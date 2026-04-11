import React from 'react';
import { useStore } from '../../store/useStore';
import { Layers, Eye, EyeOff } from 'lucide-react';

const LayerToggle: React.FC = () => {
  const { layerVisibility, setLayerVisibility, setLayerOpacity } = useStore();

  const labels: Record<string, string> = {
    demographics: "Demographics Heatmap",
    transport: "Transport Network",
    poi: "Points of Interest",
    land_use: "Zoning Fill",
    environment: "Environment Overlay",
    hotspots: "H3 Hotspot Extract",
    isochrones: "Routing Catchments"
  };

  return (
    <div className="w-72 bg-slate-900 border-l border-slate-800 p-6 flex flex-col h-full text-slate-100 overflow-y-auto">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
        <Layers className="text-blue-500" size={24} />
        <h2 className="text-lg font-bold">Data Layers</h2>
      </div>

      <div className="space-y-6">
        {Object.keys(layerVisibility).map((layerId) => {
          const state = layerVisibility[layerId];
          return (
            <div key={layerId} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">
                  {labels[layerId] || layerId}
                </span>
                <button
                  onClick={() => setLayerVisibility(layerId, !state.visible)}
                  className={`p-1.5 rounded-md transition-colors ${state.visible ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}
                >
                  {state.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 font-mono w-6">
                  {Math.round(state.opacity * 100)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.opacity}
                  onChange={(e) => setLayerOpacity(layerId, parseFloat(e.target.value))}
                  disabled={!state.visible}
                  className={`flex-1 h-1 rounded-full appearance-none bg-slate-800 cursor-pointer ${!state.visible && 'opacity-50 cursor-not-allowed'}
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                    [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LayerToggle;
