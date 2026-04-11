import pytest
import math
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
from engine.scoring_model import compute_score

@pytest.fixture
def base_config():
    return {
        "weights": {
            "demographics": 0.25, 
            "transport": 0.20, 
            "poi": 0.20, 
            "land_use": 0.20, 
            "environment": 0.15
        },
        "min_population": 5000,
        "poi_optimal_count": 3,
        "poi_max_count": 10,
        "demo_sigma": 2.0,
        "max_pop_density": 20000.0,
        "max_income": 120000.0,
        "land_use_map": {"commercial": 1.0, "mixed": 0.7, "residential": 0.3, "industrial": 0.1}
    }

def _create_mock_layers(lat, lon, pop_density, income, zone, flood, aqi, poi_count):
    # Demographics
    demo = gpd.GeoDataFrame({
        "population_density": [pop_density],
        "median_income": [income],
        "age_score": [80],
        # Give a large total_population to bypass threshold, or small to trigger it
        "total_population": [pop_density * 2], 
        "geometry": [Point(lon, lat)]
    }, crs="EPSG:4326")

    # Transport
    # Transport point exactly at lat/lon so distance is 0 -> score 1.0
    trans = gpd.GeoDataFrame({"road_type": ["highway"], "geometry": [Point(lon, lat)]}, crs="EPSG:4326")

    # POI
    pois = []
    # Create `poi_count` points very close
    for i in range(poi_count):
        pois.append(Point(lon + 0.0001*i, lat + 0.0001*i))
    if not pois:
        poi_gdf = gpd.GeoDataFrame(columns=["category", "geometry"], crs="EPSG:4326")
    else:
        poi_gdf = gpd.GeoDataFrame({"category": ["retail"] * poi_count, "geometry": pois}, crs="EPSG:4326")

    # Land use
    lu = gpd.GeoDataFrame({"zone_type": [zone], "geometry": [Point(lon, lat).buffer(0.01)]}, crs="EPSG:4326")

    # Environment
    env = gpd.GeoDataFrame({
        "flood_risk": [flood],
        "earthquake_risk": [0.0],
        "air_quality_index": [aqi],
        "geometry": [Point(lon, lat).buffer(0.01)]
    }, crs="EPSG:4326")

    return {
        "demographics": demo,
        "transport": trans,
        "poi": poi_gdf,
        "land_use": lu,
        "environment": env
    }


def test_high_score_site(base_config):
    """
    Test 1: High-score site.
    Optimal POI (3), commercial zoning, perfect environment (no flood, low AQI), high pop/income.
    """
    lat, lon = 40.0, -74.0
    layers = _create_mock_layers(lat, lon, 
                                 pop_density=20000, 
                                 income=120000, 
                                 zone="commercial", 
                                 flood=0.0, 
                                 aqi=0.0, 
                                 poi_count=3)
    
    # Needs at least 5000 population to pass constraint
    layers["demographics"].loc[0, "total_population"] = 10000
    
    result = compute_score(lat, lon, layers, base_config)
    assert result["total_score"] > 80.0
    assert result["layer_scores"]["demographics"] > 80.0
    assert result["layer_scores"]["poi"] == 100.0 # optimal count = 3


def test_low_score_site(base_config):
    """
    Test 2: Low-score site triggered by threshold constraint.
    Population is under minimum allowed (5000). Total score should be 0.
    """
    lat, lon = 40.0, -74.0
    layers = _create_mock_layers(lat, lon, 
                                 pop_density=500, 
                                 income=30000, 
                                 zone="residential", 
                                 flood=0.0, 
                                 aqi=150.0, 
                                 poi_count=0)
    
    layers["demographics"].loc[0, "total_population"] = 3000 # Below 5000
    
    result = compute_score(lat, lon, layers, base_config)
    assert result["total_score"] == 0.0
    assert len(result["warnings"]) == 1
    assert "CONSTRAINT FAILURE" in result["warnings"][0]


def test_edge_case_near_water(base_config):
    """
    Test 3: Edge case near water (flood_risk = 1.0).
    Everything else is perfect, but environment score takes a massive hit.
    """
    lat, lon = 40.0, -74.0
    layers = _create_mock_layers(lat, lon, 
                                 pop_density=20000, 
                                 income=120000, 
                                 zone="commercial", 
                                 flood=1.0,  # Max flood risk
                                 aqi=0.0, 
                                 poi_count=3)
    
    layers["demographics"].loc[0, "total_population"] = 10000
    
    result = compute_score(lat, lon, layers, base_config)
    
    env_score = result["layer_scores"]["environment"]
    # Base is 0.5. AQI bonus is +0.3. Flood penalty is -0.4.
    # Expected env base calculation: 0.5 + 0.3 - 0.4 = 0.4 -> 40.0
    assert math.isclose(env_score, 40.0, abs_tol=1e-1)
    
    # Compare with high-score site (env score = 80.0)
    # Total score should be visibly lower due to the 0.15 environment weight
    assert result["total_score"] > 60.0 and result["total_score"] < 95.0
