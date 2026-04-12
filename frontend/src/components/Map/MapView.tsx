import React, { useCallback, useRef, useState, useMemo } from 'react';
import Map, { Marker, NavigationControl, useControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type { IControl } from 'maplibre-gl';
import { useStore } from '../../store/useStore';
import { useMutation } from '@tanstack/react-query';
import { useConfig, useLandmarks } from '../../api/queries';
import { API_BASE_URL } from '../../api/apiConfig';
import SearchBar from './SearchBar';
import { Building2, Warehouse, BatteryCharging, Radio, Crosshair, Layers } from 'lucide-react';

// ─── Clean light map style (Carto Voyager — label-rich, clean) ───
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Fallback values used if /config API is unreachable
const FALLBACK_BBOX = { min_lon: 72.45, min_lat: 22.95, max_lon: 72.70, max_lat: 23.15 };
const FALLBACK_USE_CASE_CONFIGS: Record<string, Record<string, number>> = {
  retail:      { demographics: 0.30, transportation: 0.25, competition: 0.20, land_use: 0.15, environment: 0.10 },
  warehouse:   { demographics: 0.10, transportation: 0.40, competition: 0.10, land_use: 0.25, environment: 0.15 },
  ev_charging: { demographics: 0.20, transportation: 0.35, competition: 0.15, land_use: 0.20, environment: 0.10 },
  telecom:     { demographics: 0.15, transportation: 0.20, competition: 0.10, land_use: 0.25, environment: 0.30 },
};

const USE_CASE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  retail: { icon: <Building2 size={13} />, label: 'Retail' },
  warehouse: { icon: <Warehouse size={13} />, label: 'Warehouse' },
  ev_charging: { icon: <BatteryCharging size={13} />, label: 'EV Charging' },
  telecom: { icon: <Radio size={13} />, label: 'Telecom' },
};

// Grade → marker color mapping
const GRADE_MARKER_COLOR: Record<string, string> = {
  A: '#10b981', B: '#22c55e', C: '#f59e0b', D: '#f97316', F: '#ef4444',
};

// Grade → gradient colors for pinned marker badges
const GRADE_BADGE_BG: Record<string, string> = {
  A: '#10b981', B: '#22c55e', C: '#f59e0b', D: '#f97316', F: '#ef4444', 'N/A': '#94a3b8',
};

// DrawControl using MapboxDraw — positioned bottom-left to avoid search bar overlap
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
    { position: 'bottom-right' }
  );
  return null;
}

function generateCircle(center: [number, number], radiusKm: number, points = 64) {
  const coords = [];
  for (let i = 0; i < points; i++) {
    const angle = (i * 360) / points;
    const dx = radiusKm * Math.cos((angle * Math.PI) / 180);
    const dy = radiusKm * Math.sin((angle * Math.PI) / 180);
    const lat = center[1] + dy / 111.0;
    const lon = center[0] + dx / (111.0 * Math.cos((center[1] * Math.PI) / 180));
    coords.push([lon, lat]);
  }
  coords.push(coords[0]);
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
  };
}

const MapView: React.FC = () => {
  const { scoringConfig, setScoringConfig, activeSite, setActiveSite, setMapBounds, pinnedSites, suggestedSites, setSuggestedSites, isSuggesting, setIsSuggesting, searchCenter, setSearchCenter, mapCenter, mapZoom } = useStore();
  const mapRef = useRef<any>(null);
  const hydrationRef = useRef<string | null>(null);
  const isMapReadyRef = useRef(false);
  const [useCase, setUseCase] = useState('retail');
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(12);

  // ─── Fetch dynamic config and landmarks from API ───
  const { data: config } = useConfig();
  const { data: landmarksData } = useLandmarks();

  // Derived from dynamic config, with fallbacks
  const coverageBbox = config?.coverage_bbox || FALLBACK_BBOX;
  const useCaseConfigs = config?.use_case_configs || FALLBACK_USE_CASE_CONFIGS;

  const coverageGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [coverageBbox.min_lon, coverageBbox.min_lat],
          [coverageBbox.max_lon, coverageBbox.min_lat],
          [coverageBbox.max_lon, coverageBbox.max_lat],
          [coverageBbox.min_lon, coverageBbox.max_lat],
          [coverageBbox.min_lon, coverageBbox.min_lat],
        ]]
      }
    }]
  }), [coverageBbox]);

  // Landmarks GeoJSON — fetched dynamically from /landmarks API
  const landmarksGeoJSON = useMemo(() => {
    if (landmarksData && landmarksData.features?.length > 0) {
      return landmarksData;
    }
    // Empty fallback while loading
    return { type: 'FeatureCollection' as const, features: [] };
  }, [landmarksData]);

  // Safe flyTo: always works regardless of map readiness timing
  const flyToLocation = useCallback((lat: number, lon: number, zoom = 15) => {
    const tryFly = () => {
      if (mapRef.current) {
        try {
          mapRef.current.getMap().flyTo({
            center: [lon, lat],
            zoom,
            speed: 1.4,
            curve: 1.4,
            essential: true,
          });
          return true;
        } catch { return false; }
      }
      return false;
    };
    if (!tryFly()) {
      // Map not ready yet — retry after a short delay
      setTimeout(() => tryFly(), 300);
    }
  }, []);

  // Reverse geocode a point to get location name
  const fetchLocationName = async (lat: number, lon: number): Promise<string> => {
    try {
      const resp = await fetch(`${API_BASE_URL}/reverse_geocode?lat=${lat}&lon=${lon}`);
      if (resp.ok) {
        const data = await resp.json();
        return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      }
    } catch { /* ignore */ }
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  };

  const suggestMutation = useMutation({
    mutationFn: async (params: { lat: number, lon: number, score: number }) => {
      setIsSuggesting(true);
      const resp = await fetch(`${API_BASE_URL}/suggest_nearby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: params.lat,
          lon: params.lon,
          radius_km: config?.search_radius_km || 2.0,
          current_score: params.score,
          config: scoringConfig,
          use_case: useCase
        })
      });
      if (!resp.ok) throw new Error('Suggest API failed');
      return resp.json();
    },
    onSuccess: (data) => {
      setIsSuggesting(false);
      const formatted = (data.suggestions || []).map((s: any) => ({
        site_id: s.site_id || `suggest_${s.coordinates.lat}_${s.coordinates.lon}`,
        lat: s.coordinates.lat,
        lon: s.coordinates.lon,
        total_score: s.composite_score ?? 0,
        layer_scores: Object.fromEntries(
          Object.entries(s.layer_scores || {}).map(([k, v]: [string, any]) => [k, v.raw ?? 0])
        ),
        warnings: s.hard_constraint_failures || [],
        grade: s.grade,
        recommendation: s.recommendation,
        reasoning: s.reasoning_trace,
        locationName: s._locationName,
        distance_km: s.distance_km
      }));
      setSuggestedSites(formatted);
    },
    onError: () => {
      setIsSuggesting(false);
      setSuggestedSites([]);
      setSearchCenter(null);
    }
  });

  const scoreMutation = useMutation({
    mutationFn: async (coords: { lat: number; lon: number }) => {
      // Clear old suggestions immediately when fetching a new main site
      setSuggestedSites([]);
      const [scoreResp, locationName] = await Promise.all([
        fetch(`${API_BASE_URL}/score`, {
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

      flyToLocation(coords.lat, coords.lon, 15);

      const token = localStorage.getItem('token');
      if (token) {
        fetch(`${API_BASE_URL}/history/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            lat: coords.lat, lon: coords.lon,
            location_name: data._locationName,
            result: data, use_case: useCase
          })
        }).catch(() => {});
      }

      setSearchCenter({ lat: coords.lat, lon: coords.lon });
      // Trigger finding better locations nearby
      suggestMutation.mutate({ lat: coords.lat, lon: coords.lon, score: data.composite_score ?? 0 });
    }
  });

  const handleMapClick = useCallback((e: any) => {
    const target = e.originalEvent.target as HTMLElement;
    if (target.closest?.('.map-marker')) return;
    if (target.closest?.('.maplibregl-ctrl') || target.closest?.('.mapboxgl-ctrl')) return;
    scoreMutation.mutate({ lat: e.lngLat.lat, lon: e.lngLat.lng });
  }, [scoreMutation]);

  const handleSearchSelect = useCallback((lat: number, lon: number, _name: string) => {
    scoreMutation.mutate({ lat, lon });
  }, [scoreMutation]);

  const onMoveEnd = useCallback(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      const b = map.getBounds();
      setMapBounds(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
      setCurrentZoom(Math.round(map.getZoom()));
    }
  }, [setMapBounds]);

  const handleUseCaseChange = useCallback((uc: string) => {
    setUseCase(uc);
    setScoringConfig(useCaseConfigs[uc] || useCaseConfigs.retail || FALLBACK_USE_CASE_CONFIGS.retail);
  }, [setScoringConfig, useCaseConfigs]);

  React.useEffect(() => {
    // Fly to location set by Dashboard navigation
    if (mapCenter.lat && mapCenter.lon) {
      flyToLocation(mapCenter.lat, mapCenter.lon, mapZoom);
    }
  }, [mapCenter, mapZoom, flyToLocation]);

  React.useEffect(() => {
    // When activeSite is set from history (no fresh scoreMutation), hydrate the map
    if (!activeSite) return;
    if (hydrationRef.current === activeSite.site_id) return; // Already hydrated
    if (scoreMutation.isPending) return; // Don't interrupt a fresh click
    if (isSuggesting) return;

    hydrationRef.current = activeSite.site_id;

    // Ensure radius circle is visible
    if (!searchCenter) {
      setSearchCenter({ lat: activeSite.lat, lon: activeSite.lon });
    }

    // Fly to the stored location — always works with the new flyToLocation helper
    flyToLocation(activeSite.lat, activeSite.lon, 15);

    // Load nearby suggestions for this historical site
    suggestMutation.mutate({
      lat: activeSite.lat,
      lon: activeSite.lon,
      score: activeSite.total_score
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSite?.site_id]);

  React.useEffect(() => {
    // Dynamically re-evaluate the location when the use case changes
    if (searchCenter) {
      scoreMutation.mutate({ lat: searchCenter.lat, lon: searchCenter.lon });
    } else if (activeSite) {
      scoreMutation.mutate({ lat: activeSite.lat, lon: activeSite.lon });
    }
  }, [useCase]); 

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
      await fetch(`${API_BASE_URL}/batch_score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, config: scoringConfig, use_case: useCase })
      });
    } finally {
      setIsBatchLoading(false);
    }
  }, [scoringConfig, useCase]);

  const resetView = useCallback(() => {
    const center = config?.demo_center || { lat: 23.03, lon: 72.57 };
    flyToLocation(center.lat, center.lon, 12);
  }, [flyToLocation, config]);

  // Determine marker size based on zoom
  const markerScale = currentZoom >= 15 ? 1 : currentZoom >= 12 ? 0.85 : 0.7;

  return (
    <div className="w-full h-full relative bg-slate-50">

      {/* ─── TOP-LEFT: Search bar (narrow, left-aligned) ─── */}
      <SearchBar onSelect={handleSearchSelect} />

      {/* ─── TOP: Use-case selector (shifted right to avoid search overlap) ─── */}
      <div className="absolute top-3 right-14 z-10 flex gap-0.5 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-1 py-0.5 shadow-sm">
        {Object.entries(USE_CASE_META).map(([uc, meta]) => (
          <button key={uc} onClick={() => handleUseCaseChange(uc)}
            title={meta.label}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
              useCase === uc
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}>
            <span className={useCase === uc ? 'text-white/90' : 'text-slate-400'}>{meta.icon}</span>
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        ))}
      </div>

      {/* ─── BOTTOM-LEFT: Info bar + Reset button ─── */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
        <div className="px-3 py-1.5 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl text-[11px] text-slate-400 font-mono shadow-sm">
          {config?.demo_center?.city || 'Ahmedabad, Gujarat'} · Zoom {currentZoom}
        </div>
        <button onClick={resetView} title="Reset view to Ahmedabad"
          className="w-8 h-8 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
          <Crosshair size={14} />
        </button>
      </div>

      {/* ─── Loading overlay ─── */}
      {(scoreMutation.isPending || isBatchLoading) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 text-slate-700 text-sm font-semibold flex items-center gap-3 shadow-lg animate-fade-up">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            {isBatchLoading ? 'Batch scoring polygon…' : 'Analyzing site…'}
          </div>
        </div>
      )}
      {/* ─── Suggesting overlay ─── */}
      {isSuggesting && !scoreMutation.isPending && (
        <div className="absolute bottom-6 mx-auto left-0 right-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-600/90 backdrop-blur-md rounded-full px-4 py-2 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 animate-fade-up">
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Searching for better locations nearby…
          </div>
        </div>
      )}

      {/* ─── Pinned count badge (top-right, below nav controls) ─── */}
      {pinnedSites.length > 0 && (
        <div className="absolute top-[120px] right-3 z-10 px-2.5 py-1.5 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-sm flex items-center gap-2">
          <Layers size={12} className="text-indigo-500" />
          <span className="text-[11px] font-semibold text-slate-600">{pinnedSites.length} pinned</span>
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={{ latitude: 23.03, longitude: 72.57, zoom: 12 }}
        mapStyle={MAP_STYLE}
        onClick={handleMapClick}
        onMoveEnd={onMoveEnd}
        onLoad={() => { isMapReadyRef.current = true; }}
        cursor={scoreMutation.isPending ? 'wait' : 'crosshair'}
      >
        <NavigationControl position="top-right" />
        <DrawControl onPolygonComplete={handlePolygonComplete} />

        {/* ─── Coverage boundary (dynamically fetched from /config) ─── */}
        <Source id="coverage-bbox" type="geojson" data={coverageGeoJSON}>
          <Layer id="coverage-fill" type="fill"
            paint={{ 'fill-color': '#6366f1', 'fill-opacity': 0.04 }} />
          <Layer id="coverage-line" type="line"
            paint={{ 'line-color': '#6366f1', 'line-width': 1.5, 'line-dasharray': [6, 4], 'line-opacity': 0.35 }} />
        </Source>

        {/* ─── Ahmedabad Area Landmark Labels (dynamically fetched from /landmarks) ─── */}
        <Source id="ahmedabad-landmarks" type="geojson" data={landmarksGeoJSON}>
          <Layer
            id="landmark-labels"
            type="symbol"
            minzoom={11}
            layout={{
              'text-field': ['get', 'name'],
              'text-font': ['Open Sans Bold'],
              'text-size': [
                'interpolate', ['linear'], ['zoom'],
                11, 10,
                14, 12,
                16, 13,
              ],
              'text-offset': [0, 0],
              'text-anchor': 'center',
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.06,
              'text-max-width': 8,
              'symbol-placement': 'point',
              'icon-allow-overlap': false,
              'text-allow-overlap': false,
            }}
            paint={{
              'text-color': [
                'match', ['get', 'type'],
                'highway', '#6366f1',
                'landmark', '#7c3aed',
                '#64748b'
              ],
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
              'text-opacity': [
                'interpolate', ['linear'], ['zoom'],
                11, 0.6,
                13, 1,
              ],
            }}
          />
          <Layer
            id="landmark-dots"
            type="circle"
            minzoom={12}
            paint={{
              'circle-radius': 3,
              'circle-color': [
                'match', ['get', 'type'],
                'highway', '#6366f1',
                'landmark', '#7c3aed',
                '#94a3b8'
              ],
              'circle-opacity': 0.55,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </Source>

        {/* ─── Pinned Sites — Persistent Markers (never disappear on zoom) ─── */}
        {pinnedSites.map((site) => {
          const color = GRADE_BADGE_BG[site.grade || 'N/A'] || '#94a3b8';
          const isActive = activeSite?.site_id === site.site_id;
          return (
            <Marker key={`pinned_${site.site_id}`} longitude={site.lon} latitude={site.lat} anchor="center">
              <div
                className="map-marker flex flex-col items-center cursor-pointer group"
                style={{ transform: `scale(${markerScale})`, zIndex: isActive ? 55 : 45 }}
                onClick={(e) => { e.stopPropagation(); setActiveSite(site); }}
                title={site.locationName || site.site_id}
              >
                {/* Grade badge */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-lg border-2 border-white group-hover:scale-125 transition-transform duration-200"
                  style={{ backgroundColor: color, boxShadow: `0 2px 8px ${color}66` }}
                >
                  {site.grade || '?'}
                </div>
                {/* Name label — appears on hover or at high zoom */}
                <div className="mt-1 px-1.5 py-0.5 bg-white/95 border border-slate-200 rounded-md text-[9px] font-bold text-slate-700 shadow-sm whitespace-nowrap max-w-[80px] truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  {site.locationName?.split(',')[0] || `${site.lat.toFixed(3)}`}
                </div>
              </div>
            </Marker>
          );
        })}

        {/* ─── 2km Radius Circle for searchCenter ─── */}
        {searchCenter && (isSuggesting || suggestedSites.length > 0) && (
          <Source id="active-radius" type="geojson" data={{ type: 'FeatureCollection', features: [generateCircle([searchCenter.lon, searchCenter.lat], config?.search_radius_km || 2)] }}>
            <Layer id="radius-fill" type="fill" paint={{ 'fill-color': '#10b981', 'fill-opacity': 0.05 }} />
            <Layer id="radius-line" type="line" paint={{ 'line-color': '#10b981', 'line-width': 1.5, 'line-dasharray': [4, 4], 'line-opacity': 0.6 }} />
          </Source>
        )}

        {/* ─── Origin / Main Location Marker ─── */}
        {searchCenter && (searchCenter.lat !== activeSite?.lat || searchCenter.lon !== activeSite?.lon) && (
          <Marker longitude={searchCenter.lon} latitude={searchCenter.lat} anchor="center">
            <div className="map-marker relative flex items-center justify-center cursor-pointer"
                 onClick={(e) => { e.stopPropagation(); scoreMutation.mutate({lat: searchCenter.lat, lon: searchCenter.lon}) }}
                 style={{ transform: `scale(${markerScale * 0.8})`, zIndex: 30 }}>
              <div className="relative w-4 h-4 rounded-full shadow-md border-2 border-slate-300 bg-slate-400" />
            </div>
          </Marker>
        )}

        {/* ─── Active marker with pulsing ring ─── */}
        {activeSite && (
          <Marker longitude={activeSite.lon} latitude={activeSite.lat} anchor="center">
            <div className="map-marker relative flex items-center justify-center" style={{ transform: `scale(${markerScale})`, zIndex: 50 }}>
              <div className="absolute w-10 h-10 rounded-full border-2 border-indigo-400 animate-pulse-ring" />
              <div className="absolute w-6 h-6 bg-indigo-500 rounded-full opacity-20 animate-ping" />
              <div className="relative w-4 h-4 rounded-full shadow-lg shadow-indigo-300 cursor-pointer z-10 border-2 border-white"
                style={{ backgroundColor: GRADE_MARKER_COLOR[activeSite.grade || ''] || '#6366f1' }} />
            </div>
          </Marker>
        )}

        {/* ─── Suggested Sites Markers ─── */}
        {suggestedSites.map((site, i) => {
          const isSelected = activeSite?.lat === site.lat && activeSite?.lon === site.lon;
          // Hide marker if it's currently the active site to prevent overlap visual glitch
          if (isSelected) return null;
          return (
            <Marker key={`suggest_${i}`} longitude={site.lon} latitude={site.lat} anchor="center">
              <div className="relative flex items-center justify-center cursor-pointer hover:scale-125 transition-transform"
                  style={{ transform: `scale(${markerScale * 0.9})`, zIndex: 40 }}
                  onClick={(e) => { e.stopPropagation(); setActiveSite(site as any); }}>
                <div className="absolute w-6 h-6 bg-emerald-500 rounded-full opacity-40 animate-ping" />
                <div className="relative w-4 h-4 rounded-full shadow-md border-2 border-white bg-emerald-500" />
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
};

export default MapView;
