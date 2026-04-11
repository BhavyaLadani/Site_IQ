import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useQuery } from '@tanstack/react-query';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { useControl } from 'react-map-gl/maplibre';
import type { LayersList } from '@deck.gl/core';

// Proper DeckGL integration inside MapLibre using MapboxOverlay adapter.
// This renders within MapLibre's WebGL context instead of a separate canvas,
// so it does NOT block scroll or click events on the map.
function DeckGLOverlay({ layers }: { layers: LayersList }) {
  useControl<MapboxOverlay>(
    () => new MapboxOverlay({ interleaved: false, layers }),
    { position: 'top-left' }
  );
  return null;
}

const HotspotLayer: React.FC = () => {
  const { mapBounds, layerVisibility } = useStore();
  const visible = layerVisibility['hotspots']?.visible ?? false;

  const { data: hotspots } = useQuery({
    queryKey: ['hotspots', mapBounds],
    queryFn: async () => {
      if (!mapBounds) return [];
      const resp = await fetch(`http://localhost:8000/hotspots?bbox=${mapBounds}&method=h3`);
      if (!resp.ok) return [];
      const geojson = await resp.json();
      return (geojson.features || []).map((f: any) => ({
        hex: f.properties?.hex_id,
        score: f.properties?.mean_score ?? f.properties?.score ?? 0
      })).filter((d: any) => !!d.hex);
    },
    enabled: !!mapBounds && visible,
    staleTime: 10000,
  });

  const layers = useMemo((): LayersList => {
    if (!visible || !hotspots || hotspots.length === 0) return [];
    return [
      new H3HexagonLayer({
        id: 'hotspot-h3',
        data: hotspots,
        pickable: true,
        filled: true,
        extruded: true,
        elevationScale: 20,
        getHexagon: (d: any) => d.hex,
        getFillColor: (d: any) => {
          const s = d.score;
          if (s > 75) return [239, 68, 68, 200];  // hot — red
          if (s < 40) return [59, 130, 246, 200];  // cold — blue
          return [248, 250, 252, 180];              // neutral — white
        },
        getElevation: (d: any) => d.score,
        opacity: layerVisibility['hotspots']?.opacity ?? 0.8,
      })
    ];
  }, [hotspots, visible, layerVisibility]);

  // Only render the overlay control if hotspots are visible
  if (!visible) return null;
  return <DeckGLOverlay layers={layers} />;
};

export default HotspotLayer;
