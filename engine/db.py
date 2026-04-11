"""
Async PostGIS Interface
=======================
Manages the asyncpg connection pool and foundational spatial queries 
for GeoAnalyst-AI. Discards client-side geometry loading in favor 
of pure mathematical set operations in PostGIS.
"""

import os
import asyncpg
import logging

logger = logging.getLogger("db")

class DatabaseManager:
    def __init__(self):
        self.pool = None

    async def connect(self):
        dsn = os.getenv(
            "PG_DSN", 
            "postgresql://postgres:password@localhost:5432/geoanalyst"
        )
        try:
            self.pool = await asyncpg.create_pool(dsn, min_size=5, max_size=20)
            logger.info("Connected to PostGIS successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to PostGIS: {e}")
            # In a live environment, we might sys.exit(1) here if PG is mandatory.

    async def close(self):
        if self.pool:
            await self.pool.close()

# Global connection manager
db = DatabaseManager()


# ─────────────────────────────────────────────
# PostGIS Query Signatures
# ─────────────────────────────────────────────

async def query_zoning_class(lat: float, lon: float) -> str:
    """Point-in-polygon for zoning."""
    query = """
        SELECT zone_class 
        FROM land_use
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326));
    """
    if not db.pool:
        return "UNKNOWN" # Fallback if pool fails
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat)
        return val or "UNKNOWN"


async def query_population_radius(lat: float, lon: float, radius_m: int = 5000) -> float:
    """Population within radius (using census centroids)."""
    query = """
        SELECT SUM(population) 
        FROM census_blocks
        WHERE ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, $3);
    """
    if not db.pool:
        return 0.0
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat, radius_m)
        return val or 0.0


async def query_nearest_competitor(lat: float, lon: float) -> float:
    """Nearest competitor distance."""
    query = """
        SELECT MIN(ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography)) 
        FROM competitors;
    """
    if not db.pool:
        # Fallback to extreme distance if DB is unavailable
        return 99999.0
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat)
        return float(val) if val is not None else 99999.0


async def query_competitor_count(lat: float, lon: float, radius_m: int = 1000) -> int:
    """Count competitors within X meters."""
    query = """
        SELECT count(*) 
        FROM competitors
        WHERE ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, $3);
    """
    if not db.pool:
        return 0
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat, radius_m)
        return val or 0


async def query_nearest_highway(lat: float, lon: float) -> float:
    query = """
        SELECT MIN(ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography)) 
        FROM traffic_corridors
        WHERE highway = true;
    """
    if not db.pool:
        return 99999.0
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat)
        return float(val) if val is not None else 99999.0


async def query_nearest_transit(lat: float, lon: float) -> float:
    query = """
        SELECT MIN(ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography)) 
        FROM transit_stops;
    """
    if not db.pool:
        return 99999.0
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat)
        return float(val) if val is not None else 99999.0


async def query_flood_zone(lat: float, lon: float) -> str:
    """Check if point falls within a mapped flood zone."""
    query = """
        SELECT flood_zone 
        FROM flood_zones
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326));
    """
    if not db.pool:
        return "UNKNOWN"
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat)
        return val or "UNKNOWN"


async def query_air_quality(lat: float, lon: float) -> float:
    """Sample continuous raster data stored via Point mapping."""
    query = """
        SELECT aqi_annual
        FROM air_quality
        WHERE ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, 2000)
        ORDER BY ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography) ASC
        LIMIT 1;
    """
    if not db.pool:
        return 50.0 # Default neutral
    async with db.pool.acquire() as conn:
        val = await conn.fetchval(query, lon, lat)
        return float(val) if val is not None else 50.0

