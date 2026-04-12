"""
Data Ingestion Module
=====================
Production-ready module for loading, validating, and reprojecting geospatial layers.
Supported formats: GeoJSON, Shapefile, GeoTIFF, and raw WKT.
"""

import os
import logging
from typing import Dict, List

import geopandas as gpd
import pandas as pd
from shapely import wkt
import rasterio
from rasterio.features import shapes
from shapely.geometry import shape

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("DataIngestion")

# Validation schema requirements
LAYER_SCHEMAS = {
    "demographics": ["population_density", "median_income", "age_distribution"],
    "transportation": ["road_type"],
    "competition": ["category"],
    "land_use": ["zone_type"],
    "environment": ["flood_risk", "earthquake_risk", "air_quality_index"]
}

# Inferred file mappings based on typical project structure (overridable)
DEFAULT_FILENAMES = {
    "demographics": "demographics.geojson",
    "transportation": "roads.geojson",       # has road_type field
    "competition": "pois.geojson",           # has category field
    "land_use": "zoning.geojson",            # has zone_type field
    "environment": "environment.geojson"     # has flood_risk, earthquake_risk, air_quality_index
}


def _read_wkt(filepath: str) -> gpd.GeoDataFrame:
    """Read a raw WKT text file into a GeoDataFrame."""
    try:
        df = pd.read_csv(filepath, header=None, names=["wkt_geom"])
        df["geometry"] = df["wkt_geom"].apply(wkt.loads)
        gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
        return gdf.drop(columns=["wkt_geom"])
    except Exception as e:
        logger.error(f"Failed to read WKT from {filepath}: {e}")
        return gpd.GeoDataFrame()


def _read_raster_as_vector(filepath: str) -> gpd.GeoDataFrame:
    """Open a GeoTIFF and extract non-null pixel areas as polygon features."""
    try:
        results = []
        with rasterio.open(filepath) as src:
            image = src.read(1) # Read first band
            mask = image != src.nodata if src.nodata is not None else image > 0
            
            # Extract polygon shapes from raster
            for geom, val in shapes(image, mask=mask, transform=src.transform):
                results.append({"geometry": shape(geom), "value": val})
                
        if not results:
            return gpd.GeoDataFrame()
            
        gdf = gpd.GeoDataFrame(results, crs=src.crs.to_string() if src.crs else "EPSG:4326")
        return gdf
    except Exception as e:
        logger.error(f"Failed to extract vectors from GeoTIFF {filepath}: {e}")
        return gpd.GeoDataFrame()


def _read_file(filepath: str) -> gpd.GeoDataFrame:
    """Smart reader dispatching based on extension."""
    if not os.path.exists(filepath):
        logger.warning(f"File not found: {filepath}")
        return gpd.GeoDataFrame()

    ext = os.path.splitext(filepath)[1].lower()
    
    try:
        if ext in [".tif", ".tiff"]:
            return _read_raster_as_vector(filepath)
        elif ext in [".wkt", ".txt", ".csv"]: # WKT fallback
            # Try traditional read first for CSVs, fallback to WKT
            try:
                return gpd.read_file(filepath)
            except Exception:
                return _read_wkt(filepath)
        else:
            # Native GeoPandas handles GeoJSON, Shapefile (.shp), GPKG
            return gpd.read_file(filepath)
    except Exception as e:
        logger.error(f"Error loading {filepath}: {e}")
        return gpd.GeoDataFrame()


def _validate_layer(name: str, gdf: gpd.GeoDataFrame) -> bool:
    """Validate layer bounds, geometries, and required attribute columns."""
    if gdf is None or gdf.empty:
        logger.warning(f"Validation Failed: Layer '{name}' is empty or could not be loaded.")
        return False
        
    # Check for empty geometries
    if gdf.geometry.is_empty.all():
        logger.warning(f"Validation Failed: Layer '{name}' has only empty geometries.")
        return False
        
    # Check schema
    required_cols = LAYER_SCHEMAS.get(name, [])
    missing = [c for c in required_cols if c not in gdf.columns]
    
    if missing:
        # We don't necessarily reject the entire layer, but we log heavily
        logger.warning(f"Layer '{name}' is missing expected fields: {missing}. Some scoring may fail.")
        
    return True


# ─────────────────────────────────────────────
# Dynamic Data Fetching from OSM/Overpass API
# ─────────────────────────────────────────────

# Layers that can be fetched dynamically from OpenStreetMap
DYNAMIC_LAYERS = {"transportation", "competition", "land_use"}

# Layers that must remain local (curated data, no free API equivalent)
LOCAL_ONLY_LAYERS = {"demographics", "environment"}

# Ahmedabad bounding box for Overpass queries (S,W,N,E)
OVERPASS_BBOX = "22.95,72.45,23.15,72.70"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def _fetch_from_overpass(layer_name: str, data_dir: str) -> gpd.GeoDataFrame:
    """
    Fetch geospatial data from OpenStreetMap via Overpass API.
    Returns a GeoDataFrame, or empty GeoDataFrame on failure.
    Caches successful results to local GeoJSON files for offline use.
    """
    import httpx
    import json
    from shapely.geometry import Point, LineString, Polygon, mapping
    
    queries = {
        "transportation": f"""
            [out:json][timeout:30];
            (
              way["highway"~"primary|secondary|tertiary|residential|motorway"]["name"]({OVERPASS_BBOX});
            );
            out body geom 500;
        """,
        "competition": f"""
            [out:json][timeout:30];
            (
              node["shop"]["name"]({OVERPASS_BBOX});
              node["amenity"~"restaurant|cafe|bank|fuel|pharmacy"]["name"]({OVERPASS_BBOX});
            );
            out body 500;
        """,
        "land_use": f"""
            [out:json][timeout:30];
            (
              way["landuse"]["name"]({OVERPASS_BBOX});
              way["landuse"]({OVERPASS_BBOX});
              relation["landuse"]({OVERPASS_BBOX});
            );
            out body geom 200;
        """,
    }

    query = queries.get(layer_name)
    if not query:
        return gpd.GeoDataFrame()

    try:
        logger.info(f"[Dynamic] Fetching '{layer_name}' from Overpass API...")
        resp = httpx.post(OVERPASS_URL, data={"data": query}, timeout=35.0,
                          headers={"User-Agent": "SiteIQ/2.0"})
        if resp.status_code != 200:
            logger.warning(f"[Dynamic] Overpass returned {resp.status_code} for '{layer_name}'")
            return gpd.GeoDataFrame()

        data = resp.json()
        elements = data.get("elements", [])
        if not elements:
            logger.warning(f"[Dynamic] No elements returned for '{layer_name}'")
            return gpd.GeoDataFrame()

        features = []
        for el in elements:
            props = {}
            tags = el.get("tags", {})

            if layer_name == "transportation":
                road_type = tags.get("highway", "residential")
                props = {"road_type": road_type, "name": tags.get("name", "")}
                geom_coords = el.get("geometry", [])
                if not geom_coords:
                    continue
                coords = [(p["lon"], p["lat"]) for p in geom_coords]
                if len(coords) < 2:
                    continue
                geometry = LineString(coords)

            elif layer_name == "competition":
                category = "competitor"
                shop = tags.get("shop", "")
                amenity = tags.get("amenity", "")
                if shop:
                    category = "competitor"
                elif amenity in ("restaurant", "cafe"):
                    category = "complementary"
                elif amenity in ("bank", "fuel"):
                    category = "anchor_tenant"
                props = {
                    "category": category,
                    "brand": tags.get("name", tags.get("brand", "Unknown")),
                }
                if "lat" not in el or "lon" not in el:
                    continue
                geometry = Point(el["lon"], el["lat"])

            elif layer_name == "land_use":
                zone_raw = tags.get("landuse", "unknown")
                zone_map = {
                    "commercial": "commercial", "retail": "commercial",
                    "residential": "residential", "industrial": "industrial",
                    "recreation_ground": "park", "grass": "park",
                    "farmland": "park", "forest": "park",
                }
                zone_type = zone_map.get(zone_raw, zone_raw)
                props = {"zone_type": zone_type}
                geom_coords = el.get("geometry", [])
                if not geom_coords:
                    continue
                coords = [(p["lon"], p["lat"]) for p in geom_coords]
                if len(coords) < 3:
                    continue
                # Close the polygon if not closed
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                try:
                    geometry = Polygon(coords)
                except Exception:
                    continue
            else:
                continue

            features.append({
                "type": "Feature",
                "properties": props,
                "geometry": mapping(geometry)
            })

        if not features:
            return gpd.GeoDataFrame()

        # Build GeoJSON and convert to GeoDataFrame
        geojson = {"type": "FeatureCollection", "features": features}
        gdf = gpd.GeoDataFrame.from_features(geojson, crs="EPSG:4326")

        # Cache to local file for offline fallback
        cache_path = os.path.join(data_dir, f"_osm_cache_{layer_name}.geojson")
        try:
            with open(cache_path, "w") as f:
                json.dump(geojson, f)
            logger.info(f"[Dynamic] Cached {len(features)} features for '{layer_name}' to {cache_path}")
        except Exception as e:
            logger.warning(f"[Dynamic] Could not cache '{layer_name}': {e}")

        return gdf

    except Exception as e:
        logger.warning(f"[Dynamic] Overpass fetch failed for '{layer_name}': {e}")
        return gpd.GeoDataFrame()


def load_all_layers(data_dir: str) -> dict[str, gpd.GeoDataFrame]:
    """
    Main ingestion function. Will load 5 core categories.
    
    For dynamic layers (transportation, competition, land_use):
      1. Try fetching live data from Overpass API (OpenStreetMap)
      2. Fall back to OSM cache file if available
      3. Fall back to original local GeoJSON file
    
    For local-only layers (demographics, environment):
      Load from local GeoJSON files (curated census/risk data)
    
    Args:
        data_dir (str): Directory where spatial files are stored.
        
    Returns:
        dict[str, gpd.GeoDataFrame]: Dictionary storing ready-to-use vector layers.
    """
    loaded_layers: Dict[str, gpd.GeoDataFrame] = {}
    
    if not os.path.isdir(data_dir):
        logger.error(f"Data directory '{data_dir}' does not exist.")
        return loaded_layers

    for layer_name, filename in DEFAULT_FILENAMES.items():
        gdf = gpd.GeoDataFrame()
        
        # For dynamic layers, attempt live fetch from OSM first
        if layer_name in DYNAMIC_LAYERS:
            gdf = _fetch_from_overpass(layer_name, data_dir)
            
            if gdf.empty:
                # Try cached OSM file
                cache_path = os.path.join(data_dir, f"_osm_cache_{layer_name}.geojson")
                if os.path.exists(cache_path):
                    logger.info(f"[Dynamic] Using cached OSM data for '{layer_name}'")
                    gdf = _read_file(cache_path)
        
        # Fallback to original local file
        if gdf.empty:
            filepath = os.path.join(data_dir, filename)
            logger.info(f"Loading '{layer_name}' layer from {filepath}...")
            gdf = _read_file(filepath)
        
        # Reprojection & CRS assignment
        if not gdf.empty:
            if gdf.crs is None:
                logger.warning(f"Layer '{layer_name}' has no CRS. Assuming EPSG:4326.")
                gdf = gdf.set_crs("EPSG:4326", allow_override=True)
            elif gdf.crs.to_string() != "EPSG:4326":
                # Ensure it reprojects exactly to WGS84 WKT/EPSG:4326
                logger.info(f"Reprojecting '{layer_name}' from {gdf.crs} to EPSG:4326")
                gdf = gdf.to_crs("EPSG:4326")
                
            # Perform geometry / schema validation
            if _validate_layer(layer_name, gdf):
                loaded_layers[layer_name] = gdf
            else:
                logger.error(f"Layer '{layer_name}' failed validation. Setting to empty.")
                loaded_layers[layer_name] = gpd.GeoDataFrame()
        else:
            loaded_layers[layer_name] = gpd.GeoDataFrame()

    return loaded_layers


if __name__ == "__main__":
    # Test suite to load sample data and output summary statistics
    target_data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    
    print("=" * 60)
    print("GeoAnalyst-AI Data Ingestion Pipeline Module")
    print("=" * 60)
    
    try:
        layers = load_all_layers(target_data_dir)
        
        print("\n[Summary Statistics]")
        for name, gdf in layers.items():
            if not gdf.empty:
                print(f"\n--- {name.upper()} ---")
                print(f"Feature Count: {len(gdf)}")
                print(f"CRS:           {gdf.crs}")
                print(f"Bounding Box:  {gdf.total_bounds}")
                print(f"Columns:       {list(gdf.columns)}")
                
                geom_types = gdf.geometry.geom_type.value_counts().to_dict()
                print(f"Geometries:    {geom_types}")
            else:
                print(f"\n--- {name.upper()} ---")
                print("STATUS: NOT LOADED OR EMPTY")
                
    except Exception as e:
        logger.critical(f"Pipeline crashed: {e}")
