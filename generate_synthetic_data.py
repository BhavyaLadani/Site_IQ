"""
Synthetic Data Generator — Gujarat / Ahmedabad Region
=====================================================
Generates realistic geospatial test data for the Ahmedabad metro area.
BBox: lon 72.45-72.70, lat 22.95-23.15 (covers core Ahmedabad)
"""

import numpy as np
import geopandas as gpd
from shapely.geometry import Point, LineString, Polygon
import os

np.random.seed(42)

# Ahmedabad Metro Bounding Box
MIN_LON, MIN_LAT, MAX_LON, MAX_LAT = 72.45, 22.95, 72.70, 23.15
DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)


def random_point():
    return Point(np.random.uniform(MIN_LON, MAX_LON), np.random.uniform(MIN_LAT, MAX_LAT))


def generate():
    # 1. Demographics — 200 census polygons
    print("Generating demographics.geojson (Ahmedabad)...")
    demo = []
    for _ in range(200):
        pt = random_point()
        poly = pt.buffer(np.random.uniform(0.003, 0.012)).simplify(0.001)
        # Ahmedabad-realistic values:
        #   Dense areas (old city, SG highway): pop 8k-25k
        #   Suburbs (Bopal, Gota): pop 2k-8k
        pop = int(np.random.lognormal(8.5, 0.6))
        pop = min(max(pop, 1000), 30000)
        demo.append({
            "geometry": poly,
            "population_density": pop,
            "median_income": int(np.random.uniform(15000, 80000)),  # INR monthly
            "pct_age_25_54": round(np.random.uniform(0.25, 0.55), 2),
            "total_population": int(pop * np.random.uniform(0.8, 2.5)),
            "literacy_rate": round(np.random.uniform(0.70, 0.95), 2),
        })
    gpd.GeoDataFrame(demo, crs="EPSG:4326").to_file(
        os.path.join(DATA_DIR, "demographics.geojson"), driver="GeoJSON")

    # 2. Roads — 500 segments
    print("Generating roads.geojson...")
    roads = []
    types = ["highway", "primary", "secondary", "residential"]
    probs = [0.05, 0.15, 0.30, 0.50]
    # Major Ahmedabad corridors:
    highway_lats = [23.00, 23.05, 23.10]  # SG Highway, Ashram Road, NH48
    highway_lons = [72.50, 72.55, 72.60, 72.65]

    for _ in range(500):
        rtype = np.random.choice(types, p=probs)
        if rtype == "highway":
            if np.random.rand() > 0.5:
                lat = np.random.choice(highway_lats) + np.random.normal(0, 0.005)
                line = LineString([(MIN_LON, lat), (MAX_LON, lat)])
            else:
                lon = np.random.choice(highway_lons) + np.random.normal(0, 0.005)
                line = LineString([(lon, MIN_LAT), (lon, MAX_LAT)])
        else:
            p1 = random_point()
            length = np.random.uniform(0.002, 0.012)
            angle = np.random.uniform(0, 2 * np.pi)
            p2 = Point(p1.x + np.cos(angle) * length, p1.y + np.sin(angle) * length)
            line = LineString([p1, p2])
        roads.append({"geometry": line, "road_type": rtype})
    gpd.GeoDataFrame(roads, crs="EPSG:4326").to_file(
        os.path.join(DATA_DIR, "roads.geojson"), driver="GeoJSON")

    # 3. POIs — 300 points with clustering
    print("Generating pois.geojson...")
    pois = []
    categories = ["competitor", "anchor_tenant", "complementary"]
    cat_probs = [0.4, 0.2, 0.4]
    brands = [
        "Reliance Fresh", "D-Mart", "Big Bazaar", "Vishal Mega Mart",
        "McDonald's", "Dominos", "Cafe Coffee Day", "Starbucks",
        "Apollo Pharmacy", "Medplus", "Croma", "Decathlon",
        "HDFC Bank", "SBI", "ICICI", "Zudio", "Pantaloons"
    ]
    # High-density commercial zones in Ahmedabad
    clusters = [
        Point(72.530, 23.030),   # CG Road
        Point(72.510, 23.020),   # Ashram Road
        Point(72.505, 23.070),   # SG Highway (north)
        Point(72.580, 23.050),   # Maninagar
        Point(72.630, 22.990),   # Vastral
        Point(72.470, 23.100),   # Bopal
    ]
    for _ in range(300):
        cat = np.random.choice(categories, p=cat_probs)
        if cat == "competitor":
            center = np.random.choice(clusters)
            lat = np.clip(np.random.normal(center.y, 0.012), MIN_LAT, MAX_LAT)
            lon = np.clip(np.random.normal(center.x, 0.012), MIN_LON, MAX_LON)
            pt = Point(lon, lat)
        else:
            pt = random_point()
        pois.append({
            "geometry": pt,
            "category": cat,
            "brand": np.random.choice(brands),
        })
    gpd.GeoDataFrame(pois, crs="EPSG:4326").to_file(
        os.path.join(DATA_DIR, "pois.geojson"), driver="GeoJSON")

    # 4. Zoning — 150 polygons
    print("Generating zoning.geojson...")
    zoning = []
    zone_types = ["commercial", "mixed_use", "residential", "industrial", "park"]
    for _ in range(150):
        pt = random_point()
        poly = pt.buffer(np.random.uniform(0.004, 0.015)).simplify(0.002)
        zoning.append({"geometry": poly, "zone_type": np.random.choice(zone_types)})
    gpd.GeoDataFrame(zoning, crs="EPSG:4326").to_file(
        os.path.join(DATA_DIR, "zoning.geojson"), driver="GeoJSON")

    # 5. Environment — 100 risk polygons
    print("Generating environment.geojson...")
    env = []
    flood_risks = ["low", "medium", "high"]
    # Sabarmati river corridor for flood risk
    river = LineString([(72.56, MIN_LAT), (72.58, MAX_LAT)])
    for _ in range(100):
        risk = np.random.choice(flood_risks, p=[0.5, 0.3, 0.2])
        if risk == "high":
            pt_on_river = river.interpolate(np.random.uniform(0, 1), normalized=True)
            center = Point(pt_on_river.x + np.random.normal(0, 0.008),
                           pt_on_river.y + np.random.normal(0, 0.008))
            poly = center.buffer(np.random.uniform(0.002, 0.006)).simplify(0.001)
        else:
            poly = random_point().buffer(np.random.uniform(0.005, 0.018)).simplify(0.002)
        env.append({
            "geometry": poly,
            "flood_risk": risk,
            "earthquake_risk": round(np.random.uniform(0.1, 0.5), 2),  # Gujarat seismic
            "air_quality_index": int(np.random.uniform(50, 200)),
        })
    gpd.GeoDataFrame(env, crs="EPSG:4326").to_file(
        os.path.join(DATA_DIR, "environment.geojson"), driver="GeoJSON")

    # 6. Expert labeled sites — 50 ground truth points
    print("Generating expert_labeled_sites.geojson...")
    expert = []
    uses = ["retail", "warehouse", "ev_charging"]
    for _ in range(50):
        r = np.random.rand()
        if r <= 0.20:
            score = int(np.random.uniform(70, 100))
        elif r <= 0.70:
            score = int(np.random.uniform(40, 69))
        else:
            score = int(np.random.uniform(5, 39))
        expert.append({
            "geometry": random_point(),
            "expert_score": score,
            "use_case": np.random.choice(uses),
        })
    gpd.GeoDataFrame(expert, crs="EPSG:4326").to_file(
        os.path.join(DATA_DIR, "expert_labeled_sites.geojson"), driver="GeoJSON")

    print("\n" + "=" * 50)
    print("Generation Complete (Gujarat / Ahmedabad)")
    print("=" * 50)
    for f in ["demographics", "roads", "pois", "zoning", "environment", "expert_labeled_sites"]:
        print(f"  - {f}.geojson")
    print(f"\nBBox: ({MIN_LON}, {MIN_LAT}) to ({MAX_LON}, {MAX_LAT})")


if __name__ == "__main__":
    generate()
