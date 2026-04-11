import { useQuery } from '@tanstack/react-query';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

// ----------------------------------------------------
// Scoring
// ----------------------------------------------------
export const fetchScore = async (lat: number, lon: number, weights: Record<string, number>) => {
  const req = await fetch(`${API_BASE}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat,
      lon,
      use_case: 'retail', // Default for now
      custom_weights: weights,
    })
  });
  if (!req.ok) {
    const errorBody = await req.json();
    throw new Error(errorBody.message || 'Scoring Engine failed');
  }
  return req.json();
};

// ----------------------------------------------------
// Hotspots
// ----------------------------------------------------
export const fetchHotspots = async (bbox: number[]) => {
  if (!bbox || bbox.length !== 4) return null;
  const param = bbox.join(',');
  const req = await fetch(`${API_BASE}/hotspots?bbox=${param}&min_score=60`);
  if (!req.ok) throw new Error('Hotspot generator failed');
  return req.json();
};

export const useHotspots = (bbox: number[]) => {
  return useQuery({
    queryKey: ['hotspots', bbox],
    queryFn: () => fetchHotspots(bbox),
    enabled: !!bbox && bbox.length === 4,
    staleTime: 60 * 60 * 1000 // 1 hour
  });
};

// ----------------------------------------------------
// Compare
// ----------------------------------------------------
export const fetchCompare = async (sites: Array<{lat: number; lon: number; label: string}>) => {
  if (sites.length < 2) return null;
  const req = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sites })
  });
  if (!req.ok) throw new Error('Comparison failed');
  return req.json();
};

// ----------------------------------------------------
// Isochrones
// ----------------------------------------------------
export const fetchIsochrone = async (lat: number, lon: number) => {
  const req = await fetch(`${API_BASE}/isochrone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat,
      lon,
      modes: ['car'],
      intervals: [10, 20, 30]
    })
  });
  if (!req.ok) throw new Error('Isochrone failed');
  return req.json();
};

