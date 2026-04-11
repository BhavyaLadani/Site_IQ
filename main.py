"""
Production FastAPI — GeoSpatial Site Readiness Analyzer
=========================================================
All endpoints wired to the real scoring engine (engine/scorer.py).
"""

import asyncio
import io
import os
import base64
import time
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import asyncpg
import httpx
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from auth import (
    create_user, authenticate_user, create_token,
    get_current_user, require_auth,
    save_contact, save_analysis, get_user_history
)

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors

import geopandas as gpd
from shapely.geometry import Point

from config import DATA_DIR, LAYER_WEIGHTS
from engine.data_ingestion import load_all_layers
from engine.scorer import score_site, score_batch
from engine.spatial_analysis import bin_to_h3, cluster_high_score_sites, compute_hotspots

# ─────────────────────────────────────────────
# Rate Limiter
# ─────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ─────────────────────────────────────────────
# Lifespan — load datasets once at startup
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Startup] Loading geospatial datasets into memory...")
    app.state.layers = load_all_layers(DATA_DIR)
    loaded = [k for k, v in app.state.layers.items() if not v.empty]
    print(f"[Startup] Loaded layers: {loaded}")

    db_url = os.getenv("DATABASE_URL", "postgres://geo_user:geo_pass@localhost:5432/geo_db")
    try:
        app.state.pool = await asyncpg.create_pool(db_url, min_size=2, max_size=10, timeout=5)
        print("[Startup] PostGIS pool connected.")
    except Exception as e:
        print(f"[Startup] PostGIS unavailable (offline mode): {e}")
        app.state.pool = None

    yield

    print("[Shutdown] Closing DB pool...")
    if app.state.pool:
        await app.state.pool.close()


app = FastAPI(
    title="GeoSpatial Site Readiness Analyzer",
    description="AI-powered location intelligence for commercial real estate and infrastructure.",
    version="2.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:5173", 
        "http://localhost:5174", 
        "http://localhost:5175",
        "http://localhost:5176"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────
class ScoreRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    config: Optional[Dict[str, float]] = None  # custom layer weights
    use_case: Optional[str] = "retail"
    include_isochrone: Optional[bool] = False


class BatchScoreRequest(BaseModel):
    points: List[Dict]  # [{lat, lon, site_id?}]
    config: Optional[Dict[str, float]] = None
    use_case: Optional[str] = "retail"


class IsochroneRequest(BaseModel):
    lat: float
    lon: float
    minutes: List[int] = [10, 20, 30]
    mode: str = "car"


# Gujarat / Ahmedabad metro — our data coverage area
DATA_BBOX = {
    "min_lat": 22.95, "max_lat": 23.15,
    "min_lon": 72.45, "max_lon": 72.70
}


# ─────────────────────────────────────────────
# 0. GET /reverse_geocode — Location name lookup
# ─────────────────────────────────────────────
@app.get("/reverse_geocode")
async def reverse_geocode(lat: float, lon: float):
    """Reverse geocode using OpenStreetMap Nominatim (free, no API key)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 16, "addressdetails": 1},
                headers={"User-Agent": "GeoAnalystAI/2.0"}
            )
            if resp.status_code == 200:
                data = resp.json()
                addr = data.get("address", {})
                # Build a clean display name
                parts = []
                for key in ["road", "neighbourhood", "suburb", "city_district", "city", "state_district", "state"]:
                    if key in addr:
                        parts.append(addr[key])
                display = ", ".join(parts[:3]) if parts else data.get("display_name", "Unknown")
                return {
                    "display_name": display,
                    "full_address": data.get("display_name", ""),
                    "area": addr.get("suburb", addr.get("city_district", "")),
                    "city": addr.get("city", addr.get("town", "")),
                    "state": addr.get("state", ""),
                }
    except Exception:
        pass
    return {"display_name": f"{lat:.4f}, {lon:.4f}", "city": "", "state": "Gujarat"}


# ─────────────────────────────────────────────
# 1. POST /score — Real Engine
# ─────────────────────────────────────────────
@app.post("/score")
@limiter.limit("100/minute")
async def score_endpoint(req: ScoreRequest, request: Request):
    """Score a single (lat, lon) coordinate using the full geospatial engine."""

    # Guard: check if coordinate is within Gujarat/Ahmedabad data coverage
    in_bbox = (
        DATA_BBOX["min_lat"] <= req.lat <= DATA_BBOX["max_lat"] and
        DATA_BBOX["min_lon"] <= req.lon <= DATA_BBOX["max_lon"]
    )
    if not in_bbox:
        return {
            "site_id": f"site_{req.lat:.3f}_{req.lon:.3f}",
            "coordinates": {"lat": req.lat, "lon": req.lon},
            "composite_score": 0,
            "grade": "N/A",
            "layer_scores": {},
            "hard_constraint_failures": [
                f"Location ({req.lat:.4f}, {req.lon:.4f}) is outside the Ahmedabad data coverage area. "
                "Please click within the highlighted region on the map."
            ],
            "data_gaps": ["No geospatial data available for this region"],
            "recommendation": "This location is outside our data coverage. Please click within the Ahmedabad metro area (the highlighted rectangle).",
            "reasoning_trace": ["Location is outside data coverage bbox - scoring aborted."],
            "scoring_model": {"name": "Retail", "version": "2.0"}
        }

    custom_weights = req.config or LAYER_WEIGHTS.copy()
    result = score_site(
        lat=req.lat,
        lon=req.lon,
        weights=custom_weights,
        include_isochrone=req.include_isochrone,
    )
    return result


# ─────────────────────────────────────────────
# 2. POST /batch_score — Parallel scoring
# ─────────────────────────────────────────────
async def _run_score_async(lat: float, lon: float, weights: dict, loop) -> dict:
    return await loop.run_in_executor(None, score_site, lat, lon, None, weights, False)


@app.post("/batch_score")
async def batch_score_endpoint(req: BatchScoreRequest, request: Request):
    """Score many points concurrently using asyncio.gather + executor."""
    weights = req.config or LAYER_WEIGHTS.copy()
    loop = asyncio.get_running_loop()

    tasks = [
        _run_score_async(float(p["lat"]), float(p["lon"]), weights, loop)
        for p in req.points
        if "lat" in p and "lon" in p
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for r in results:
        if isinstance(r, Exception):
            output.append({"error": str(r)})
        else:
            output.append(r)
    return {"results": output, "count": len(output)}


# ─────────────────────────────────────────────
# 3. GET /hotspots — Real spatial analysis
# ─────────────────────────────────────────────
@app.get("/hotspots")
async def hotspots_endpoint(
    request: Request,
    bbox: str,
    method: str = "h3",
    resolution: int = 8,
    threshold: float = 60.0
):
    """
    Score a grid of points inside bbox, then aggregate via H3/DBSCAN/Getis-Ord.
    bbox format: minx,miny,maxx,maxy (lon,lat,lon,lat)
    """
    try:
        minx, miny, maxx, maxy = map(float, bbox.split(","))
    except Exception:
        raise HTTPException(400, "Invalid bbox. Use format: minx,miny,maxx,maxy")

    # Sample a grid of ~100 points inside the bbox
    lats = np.linspace(miny, maxy, 10)
    lons = np.linspace(minx, maxx, 10)
    scored_points = []

    loop = asyncio.get_running_loop()
    tasks = []
    coords = []
    for lat in lats:
        for lon in lons:
            coords.append((lat, lon))
            tasks.append(loop.run_in_executor(None, score_site, lat, lon, None, LAYER_WEIGHTS, False))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for (lat, lon), res in zip(coords, results):
        if not isinstance(res, Exception):
            scored_points.append((lat, lon, float(res.get("composite_score", 0))))

    if not scored_points:
        return {"type": "FeatureCollection", "features": []}

    if method == "h3":
        gdf = bin_to_h3(scored_points, resolution=resolution)
        gdf = gdf.rename(columns={"mean_score": "score"})
    elif method == "dbscan":
        gdf = cluster_high_score_sites(scored_points, threshold=threshold)
    elif method == "getisord":
        raw_gdf = gpd.GeoDataFrame(
            [{"score": p[2], "geometry": Point(p[1], p[0])} for p in scored_points],
            crs="EPSG:4326"
        )
        gdf = compute_hotspots(raw_gdf, score_col="score")
    else:
        raise HTTPException(400, "method must be h3, dbscan, or getisord")

    return JSONResponse(content=gdf.__geo_interface__)


# ─────────────────────────────────────────────
# 4. GET /layers — Real metadata
# ─────────────────────────────────────────────
@app.get("/layers")
async def layers_endpoint(request: Request):
    """Return metadata for all loaded geospatial layers."""
    meta = []
    for name, gdf in request.app.state.layers.items():
        if not gdf.empty:
            bounds = gdf.total_bounds.tolist()
            meta.append({
                "id": name,
                "feature_count": len(gdf),
                "bbox": {"minx": bounds[0], "miny": bounds[1], "maxx": bounds[2], "maxy": bounds[3]},
                "columns": [c for c in gdf.columns if c != "geometry"],
                "geometry_types": list(gdf.geometry.geom_type.value_counts().to_dict().keys()),
                "status": "loaded"
            })
        else:
            meta.append({"id": name, "status": "empty"})
    return {"layers": meta, "total_loaded": len([m for m in meta if m.get("status") == "loaded"])}


# ─────────────────────────────────────────────
# 5. POST /isochrone — Async routing simulation
# ─────────────────────────────────────────────
@app.post("/isochrone")
async def isochrone_endpoint(req: IsochroneRequest):
    """
    Return drive-time isochrone polygons.
    Uses OSRM-style buffering as a reliable fallback (OSRM isochrone requires Valhalla plugin).
    """
    features = []
    # km/h assumption — car ~50km/h avg urban, walk ~5km/h
    speed_kmh = 45.0 if req.mode == "car" else 5.0

    for m in req.minutes:
        dist_km = (m / 60.0) * speed_kmh
        dist_deg = dist_km / 111.0  # rough degrees conversion
        poly = Point(req.lon, req.lat).buffer(dist_deg)
        features.append({
            "type": "Feature",
            "properties": {
                "minutes": m,
                "mode": req.mode,
                "est_radius_km": round(dist_km, 1)
            },
            "geometry": poly.__geo_interface__
        })

    return {"type": "FeatureCollection", "features": features}


# ─────────────────────────────────────────────
# 6. GET /export/{site_id} — Professional PDF
# ─────────────────────────────────────────────
@app.get("/export/{site_id}")
async def export_endpoint(site_id: str, lat: float = 23.03, lon: float = 72.56):
    """Generate a comprehensive PDF report with charts, tables, and use-case analysis."""
    from reportlab.lib.utils import ImageReader
    from datetime import datetime

    result = score_site(lat=lat, lon=lon, weights=LAYER_WEIGHTS, include_isochrone=False)
    composite = result.get("composite_score", 0)
    grade = result.get("grade", "N/A")
    layer_scores = result.get("layer_scores", {})
    recommendation = result.get("recommendation", "")
    hard_failures = result.get("hard_constraint_failures", [])
    reasoning = result.get("reasoning_trace", [])

    # ── Bar chart ──
    layer_names = [n.replace("_", " ").title() for n in layer_scores.keys()]
    raw_vals = [layer_scores[n].get("raw", 0) for n in layer_scores.keys()]
    bar_colors = ["#22c55e" if v >= 70 else "#f59e0b" if v >= 40 else "#ef4444" for v in raw_vals]

    fig, ax = plt.subplots(figsize=(7, 3))
    bars = ax.barh(layer_names, raw_vals, color=bar_colors, height=0.6, edgecolor='white', linewidth=0.5)
    ax.set_xlim(0, 105)
    ax.set_xlabel("Score (0-100)", fontsize=9)
    ax.set_title("Layer Score Breakdown", fontsize=11, fontweight='bold', pad=10)
    ax.bar_label(bars, fmt="%.0f", padding=4, fontsize=9, fontweight='bold')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.tick_params(axis='y', labelsize=9)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_bytes = buf.read()
    plt.close()

    # ── Use-case suitability chart ──
    use_cases = {
        "Retail Store":     {"layers": ["demographics", "competition", "transportation"], "icon": "R"},
        "Warehouse":        {"layers": ["transportation", "land_use", "environment"], "icon": "W"},
        "EV Charging":      {"layers": ["transportation", "demographics", "land_use"], "icon": "E"},
        "Telecom Tower":    {"layers": ["environment", "land_use", "demographics"], "icon": "T"},
    }

    uc_names = list(use_cases.keys())
    uc_scores = []
    for uc in use_cases.values():
        scores = [layer_scores.get(l, {}).get("raw", 0) for l in uc["layers"]]
        uc_scores.append(sum(scores) / len(scores) if scores else 0)
    uc_colors = ["#22c55e" if s >= 60 else "#f59e0b" if s >= 35 else "#ef4444" for s in uc_scores]

    fig2, ax2 = plt.subplots(figsize=(7, 2.5))
    bars2 = ax2.bar(uc_names, uc_scores, color=uc_colors, width=0.5, edgecolor='white', linewidth=0.5)
    ax2.set_ylim(0, 105)
    ax2.set_ylabel("Suitability Score", fontsize=9)
    ax2.set_title("Use-Case Suitability Analysis", fontsize=11, fontweight='bold', pad=10)
    ax2.bar_label(bars2, fmt="%.0f", padding=3, fontsize=10, fontweight='bold')
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_visible(False)
    plt.tight_layout()
    buf2 = io.BytesIO()
    plt.savefig(buf2, format='png', dpi=150, bbox_inches='tight')
    buf2.seek(0)
    uc_chart_bytes = buf2.read()
    plt.close()

    # ── Build PDF ──
    pdf_buf = io.BytesIO()
    p = canvas.Canvas(pdf_buf, pagesize=letter)
    w, h = letter
    now = datetime.now().strftime("%B %d, %Y at %H:%M")

    # --- Header ---
    p.setFillColorRGB(0.04, 0.07, 0.14)
    p.rect(0, h - 90, w, 90, fill=1, stroke=0)
    p.setFillColorRGB(0.23, 0.51, 0.96)
    p.rect(0, h - 94, w, 4, fill=1, stroke=0)
    p.setFillColorRGB(1, 1, 1)
    p.setFont("Helvetica-Bold", 22)
    p.drawString(40, h - 40, "GeoAnalyst AI")
    p.setFont("Helvetica", 10)
    p.drawString(40, h - 58, "Site Readiness Assessment Report")
    p.setFillColorRGB(0.7, 0.7, 0.8)
    p.setFont("Helvetica", 9)
    p.drawString(40, h - 78, f"Generated: {now}")
    p.drawRightString(w - 40, h - 78, f"Site ID: {site_id}")

    # --- Location Details ---
    y = h - 120
    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "1. Location Details")
    y -= 18
    p.setFont("Helvetica", 10)
    p.drawString(60, y, f"Latitude: {lat:.6f}")
    p.drawString(250, y, f"Longitude: {lon:.6f}")
    y -= 15
    p.drawString(60, y, f"Coverage Area: Chicago Metro (41.64-42.02N, -87.94 to -87.52E)")

    # --- Composite Score Badge ---
    y -= 35
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "2. Site Suitability Score")
    y -= 5
    score_color = (0.13, 0.77, 0.37) if composite >= 70 else (0.96, 0.62, 0.04) if composite >= 40 else (0.94, 0.27, 0.27)
    p.setFillColorRGB(*score_color)
    p.roundRect(60, y - 60, 80, 55, 8, fill=1, stroke=0)
    p.setFillColorRGB(1, 1, 1)
    p.setFont("Helvetica-Bold", 32)
    p.drawCentredString(100, y - 30, str(composite))
    p.setFont("Helvetica-Bold", 11)
    p.drawCentredString(100, y - 50, f"Grade: {grade}")

    suit_label = "Highly Suitable" if composite >= 70 else "Moderately Suitable" if composite >= 40 else "Not Recommended"
    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 12)
    p.drawString(160, y - 22, suit_label)
    p.setFont("Helvetica", 9)
    p.setFillColorRGB(0.3, 0.3, 0.3)
    # Wrap recommendation
    words = recommendation.split()
    line, lines = "", []
    for word in words:
        if len(line + word) < 65:
            line += word + " "
        else:
            lines.append(line.strip())
            line = word + " "
    if line:
        lines.append(line.strip())
    for i, l in enumerate(lines[:3]):
        p.drawString(160, y - 38 - i * 13, l)

    # --- Embed layer chart ---
    y -= 85
    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "3. Layer Score Breakdown")
    chart_img = ImageReader(io.BytesIO(chart_bytes))
    p.drawImage(chart_img, 40, y - 180, width=420, height=170, preserveAspectRatio=True)

    # --- Layer table ---
    y -= 200
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "4. Detailed Scores")
    y -= 16
    headers = ["Layer", "Raw Score", "Weight", "Weighted Score", "Status"]
    col_x = [50, 180, 280, 360, 460]
    p.setFillColorRGB(0.92, 0.92, 0.95)
    p.rect(42, y - 3, 510, 16, fill=1, stroke=0)
    p.setFillColorRGB(0.15, 0.15, 0.2)
    p.setFont("Helvetica-Bold", 8)
    for i, hdr in enumerate(headers):
        p.drawString(col_x[i], y, hdr)
    y -= 15
    p.setFont("Helvetica", 9)
    p.setFillColorRGB(0.1, 0.1, 0.1)
    for name, scores in layer_scores.items():
        raw = scores.get("raw", 0)
        wt = scores.get("weight", 0)
        wval = scores.get("weighted", 0)
        status = "Pass" if raw >= 40 else "Needs Attention"
        st_color = (0.13, 0.55, 0.13) if raw >= 40 else (0.85, 0.2, 0.2)
        p.drawString(col_x[0], y, name.replace("_", " ").title())
        p.drawString(col_x[1], y, f"{raw:.1f} / 100")
        p.drawString(col_x[2], y, f"{wt:.2f}")
        p.drawString(col_x[3], y, f"{wval:.1f}")
        p.setFillColorRGB(*st_color)
        p.drawString(col_x[4], y, status)
        p.setFillColorRGB(0.1, 0.1, 0.1)
        y -= 14

    # --- Constraints ---
    if hard_failures:
        y -= 10
        p.setFont("Helvetica-Bold", 13)
        p.drawString(40, y, "5. Constraint Violations")
        y -= 16
        p.setFont("Helvetica", 9)
        p.setFillColorRGB(0.7, 0.1, 0.1)
        for f in hard_failures:
            p.drawString(60, y, f"X  {f}")
            y -= 13
        p.setFillColorRGB(0.1, 0.1, 0.1)

    # === PAGE 2 ===
    p.showPage()

    # Header on page 2
    p.setFillColorRGB(0.04, 0.07, 0.14)
    p.rect(0, h - 50, w, 50, fill=1, stroke=0)
    p.setFillColorRGB(0.23, 0.51, 0.96)
    p.rect(0, h - 53, w, 3, fill=1, stroke=0)
    p.setFillColorRGB(1, 1, 1)
    p.setFont("Helvetica-Bold", 14)
    p.drawString(40, h - 35, "GeoAnalyst AI  |  Use-Case Suitability Analysis")

    # Use-case chart
    y = h - 80
    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "6. Use-Case Suitability")
    uc_img = ImageReader(io.BytesIO(uc_chart_bytes))
    p.drawImage(uc_img, 40, y - 165, width=420, height=155, preserveAspectRatio=True)

    # Use-case table
    y -= 190
    p.setFont("Helvetica-Bold", 11)
    p.drawString(40, y, "Suitability Breakdown:")
    y -= 18
    p.setFillColorRGB(0.92, 0.92, 0.95)
    p.rect(42, y - 3, 510, 16, fill=1, stroke=0)
    p.setFillColorRGB(0.15, 0.15, 0.2)
    p.setFont("Helvetica-Bold", 8)
    uc_headers = ["Use Case", "Key Factors", "Score", "Verdict"]
    uc_cols = [50, 170, 380, 440]
    for i, hdr in enumerate(uc_headers):
        p.drawString(uc_cols[i], y, hdr)
    y -= 15
    p.setFont("Helvetica", 9)
    p.setFillColorRGB(0.1, 0.1, 0.1)
    for uc_name, uc_data, score in zip(uc_names, use_cases.values(), uc_scores):
        p.drawString(uc_cols[0], y, uc_name)
        p.drawString(uc_cols[1], y, ", ".join(l.replace("_", " ").title() for l in uc_data["layers"]))
        p.drawString(uc_cols[2], y, f"{score:.0f}/100")
        verdict = "Recommended" if score >= 60 else "Possible" if score >= 35 else "Not Suitable"
        vcolor = (0.13, 0.55, 0.13) if score >= 60 else (0.8, 0.6, 0.0) if score >= 35 else (0.85, 0.2, 0.2)
        p.setFillColorRGB(*vcolor)
        p.setFont("Helvetica-Bold", 9)
        p.drawString(uc_cols[3], y, verdict)
        p.setFont("Helvetica", 9)
        p.setFillColorRGB(0.1, 0.1, 0.1)
        y -= 16

    # AI Reasoning
    y -= 20
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "7. AI Reasoning Trace")
    y -= 16
    p.setFont("Courier", 7)
    p.setFillColorRGB(0.3, 0.3, 0.35)
    for line in reasoning[:25]:
        if y < 60:
            break
        p.drawString(50, y, str(line)[:100])
        y -= 10

    # Footer
    p.setFillColorRGB(0.5, 0.5, 0.5)
    p.setFont("Helvetica", 7)
    p.drawCentredString(w / 2, 30, f"GeoAnalyst AI - Site Readiness Report - {now} - Page 2")

    p.showPage()
    p.save()
    pdf_buf.seek(0)

    return Response(
        content=pdf_buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=site_report_{site_id}.pdf"}
    )

# ═════════════════════════════════════════════
# AUTH ENDPOINTS
# ═════════════════════════════════════════════

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ContactRequest(BaseModel):
    name: str
    email: str
    message: str


@app.post("/auth/signup")
async def signup(req: SignupRequest):
    """Register a new user."""
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user = create_user(req.name, req.email, req.password)
    token = create_token(user["id"], user["email"], user["name"])
    return {"token": token, "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}


@app.post("/auth/login")
async def login(req: LoginRequest):
    """Login and receive JWT token."""
    user = authenticate_user(req.email, req.password)
    token = create_token(user["id"], user["email"], user["name"])
    return {"token": token, "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}


@app.get("/auth/me")
async def get_me(user=Depends(require_auth)):
    """Get current user profile."""
    return {"id": int(user["sub"]), "name": user["name"], "email": user["email"]}


# ═════════════════════════════════════════════
# CONTACT ENDPOINT
# ═════════════════════════════════════════════

@app.post("/contact")
async def contact_endpoint(req: ContactRequest):
    """Save a contact form submission."""
    save_contact(req.name, req.email, req.message)
    return {"status": "ok", "message": "Your message has been received. We will get back to you soon."}


# ═════════════════════════════════════════════
# ANALYSIS HISTORY
# ═════════════════════════════════════════════

@app.get("/history")
async def history_endpoint(user=Depends(require_auth)):
    """Get analysis history for the logged-in user."""
    records = get_user_history(int(user["sub"]))
    return {"history": records}


@app.post("/history/save")
async def save_history_endpoint(
    request: Request,
    user=Depends(get_current_user)
):
    """Save an analysis result to history (requires auth)."""
    if not user:
        return {"saved": False, "reason": "Not authenticated"}
    body = await request.json()
    save_analysis(
        user_id=user["id"],
        lat=body.get("lat", 0),
        lon=body.get("lon", 0),
        location_name=body.get("location_name", ""),
        result=body.get("result", {}),
        use_case=body.get("use_case", "retail")
    )
    return {"saved": True}


# ═════════════════════════════════════════════
# DATABASE ADMIN VIEWER
# ═════════════════════════════════════════════
@app.get("/admin/db")
async def db_admin():
    """Built-in database viewer — shows all tables and data."""
    import psycopg2
    import psycopg2.extras
    from auth import DB_CONNECTION_STRING

    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # Get all tables in public schema
        c.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        """)
        tables = [r[0] for r in c.fetchall()]
    except Exception as e:
        return Response(content=f"<h1>Database Connection Error</h1><p>{str(e)}</p>", status_code=500)

    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SiteIQ DB Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0f1a; color: #e2e8f0; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 6px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .stats { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat { background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 16px 20px; flex: 1; }
  .stat-num { font-size: 28px; font-weight: 800; color: #3b82f6; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .table-card { background: #111827; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
  .table-header { padding: 14px 20px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
  .table-name { font-weight: 700; font-size: 15px; }
  .table-count { background: #1e293b; padding: 3px 10px; border-radius: 20px; font-size: 11px; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #0f172a; text-align: left; padding: 10px 14px; font-size: 10px; text-transform: uppercase;
       letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #1e293b; }
  td { padding: 10px 14px; border-bottom: 1px solid #1e293b; max-width: 250px; overflow: hidden;
       text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; }
  tr:hover td { background: #1e293b40; }
  .empty { padding: 24px; text-align: center; color: #475569; font-size: 13px; }
  .grade-A { color: #4ade80; font-weight: 700; } .grade-B { color: #34d399; font-weight: 700; }
  .grade-C { color: #fbbf24; font-weight: 700; } .grade-D { color: #fb923c; font-weight: 700; }
  .grade-F { color: #f87171; font-weight: 700; }
  .refresh { position: fixed; bottom: 20px; right: 20px; background: #3b82f6; color: white; border: none;
             padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .refresh:hover { background: #2563eb; }
  .pw { color: #475569; font-style: italic; }
</style>
</head>
<body>
<h1>🗄️ SiteIQ Database Admin</h1>
<p class="subtitle">PostgreSQL database — Site_IQ | Auto-refresh: <a href="/admin/db" style="color:#3b82f6">Reload</a></p>
"""

    # Stats
    table_counts = {}
    for t in tables:
        c.execute(f"SELECT count(*) FROM {t}")
        table_counts[t] = c.fetchone()[0]

    html += '<div class="stats">'
    for t in tables:
        html += f'<div class="stat"><div class="stat-num">{table_counts[t]}</div><div class="stat-label">{t}</div></div>'
    html += '</div>'

    # Table data
    for t in tables:
        c.execute(f"SELECT * FROM {t} ORDER BY id DESC LIMIT 50")
        rows = c.fetchall()
        cols = [desc[0] for desc in c.description] if c.description else []

        html += f'<div class="table-card"><div class="table-header">'
        html += f'<span class="table-name">{t}</span>'
        html += f'<span class="table-count">{table_counts[t]} rows</span></div>'

        if not rows:
            html += '<div class="empty">No data yet</div>'
        else:
            html += '<table><thead><tr>'
            for col in cols:
                html += f'<th>{col}</th>'
            html += '</tr></thead><tbody>'
            for row in rows:
                html += '<tr>'
                for i, val in enumerate(row):
                    col_name = cols[i] if i < len(cols) else ''
                    cell = str(val) if val is not None else '-'
                    if col_name == 'password_hash':
                        cell = '<span class="pw">••••••••</span>'
                    elif col_name == 'grade' and val:
                        cell = f'<span class="grade-{val}">{val}</span>'
                    elif col_name == 'layer_scores' and val and len(str(val)) > 40:
                        cell = str(val)[:40] + '...'
                    html += f'<td>{cell}</td>'
                html += '</tr>'
            html += '</tbody></table>'
        html += '</div>'

    html += '<button class="refresh" onclick="location.reload()">🔄 Refresh</button></body></html>'
    conn.close()
    return Response(content=html, media_type="text/html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)

