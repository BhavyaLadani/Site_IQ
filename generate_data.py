"""
Sample Data Generator
=====================
Creates realistic synthetic GeoJSON datasets centered around
Manhattan, New York for demo purposes.

Run this script directly to regenerate all sample data:
    python generate_data.py
"""

import json
import os
import random
import math

# Manhattan center
CENTER_LAT = 40.7580
CENTER_LON = -73.9855

# Convenience: offset in degrees for ~meters
# 1 degree lat ≈ 111,320 m, 1 degree lon ≈ 84,372 m at 40.7°N
LAT_PER_M = 1.0 / 111320.0
LON_PER_M = 1.0 / (111320.0 * math.cos(math.radians(CENTER_LAT)))


def rand_point(center_lat, center_lon, radius_m):
    """Generate a random point within radius_m of center."""
    angle = random.uniform(0, 2 * math.pi)
    dist = random.uniform(0, radius_m)
    lat = center_lat + dist * LAT_PER_M * math.sin(angle)
    lon = center_lon + dist * LON_PER_M * math.cos(angle)
    return round(lat, 6), round(lon, 6)


def rand_polygon(center_lat, center_lon, size_m, irregularity=0.3):
    """Generate a random polygon around center."""
    n_points = random.randint(5, 8)
    coords = []
    for i in range(n_points):
        angle = 2 * math.pi * i / n_points + random.uniform(-0.3, 0.3)
        dist = size_m * (1.0 + random.uniform(-irregularity, irregularity))
        lat = center_lat + dist * LAT_PER_M * math.sin(angle)
        lon = center_lon + dist * LON_PER_M * math.cos(angle)
        coords.append([round(lon, 6), round(lat, 6)])
    coords.append(coords[0])  # close polygon
    return coords


def generate_pois():
    """Generate ~50 Points of Interest."""
    categories = [
        ("Restaurant", 15), ("Cafe", 8), ("Retail Store", 8),
        ("Grocery", 5), ("Pharmacy", 4), ("Bank", 3),
        ("Gym", 3), ("Salon", 2), ("Bookstore", 2),
    ]
    names = {
        "Restaurant": ["The Golden Fork", "Sakura Sushi", "Bella Italia", "Spice Route",
                        "Urban Grill", "The Green Leaf", "Taco Fiesta", "Noodle House",
                        "Bistro 42", "Harbor Seafood", "Cloud Kitchen", "Pasta Paradise",
                        "Le Petit Chef", "Smoke & Fire BBQ", "The Vegan Spot"],
        "Cafe": ["Blue Bottle", "Stumptown", "The Daily Grind", "Matcha Lab",
                 "Brew & Bean", "Morning Sun", "Perk Up", "The Roastery"],
        "Retail Store": ["Urban Outfitters", "Zara", "H&M", "Nordstrom",
                         "Nike Store", "Apple Store", "Best Buy", "Target"],
        "Grocery": ["Whole Foods", "Trader Joe's", "Gristedes", "Morton Williams", "Key Food"],
        "Pharmacy": ["CVS Pharmacy", "Walgreens", "Duane Reade", "Rite Aid"],
        "Bank": ["Chase Bank", "Bank of America", "Citibank"],
        "Gym": ["Equinox", "Planet Fitness", "SoulCycle"],
        "Salon": ["Drybar", "Supercuts"],
        "Bookstore": ["Strand Bookstore", "Barnes & Noble"],
    }

    features = []
    for category, count in categories:
        for i in range(count):
            lat, lon = rand_point(CENTER_LAT, CENTER_LON, 2500)
            name = names[category][i % len(names[category])]
            features.append({
                "type": "Feature",
                "properties": {
                    "name": name,
                    "category": category,
                    "rating": round(random.uniform(3.5, 5.0), 1),
                    "reviews": random.randint(10, 500),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                }
            })

    return {"type": "FeatureCollection", "features": features}


def generate_transit_stops():
    """Generate ~20 transit stops with routes/frequency."""
    stop_names = [
        "Times Square–42nd St", "Grand Central", "Penn Station",
        "Herald Square", "Union Square", "Columbus Circle",
        "Rockefeller Center", "5th Ave–53rd St", "Lexington Ave–59th St",
        "57th St–7th Ave", "49th St", "50th St–Broadway",
        "42nd St–Bryant Park", "34th St–Herald Sq", "28th St",
        "23rd St", "14th St–Union Sq", "Astor Place",
        "8th St–NYU", "Christopher St–Sheridan Sq",
    ]

    features = []
    for i, name in enumerate(stop_names):
        lat, lon = rand_point(CENTER_LAT, CENTER_LON, 3000)
        features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "stop_id": f"MTA_{i+1:03d}",
                "routes": random.randint(1, 12),
                "frequency": random.randint(3, 15),  # trains per hour
                "type": random.choice(["subway", "subway", "bus", "bus", "commuter_rail"]),
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            }
        })

    return {"type": "FeatureCollection", "features": features}


def generate_traffic():
    """Generate ~15 traffic corridor segments."""
    corridors = [
        ("Broadway", 45000), ("5th Avenue", 38000), ("7th Avenue", 42000),
        ("Park Avenue", 30000), ("Lexington Avenue", 35000),
        ("Madison Avenue", 28000), ("6th Avenue", 40000),
        ("8th Avenue", 32000), ("3rd Avenue", 25000),
        ("West Side Highway", 55000), ("FDR Drive", 50000),
        ("42nd Street", 35000), ("34th Street", 30000),
        ("23rd Street", 22000), ("14th Street", 28000),
    ]

    features = []
    for name, base_volume in corridors:
        # Create a line segment
        lat1, lon1 = rand_point(CENTER_LAT, CENTER_LON, 2000)
        angle = random.uniform(0, 2 * math.pi)
        length = random.uniform(300, 800)
        lat2 = lat1 + length * LAT_PER_M * math.sin(angle)
        lon2 = lon1 + length * LON_PER_M * math.cos(angle)

        volume = base_volume + random.randint(-5000, 5000)
        features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "volume": volume,
                "speed_limit_mph": random.choice([25, 30, 35]),
                "lanes": random.choice([2, 3, 4, 6]),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [round(lon1, 6), round(lat1, 6)],
                    [round(lon2, 6), round(lat2, 6)],
                ],
            }
        })

    return {"type": "FeatureCollection", "features": features}


def generate_demographics():
    """Generate ~10 demographic census-tract polygons covering the area."""
    tract_data = [
        ("Census Tract 1", 25000, 95000),
        ("Census Tract 2", 32000, 110000),
        ("Census Tract 3", 18000, 78000),
        ("Census Tract 4", 28000, 120000),
        ("Census Tract 5", 15000, 65000),
        ("Census Tract 6", 35000, 88000),
        ("Census Tract 7", 22000, 102000),
        ("Census Tract 8", 30000, 135000),
        ("Census Tract 9", 12000, 55000),
        ("Census Tract 10", 20000, 92000),
    ]

    features = []
    # Arrange tracts in a grid pattern
    grid_size = math.ceil(math.sqrt(len(tract_data)))
    cell_size = 600  # meters per cell

    for i, (name, pop_density, income) in enumerate(tract_data):
        row = i // grid_size
        col = i % grid_size

        center_lat_t = CENTER_LAT + (row - grid_size / 2) * cell_size * LAT_PER_M * 2
        center_lon_t = CENTER_LON + (col - grid_size / 2) * cell_size * LON_PER_M * 2

        coords = rand_polygon(center_lat_t, center_lon_t, cell_size)

        features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "tract_id": f"36061{i+1:04d}00",
                "population_density": pop_density + random.randint(-2000, 2000),
                "median_income": income + random.randint(-5000, 5000),
                "total_population": random.randint(3000, 8000),
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords],
            }
        })

    return {"type": "FeatureCollection", "features": features}


def generate_zoning():
    """Generate ~8 zoning polygons."""
    zones = [
        ("commercial", 400),
        ("mixed_use", 500),
        ("commercial_retail", 350),
        ("residential_mixed", 450),
        ("residential", 500),
        ("light_industrial", 400),
        ("institutional", 300),
        ("park_recreation", 350),
    ]

    features = []
    for i, (zone_type, size) in enumerate(zones):
        angle = 2 * math.pi * i / len(zones)
        dist = random.uniform(500, 1800)
        clat = CENTER_LAT + dist * LAT_PER_M * math.sin(angle)
        clon = CENTER_LON + dist * LON_PER_M * math.cos(angle)

        coords = rand_polygon(clat, clon, size)

        features.append({
            "type": "Feature",
            "properties": {
                "zone_type": zone_type,
                "zone_id": f"ZN-{i+1:03d}",
                "description": zone_type.replace("_", " ").title() + " Zone",
                "max_height_ft": random.choice([40, 60, 80, 120, 200, None]),
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords],
            }
        })

    return {"type": "FeatureCollection", "features": features}


def generate_competitors():
    """Generate ~30 competitor locations."""
    competitor_types = [
        "Coffee Shop", "Fast Food", "Convenience Store",
        "Clothing Store", "Electronics", "Bookstore",
    ]

    features = []
    for i in range(30):
        lat, lon = rand_point(CENTER_LAT, CENTER_LON, 2500)
        features.append({
            "type": "Feature",
            "properties": {
                "name": f"Competitor {i+1}",
                "type": random.choice(competitor_types),
                "chain": random.choice([True, False]),
                "estimated_revenue": random.randint(200000, 2000000),
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            }
        })

    return {"type": "FeatureCollection", "features": features}


def generate_flood_zones():
    """Generate 3 flood zone polygons (1 with disqualifying AE zone)."""
    zones = [
        ("AE", 300),  # Disqualifying!
        ("X", 400),   # Moderate risk
        ("X500", 350),  # Minimal risk
    ]

    features = []
    positions = [
        (CENTER_LAT + 0.015, CENTER_LON - 0.008),  # AE zone — offset from center
        (CENTER_LAT - 0.010, CENTER_LON + 0.012),
        (CENTER_LAT + 0.005, CENTER_LON + 0.015),
    ]

    for i, ((zone, size), (clat, clon)) in enumerate(zip(zones, positions)):
        coords = rand_polygon(clat, clon, size)
        features.append({
            "type": "Feature",
            "properties": {
                "zone": zone,
                "flood_zone": zone,
                "zone_id": f"FZ-{i+1:03d}",
                "description": f"FEMA Flood Zone {zone}",
                "risk_level": "high" if zone in ["AE", "VE", "A"] else "moderate" if zone == "X" else "low",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords],
            }
        })

    return {"type": "FeatureCollection", "features": features}


def main():
    """Generate all sample data files."""
    os.makedirs("data", exist_ok=True)

    datasets = {
        "data/sample_pois.geojson": generate_pois,
        "data/transit_stops.geojson": generate_transit_stops,
        "data/traffic.geojson": generate_traffic,
        "data/demographics.geojson": generate_demographics,
        "data/zoning.geojson": generate_zoning,
        "data/competitors.geojson": generate_competitors,
        "data/flood_zones.geojson": generate_flood_zones,
    }

    for filepath, generator in datasets.items():
        data = generator()
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        n_features = len(data["features"])
        print(f"  [OK] {filepath} - {n_features} features")

    print("\n[DONE] All sample data generated!")


if __name__ == "__main__":
    random.seed(42)  # Reproducible data
    main()
