"""
GeoAnalyst-AI — Flask API Server
==================================
REST API for geospatial site readiness scoring.
"""

import os
import sys
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import LAYER_WEIGHTS, DEMO_CENTER, LAYER_DATA_FILES
from engine.scorer import score_site, score_batch
from engine.isochrone import generate_isochrone
from engine.clustering import dbscan_clusters, h3_hotspots
import geopandas as gpd
import json


app = Flask(__name__,
            static_folder="static",
            template_folder="templates")
CORS(app)


# ─────────────────────────────────────────────
# Cache loaded datasets
# ─────────────────────────────────────────────
_data_cache = {}


def _get_data(layer_name: str) -> dict:
    """Load and cache a GeoJSON dataset."""
    if layer_name not in _data_cache:
        filepath = LAYER_DATA_FILES.get(layer_name, "")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                _data_cache[layer_name] = json.load(f)
        else:
            _data_cache[layer_name] = None
    return _data_cache[layer_name]


# ═══════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════

@app.route("/")
def index():
    """Serve the main dashboard."""
    return render_template("index.html")


@app.route("/api/score", methods=["POST"])
def api_score():
    """
    Score a single site.

    Request body:
    {
        "lat": float,
        "lon": float,
        "site_id": str (optional),
        "weights": dict (optional),
        "include_isochrone": bool (optional, default true),
        "isochrone_profile": str (optional),
        "isochrone_range": list[int] (optional)
    }
    """
    data = request.get_json()

    if not data or "lat" not in data or "lon" not in data:
        return jsonify({"error": "Missing required fields: lat, lon"}), 400

    try:
        lat = float(data["lat"])
        lon = float(data["lon"])
    except (ValueError, TypeError):
        return jsonify({"error": "lat and lon must be numeric"}), 400

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "Invalid coordinates. lat: [-90, 90], lon: [-180, 180]"}), 400

    result = score_site(
        lat=lat,
        lon=lon,
        site_id=data.get("site_id"),
        weights=data.get("weights"),
        include_isochrone=data.get("include_isochrone", True),
        isochrone_profile=data.get("isochrone_profile"),
        isochrone_range=data.get("isochrone_range"),
    )

    return jsonify(result)


@app.route("/api/score/batch", methods=["POST"])
def api_score_batch():
    """
    Score multiple sites.

    Request body:
    {
        "sites": [{"lat": float, "lon": float, "site_id": str}, ...],
        "weights": dict (optional),
        "include_isochrone": bool (optional, default false)
    }
    """
    data = request.get_json()

    if not data or "sites" not in data:
        return jsonify({"error": "Missing required field: sites"}), 400

    sites = data["sites"]
    if not isinstance(sites, list) or len(sites) == 0:
        return jsonify({"error": "sites must be a non-empty array"}), 400

    if len(sites) > 50:
        return jsonify({"error": "Maximum 50 sites per batch request"}), 400

    results = score_batch(
        sites=sites,
        weights=data.get("weights"),
        include_isochrone=data.get("include_isochrone", False),
    )

    return jsonify({
        "count": len(results),
        "results": results,
    })


@app.route("/api/layers", methods=["GET"])
def api_layers():
    """List available data layers and their metadata."""
    layers = {}
    for name, filepath in LAYER_DATA_FILES.items():
        available = os.path.exists(filepath)
        feature_count = 0

        if available:
            try:
                with open(filepath, "r") as f:
                    geojson = json.load(f)
                    feature_count = len(geojson.get("features", []))
            except Exception:
                pass

        layers[name] = {
            "available": available,
            "filepath": filepath,
            "feature_count": feature_count,
            "weight": LAYER_WEIGHTS.get(name, 0),
        }

    return jsonify(layers)


@app.route("/api/layer/<layer_name>", methods=["GET"])
def api_layer_data(layer_name: str):
    """Get the GeoJSON data for a specific layer."""
    filepath = LAYER_DATA_FILES.get(layer_name)
    if not filepath:
        # Also check flood_zones
        filepath = LAYER_DATA_FILES.get(layer_name, "")

    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": f"Layer '{layer_name}' not found"}), 404

    with open(filepath, "r") as f:
        data = json.load(f)

    return jsonify(data)


@app.route("/api/isochrone", methods=["POST"])
def api_isochrone():
    """
    Generate an isochrone for a coordinate.

    Request body:
    {
        "lat": float,
        "lon": float,
        "profile": str (optional),
        "range_seconds": list[int] (optional)
    }
    """
    data = request.get_json()

    if not data or "lat" not in data or "lon" not in data:
        return jsonify({"error": "Missing required fields: lat, lon"}), 400

    result = generate_isochrone(
        lat=float(data["lat"]),
        lon=float(data["lon"]),
        profile=data.get("profile"),
        range_seconds=data.get("range_seconds"),
    )

    return jsonify(result)


@app.route("/api/clusters", methods=["POST"])
def api_clusters():
    """
    Detect spatial clusters in a dataset.

    Request body:
    {
        "layer_name": str,
        "method": "dbscan" | "h3",
        "params": dict (optional, e.g., eps_m, min_samples, resolution)
    }
    """
    data = request.get_json()

    if not data or "layer_name" not in data:
        return jsonify({"error": "Missing required field: layer_name"}), 400

    layer_name = data["layer_name"]
    filepath = LAYER_DATA_FILES.get(layer_name)

    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": f"Layer '{layer_name}' not found"}), 404

    try:
        gdf = gpd.read_file(filepath)
    except Exception as e:
        return jsonify({"error": f"Failed to load layer: {str(e)}"}), 500

    method = data.get("method", "h3")
    params = data.get("params", {})

    if method == "dbscan":
        result_gdf = dbscan_clusters(gdf, **params)
        # Convert to GeoJSON
        result_gdf = result_gdf.to_crs("EPSG:4326")
        result = json.loads(result_gdf.to_json())
        result["metadata"] = {
            "method": "dbscan",
            "n_clusters": result_gdf.attrs.get("n_clusters", 0),
            "n_noise": result_gdf.attrs.get("n_noise", 0),
        }
        return jsonify(result)

    elif method == "h3":
        result = h3_hotspots(gdf, **params)
        return jsonify(result)

    else:
        return jsonify({"error": f"Unknown method: {method}. Use 'dbscan' or 'h3'"}), 400


@app.route("/api/config", methods=["GET"])
def api_config():
    """Get current scoring configuration."""
    return jsonify({
        "layer_weights": LAYER_WEIGHTS,
        "demo_center": DEMO_CENTER,
        "grade_thresholds": {
            "A": "≥ 80",
            "B": "65 – 79",
            "C": "50 – 64",
            "D": "35 – 49",
            "F": "< 35",
        }
    })


# ═══════════════════════════════════════════════
# Main
# -----------------------------------------------

if __name__ == "__main__":
    # Generate sample data if not exists
    if not os.path.exists("data/sample_pois.geojson"):
        print("[DATA] Generating sample data...")
        from generate_data import main as gen_main
        import random
        random.seed(42)
        gen_main()
        print()

    print("[GeoAnalyst-AI] Server starting...")
    print(f"   Dashboard: http://127.0.0.1:5000")
    print(f"   API docs:  http://127.0.0.1:5000/api/config")
    print()

    app.run(debug=True, host="127.0.0.1", port=5000)
