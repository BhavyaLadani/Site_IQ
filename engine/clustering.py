"""
Spatial Clustering
==================
Detects spatial clusters and hot-spots using:
1. DBSCAN — density-based clustering on point features
2. H3 hexagonal binning — aggregate counts into hex cells

Used for analyzing POI / competitor spatial patterns.
"""

import numpy as np
import geopandas as gpd
from shapely.geometry import Point, Polygon
from sklearn.cluster import DBSCAN
import h3
from config import CLUSTERING_CONFIG


def dbscan_clusters(points_gdf: gpd.GeoDataFrame,
                    eps_m: float = None,
                    min_samples: int = None) -> gpd.GeoDataFrame:
    """
    Apply DBSCAN clustering to a GeoDataFrame of point features.

    Parameters
    ----------
    points_gdf : GeoDataFrame
        Must contain point geometries.
    eps_m : float, optional
        Maximum distance between two samples (meters). Default from config.
    min_samples : int, optional
        Minimum points to form a cluster. Default from config.

    Returns
    -------
    GeoDataFrame
        Original data with added 'cluster' column (-1 = noise).
    """
    if eps_m is None:
        eps_m = CLUSTERING_CONFIG["dbscan_eps_m"]
    if min_samples is None:
        min_samples = CLUSTERING_CONFIG["dbscan_min_samples"]

    if points_gdf.empty:
        return points_gdf.copy()

    # Ensure point geometries
    result = points_gdf.copy()
    if result.crs is None:
        result = result.set_crs("EPSG:4326")

    # Project to meters for distance calculation
    centroid = result.geometry.unary_union.centroid
    utm_zone = int((centroid.x + 180) / 6) + 1
    hemisphere = "north" if centroid.y >= 0 else "south"
    epsg = 32600 + utm_zone if hemisphere == "north" else 32700 + utm_zone

    projected = result.to_crs(f"EPSG:{epsg}")
    coords = np.column_stack([
        projected.geometry.x,
        projected.geometry.y
    ])

    # Run DBSCAN
    db = DBSCAN(eps=eps_m, min_samples=min_samples)
    labels = db.fit_predict(coords)

    result["cluster"] = labels
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int(np.sum(labels == -1))

    result.attrs["n_clusters"] = n_clusters
    result.attrs["n_noise"] = n_noise

    return result


def h3_hotspots(points_gdf: gpd.GeoDataFrame,
                resolution: int = None,
                threshold: int = None) -> dict:
    """
    Aggregate point features into H3 hexagonal bins and identify hotspots.

    Parameters
    ----------
    points_gdf : GeoDataFrame
        Must contain point geometries.
    resolution : int, optional
        H3 resolution (0–15). Default from config.
    threshold : int, optional
        Minimum count to flag as hotspot. Default from config.

    Returns
    -------
    dict
        GeoJSON FeatureCollection with hex polygons and counts.
    """
    if resolution is None:
        resolution = CLUSTERING_CONFIG["h3_resolution"]
    if threshold is None:
        threshold = CLUSTERING_CONFIG["hotspot_threshold"]

    if points_gdf.empty:
        return {"type": "FeatureCollection", "features": []}

    gdf = points_gdf.copy()
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    # Assign H3 cell to each point
    gdf["h3_cell"] = gdf.geometry.apply(
        lambda g: h3.latlng_to_cell(g.y, g.x, resolution)
    )

    # Count points per hex
    hex_counts = gdf.groupby("h3_cell").size().reset_index(name="count")

    # Build GeoJSON features
    features = []
    for _, row in hex_counts.iterrows():
        cell_id = row["h3_cell"]
        count = int(row["count"])
        is_hotspot = count >= threshold

        # Get hex boundary
        boundary = h3.cell_to_boundary(cell_id)
        # h3 returns (lat, lng) tuples — convert to (lng, lat) for GeoJSON
        coords = [[lng, lat] for lat, lng in boundary]
        coords.append(coords[0])  # close the polygon

        feature = {
            "type": "Feature",
            "properties": {
                "h3_cell": cell_id,
                "count": count,
                "is_hotspot": is_hotspot,
                "resolution": resolution,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords],
            }
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_hexes": len(features),
            "hotspot_count": sum(1 for f in features if f["properties"]["is_hotspot"]),
            "resolution": resolution,
            "threshold": threshold,
        }
    }
