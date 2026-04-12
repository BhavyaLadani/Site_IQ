import React, { useMemo } from 'react';
import Map from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import 'maplibre-gl/dist/maplibre-gl.css';

interface InteractiveMapProps {
  onMapClick: (lat: number, lon: number) => void;
}

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: 23.03,
  longitude: 72.57,
  zoom: 12,
  pitch: 45,
  bearing: 0
};

// MapLibre compatible dark basemap style
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

interface HexDataItem {
  hex: string;
  score: number;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ onMapClick }) => {
  // Deck.gl Layers array
  const layers = useMemo(() => {
    return [
      // 1. Placeholder H3 Hexagon Grid (Requires standard h3 index array)
      new H3HexagonLayer({
        id: 'h3-score-grid',
        data: [], // Would stream from backend /api/v1/hotspots
        pickable: true,
        wireframe: false,
        filled: true,
        extruded: false,
        getHexagon: (d: HexDataItem) => d.hex,
        getFillColor: (d: HexDataItem) => [255, (100 - d.score) * 2.5, 0, 150], // Amber-ish
      }),
      // Other layers (Isochrones, Clusters) would be mapped here using `new GeoJsonLayer(...)`
    ];
  }, []);

  const handleClick = (info: PickingInfo) => {
    if (info.coordinate) {
      onMapClick(info.coordinate[1], info.coordinate[0]);
    }
  };

  return (
    <div className="w-full h-full relative">
      <DeckGL
        layers={layers}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        onClick={handleClick}
        getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'crosshair'}
      >
        <Map 
          mapStyle={MAP_STYLE} 
          reuseMaps 
          attributionControl={false}
        />
      </DeckGL>
    </div>
  );
};

export default InteractiveMap;
