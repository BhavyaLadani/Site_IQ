"""
Spatial Analysis Module
=======================
Advanced statistical computations for site suitability grids inclusive of:
1. H3 Hexagonal Array Binning
2. Haversine DBSCAN Spatial Clustering
3. Getis-Ord Gi* Econometric Hot-Spot Detection
"""

import os
import random
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point, Polygon
import h3
from sklearn.cluster import DBSCAN

# Lazy load spatial econometric dependencies
try:
    import libpysal
    from esda.getisord import G_Local
except ImportError:
    libpysal = None
    G_Local = None


def bin_to_h3(scored_points: list[tuple], resolution: int = 8) -> gpd.GeoDataFrame:
    """
    Aggregate point data into an H3 hex-grid mapping mean values.
    Accepts: scored_points -> list of (lat, lon, score)
    """
    h3_data = {}
    for lat, lon, score in scored_points:
        # h3 library versions map slightly differently, try latlng_to_cell first (v4+)
        try:
            hex_id = h3.latlng_to_cell(lat, lon, resolution)
        except AttributeError:
            hex_id = h3.geo_to_h3(lat, lon, resolution) # Fallback for older h3 < v4
            
        if hex_id not in h3_data:
            h3_data[hex_id] = []
        h3_data[hex_id].append(score)
        
    features = []
    for hex_id, scores in h3_data.items():
        mean_s = np.mean(scores)
        
        try:
            boundary = h3.cell_to_boundary(hex_id)
        except AttributeError:
            boundary = h3.h3_to_geo_boundary(hex_id)
            
        # H3 boundaries are (lat, lon), Shapely Polygon requires (lon, lat)
        poly = Polygon([(b[1], b[0]) for b in boundary])
        features.append({
            "hex_id": hex_id, 
            "mean_score": mean_s, 
            "geometry": poly
        })
        
    gdf = gpd.GeoDataFrame(features, crs="EPSG:4326")
    return gdf


def cluster_high_score_sites(scored_points: list[tuple], threshold: float = 70.0) -> gpd.GeoDataFrame:
    """
    Identify density clusters routing exclusively high-score points utilizing Scikit DBSCAN.
    """
    high_points = [p for p in scored_points if p[2] > threshold]
    if not high_points:
        return gpd.GeoDataFrame(columns=["score", "cluster_id", "geometry"], crs="EPSG:4326")
    
    # Convert lat/lon coordinates from degrees to radians for strict Haversine math
    coords_rad = np.array([[np.radians(p[0]), np.radians(p[1])] for p in high_points])
    
    # Earth radius ~6371km. Compute epsilon in radians: eps = 0.5km / 6371.0km
    eps_rad = 0.5 / 6371.0
    
    db = DBSCAN(eps=eps_rad, min_samples=3, algorithm='ball_tree', metric='haversine').fit(coords_rad)
    
    features = []
    for i, p in enumerate(high_points):
        lat, lon, score = p
        cluster_id = db.labels_[i]
        features.append({
            "score": score,
            "cluster_id": int(cluster_id),
            "cluster_status": "Noise" if cluster_id == -1 else f"Cluster {cluster_id}",
            "geometry": Point(lon, lat)
        })
        
    return gpd.GeoDataFrame(features, crs="EPSG:4326")


def compute_hotspots(scored_gdf: gpd.GeoDataFrame, score_col: str) -> gpd.GeoDataFrame:
    """
    Deploy PySAL ESDA matrix for Getis-Ord Gi* evaluating statistical hot/cold micro-regions.
    Requires libpysal and esda dependencies.
    """
    if libpysal is None or G_Local is None:
        raise ImportError("esda and libpysal are required for compute_hotspots(). Use pip install esda libpysal.")
        
    if len(scored_gdf) < 8:
        # Requires enough features to map K-Nearest Neighbors
        scored_gdf["hotspot_class"] = "Not Significant"
        return scored_gdf

    # Construct strict spatial weights matrix
    try:
        w = libpysal.weights.KNN.from_dataframe(scored_gdf, k=8)
        w.transform = 'R' # Row-standardize weight configuration
    except Exception as e:
        print(f"Warning: Failed to map KNN weights ({e}). Hotspots aborted.")
        scored_gdf["hotspot_class"] = "Not Significant"
        return scored_gdf
        
    # Analyze raw values directly against K-weighted boundaries 
    y = scored_gdf[score_col].values
    gi_star = G_Local(y, w, transform='R', star=True)
    
    # Mathematical Rules: +/- 2.58 roughly represents 99% CI 
    classes = []
    for z in gi_star.Zs:
        if z > 2.58:
            classes.append("Hot Spot")
        elif z < -2.58:
            classes.append("Cold Spot")
        else:
            classes.append("Not Significant")
            
    res_gdf = scored_gdf.copy()
    res_gdf["gi_z_score"] = gi_star.Zs
    res_gdf["hotspot_class"] = classes
    
    return res_gdf


if __name__ == "__main__":
    print("\n" + "="*50)
    print("Executing Spatial Analysis Engine Demo")
    print("="*50)
    
    # 1. Synthesize 500 coordinates bounded roughly around Manhattan
    sim_points = []
    for _ in range(500):
        lat = random.uniform(40.70, 40.80)
        lon = random.uniform(-74.05, -73.90)
        score = random.uniform(40.0, 100.0)
        
        # Inject artificial spatial clustering (Patch around Midtown)
        if 40.74 < lat < 40.76 and -73.99 < lon < -73.97:
            if random.random() > 0.2:
                score = random.uniform(85.0, 100.0)
                
        sim_points.append((lat, lon, score))
        
    print(f"[*] Generated N={len(sim_points)} syntheic scoring evaluations.")
    
    # 2. H3 Aggregation
    print("[*] Dispatching H3 Aggregation (Res 8)...")
    h3_gdf = bin_to_h3(sim_points, resolution=8)
    h3_gdf.to_file("h3_bins.geojson", driver="GeoJSON")
    print(f" -> Exported: h3_bins.geojson ({len(h3_gdf)} active hexes)")
    
    # 3. DBSCAN Clustering
    print("[*] Dispatching DBSCAN (Haversine)...")
    dbscan_gdf = cluster_high_score_sites(sim_points, threshold=70.0)
    dbscan_gdf.to_file("dbscan_clusters.geojson", driver="GeoJSON")
    print(f" -> Exported: dbscan_clusters.geojson ({len(dbscan_gdf)} >70 thresholds)")
    
    # 4. Getis-Ord Statistics
    print("[*] Dispatching Getis-Ord Gi* Econometrics (k=8)...")
    raw_gdf = gpd.GeoDataFrame(
        [{"score": p[2], "geometry": Point(p[1], p[0])} for p in sim_points],
        crs="EPSG:4326"
    )
    hotspots_gdf = compute_hotspots(raw_gdf, score_col="score")
    hotspots_gdf.to_file("hotspots.geojson", driver="GeoJSON")
    
    hs = len(hotspots_gdf[hotspots_gdf["hotspot_class"] == "Hot Spot"])
    cs = len(hotspots_gdf[hotspots_gdf["hotspot_class"] == "Cold Spot"])
    print(f" -> Exported: hotspots.geojson (Hot Spots: {hs}, Cold Spots: {cs})")
    
    print("\n[SUCCESS] Matrix operations successfully compiled to disk.")
