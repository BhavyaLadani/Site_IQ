import React from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../store/useStore';
import type { SiteScore } from '../../store/useStore';

interface IsochroneLayerProps {
  activeSite: SiteScore | null;
}

const IsochroneLayer: React.FC<IsochroneLayerProps> = ({ activeSite }) => {
  const { layerVisibility } = useStore();
  const state = layerVisibility['isochrones'];

  const { data: geojson } = useQuery({
    queryKey: ['isochrones', activeSite?.site_id],
    queryFn: async () => {
      if (!activeSite) return null;
      const resp = await fetch('http://localhost:8000/isochrone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: activeSite.lat,
          lon: activeSite.lon,
          minutes: [10, 20, 30],
          mode: 'car'
        })
      });
      return await resp.json();
    },
    enabled: !!activeSite && state.visible
  });

  if (!state.visible || !geojson || !geojson.features) return null;

  return (
    <Source type="geojson" data={geojson}>
      <Layer
        id="isochrone-fill"
        type="fill"
        paint={{
          'fill-color': [
            'match',
            ['get', 'value'],
            10, '#3b82f6',
            20, '#10b981',
            30, '#8b5cf6',
            '#64748b' // default
          ],
          'fill-opacity': state.opacity
        }}
      />
      <Layer
        id="isochrone-line"
        type="line"
        paint={{
          'line-color': '#0f172a',
          'line-width': 1.5,
          'line-opacity': state.opacity + 0.1
        }}
      />
    </Source>
  );
};

export default IsochroneLayer;
