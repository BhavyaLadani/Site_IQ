"""
Isochrone Generator
===================
Generates drive-time and walk-time isochrones using OpenRouteService API.
Falls back to circular buffer approximation when API is unavailable.
"""

import math
import json
from shapely.geometry import Point, mapping
from config import ORS_API_KEY, ISOCHRONE_CONFIG


def _circular_buffer_isochrone(lat: float, lon: float,
                               range_seconds: list,
                               profile: str) -> dict:
    """
    Fallback: generate circular buffer isochrones using speed estimates.
    Returns a GeoJSON FeatureCollection.
    """
    speed_kmh = ISOCHRONE_CONFIG["fallback_speed_kmh"].get(profile, 40)
    speed_ms = speed_kmh * 1000.0 / 3600.0  # m/s

    features = []
    for seconds in sorted(range_seconds, reverse=True):
        radius_m = speed_ms * seconds
        # Convert meters to approximate degrees
        # 1 degree latitude ≈ 111,320 meters
        lat_offset = radius_m / 111320.0
        lon_offset = radius_m / (111320.0 * math.cos(math.radians(lat)))

        # Generate circle polygon (32-sided approximation)
        n_points = 32
        coords = []
        for i in range(n_points + 1):
            angle = 2.0 * math.pi * i / n_points
            cx = lon + lon_offset * math.cos(angle)
            cy = lat + lat_offset * math.sin(angle)
            coords.append([round(cx, 6), round(cy, 6)])

        feature = {
            "type": "Feature",
            "properties": {
                "range_seconds": seconds,
                "range_minutes": round(seconds / 60, 1),
                "profile": profile,
                "method": "circular_buffer_fallback",
                "radius_m": round(radius_m, 0),
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
    }


def _ors_isochrone(lat: float, lon: float,
                   range_seconds: list,
                   profile: str) -> dict:
    """
    Generate isochrones using OpenRouteService API.
    Returns a GeoJSON FeatureCollection.
    """
    try:
        import openrouteservice
        client = openrouteservice.Client(key=ORS_API_KEY)

        result = client.isochrones(
            locations=[[lon, lat]],
            profile=profile,
            range=range_seconds,
            range_type="time",
            attributes=["area", "total_pop"],
        )

        # Enrich properties
        for feature in result.get("features", []):
            props = feature.get("properties", {})
            props["profile"] = profile
            props["method"] = "openrouteservice"
            if "value" in props:
                props["range_seconds"] = props["value"]
                props["range_minutes"] = round(props["value"] / 60, 1)

        return result

    except Exception as e:
        # Fall back to circular buffer on any error
        print(f"[Isochrone] ORS API failed ({e}), using circular buffer fallback")
        return _circular_buffer_isochrone(lat, lon, range_seconds, profile)


def generate_isochrone(lat: float, lon: float,
                       profile: str = None,
                       range_seconds: list = None) -> dict:
    """
    Generate isochrones for a coordinate.

    Parameters
    ----------
    lat, lon : float
        Center point coordinates.
    profile : str, optional
        Routing profile. Default from config.
        Options: "driving-car", "foot-walking", "cycling-regular"
    range_seconds : list[int], optional
        Time ranges in seconds. Default from config.

    Returns
    -------
    dict
        GeoJSON FeatureCollection with isochrone polygons.
    """
    if profile is None:
        profile = ISOCHRONE_CONFIG["default_profile"]
    if range_seconds is None:
        range_seconds = ISOCHRONE_CONFIG["default_range_seconds"]

    if ORS_API_KEY:
        return _ors_isochrone(lat, lon, range_seconds, profile)
    else:
        return _circular_buffer_isochrone(lat, lon, range_seconds, profile)
