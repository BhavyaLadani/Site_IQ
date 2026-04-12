import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { 
  BarChart as BarChart3, 
  Trash2, 
  CheckCircle as CheckSquare, 
  Square, 
  ChevronDown,
  Layers
} from 'lucide-react';

const ComparisonDashboard: React.FC<{ onOpenCompare: () => void }> = ({ onOpenCompare }) => {
  const { pinnedSites, unpinSite, selectedComparisonIds, toggleComparisonSelection } = useStore();
  const [isMinimized, setIsMinimized] = useState(false);

  if (pinnedSites.length === 0) return null;

  return (
    <div className={`fixed bottom-6 left-6 z-[1000] transition-all duration-300 ease-in-out ${
      isMinimized ? 'w-14 h-14' : 'w-80'
    }`}>
      {isMinimized ? (
        <button 
          onClick={() => setIsMinimized(false)}
          className="w-12 h-12 bg-indigo-600 text-white rounded-xl shadow-2xl flex items-center justify-center hover:bg-indigo-500 transition-colors relative overflow-hidden group"
        >
          <BarChart3 size={20} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
            {pinnedSites.length}
          </span>
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ) : (
        <div className="bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Layers size={18} />
              <h3 className="font-bold text-sm tracking-tight">Saved for Comparison</h3>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto p-3 space-y-2">
            {pinnedSites.map((site) => {
              const isSelected = selectedComparisonIds.includes(site.site_id);
              return (
                <div 
                  key={site.site_id}
                  className={`group relative p-3 rounded-xl border transition-all ${
                    isSelected 
                    ? 'bg-indigo-50/50 border-indigo-200 ring-1 ring-indigo-200' 
                    : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button 
                      onClick={() => toggleComparisonSelection(site.site_id)}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${isSelected ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
                    >
                      {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                    
                    <div className="flex-1 min-w-0" onClick={() => toggleComparisonSelection(site.site_id)}>
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {site.locationName || 'Unnamed Location'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono text-slate-400">
                          {site.lat.toFixed(4)}, {site.lon.toFixed(4)}
                        </span>
                        <span className="text-[10px] font-bold text-indigo-600 px-1.5 py-0.5 bg-indigo-50 rounded-md">
                          {site.total_score} pts
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        unpinSite(site.site_id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button 
              onClick={onOpenCompare}
              disabled={selectedComparisonIds.length < 2}
              className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                selectedComparisonIds.length >= 2
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-500 active:scale-[0.98]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <BarChart3 size={14} />
              Compare Selected ({selectedComparisonIds.length})
            </button>
            {selectedComparisonIds.length < 2 && (
              <p className="text-[10px] text-center text-slate-400 mt-2 font-medium">
                Select at least 2 locations to compare.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonDashboard;
