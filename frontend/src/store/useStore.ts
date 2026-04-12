import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  mapBounds: string | null;
  setMapBounds: (bounds: string) => void;
  mapCenter: { lat: number; lon: number };
  setMapCenter: (lat: number, lon: number) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  
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
  
  // Comparison Selection
  selectedComparisonIds: string[];
  toggleComparisonSelection: (id: string) => void;
  clearComparisonSelection: () => void;
  
  // Smart Suggestions
  searchCenter: { lat: number; lon: number } | null;
  setSearchCenter: (center: { lat: number; lon: number } | null) => void;
  suggestedSites: (SiteScore & { distance_km?: number })[];
  setSuggestedSites: (sites: (SiteScore & { distance_km?: number })[]) => void;
  isSuggesting: boolean;
  setIsSuggesting: (loading: boolean) => void;
  
  scoringConfig: Record<string, number>;
  setScoringConfig: (config: Record<string, number>) => void;
}

export const useStore = create<GeoAppState>()(
  persist(
    (set) => ({
      mapBounds: null,
      setMapBounds: (bounds) => set({ mapBounds: bounds }),
      mapCenter: { lat: 23.0225, lon: 72.5714 },
      setMapCenter: (lat, lon) => set({ mapCenter: { lat, lon } }),
      mapZoom: 12,
      setMapZoom: (zoom) => set({ mapZoom: zoom }),
      
      layerVisibility: {
        demographics: { visible: true, opacity: 0.8 },
        transport: { visible: true, opacity: 0.8 },
        poi: { visible: true, opacity: 0.8 },
        land_use: { visible: false, opacity: 0.5 },
        environment: { visible: false, opacity: 0.6 },
        hotspots: { visible: false, opacity: 0.8 },
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
        if (state.pinnedSites.length >= 5 || state.pinnedSites.find(s => s.site_id === site.site_id)) return state;
        return { pinnedSites: [...state.pinnedSites, site] };
      }),
      unpinSite: (siteId) => set((state) => ({
        pinnedSites: state.pinnedSites.filter(s => s.site_id !== siteId),
        selectedComparisonIds: state.selectedComparisonIds.filter(id => id !== siteId)
      })),
      
      selectedComparisonIds: [],
      toggleComparisonSelection: (id) => set((state) => ({
        selectedComparisonIds: state.selectedComparisonIds.includes(id)
          ? state.selectedComparisonIds.filter(sid => sid !== id)
          : [...state.selectedComparisonIds, id]
      })),
      clearComparisonSelection: () => set({ selectedComparisonIds: [] }),
      
      searchCenter: null,
      setSearchCenter: (center) => set({ searchCenter: center }),
      suggestedSites: [],
      setSuggestedSites: (sites) => set({ suggestedSites: sites }),
      isSuggesting: false,
      setIsSuggesting: (loading) => set({ isSuggesting: loading }),
      
      scoringConfig: {
        demographics: 0.25,
        transport: 0.20,
        poi: 0.20,
        land_use: 0.20,
        environment: 0.15
      },
      setScoringConfig: (config) => set({ scoringConfig: config })
    }),
    {
      name: 'site-iq-storage',
      partialize: (state) => ({ 
        pinnedSites: state.pinnedSites,
        scoringConfig: state.scoringConfig 
      }), // only persist these
    }
  )
);

