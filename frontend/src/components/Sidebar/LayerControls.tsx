import React, { useState, useEffect } from 'react';

interface LayerControlsProps {
  weights: Record<string, number>;
  onChangeWeights: (weights: Record<string, number>) => void;
}

const LayerControls: React.FC<LayerControlsProps> = ({ weights, onChangeWeights }) => {
  // Local state for debouncing
  const [localWeights, setLocalWeights] = useState(weights);

  useEffect(() => {
    const handler = setTimeout(() => {
      onChangeWeights(localWeights);
    }, 300); // 300ms debounce
    return () => clearTimeout(handler);
  }, [localWeights, onChangeWeights]);

  const handleChange = (key: string, val: number) => {
    // Normalize logic mathematically would be placed here to keep sum = 1.0
    // Simplified for mockup
    setLocalWeights(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">Layer Weights</h2>
      
      {Object.entries(localWeights).map(([key, val]) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize text-gray-300">{key.replace('_', ' ')}</span>
            <span className="text-emerald-400 font-mono">{(val * 100).toFixed(0)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05"
            value={val}
            onChange={(e) => handleChange(key, parseFloat(e.target.value))}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      ))}
      
      <div className="mt-4 pt-4 border-t border-gray-700 flex flex-col gap-3">
         <h2 className="text-lg font-semibold mb-1">Map Overlays</h2>
         {["Show Clusters", "Show Isochrones", "Show Competitors", "Show Zoning"].map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded bg-gray-800 border-gray-600 focus:ring-emerald-500" />
              {opt}
            </label>
         ))}
      </div>
    </div>
  );
};

export default LayerControls;
