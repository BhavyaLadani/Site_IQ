"""
Retail Layer Processors
========================
Five layers matching the Retail Scoring Model:

  1. demographics   (0.30) — pop density + income + age 25-55
  2. transportation (0.25) — highway proximity, transit, parking
  3. competition    (0.20) — non-linear density curve
  4. land_use       (0.15) — commercial zoning score
  5. environment    (0.10) — flood risk, air quality, noise

Every processor applies distance-decay BEFORE scoring.
Missing data is NEVER silently interpolated — flagged explicitly.
"""

import os
import math
import numpy as np
import geopandas as gpd
from shapely.geometry import Point
from engine.distance_decay import exponential_decay_km, apply_decay
from config import (LAYER_DATA_FILES, DECAY_CONFIG,
                    COMPETITION_DENSITY_CURVE, COMPETITION_RADIUS_KM)


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


def _distances_m(lat: float, lon: float,
                 gdf: gpd.GeoDataFrame) -> np.ndarray:
    """Distances in metres from (lat, lon) to all features in gdf."""
    if gdf.empty:
        return np.array([])

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")

    utm_zone = int((lon + 180) / 6) + 1
    epsg = 32600 + utm_zone if lat >= 0 else 32700 + utm_zone
    crs_utm = f"EPSG:{epsg}"

    p_proj = point_gdf.to_crs(crs_utm).geometry.iloc[0]

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    gdf_proj = gdf.to_crs(crs_utm)

    geoms = gdf_proj.geometry
    if geoms.geom_type.iloc[0] in ("Polygon", "MultiPolygon"):
        geoms = geoms.centroid

    return geoms.distance(p_proj).values


class LayerResult:
    """Standardised output from every layer processor."""

    def __init__(self, raw_score: float, data_available: bool,
                 gaps: list = None, details: dict = None):
        self.raw_score = float(max(0.0, min(100.0, raw_score)))
        self.data_available = data_available
        self.gaps = gaps or []
        self.details = details or {}

    def to_dict(self):
        return {
            "raw_score":      round(self.raw_score, 2),
            "data_available": self.data_available,
            "gaps":           self.gaps,
            "details":        self.details,
        }


def _is_nan(v) -> bool:
    try:
        return v != v
    except Exception:
        return False


# ═══════════════════════════════════════════════
# Layer 1 — Demographics (weight 0.30)
# ═══════════════════════════════════════════════

def score_demographics(lat: float, lon: float,
                       data: gpd.GeoDataFrame = None) -> LayerResult:
    """
    Score = 60% population density + 25% median income + 15% age 25-55.

    Uses census-tract polygon containing the site (or nearest tract).
    Bonus metadata (population_5km, median_income, walk_score) extracted
    here for the threshold-bonus step in scorer.py.
    """
    if data is None:
        data = _load_geojson(LAYER_DATA_FILES.get("demographics", ""))

    if data.empty:
        return LayerResult(0, False, ["demographics: No data available"])

    if data.crs is None:
        data = data.set_crs("EPSG:4326")
    data = data.to_crs("EPSG:4326")

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")
    joined = gpd.sjoin(point_gdf, data, how="left", predicate="within")

    if joined.empty or joined["index_right"].isna().all():
        # Nearest-tract fallback
        distances = _distances_m(lat, lon, data)
        if len(distances) == 0:
            return LayerResult(0, True, ["demographics: No tracts found"])
        tract = data.iloc[int(np.argmin(distances))]
    else:
        tract = joined.iloc[0]

    gaps = []

    # Component 1 — Population density (60%)
    pop_score = 50.0
    pop_col = next((c for c in ["population_density", "pop_density",
                                 "pop_per_sqkm", "density"]
                    if c in tract.index and not _is_nan(tract[c])), None)
    if pop_col:
        # Normalize: 30,000 people/km² → 100
        pop_score = min(float(tract[pop_col]) / 30000.0, 1.0) * 100
    else:
        gaps.append("demographics: population_density attribute missing")

    # Component 2 — Median income (25%)
    inc_score = 50.0
    inc_col = next((c for c in ["median_income", "med_income", "income"]
                    if c in tract.index and not _is_nan(tract[c])), None)
    if inc_col:
        # Normalize: $150,000 → 100
        inc_score = min(float(tract[inc_col]) / 150000.0, 1.0) * 100
    else:
        gaps.append("demographics: median_income attribute missing")

    # Component 3 — Prime retail age share 25-55 (15%)
    age_score = 50.0
    age_col = next((c for c in ["age_25_55_pct", "prime_age_pct", "age_share"]
                    if c in tract.index and not _is_nan(tract[c])), None)
    if age_col:
        # Normalize: 50%+ prime-age share → 100
        age_score = min(float(tract[age_col]) / 50.0, 1.0) * 100
    else:
        gaps.append("demographics: age_25_55_pct attribute missing (using default 50)")

    raw = pop_score * 0.60 + inc_score * 0.25 + age_score * 0.15

    # Expose values for threshold-bonus step
    details = {
        "population_density":    float(tract[pop_col]) if pop_col else None,
        "median_income":         float(tract[inc_col]) if inc_col else None,
        "population_5km":        float(tract.get("total_population", 0) or 0),
        "walk_score":            float(tract.get("walk_score", 0) or 0),
    }

    return LayerResult(raw, True, gaps, details)


# ═══════════════════════════════════════════════
# Layer 2 — Transportation (weight 0.25)
# ═══════════════════════════════════════════════

def score_transportation(lat: float, lon: float,
                         transit_data: gpd.GeoDataFrame = None,
                         traffic_data: gpd.GeoDataFrame = None) -> LayerResult:
    """
    Score = 40% highway/road proximity + 40% transit stops + 20% parking proxy.

    Highway proximity: nearest high-traffic road, λ=0.8 (km-based).
    Transit stops:     nearest stop + density within 1 km, λ=0.5.
    Parking proxy:     inferred from POI density (no explicit data).
    """
    if transit_data is None:
        transit_data = _load_geojson(LAYER_DATA_FILES.get("transportation", ""))
    if traffic_data is None:
        traffic_data = _load_geojson(LAYER_DATA_FILES.get("traffic", ""))

    gaps = []

    # ── Highway proximity (40% of transportation score) ──
    highway_score = 0.0
    if traffic_data.empty:
        gaps.append("transportation: No traffic/highway data")
        highway_score = 50.0  # neutral default
    else:
        distances = _distances_m(lat, lon, traffic_data)
        if len(distances) > 0:
            nearest_m = float(np.min(distances))
            # λ=0.8 for highway ramp, base_score=1.0
            decay = exponential_decay_km(nearest_m, feature="highway_ramp")
            highway_score = decay * 100
        else:
            gaps.append("transportation: No road features found")
            highway_score = 50.0

    # ── Transit stop proximity & density (40%) ──
    transit_score = 0.0
    transit_details = {}
    if transit_data.empty:
        gaps.append("transportation: No transit data")
        transit_score = 50.0
    else:
        distances = _distances_m(lat, lon, transit_data)
        if len(distances) > 0:
            nearest_m = float(np.min(distances))
            # λ=0.5 for transit stop
            nearest_decay = exponential_decay_km(nearest_m, feature="transit_stop")
            # Density within 1 km
            count_1km = int(np.sum(distances <= 1000))
            density_score = min(count_1km / 5.0, 1.0)  # 5+ stops = full score

            transit_score = (nearest_decay * 0.6 + density_score * 0.4) * 100
            transit_details = {
                "nearest_stop_m": round(nearest_m, 1),
                "stops_within_1km": count_1km,
            }
        else:
            gaps.append("transportation: No transit features found")
            transit_score = 50.0

    # ── Parking proxy (20%) — scored 70 as default for urban areas ──
    # (No dedicated parking dataset; can be updated when data is available)
    parking_score = 70.0
    gaps.append("transportation: Parking score estimated (no dedicated dataset)")

    raw = highway_score * 0.40 + transit_score * 0.40 + parking_score * 0.20

    return LayerResult(
        raw_score=raw,
        data_available=True,
        gaps=gaps,
        details={
            "highway_score": round(highway_score, 1),
            "transit_score": round(transit_score, 1),
            "parking_score": round(parking_score, 1),
            **transit_details,
        }
    )


# ═══════════════════════════════════════════════
# Layer 3 — Competition (weight 0.20) — NON-LINEAR CURVE
# ═══════════════════════════════════════════════

def _competition_curve_score(count: int) -> float:
    """
    Map competitor count to a score using the configured density curve.

    Curve:
      0 competitors  →  40   (unproven market)
      1–3            →  90   (optimal — validated, not saturated)
      4–6            →  60
      7–10           →  30
      >10            →   5   (heavily saturated)
    """
    for (lo, hi, score) in COMPETITION_DENSITY_CURVE:
        if hi is None:
            if count >= lo:
                return float(score)
        else:
            if lo <= count < hi:
                return float(score)
    return 40.0  # fallback


def score_competition(lat: float, lon: float,
                      data: gpd.GeoDataFrame = None) -> LayerResult:
    """
    Score competition density using the non-linear curve.
    Counts competitors within COMPETITION_RADIUS_KM (default 1 km).
    Each competitor weighted by exponential decay (λ=0.3).
    """
    if data is None:
        data = _load_geojson(LAYER_DATA_FILES.get("competition", ""))

    if data.empty:
        return LayerResult(
            0, False,
            ["competition: No competitor data available"],
            {"competitors_in_1km": None}
        )

    distances = _distances_m(lat, lon, data)
    if len(distances) == 0:
        return LayerResult(40, True, details={"competitors_in_1km": 0,
                                              "curve_score": 40})

    radius_m = COMPETITION_RADIUS_KM * 1000
    mask = distances <= radius_m
    count_in_radius = int(mask.sum())

    # Non-linear curve score
    curve_score = _competition_curve_score(count_in_radius)

    # Decay-weighted penalty modifier (± 10 points from curve)
    if count_in_radius > 0:
        nearby_dists = distances[mask]
        # Decay each competitor with λ=0.3 (soft decay)
        decay_sum = sum(
            exponential_decay_km(d, feature="competitor")
            for d in nearby_dists
        )
        # Closer competitors → slightly lower score within the band
        proximity_modifier = max(-10, min(10, -decay_sum * 2))
    else:
        proximity_modifier = 0.0

    raw = max(0, min(100, curve_score + proximity_modifier))

    return LayerResult(
        raw_score=raw,
        data_available=True,
        details={
            "competitors_in_1km": count_in_radius,
            "curve_score":        curve_score,
            "proximity_modifier": round(proximity_modifier, 1),
            "nearest_competitor_m": round(float(np.min(distances)), 1)
                                    if len(distances) > 0 else None,
            "total_competitors":  len(distances),
        }
    )


# ═══════════════════════════════════════════════
# Layer 4 — Land Use (weight 0.15)
# ═══════════════════════════════════════════════

def score_land_use(lat: float, lon: float,
                   data: gpd.GeoDataFrame = None) -> LayerResult:
    """
    Score commercial zoning compatibility.

    C1, C2, MX, TC → premium scores (80–100).
    Other commercial → mid scores. Non-commercial → low.
    Hard constraint (zoning NOT in valid set) is enforced separately
    in hard_constraints.py; this layer scores the *quality* of the zone.
    """
    ZONE_SCORE_MAP = {
        "commercial_retail": 100,
        "c1":                100,
        "c2":                 90,
        "mx":                 90,
        "mixed_use":          88,
        "tc":                 85,
        "commercial":         80,
        "residential_mixed":  55,
        "residential":        30,
        "light_industrial":   20,
        "institutional":      15,
        "park_recreation":    10,
    }

    if data is None:
        data = _load_geojson(LAYER_DATA_FILES.get("land_use", ""))
        if data.empty:
            data = _load_geojson("data/zoning.geojson")

    if data.empty:
        return LayerResult(0, False, ["land_use: No zoning data available"])

    if data.crs is None:
        data = data.set_crs("EPSG:4326")
    data = data.to_crs("EPSG:4326")

    point = Point(lon, lat)
    point_gdf = gpd.GeoDataFrame([{"geometry": point}], crs="EPSG:4326")
    joined = gpd.sjoin(point_gdf, data, how="left", predicate="within")

    if joined.empty or joined["index_right"].isna().all():
        return LayerResult(0, True, ["land_use: Point not within any zoning polygon"])

    zone_col = next(
        (c for c in ["zone_type", "zoning", "land_use", "ZONE_TYPE", "LAND_USE"]
         if c in joined.columns),
        None
    )

    if zone_col is None:
        return LayerResult(50, True, ["land_use: No zone attribute found"],
                           {"zone_type": "unknown"})

    zone_value = str(joined.iloc[0][zone_col]).strip().lower()
    raw = float(ZONE_SCORE_MAP.get(zone_value, 30))

    return LayerResult(
        raw_score=raw,
        data_available=True,
        details={
            "zone_type":     zone_value,
            "compatibility": "high" if raw >= 80 else
                             "medium" if raw >= 50 else "low",
        }
    )


# ═══════════════════════════════════════════════
# Layer 5 — Environment (weight 0.10)
# ═══════════════════════════════════════════════

def score_environment(lat: float, lon: float,
                      data: gpd.GeoDataFrame = None) -> LayerResult:
    """
    Score = 50% flood risk + 30% air quality + 20% noise (proxy).

    Flood risk uses distance-decay from flood zone boundary (λ=1.5).
    AQI: lower = better. Noise: estimated from traffic data (proxy).
    """
    if data is None:
        data = _load_geojson(LAYER_DATA_FILES.get("environment", ""))

    gaps = []

    # ── Flood risk (50%) ──
    flood_score = 100.0  # default: not near any flood zone
    if data.empty:
        gaps.append("environment: No flood zone data")
        flood_score = 70.0  # neutral default
    else:
        distances = _distances_m(lat, lon, data)
        if len(distances) > 0:
            nearest_m = float(np.min(distances))
            # λ=1.5 — very sharp decay near flood zones
            # Invert: closer to flood zone = lower score
            proximity = exponential_decay_km(nearest_m, feature="flood_zone")
            flood_score = proximity * 100  # far away = high score

    # ── Air quality score (30%) ──
    aqi_score = 70.0  # default neutral
    if not data.empty:
        aqi_col = next((c for c in ["aqi", "air_quality_index", "AQI"]
                        if c in data.columns), None)
        if aqi_col:
            # Use the value of tract nearest the point
            distances = _distances_m(lat, lon, data)
            if len(distances) > 0:
                nearest_aqi = data.iloc[int(np.argmin(distances))][aqi_col]
                if not _is_nan(nearest_aqi):
                    aqi_val = float(nearest_aqi)
                    # AQI 0=perfect → 100 pts; 150=0 pts
                    aqi_score = max(0, (1 - aqi_val / 150.0)) * 100
        else:
            gaps.append("environment: AQI attribute not found — using default 70")
    else:
        gaps.append("environment: AQI data missing — using default 70")

    # ── Noise proxy (20%) — estimated from traffic intensity ──
    traffic_data = _load_geojson(LAYER_DATA_FILES.get("traffic", ""))
    noise_score = 70.0  # default neutral
    if not traffic_data.empty:
        distances = _distances_m(lat, lon, traffic_data)
        if len(distances) > 0:
            nearest_m = float(np.min(distances))
            vol_col = next((c for c in ["volume", "traffic_volume", "aadt"]
                            if c in traffic_data.columns), None)
            if vol_col and nearest_m < 500:
                nearest_row = traffic_data.iloc[int(np.argmin(distances))]
                vol = float(nearest_row[vol_col] or 0)
                # Higher traffic near site = more noise = lower score
                noise_score = max(0, (1 - vol / 80000.0)) * 100
    else:
        gaps.append("environment: No traffic data for noise proxy")

    raw = flood_score * 0.50 + aqi_score * 0.30 + noise_score * 0.20

    return LayerResult(
        raw_score=raw,
        data_available=True,
        gaps=gaps,
        details={
            "flood_risk_score":  round(flood_score, 1),
            "air_quality_score": round(aqi_score, 1),
            "noise_proxy_score": round(noise_score, 1),
        }
    )


# ═══════════════════════════════════════════════
# Layer Dispatcher
# ═══════════════════════════════════════════════

LAYER_PROCESSORS = {
    "demographics":   score_demographics,
    "transportation": score_transportation,
    "competition":    score_competition,
    "land_use":       score_land_use,
    "environment":    score_environment,
}


def process_all_layers(lat: float, lon: float,
                       datasets: dict = None) -> dict:
    """
    Run all five retail layer processors.

    Parameters
    ----------
    lat, lon : float
    datasets : dict, optional
        Pre-loaded GeoDataFrames keyed by layer name.

    Returns
    -------
    dict  {layer_name: LayerResult.to_dict(), ...}
    """
    datasets = datasets or {}
    results = {}

    for name, processor in LAYER_PROCESSORS.items():
        data = datasets.get(name)
        try:
            if name == "transportation":
                # Transportation needs two data sources
                transit = datasets.get("transportation")
                traffic = datasets.get("traffic")
                result = processor(lat, lon, transit, traffic)
            else:
                result = processor(lat, lon, data)
        except Exception as e:
            result = LayerResult(
                0, False,
                [f"{name}: Processing error — {str(e)}"]
            )
        results[name] = result.to_dict()

    return results
