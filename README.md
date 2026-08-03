<div align="center">

# 🗺️ Site_IQ — Spatial Econometric & GeoSpatial Site Readiness Platform

**An advanced, full-stack geospatial site selection and spatial econometric platform combining a high-performance React + MapLibre GL JS + Deck.gl interactive frontend with a concurrent FastAPI + PostGIS geospatial engine.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostGIS](https://img.shields.io/badge/PostGIS-15.0-336791?logo=postgresql&logoColor=white)](https://postgis.net/)
[![Deck.gl](https://img.shields.io/badge/Deck.gl-9.2-FF4081?logo=uber&logoColor=white)](https://deck.gl/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

[Overview](#-overview) • [Key Features](#-key-features) • [Tech Stack](#%EF%B8%8F-tech-stack) • [Quick Start](#-quick-start) • [Repository Structure](#-repository-structure)

</div>

---

## 📖 Overview

**Site_IQ** (`BhavyaLadani/Site_IQ`) is a cutting-edge spatial econometric and site-readiness assessment application designed for urban planners, real estate developers, commercial site selectors, and GIS analysts.

It combines multi-layer vector spatial rendering, distance decay algorithms, H3 spatial indexing, and automated PDF site assessment generation to help users evaluate, score, and compare locations anywhere on the globe.

---

## ✨ Key Features

### 🌐 1. Interactive Spatial Mapping & Scoring
- 📍 **Real-time Spatial Scoring**: Click anywhere on the MapLibre & Deck.gl map matrix to evaluate site-readiness scores using distance decay algorithms.
- 🎨 **Multi-Layer Data Overlay**: Render complex spatial features, H3 spatial grids, transit proximity, and environmental boundaries seamlessly.
- 📐 **Polygon & Draw Tools**: Draw custom site boundaries using Mapbox GL Draw for custom localized metric calculations.

### 📊 2. Multi-Site Comparison & Analytics
- ➕ **Pinned Site Comparison**: Pin multiple site coordinates into a dynamic comparative array (`pinnedSites[]`).
- 📈 **Polar Radar & Analytics Charts**: Compare site readiness, accessibility, demographics, and infrastructure scores side-by-side using interactive Recharts Radar visualizations.

### 📄 3. Automated PDF Report Generation
- 📝 **Downloadable Analytical Briefs**: Export complete spatial readiness reports offline into PDF format generated on-the-fly using `ReportLab` and `@react-pdf/renderer`.
- 📊 Serializes spatial metrics, map visual snapshots, distance decay scores, and comparative radar summaries into presentation-ready reports.

### ⚡ 4. High-Performance Spatial Engine
- 🏎️ **FastAPI + Asyncpg**: Asynchronous PostgreSQL / PostGIS database connections for low-latency spatial queries (`ST_DWithin`, `ST_Distance`).
- 🗄️ **Spatial Indexing & Caching**: H3 spatial indexing (`h3-js` / `h3-py`), GeoPandas, Shapely, and Redis caching for optimal performance.
- 🔐 **Secure Auth & Rate Limiting**: Token-based authentication (PyJWT) and SlowAPI rate throttling.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, MapLibre GL JS, Deck.gl, TailwindCSS, Zustand (Global State), React-Query (@tanstack), Recharts, Mapbox GL Draw |
| **Backend** | FastAPI (Python 3.12), Uvicorn, Asyncpg, Pydantic, SlowAPI, PyJWT |
| **Spatial / GIS & ML** | PostGIS, GeoPandas, Shapely, Fiona, Rasterio, PyProj, H3 Indexing (`h3-js` & `h3-py`), Scikit-Learn, NumPy, Pandas, OpenRouteService |
| **Reporting & Export** | ReportLab (Python binary PDF generator), `@react-pdf/renderer` |
| **Containerization** | Docker, Docker Compose, Redis, PostgreSQL / PostGIS 15 |

---

## ⚡ Quick Start

### 1. Unified Deployment via Docker (Recommended)

Run the full stack (PostGIS database, Redis, FastAPI backend, and frontend) with a single command:

```bash
docker-compose up -d --build
```

This automatically spins up:
- 🗄️ **PostGIS Database**: `localhost:5432`
- ⚡ **FastAPI Geo-Engine**: `http://localhost:8000`
- ⚡ **Redis Cache**: Background spatial caching

---

### 2. Local Manual Setup

#### Backend Setup
```bash
# Clone repository
git clone https://github.com/BhavyaLadani/Site_IQ.git
cd Site_IQ

# Create & activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn main:app --reload --port 8000
```

#### Frontend Setup
```bash
# Navigate to frontend folder
cd frontend

# Install Node packages
npm install

# Start Vite dev server
npm run dev
```

The frontend will run locally on `http://localhost:5173`.

---

## 📁 Repository Structure

```
Site_IQ/
├── README.md
├── main.py                     # FastAPI entry point & spatial routing endpoints
├── auth.py                     # Authentication & security handlers
├── config.py                   # Spatial engine configuration settings
├── docker-compose.yml          # Container configuration (PostGIS, Redis, API)
├── Dockerfile                  # API container Dockerfile
├── requirements.txt            # Python spatial & backend dependencies
│
├── engine/                     # Spatial analysis algorithms & spatial scoring functions
├── data/                       # Spatial dataset definitions & GIS seed data
│
└── frontend/                   # React 19 + TypeScript + MapLibre/Deck.gl Frontend
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── api/                # React-Query spatial API hooks
        ├── components/         # Map, Sidebar, Report & UI components
        ├── context/            # AuthContext
        ├── pages/              # Dashboard, MapAnalysis, About, Contact
        └── store/              # Zustand global spatial state store
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

<div align="center">
  Developed with ❤️ by <b><a href="https://github.com/BhavyaLadani">Bhavya Ladani</a></b>
</div>
