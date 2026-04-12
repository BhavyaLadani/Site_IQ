"""
GeoAnalyst-AI Configuration — Gujarat / Ahmedabad
=====================================================
Layer weights and parameters tuned for Indian urban areas.

Weights sum to 1.0:
  demographics   0.30
  transportation 0.25
  competition    0.20
  land_use       0.15
  environment    0.10
"""

# ─────────────────────────────────────────────
# Scoring Layer Weights (sum = 1.0)
# ─────────────────────────────────────────────
LAYER_WEIGHTS = {
    "demographics":   0.30,  # population density + income + age 25-55 share
    "transportation": 0.25,  # highway proximity, transit stops, parking
    "competition":    0.20,  # competitor density curve (non-linear)
    "land_use":       0.15,  # commercial zoning (hard constraint layer)
    "environment":    0.10,  # flood risk, air quality, noise
}

# ─────────────────────────────────────────────
# Grade Thresholds (relaxed for dense Indian urban data)
# ─────────────────────────────────────────────
GRADE_THRESHOLDS = {
    "A": 72,   # Excellent — Prime commercial location
    "B": 55,   # Good — Strong candidate
    "C": 40,   # Average — Feasible with investment
    "D": 25,   # Below Average — Significant challenges
    # F: < 25  — Not recommended
}

# ─────────────────────────────────────────────
# Distance-Decay — Per-Feature Lambda (km-based)
# ─────────────────────────────────────────────
# score(d) = base_score * exp(-lambda * d)
# d in kilometers
DECAY_LAMBDA = {
    "highway_ramp":  0.6,   # within 3 km matters
    "transit_stop":  0.4,   # moderate — BRTS/metro reach
    "competitor":    0.3,   # soft — far competitors still matter
    "flood_zone":    1.2,   # sharp — Sabarmati corridor
    "default":       0.4,   # fallback
}

# Global max search radius in meters
DECAY_CONFIG = {
    "default_method":  "exponential",
    "max_distance_m":  5000,
    "decay_rate":      0.0006,
}

# ─────────────────────────────────────────────
# Competitive Density Curve (non-linear)
# competitors within 1 km radius → raw score
# ─────────────────────────────────────────────
COMPETITION_DENSITY_CURVE = [
    (0,   0,   35),   # 0 competitors  — no demand signal
    (1,   3,   90),   # 1-2 competitors — optimal market validation
    (3,   6,   75),   # 3-5 competitors — healthy competition
    (6,   10,  50),   # 6-9 competitors — getting crowded
    (10, None, 20),   # 10+ competitors — saturated
]
COMPETITION_RADIUS_KM = 1.0

# ─────────────────────────────────────────────
# Hard Constraints (score = 0 if violated)
# Calibrated for Indian urban density
# ─────────────────────────────────────────────
HARD_CONSTRAINTS = {
    # Population catchment — Indian cities are dense, lower threshold
    "min_population_5km":   5000,
    # Valid commercial zoning codes (Relaxed for demo purposes across all areas)
    "valid_zoning_codes":   ["C1", "C2", "MX", "TC",
                             "commercial", "mixed_use", "commercial_retail", 
                             "c1", "c2", "mx", "tc", "park", "residential", 
                             "industrial", "retail", "public", "open_space",
                             "recreation_ground", "farmland", "grass"],
    # Flood zone disqualifiers
    "flood_zone_codes":     ["AE", "VE"],
    # Air Quality Index ceiling (Indian cities have higher baseline)
    "max_aqi":              200,
}

# ─────────────────────────────────────────────
# Threshold Bonuses (applied AFTER weighted sum, cap at 100)
# Calibrated for Indian metro areas (INR values)
# ─────────────────────────────────────────────
THRESHOLD_BONUSES = [
    # (attribute_key, operator, threshold_value, bonus_points, description)
    ("population_5km",  ">=", 15000, 8,  "Dense urban area (pop >15k in 5km)"),
    ("population_5km",  ">=", 8000,  4,  "Moderate urban density (pop >8k in 5km)"),
    ("median_income",   ">=", 40000, 5,  "Strong purchasing power (income >40k INR)"),
    ("median_income",   ">=", 25000, 3,  "Adequate spending capacity (income >25k INR)"),
]

# ─────────────────────────────────────────────
# Isochrone Configuration
# ─────────────────────────────────────────────
ORS_API_KEY = None
ISOCHRONE_CONFIG = {
    "default_profile":       "driving-car",
    "default_range_seconds": [300, 600, 900],
    "fallback_speed_kmh": {
        "driving-car":       30,   # Indian urban avg ~30km/h
        "foot-walking":       4,
        "cycling-regular":   12,
    },
}

# ─────────────────────────────────────────────
# Clustering Parameters
# ─────────────────────────────────────────────
CLUSTERING_CONFIG = {
    "dbscan_eps_m":      500,
    "dbscan_min_samples":  3,
    "h3_resolution":       9,
    "hotspot_threshold":   3,
}

# ─────────────────────────────────────────────
# Layer Data Paths
# ─────────────────────────────────────────────
DATA_DIR = "data"
LAYER_DATA_FILES = {
    "demographics":   f"{DATA_DIR}/demographics.geojson",
    "transportation": f"{DATA_DIR}/roads.geojson",
    "competition":    f"{DATA_DIR}/pois.geojson",
    "land_use":       f"{DATA_DIR}/zoning.geojson",
    "environment":    f"{DATA_DIR}/environment.geojson",
}

# ─────────────────────────────────────────────
# Demo Center — Ahmedabad, Gujarat
# ─────────────────────────────────────────────
DEMO_CENTER = {
    "lat": 23.0225,
    "lon": 72.5714,
    "city": "Ahmedabad, Gujarat",
}

# ─────────────────────────────────────────────
# Scoring Model Metadata
# ─────────────────────────────────────────────
SCORING_MODEL = {
    "name":    "Retail Store Site Readiness",
    "version": "2.0",
    "use_case": "retail",
}

# ─────────────────────────────────────────────
# Ingestion Pipeline Configuration
# ─────────────────────────────────────────────
INGESTION_CONFIG = {
    "study_area_bbox": [72.45, 22.95, 72.70, 23.15],  # Ahmedabad metro
    "target_crs": "EPSG:4326",
    "max_overlap_warning": 0.20,
    "h3_tiling_resolution": 8,
    "auto_tile_threshold": 100000,
    "pg_cache_enabled": False,
    "pg_connection_string": "postgresql://postgres:postgres@localhost:5432/Site_IQ",
}
