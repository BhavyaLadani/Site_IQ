"""
Hard Constraint Checker — Retail Model
=======================================
Four hard constraints for retail site scoring:

  1. Population within 5 km < 10,000       → FAIL  (insufficient catchment)
  2. Zoning NOT in [C1, C2, MX, TC, ...]   → FAIL  (not commercially viable)
  3. FEMA Flood Zone = AE or VE            → FAIL  (uninsurable risk)
  4. Air Quality Index (annual avg) > 150  → FAIL  (regulatory + brand risk)

Any single failure short-circuits scoring to composite_score = 0.
"""

import math
import geopandas as gpd
from shapely.geometry import Point
from config import HARD_CONSTRAINTS, LAYER_DATA_FILES
import os


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _load_geojson(filepath: str) -> gpd.GeoDataFrame:
    if not os.path.exists(filepath):
        return gpd.GeoDataFrame()
    try:
        return gpd.read_file(filepath)
    except Exception:
        return gpd.GeoDataFrame()


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in metres between two lat/lon points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─────────────────────────────────────────────
# Constraint 1 — Population Catchment
# ─────────────────────────────────────────────

def check_population_catchment(lat: float, lon: float,
                               demo_data: gpd.GeoDataFrame = None) -> dict:
    """
    FAIL if estimated population within 5 km < 10,000.

    Sums 'total_population' attribute of all overlapping census tracts
    if available; otherwise falls back to population_density × area.
    """
    MIN_POP = HARD_CONSTRAINTS["min_population_5km"]
    RADIUS_M = 5000

    if demo_data is None:
        demo_data = _load_geojson(LAYER_DATA_FILES.get("demographics", ""))

    if demo_data.empty:
        return {
            "passed": True,
            "failure": None,
            "data_available": False,
            "gap": "population_catchment: No demographics data — constraint skipped",
        }

    if demo_data.crs is None:
        demo_data = demo_data.set_crs("EPSG:4326")
    data_ll = demo_data.to_crs("EPSG:4326")

    # Estimate UTM for accurate distance/area
    utm_zone = int((lon + 180) / 6) + 1
    epsg = 32600 + utm_zone if lat >= 0 else 32700 + utm_zone
    crs_utm = f"EPSG:{epsg}"

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")
    point_proj = point_gdf.to_crs(crs_utm).geometry.iloc[0]

    data_proj = demo_data.to_crs(crs_utm)

    # Buffer 5 km around site
    buffer = point_proj.buffer(RADIUS_M)

    total_population = 0.0
    for _, row in data_proj.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        intersection = geom.intersection(buffer)
        if intersection.is_empty:
            continue

        # Proportion of tract within buffer
        tract_area = geom.area
        overlap_area = intersection.area
        proportion = overlap_area / tract_area if tract_area > 0 else 0

        # Use total_population if available, else estimate from density
        if "total_population" in row.index and not _is_nan(row["total_population"]):
            total_population += float(row["total_population"]) * proportion
        elif "population_density" in row.index and not _is_nan(row["population_density"]):
            # density (people/km²) × area (km²)
            area_km2 = overlap_area / 1_000_000
            total_population += float(row["population_density"]) * area_km2

    total_population = round(total_population)

    if total_population < MIN_POP:
        return {
            "passed": False,
            "failure": (f"Insufficient catchment population: estimated "
                        f"{total_population:,} within 5 km "
                        f"(minimum required: {MIN_POP:,})"),
            "data_available": True,
            "population_5km": total_population,
        }

    return {
        "passed": True,
        "failure": None,
        "data_available": True,
        "population_5km": total_population,
    }


def _is_nan(v) -> bool:
    try:
        return v != v  # NaN check
    except Exception:
        return False


# ─────────────────────────────────────────────
# Constraint 2 — Commercial Zoning
# ─────────────────────────────────────────────

def check_commercial_zoning(lat: float, lon: float,
                            zoning_data: gpd.GeoDataFrame = None) -> dict:
    """
    FAIL if the site's zoning code is not in the valid commercial set.
    Valid codes: C1, C2, MX, TC (plus legacy aliases).
    """
    VALID = [c.lower() for c in HARD_CONSTRAINTS["valid_zoning_codes"]]

    if zoning_data is None:
        zoning_data = _load_geojson(LAYER_DATA_FILES.get("land_use", ""))
        if zoning_data.empty:
            zoning_data = _load_geojson(LAYER_DATA_FILES.get("zoning_compatibility",
                                        "data/zoning.geojson"))

    if zoning_data.empty:
        return {
            "passed": True,
            "failure": None,
            "data_available": False,
            "gap": "commercial_zoning: No zoning data — constraint skipped",
        }

    if zoning_data.crs is None:
        zoning_data = zoning_data.set_crs("EPSG:4326")
    zoning_data = zoning_data.to_crs("EPSG:4326")

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")
    joined = gpd.sjoin(point_gdf, zoning_data, how="left", predicate="within")

    if joined.empty or joined["index_right"].isna().all():
        # Point not inside any polygon — treat as unknown, not a failure
        return {
            "passed": True,
            "failure": None,
            "data_available": True,
            "gap": "commercial_zoning: Point not within any zoning polygon",
        }

    zone_col = next(
        (c for c in ["zone_type", "zoning", "land_use", "zone_code",
                      "ZONE_TYPE", "LAND_USE", "ZONE_CODE"]
         if c in joined.columns),
        None
    )

    if zone_col is None:
        return {
            "passed": True,
            "failure": None,
            "data_available": True,
            "gap": "commercial_zoning: No zone attribute column found",
        }

    zone_value = str(joined.iloc[0][zone_col]).strip().lower()

    if zone_value not in VALID:
        return {
            "passed": False,
            "failure": (f"Zoning class '{zone_value}' is restricted and not "
                        f"commercially viable for new site construction."),
            "data_available": True,
            "zone_found": zone_value,
        }

    return {
        "passed": True,
        "failure": None,
        "data_available": True,
        "zone_found": zone_value,
    }


# ─────────────────────────────────────────────
# Constraint 3 — FEMA Flood Zone
# ─────────────────────────────────────────────

def check_flood_zone(lat: float, lon: float,
                     flood_data: gpd.GeoDataFrame = None) -> dict:
    """FAIL if site is within a FEMA AE or VE flood zone."""
    DISQUALIFYING = [z.upper() for z in HARD_CONSTRAINTS["flood_zone_codes"]]

    if flood_data is None:
        flood_data = _load_geojson(LAYER_DATA_FILES.get("flood_zones", ""))

    if flood_data.empty:
        return {
            "passed": True,
            "failure": None,
            "data_available": False,
            "gap": "flood_zone: No flood zone data — constraint skipped",
        }

    if flood_data.crs is None:
        flood_data = flood_data.set_crs("EPSG:4326")
    flood_data = flood_data.to_crs("EPSG:4326")

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")
    joined = gpd.sjoin(point_gdf, flood_data, how="left", predicate="within")

    if joined.empty or joined["index_right"].isna().all():
        return {"passed": True, "failure": None, "data_available": True}

    zone_col = next(
        (c for c in ["zone", "flood_zone", "fld_zone", "ZONE", "FLD_ZONE"]
         if c in joined.columns),
        None
    )
    if zone_col is None:
        return {"passed": True, "failure": None, "data_available": True}

    zone_value = str(joined.iloc[0][zone_col]).strip().upper()
    if zone_value in DISQUALIFYING:
        return {
            "passed": False,
            "failure": (f"Site is in FEMA flood zone {zone_value} "
                        f"(AE/VE = uninsurable risk) — automatic disqualification"),
            "data_available": True,
            "flood_zone": zone_value,
        }

    return {"passed": True, "failure": None, "data_available": True,
            "flood_zone": zone_value}


# ─────────────────────────────────────────────
# Constraint 4 — Air Quality Index
# ─────────────────────────────────────────────

def check_air_quality(lat: float, lon: float,
                      env_data: gpd.GeoDataFrame = None) -> dict:
    """
    FAIL if Air Quality Index (annual avg) > 150.

    Looks for 'aqi', 'air_quality_index', or 'aqi_annual' column.
    If no AQI data is available, the constraint is skipped (not failed).
    """
    MAX_AQI = HARD_CONSTRAINTS["max_aqi"]

    # Try to load environment/flood data which may carry AQI
    if env_data is None:
        env_data = _load_geojson(LAYER_DATA_FILES.get("environment",
                                 "data/flood_zones.geojson"))

    if env_data.empty:
        return {
            "passed": True,
            "failure": None,
            "data_available": False,
            "gap": "air_quality: No environment data — AQI constraint skipped",
        }

    aqi_col = next(
        (c for c in ["aqi", "air_quality_index", "aqi_annual", "AQI"]
         if c in env_data.columns),
        None
    )

    if aqi_col is None:
        return {
            "passed": True,
            "failure": None,
            "data_available": False,
            "gap": "air_quality: No AQI attribute found — constraint skipped",
        }

    if env_data.crs is None:
        env_data = env_data.set_crs("EPSG:4326")
    env_data = env_data.to_crs("EPSG:4326")

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")
    joined = gpd.sjoin(point_gdf, env_data, how="left", predicate="within")

    if joined.empty or joined["index_right"].isna().all():
        return {"passed": True, "failure": None, "data_available": True}

    aqi_value = joined.iloc[0].get(aqi_col)
    if _is_nan(aqi_value) or aqi_value is None:
        return {"passed": True, "failure": None, "data_available": True}

    aqi_value = float(aqi_value)
    if aqi_value > MAX_AQI:
        return {
            "passed": False,
            "failure": (f"Air Quality Index {aqi_value:.0f} exceeds maximum "
                        f"allowed {MAX_AQI} (regulatory + brand risk)"),
            "data_available": True,
            "aqi": aqi_value,
        }

    return {"passed": True, "failure": None, "data_available": True,
            "aqi": aqi_value}


# ─────────────────────────────────────────────
# Unified Constraint Runner
# ─────────────────────────────────────────────

def check_all_constraints(lat: float, lon: float,
                          flood_data: gpd.GeoDataFrame = None,
                          zoning_data: gpd.GeoDataFrame = None,
                          demo_data: gpd.GeoDataFrame = None,
                          env_data: gpd.GeoDataFrame = None) -> dict:
    """
    Run all four retail hard constraints in order.

    Returns
    -------
    dict
        {
            "all_passed": bool,
            "failures":   [str, ...],
            "data_gaps":  [str, ...],
            "metadata":   {population_5km, zone_found, flood_zone, aqi}
        }
    """
    failures = []
    data_gaps = []
    metadata = {}

    # 1 — Population catchment
    pop_result = check_population_catchment(lat, lon, demo_data)
    if not pop_result["data_available"]:
        data_gaps.append(pop_result.get("gap", "population_catchment: no data"))
    if not pop_result["passed"]:
        failures.append(pop_result["failure"])
    if "population_5km" in pop_result:
        metadata["population_5km"] = pop_result["population_5km"]

    # 2 — Commercial zoning
    zone_result = check_commercial_zoning(lat, lon, zoning_data)
    if not zone_result["data_available"]:
        data_gaps.append(zone_result.get("gap", "commercial_zoning: no data"))
    if zone_result.get("gap") and zone_result["data_available"]:
        data_gaps.append(zone_result["gap"])
    if not zone_result["passed"]:
        failures.append(zone_result["failure"])
    if "zone_found" in zone_result:
        metadata["zone_found"] = zone_result["zone_found"]

    # 3 — Flood zone
    flood_result = check_flood_zone(lat, lon, flood_data)
    if not flood_result["data_available"]:
        data_gaps.append(flood_result.get("gap", "flood_zone: no data"))
    if not flood_result["passed"]:
        failures.append(flood_result["failure"])
    if "flood_zone" in flood_result:
        metadata["flood_zone"] = flood_result["flood_zone"]

    # 4 — Air quality
    aqi_result = check_air_quality(lat, lon, env_data)
    if not aqi_result["data_available"]:
        data_gaps.append(aqi_result.get("gap", "air_quality: no data"))
    if not aqi_result["passed"]:
        failures.append(aqi_result["failure"])
    if "aqi" in aqi_result:
        metadata["aqi"] = aqi_result["aqi"]

    return {
        "all_passed": len(failures) == 0,
        "failures":   failures,
        "data_gaps":  data_gaps,
        "metadata":   metadata,
    }
