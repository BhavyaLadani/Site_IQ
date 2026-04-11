"""
Caching Strategy — Redis
========================
- Redis: cache score results by H3 hex ID (res 10) + use_case, TTL = 24h
- Isochrones: cache by (lat, lon rounded to 4dp) + mode + interval, TTL = 7d
"""

import os
import json
import redis.asyncio as redis
import h3
import logging

logger = logging.getLogger("cache")

class CacheManager:
    def __init__(self):
        self.client = None

    async def connect(self):
        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            self.client = redis.from_url(url, decode_responses=True)
            # test ping
            await self.client.ping()
            logger.info("Connected to Redis gracefully.")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis. Caching bypassed. {e}")
            self.client = None

    async def close(self):
        if self.client:
            await self.client.close()


cache = CacheManager()


# ─────────────────────────────────────────────
# Score Caching (TTL 24h, H3 Res 10)
# ─────────────────────────────────────────────
async def get_cached_score(lat: float, lon: float, use_case: str) -> dict:
    if not cache.client:
        return None
    hex_id = h3.latlng_to_cell(lat, lon, 10)
    key = f"score:{use_case}:{hex_id}"
    
    data = await cache.client.get(key)
    if data:
        return json.loads(data)
    return None


async def set_cached_score(lat: float, lon: float, use_case: str, result: dict):
    if not cache.client:
        return
    hex_id = h3.latlng_to_cell(lat, lon, 10)
    key = f"score:{use_case}:{hex_id}"
    
    # 24 hours = 86400 seconds
    await cache.client.set(key, json.dumps(result), ex=86400)


# ─────────────────────────────────────────────
# Isochrone Caching (TTL 7d, 4 decimal places)
# ─────────────────────────────────────────────
async def get_cached_isochrone(lat: float, lon: float, mode: str, interval: int) -> dict:
    if not cache.client:
        return None
    
    lat_r = round(lat, 4)
    lon_r = round(lon, 4)
    key = f"iso:{lat_r}:{lon_r}:{mode}:{interval}"
    
    data = await cache.client.get(key)
    if data:
        return json.loads(data)
    return None

async def set_cached_isochrone(lat: float, lon: float, mode: str, interval: int, result: dict):
    if not cache.client:
        return
    
    lat_r = round(lat, 4)
    lon_r = round(lon, 4)
    key = f"iso:{lat_r}:{lon_r}:{mode}:{interval}"
    
    # 7 days = 604800 seconds
    await cache.client.set(key, json.dumps(result), ex=604800)
