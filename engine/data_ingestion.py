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


def load_all_layers(data_dir: str) -> dict[str, gpd.GeoDataFrame]:
    """
    Main ingestion function. Will load 5 core categories, reproject and validate.
    
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
