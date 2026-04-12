import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from './apiConfig';

// ----------------------------------------------------
// Scoring
// ----------------------------------------------------
export const fetchScore = async (lat: number, lon: number, weights: Record<string, number>) => {
  return apiPost('/score', {
    lat,
    lon,
    use_case: 'retail',
    custom_weights: weights,
  });
};

// ----------------------------------------------------
// Hotspots
// ----------------------------------------------------
export const fetchHotspots = async (bbox: number[]) => {
  if (!bbox || bbox.length !== 4) return null;
  const param = bbox.join(',');
  return apiGet(`/hotspots?bbox=${param}&min_score=60`);
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
  return apiPost('/compare', { sites });
};

// ----------------------------------------------------
// Isochrones
// ----------------------------------------------------
export const fetchIsochrone = async (lat: number, lon: number) => {
  return apiPost('/isochrone', {
    lat,
    lon,
    modes: ['car'],
    intervals: [10, 20, 30]
  });
};

// ----------------------------------------------------
// Dynamic Config (replaces all hardcoded values)
// ----------------------------------------------------
export interface AppConfig {
  coverage_bbox: { min_lat: number; max_lat: number; min_lon: number; max_lon: number };
  layer_weights: Record<string, number>;
  use_case_configs: Record<string, Record<string, number>>;
  grade_thresholds: Record<string, number>;
  search_radius_km: number;
  demo_center: { lat: number; lon: number; city: string };
}

export const useConfig = () => {
  return useQuery<AppConfig>({
    queryKey: ['app-config'],
    queryFn: () => apiGet('/config'),
    staleTime: 30 * 60 * 1000,  // 30 minutes
    gcTime: 60 * 60 * 1000,     // 1 hour
    retry: 2,
  });
};

// ----------------------------------------------------
// Live System Stats (for homepage banner)
// ----------------------------------------------------
export interface AppStats {
  search_radius: string;
  analysis_layers: string;
  grade_system: string;
  analysis_speed: string;
  total_features: number;
  loaded_layers: number;
  coverage_area: string;
}

export const useStats = () => {
  return useQuery<AppStats>({
    queryKey: ['app-stats'],
    queryFn: () => apiGet('/stats'),
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 15 * 60 * 1000,     // 15 minutes
    retry: 1,
  });
};

// ----------------------------------------------------
// Dynamic Landmarks (for map labels)
// ----------------------------------------------------
export const useLandmarks = () => {
  return useQuery({
    queryKey: ['landmarks'],
    queryFn: () => apiGet('/landmarks'),
    staleTime: 6 * 60 * 60 * 1000,  // 6 hours (matches backend cache)
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
};
