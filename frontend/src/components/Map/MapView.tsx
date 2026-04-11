import React, { useCallback, useRef, useState } from 'react';
import Map, { Marker, NavigationControl, useControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type { IControl } from 'maplibre-gl';
import { useStore } from '../../store/useStore';
import { useMutation } from '@tanstack/react-query';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Gujarat / Ahmedabad data coverage area
const COVERAGE_BBOX = {
  minLon: 72.45, minLat: 22.95,
  maxLon: 72.70, maxLat: 23.15
};

const COVERAGE_GEOJSON = {
  type: 'FeatureCollection' as const,
  features: [{
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[
        [COVERAGE_BBOX.minLon, COVERAGE_BBOX.minLat],
        [COVERAGE_BBOX.maxLon, COVERAGE_BBOX.minLat],
        [COVERAGE_BBOX.maxLon, COVERAGE_BBOX.maxLat],
        [COVERAGE_BBOX.minLon, COVERAGE_BBOX.maxLat],
        [COVERAGE_BBOX.minLon, COVERAGE_BBOX.minLat],
      ]]
    }
  }]
};

// Use-case weight presets
const USE_CASE_CONFIGS: Record<string, Record<string, number>> = {
  retail:      { demographics: 0.30, transportation: 0.25, competition: 0.20, land_use: 0.15, environment: 0.10 },
  warehouse:   { demographics: 0.10, transportation: 0.40, competition: 0.10, land_use: 0.25, environment: 0.15 },
  ev_charging: { demographics: 0.20, transportation: 0.35, competition: 0.15, land_use: 0.20, environment: 0.10 },
  telecom:     { demographics: 0.15, transportation: 0.20, competition: 0.10, land_use: 0.25, environment: 0.30 },
};

// DrawControl using MapboxDraw cast to IControl for MapLibre compatibility
function DrawControl({ onPolygonComplete }: { onPolygonComplete: (coords: [number, number][]) => void }) {
  useControl<IControl>(
    () => {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
      });
      return draw as unknown as IControl;
    },
    ({ map }) => {
      map.on('draw.create', (e: any) => {
        const coords = e.features[0]?.geometry?.coordinates[0] as [number, number][];
        if (coords) onPolygonComplete(coords);
      });
    },
    { position: 'top-left' }
  );
  return null;
}

const MapView: React.FC = () => {
  const { scoringConfig, setScoringConfig, activeSite, setActiveSite, setMapBounds } = useStore();
  const mapRef = useRef<any>(null);
  const [useCase, setUseCase] = useState('retail');
  const [isBatchLoading, setIsBatchLoading] = useState(false);

  // Reverse geocode a point to get location name
  const fetchLocationName = async (lat: number, lon: number): Promise<string> => {
    try {
      const resp = await fetch(`http://localhost:8000/reverse_geocode?lat=${lat}&lon=${lon}`);
      if (resp.ok) {
        const data = await resp.json();
        return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      }
    } catch { /* ignore */ }
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  };

  const scoreMutation = useMutation({
    mutationFn: async (coords: { lat: number; lon: number }) => {
      // Score and reverse geocode in parallel
      const [scoreResp, locationName] = await Promise.all([
        fetch('http://localhost:8001/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: coords.lat, lon: coords.lon, config: scoringConfig, use_case: useCase })
        }).then(r => { if (!r.ok) throw new Error('Score API failed'); return r.json(); }),
        fetchLocationName(coords.lat, coords.lon)
      ]);
      return { ...scoreResp, _locationName: locationName };
    },
    onSuccess: (data, coords) => {
      setActiveSite({
        site_id: data.site_id || `site_${coords.lat.toFixed(3)}_${coords.lon.toFixed(3)}`,
        lat: coords.lat,
        lon: coords.lon,
        total_score: data.composite_score ?? 0,
        layer_scores: Object.fromEntries(
          Object.entries(data.layer_scores || {}).map(([k, v]: [string, any]) => [k, v.raw ?? 0])
        ),
        warnings: data.hard_constraint_failures || [],
        grade: data.grade,
        recommendation: data.recommendation,
        reasoning: data.reasoning_trace,
        locationName: data._locationName,
      });

      // Smooth fly-to animation
      if (mapRef.current) {
        mapRef.current.getMap().flyTo({
          center: [coords.lon, coords.lat],
          zoom: 15,
          speed: 1.2,
          curve: 1.4,
          essential: true,
        });
      }

      // Auto-save to history if user is logged in
      const token = localStorage.getItem('token');
      if (token) {
        fetch('http://localhost:8001/history/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            lat: coords.lat, lon: coords.lon,
            location_name: data._locationName,
            result: data, use_case: useCase
          })
        }).catch(() => {}); // silent — don't block UI
      }
    }
  });

  const handleMapClick = useCallback((e: any) => {
    if ((e.originalEvent.target as HTMLElement).closest?.('.map-marker')) return;
    scoreMutation.mutate({ lat: e.lngLat.lat, lon: e.lngLat.lng });
  }, [scoreMutation]);

  const onMoveEnd = useCallback(() => {
    if (mapRef.current) {
      const b = mapRef.current.getMap().getBounds();
      setMapBounds(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
    }
  }, [setMapBounds]);

  const handleUseCaseChange = useCallback((uc: string) => {
    setUseCase(uc);
    setScoringConfig(USE_CASE_CONFIGS[uc] || USE_CASE_CONFIGS.retail);
  }, [setScoringConfig]);

  const handlePolygonComplete = useCallback(async (coords: [number, number][]) => {
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    setIsBatchLoading(true);
    const gridLats = Array.from({ length: 5 }, (_, i) => minLat + (i / 4) * (maxLat - minLat));
    const gridLons = Array.from({ length: 5 }, (_, i) => minLon + (i / 4) * (maxLon - minLon));
    const points = gridLats.flatMap(lat => gridLons.map(lon => ({ lat, lon })));
    try {
      await fetch('http://localhost:8000/batch_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, config: scoringConfig, use_case: useCase })
      });
    } finally {
      setIsBatchLoading(false);
    }
  }, [scoringConfig, useCase]);

  return (
    <div className="w-full h-full relative">
      {/* Use-case selector */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full px-2 py-1 shadow-xl">
        {Object.keys(USE_CASE_CONFIGS).map(uc => (
          <button key={uc} onClick={() => handleUseCaseChange(uc)}
            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all ${
              useCase === uc ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-slate-100'
            }`}>
            {uc.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      {(scoreMutation.isPending || isBatchLoading) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl px-6 py-4 text-white text-sm font-semibold flex items-center gap-3 shadow-2xl">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {isBatchLoading ? 'Batch scoring polygon...' : 'Analyzing site...'}
          </div>
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={{ latitude: 23.03, longitude: 72.57, zoom: 12 }}
        mapStyle={MAP_STYLE}
        onClick={handleMapClick}
        onMoveEnd={onMoveEnd}
        cursor={scoreMutation.isPending ? 'wait' : 'crosshair'}
      >
        <NavigationControl position="top-right" />
        <DrawControl onPolygonComplete={handlePolygonComplete} />

        {/* Data coverage boundary */}
        <Source id="coverage-bbox" type="geojson" data={COVERAGE_GEOJSON}>
          <Layer id="coverage-fill" type="fill"
            paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.04 }} />
          <Layer id="coverage-line" type="line"
            paint={{ 'line-color': '#3b82f6', 'line-width': 2, 'line-dasharray': [4, 3], 'line-opacity': 0.5 }} />
        </Source>

        {/* Active marker with pulsing animation */}
        {activeSite && (
          <Marker longitude={activeSite.lon} latitude={activeSite.lat} anchor="center">
            <div className="map-marker relative flex items-center justify-center">
              <div className="absolute w-10 h-10 bg-blue-500 rounded-full opacity-40 animate-ping" />
              <div className="relative w-5 h-5 bg-white rounded-full border-4 border-blue-500 shadow-xl cursor-pointer z-10" />
            </div>
          </Marker>
        )}
      </Map>
    </div>
  );
};

export default MapView;
