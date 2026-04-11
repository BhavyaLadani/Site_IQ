"""
Geospatial Data Pipeline Agent
==============================
Handles ingestion, format detection, validation, reprojection, and spatial
indexing for the GeoAnalyst-AI ecosystem.
"""

import os
import uuid
import json
import logging
import requests
import numpy as np
import geopandas as gpd
from shapely import wkt
from shapely.strtree import STRtree
from shapely.geometry import box, shape
import h3
import rasterio

from config import INGESTION_CONFIG, DATA_DIR

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GeoIngest")


def format_error(reason: str, suggested_fix: str) -> dict:
    return {
        "status": "error",
        "layer_id": None,
        "reason": reason,
        "suggested_fix": suggested_fix
    }


def _get_study_area_polygon() -> gpd.GeoSeries:
    """Returns a bounding box polygon for the study area."""
    bbox = INGESTION_CONFIG.get("study_area_bbox", [-180, -90, 180, 90])
    return gpd.GeoSeries([box(bbox[0], bbox[1], bbox[2], bbox[3])], crs="EPSG:4326")


# ─────────────────────────────────────────────
# Ingestion & Detection Logic
# ─────────────────────────────────────────────

def _ingest_wkt(wkt_string: str) -> gpd.GeoDataFrame:
    """Parses WKT string into a GeoDataFrame."""
    try:
        geom = wkt.loads(wkt_string)
        return gpd.GeoDataFrame({"geometry": [geom]}, crs="EPSG:4326")
    except Exception as e:
        raise ValueError(f"Failed to parse WKT: {str(e)}")


def _ingest_api(url: str) -> gpd.GeoDataFrame:
    """Fetches GeoJSON from API and converts to GeoDataFrame."""
    try:
        req = requests.get(url, timeout=10)
        req.raise_for_status()
        data = req.json()
        if data.get("type") != "FeatureCollection":
            raise ValueError("API did not return a valid FeatureCollection schema.")
        return gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")
    except Exception as e:
        raise ValueError(f"Failed to fetch or parse API endpoint: {str(e)}")


def _ingest_raster(filepath: str) -> dict:
    """Handles raster processing directly, distinct from vector logic."""
    try:
        warnings = []
        with rasterio.open(filepath) as src:
            bounds = src.bounds
            crs = src.crs.to_string() if src.crs else None
            if crs != "EPSG:4326":
                warnings.append(f"Raster CRS is {crs}, target schema requires EPSG:4326.")
            
            return {
                "layer_id": str(uuid.uuid4()),
                "layer_type": "environment_raster", # Default
                "feature_count": src.width * src.height,
                "crs": crs or "Unknown",
                "bbox": [bounds.left, bounds.bottom, bounds.right, bounds.top],
                "attributes": ["band_" + str(i) for i in src.indexes],
                "ingestion_warnings": warnings,
                "spatial_index_built": False # Rasters don't use STRtree
            }
    except Exception as e:
        raise ValueError(f"Failed to read TIFF raster: {str(e)}")


def load_spatial_data(source: str) -> dict:
    """
    Main format detection layer.
    Determines type -> Loads -> Validates -> Output Registry Schema.
    """
    is_wkt = source.strip().upper().startswith(("POLYGON", "MULTIPOLYGON", "POINT", "LINESTRING"))
    is_api = source.startswith(("http://", "https://"))
    is_raster = source.lower().endswith((".tif", ".tiff"))
    
    if is_raster:
        try:
            return _ingest_raster(source)
        except ValueError as e:
            return format_error(str(e), "Verify raster integrity and rasterio compatibility")
            
    gdf = None
    warnings = []
    
    try:
        if is_wkt:
            gdf = _ingest_wkt(source)
        elif is_api:
            gdf = _ingest_api(source)
        else:
            # File system generic (shp, geojson, json)
            if not os.path.exists(source):
                return format_error(f"File not found: {source}", "Check the filepath")
            
            ext = os.path.splitext(source)[1].lower()
            if ext not in [".json", ".geojson", ".shp"]:
                return format_error(f"Unsupported extension: {ext}", "Provide .geojson, .json, .shp, or .tif")
            
            gdf = gpd.read_file(source)
    except Exception as e:
        return format_error(f"Ingestion failed: {str(e)}", "Ensure the source validates against its respective format schema.")
    
    return validate_and_register(gdf, source)


# ─────────────────────────────────────────────
# Validation & Registration
# ─────────────────────────────────────────────

def validate_and_register(gdf: gpd.GeoDataFrame, source_identifier: str) -> dict:
    """Validation checklist, spatial tree, and payload construction."""
    warnings = []
    
    if gdf.empty:
        return format_error("GeoDataFrame is empty after ingestion", "Provide dataset with features")

    # 1. CRS validation
    if gdf.crs is None:
        warnings.append("CRS missing. Defaulting to EPSG:4326.")
        gdf = gdf.set_crs("EPSG:4326", allow_override=True)
    elif gdf.crs.to_string() != "EPSG:4326":
        gdf = gdf.to_crs("EPSG:4326")
        
    # 2. Geometry validity + repair via 0-buffer trick
    invalid_mask = ~gdf.is_valid
    if invalid_mask.any():
        num_invalid = invalid_mask.sum()
        warnings.append(f"{num_invalid} geometries invalid. Attempting buffer(0) repair.")
        gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].buffer(0)

    # 3. Duplicate checks via spatial index
    initial_count = len(gdf)
    gdf["geometry_wkb"] = gdf.geometry.apply(lambda x: x.wkb_hex)
    gdf = gdf.drop_duplicates(subset=["geometry_wkb"]).drop(columns=["geometry_wkb"])
    if len(gdf) < initial_count:
        warnings.append(f"Dropped {initial_count - len(gdf)} spatially identical duplicate geometries.")

    # 4. Bounding Box Checks vs Study Area
    study_area = _get_study_area_polygon()
    dataset_bbox = box(*gdf.total_bounds)
    
    study_area_3857 = study_area.to_crs(epsg=3857)
    dataset_bbox_3857 = gpd.GeoSeries([dataset_bbox], crs="EPSG:4326").to_crs(epsg=3857)
    
    intersection = study_area_3857.intersection(dataset_bbox_3857).area.iloc[0]
    bbox_area = dataset_bbox_3857.area.iloc[0]
    overlap_ratio = intersection / bbox_area if bbox_area > 0 else 0.0
    max_overlap = INGESTION_CONFIG.get("max_overlap_warning", 0.20)
    
    if overlap_ratio > 0 and overlap_ratio < max_overlap:
        warnings.append(f"WARNING: Dataset bounding box only overlaps study area by {overlap_ratio:.1%} (Threshold={max_overlap:.1%}). Might be out of bounds.")

    # 5. STRtree Spatial Index implementation
    # building this creates the index dynamically in shapely 2.0+
    spatial_index = STRtree(gdf.geometry.values)
    
    # 6. Large Dataset auto-tiling check (H3)
    auto_thresh = INGESTION_CONFIG.get("auto_tile_threshold", 100000)
    if len(gdf) > auto_thresh:
        resolution = INGESTION_CONFIG.get("h3_tiling_resolution", 8)
        warnings.append(f"Feature count > {auto_thresh}. Recommend auto-tiling to H3 resolution {resolution}.")
        # Real tiling would reassign geometries here; omitted to avoid destroying source attributes
        
    # 7. PostGIS Caching placeholder (SQL Generation)
    pg_sql = _generate_postgis_schema(gdf, "ingested_layer")

    layer_id = str(uuid.uuid4())
    bounds = gdf.total_bounds.tolist() # [minx, miny, maxx, maxy]

    return {
        "layer_id": layer_id,
        "layer_type": _infer_layer_type(gdf.columns.tolist()),
        "feature_count": len(gdf),
        "crs": "EPSG:4326",
        "bbox": bounds,
        "attributes": [str(c) for c in gdf.columns if c != "geometry"],
        "ingestion_warnings": warnings,
        "spatial_index_built": True,
        # Extended metadata (hidden from formal schema, useful for logging)
        "_sql_cache_query": pg_sql
    }


def _infer_layer_type(columns: list) -> str:
    """Tries to guess layer type from attribute schema."""
    cols = [str(c).lower() for c in columns]
    if any(k in cols for k in ["population", "income", "age"]):
        return "demographic"
    if any(k in cols for k in ["transit", "highway", "stop_id", "route"]):
        return "transport"
    if any(k in cols for k in ["poi_id", "shop", "restaurant"]):
        return "poi"
    if any(k in cols for k in ["zoning", "zone_code", "land_use"]):
        return "landuse"
    if any(k in cols for k in ["flood", "aqi", "noise", "elevation"]):
        return "environment"
    return "unknown"


def _generate_postgis_schema(gdf: gpd.GeoDataFrame, table_name: str) -> str:
    """Generates the DDL to cache this dataset inside Postgres/PostGIS."""
    if not INGESTION_CONFIG.get("pg_cache_enabled", False):
        return "PostGIS cache disabled in config. Skipping."
        
    sql = [f"CREATE TABLE IF NOT EXISTS {table_name} ("]
    sql.append("    id SERIAL PRIMARY KEY,")
    
    # Map pandas types to Postgres types
    for col, dtype in gdf.dtypes.items():
        if col == "geometry":
            continue
            
        dtype_str = str(dtype)
        if "int" in dtype_str:
            pg_col = "INTEGER"
        elif "float" in dtype_str:
            pg_col = "DOUBLE PRECISION"
        elif "datetime" in dtype_str:
            pg_col = "TIMESTAMP"
        elif "bool" in dtype_str:
            pg_col = "BOOLEAN"
        else:
            pg_col = "VARCHAR(255)"
            
        sql.append(f"    {col} {pg_col},")
        
    sql.append("    geom GEOMETRY(Geometry, 4326)")
    sql.append(");")
    sql.append(f"CREATE INDEX IF NOT EXISTS {table_name}_geom_idx ON {table_name} USING GIST (geom);")
    
    return "\n".join(sql)

