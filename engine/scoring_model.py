"""
Advanced Scoring Model Module
=============================
Computes a composite Site Readiness Score (0-100) using rigorous 
geospatial mathematics, decay patterns, and bounding box pre-filtering.
"""

import math
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

def _get_local_subset(lat: float, lon: float, gdf: gpd.GeoDataFrame, buffer_deg: float = 0.05) -> gpd.GeoDataFrame:
    """Pre-filter dataset using bounding box (.cx) to accelerate distance ops."""
    if gdf.empty:
        return gdf
    minx, maxx = lon - buffer_deg, lon + buffer_deg
    miny, maxy = lat - buffer_deg, lat + buffer_deg
    return gdf.cx[minx:maxx, miny:maxy].copy()

def _vectorized_distance_km(lat: float, lon: float, gdf: gpd.GeoDataFrame) -> np.ndarray:
    """Computes accurate distance in km utilizing pseudo-mercator projection."""
    if gdf.empty:
        return np.array([])
    if gdf.crs is None:
        gdf = gdf.set_crs('EPSG:4326')
    pnt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs("EPSG:3857").iloc[0]
    gdf_proj = gdf.to_crs("EPSG:3857")
    dists_m = gdf_proj.geometry.distance(pnt)
    return dists_m.values / 1000.0


# --- Sub-Scorers ---

def score_demographics(lat: float, lon: float, gdf: gpd.GeoDataFrame, config: dict) -> float:
    """
    Gaussian Distance-Decay Scoring: score * exp(-d^2 / 2*sigma^2)
    """
    local = _get_local_subset(lat, lon, gdf, 0.1)
    if local.empty:
        return 0.0
    
    dists = _vectorized_distance_km(lat, lon, local)
    sigma = config.get("demo_sigma", 3.0)
    decays = np.exp(-(dists**2) / (2 * sigma**2))
    
    nearest_idx = np.argmin(dists)
    nearest = local.iloc[nearest_idx]
    
    pop_d = float(nearest.get("population_density", 0))
    inc = float(nearest.get("median_income", 0))
    age = float(nearest.get("age_score", 50)) 
    
    norm_pop = min(pop_d / config.get("max_pop_density", 20000.0), 1.0)
    norm_inc = min(inc / config.get("max_income", 120000.0), 1.0)
    norm_age = min(age / 100.0, 1.0)
    
    base_score = (norm_pop + norm_inc + norm_age) / 3.0
    return float(base_score * decays[nearest_idx])


def score_transport(lat: float, lon: float, gdf: gpd.GeoDataFrame, config: dict) -> float:
    """
    Inverse Distance Weighting: 1 / (1 + d)
    """
    local = _get_local_subset(lat, lon, gdf, 0.1)
    if local.empty:
        return 0.0
    dists = _vectorized_distance_km(lat, lon, local)
    min_dist = np.min(dists)
    return 1.0 / (1.0 + min_dist)


def score_poi(lat: float, lon: float, gdf: gpd.GeoDataFrame, config: dict) -> float:
    """
    U-Shaped Quadratic Penalty: score = 1 - ((count - opt) / max)^2
    """
    local = _get_local_subset(lat, lon, gdf, 0.05) # ~5km bounds
    if local.empty:
        count = 0
    else:
        dists = _vectorized_distance_km(lat, lon, local)
        count = np.sum(dists <= 5.0)
        
    opt = config.get("poi_optimal_count", 3)
    max_c = config.get("poi_max_count", 10)
    
    val = 1.0 - ((count - opt) / max_c)**2
    return float(max(0.0, min(1.0, val)))


def score_land_use(lat: float, lon: float, gdf: gpd.GeoDataFrame, config: dict) -> float:
    """
    Categorical Scoring Mapping.
    """
    local = _get_local_subset(lat, lon, gdf, 0.02)
    if local.empty:
        return 0.0
    dists = _vectorized_distance_km(lat, lon, local)
    nearest = local.iloc[np.argmin(dists)]
    
    zt = str(nearest.get("zone_type", "")).lower()
    mapping = config.get("land_use_map", {"commercial": 1.0, "mixed": 0.7, "residential": 0.3, "industrial": 0.1})
    
    for k, v in mapping.items():
        if k in zt:
            return float(v)
    return 0.0


def score_environment(lat: float, lon: float, gdf: gpd.GeoDataFrame, config: dict) -> float:
    """
    Penalty-based scoring: risks lower score, air quality raises it.
    """
    local = _get_local_subset(lat, lon, gdf, 0.05)
    if local.empty:
        return 0.5  # Neutral if missing
    
    dists = _vectorized_distance_km(lat, lon, local)
    nearest = local.iloc[np.argmin(dists)]
    
    f_risk = float(nearest.get("flood_risk", 0.0))  # Assumed 0.0 (safe) to 1.0 (danger)
    e_risk = float(nearest.get("earthquake_risk", 0.0)) 
    aqi = float(nearest.get("air_quality_index", 50))
    
    aqi_norm = max(0.0, 1.0 - (aqi / 200.0)) # 0 is best, >200 is bad
    
    base = 0.5
    base += (aqi_norm * 0.3)
    base -= (f_risk * 0.4)
    base -= (e_risk * 0.4)
    return float(max(0.0, min(1.0, base)))


def _check_hard_constraints(lat: float, lon: float, demo_gdf: gpd.GeoDataFrame, config: dict) -> tuple:
    """
    Returns score=0 if population within 5km < min_population threshold.
    """
    if demo_gdf.empty:
        return True, "No demographic data to run threshold constraint against"
        
    local = _get_local_subset(lat, lon, demo_gdf, 0.06)
    if local.empty:
        pop = 0
    else:
        dists = _vectorized_distance_km(lat, lon, local)
        within_5km = local[dists <= 5.0]
        
        if "total_population" in within_5km.columns:
            pop = within_5km["total_population"].sum()
        elif "population_density" in within_5km.columns:
            # Approximate area in km2 based on EPSG:3857 extraction
            areas_km2 = within_5km.to_crs("EPSG:3857").area / 1e6
            pop = (within_5km["population_density"] * areas_km2).sum()
        else:
            pop = 0
            
    min_pop = config.get("min_population", 5000)
    if pop < min_pop:
        return False, f"Population within 5km ({int(pop)}) is below the {min_pop} minimum threshold."
    return True, None


# --- Core Pipeline Function ---

def compute_score(lat: float, lon: float, layers: dict, config: dict) -> dict:
    """
    Main execution pipeline for the advanced scoring model.
    """
    warnings = []
    
    # 1. Evaluate Hard Constraints
    demo_layer = layers.get("demographics", gpd.GeoDataFrame())
    passed, constraint_msg = _check_hard_constraints(lat, lon, demo_layer, config)
    
    if not passed:
        return {
            "total_score": 0.0,
            "layer_scores": {},
            "warnings": [f"CONSTRAINT FAILURE: {constraint_msg}"]
        }
    if constraint_msg:
        warnings.append(constraint_msg)
        
    # 2. Extract configuration weights
    weights = config.get("weights", {
        "demographics": 0.25, 
        "transport": 0.20, 
        "poi": 0.20, 
        "land_use": 0.20, 
        "environment": 0.15
    })
    
    # 3. Compute Normalized Layer Scores [0.0 - 1.0]
    sub_scores = {
        "demographics": score_demographics(lat, lon, demo_layer, config),
        "transport": score_transport(lat, lon, layers.get("transport", gpd.GeoDataFrame()), config),
        "poi": score_poi(lat, lon, layers.get("poi", gpd.GeoDataFrame()), config),
        "land_use": score_land_use(lat, lon, layers.get("land_use", gpd.GeoDataFrame()), config),
        "environment": score_environment(lat, lon, layers.get("environment", gpd.GeoDataFrame()), config)
    }
    
    # 4. Construct Composite Score
    total_score = 0.0
    for layer_name, score_val in sub_scores.items():
        w = weights.get(layer_name, 0.0)
        total_score += (score_val * w)
        
    # Translate 0-1 into 0-100 format
    composite_100 = round(total_score * 100.0, 2)
    
    return {
        "total_score": composite_100,
        "layer_scores": {k: round(v * 100.0, 2) for k, v in sub_scores.items()},
        "warnings": warnings
    }
