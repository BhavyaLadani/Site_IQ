import { create } from 'zustand';

export interface SiteScore {
  site_id: string;
  total_score: number;
  layer_scores: Record<string, number>;
  warnings: string[];
  lat: number;
  lon: number;
  grade?: string;
  recommendation?: string;
  reasoning?: string[];
  locationName?: string;
}

interface GeoAppState {
  // Mapping State
  mapBounds: string | null; // bbox "minx,miny,maxx,maxy"
  setMapBounds: (bounds: string) => void;
  
  // Layer Visibility Tracking [LayerToggles]
  layerVisibility: Record<string, { visible: boolean; opacity: number }>;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  
  // Scoring / Analysis Targets
  activeSite: SiteScore | null;
  setActiveSite: (site: SiteScore | null) => void;
  
  // Comparison Arsenal [SiteComparison]
  pinnedSites: SiteScore[];
  pinSite: (site: SiteScore) => void;
  unpinSite: (siteId: string) => void;
  
  scoringConfig: Record<string, number>;
  setScoringConfig: (config: Record<string, number>) => void;
}

export const useStore = create<GeoAppState>((set) => ({
  mapBounds: null,
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
  
  layerVisibility: {
    demographics: { visible: true, opacity: 0.8 },
    transport: { visible: true, opacity: 0.8 },
    poi: { visible: true, opacity: 0.8 },
    land_use: { visible: false, opacity: 0.5 },
    environment: { visible: false, opacity: 0.6 },
    hotspots: { visible: false, opacity: 0.8 }, // Hexagon DeckGL bind
    isochrones: { visible: true, opacity: 0.2 },
  },
  
  setLayerVisibility: (id, visible) => set((state) => ({
    layerVisibility: {
      ...state.layerVisibility,
      [id]: { ...state.layerVisibility[id], visible }
    }
  })),
  
  setLayerOpacity: (id, opacity) => set((state) => ({
    layerVisibility: {
      ...state.layerVisibility,
      [id]: { ...state.layerVisibility[id], opacity }
    }
  })),
  
  activeSite: null,
  setActiveSite: (site) => set({ activeSite: site }),
  
  pinnedSites: [],
  pinSite: (site) => set((state) => {
    if (state.pinnedSites.length >= 4 || state.pinnedSites.find(s => s.site_id === site.site_id)) return state;
    return { pinnedSites: [...state.pinnedSites, site] };
  }),
  unpinSite: (siteId) => set((state) => ({
    pinnedSites: state.pinnedSites.filter(s => s.site_id !== siteId)
  })),
  
  scoringConfig: {
    demographics: 0.25,
    transport: 0.20,
    poi: 0.20,
    land_use: 0.20,
    environment: 0.15
  },
  setScoringConfig: (config) => set({ scoringConfig: config })
}));
