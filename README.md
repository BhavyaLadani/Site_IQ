# GeoSpatial Site Readiness Analyzer

An advanced spatial econometric application combining a robust React/DeckGL frontend with a highly-concurrent FastAPI/PostGIS routing engine.

## Architectural Stack
- **Frontend**: React 18, MapLibre GL JS, Deck.gl, TailwindCSS, Zustand (Global State), React-Query (API bindings), Recharts.
- **Backend**: FastAPI (Python 3.12), Asyncpg (PostGIS pooling), ReportLab (Binary PDF Generator), H3/Scikit-Learn (Analytics), SlowAPI (Rate Throttler).

## Installation & Deployment

### 1. Unified Deployment via Docker (Recommended)
You can instantiate the fully linked API Gateway, Database containers, and application dependencies seamlessly leveraging Docker Compose.

```bash
docker-compose up -d --build
```
This automatically boots:
- The `postgis/postgis:15` backend instance on `localhost:5432`.
- The `geoanalyst-api` FastAPI on `localhost:8000`.
- The internal redis data structures.

### 2. Local Frontend Development
Ensure you are running Node 18 or 20+.
```bash
cd frontend
npm install # Installs Zustand, MapLibre, Recharts, and Deck.gl wrappers
npm run dev
```

The frontend runs locally on `http://localhost:3000` (by default Vite acts on `http://localhost:5173`, check your CLI port!).

### Key Functionality
1. **Interactive Data Scoring**: Click anywhere on the MapLibre array vector to physically generate and animate site-readiness index values utilizing distance decay and bounding configurations dynamically pulled from `localhost:8000`.
2. **Global Comparison**: Leverage the right-hand Plus icon (`+`) to pin coordinates directly into your Zustand `pinnedSites[]` parameter, projecting the array dynamically via an animated Recharts Polar-Radar component along the bottom of the map view.
3. **Downloadable Briefs**: Utilize the "Export" button from inside the pinned component to serialize your spatial metric thresholds completely offline using dynamically produced PDFs bound with ReportLab.
