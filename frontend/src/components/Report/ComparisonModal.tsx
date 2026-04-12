import React from 'react';
import { useStore } from '../../store/useStore';
import {
  X,
  TrendingUp as Trophy,
  Users,
  TrendingUp,
  Building2,
  MapPin,
  ShieldAlert,
  ChevronRight as ArrowRight,
  TrendingUp as Zap,
  CheckCircle as Star
} from 'lucide-react';

interface ComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const METRICS = [
  { key: 'total_score', label: 'Overall Suitability', icon: <Star size={13} /> },
  { key: 'demographics', label: 'Population Density', icon: <Users size={13} /> },
  { key: 'transportation', label: 'Infrastructure & Transit', icon: <TrendingUp size={13} /> },
  { key: 'competition', label: 'Competitive Gap', icon: <Building2 size={13} /> },
  { key: 'land_use', label: 'Zoning & Usage', icon: <MapPin size={13} /> },
  { key: 'environment', label: 'Hazard Risk', icon: <ShieldAlert size={13} /> },
];

const ComparisonModal: React.FC<ComparisonModalProps> = ({ isOpen, onClose }) => {
  const { pinnedSites, selectedComparisonIds } = useStore();

  if (!isOpen) return null;

  const selectedSites = pinnedSites.filter(s => selectedComparisonIds.includes(s.site_id));

  if (selectedSites.length === 0) return null;

  // Find max values for highlighting
  const maxValues: Record<string, number> = {};
  METRICS.forEach(metric => {
    let max = -1;
    selectedSites.forEach(site => {
      const val = metric.key === 'total_score' ? site.total_score : (site.layer_scores[metric.key] || 0);
      if (val > max) max = val;
    });
    maxValues[metric.key] = max;
  });

  // Recommendation logic: Highest total score
  const bestSite = [...selectedSites].sort((a, b) => b.total_score - a.total_score)[0];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-slate-50 to-white">
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <Trophy size={16} />
              </div>
              Site Comparison Analysis
            </h2>
            <p className="text-slate-400 text-xs font-medium mt-0.5">Comparing {selectedSites.length} high-potential locations</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
            <X size={18} />
          </button>
        </div>

        {/* Table/Scrollable Area */}
        <div className="flex-1 overflow-auto p-8">
          <table className="w-full border-separate border-spacing-x-4 border-spacing-y-0">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 w-64 text-left pb-6">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Comparison Factor</span>
                </th>
                {selectedSites.map(site => (
                  <th key={site.site_id} className="min-w-[200px] pb-6">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left relative overflow-hidden group hover:border-indigo-200 transition-all">
                      {site.site_id === bestSite.site_id && (
                        <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl shadow-sm">
                          RECOMMENDED
                        </div>
                      )}
                      <p className="text-sm font-bold text-slate-800 truncate mb-1 pr-16">{site.locationName || 'Location'}</p>
                      <p className="text-[10px] text-slate-400 font-mono mb-2">{site.lat.toFixed(4)}, {site.lon.toFixed(4)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-slate-900">{site.total_score}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Score</span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {METRICS.map((metric, idx) => (
                <tr key={metric.key} className="group transition-colors">
                  <td className="sticky left-0 bg-white z-10 py-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${idx === 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'} group-hover:scale-110 transition-transform`}>
                        {metric.icon}
                      </div>
                      <span className={`text-xs font-bold leading-none ${idx === 0 ? 'text-slate-800' : 'text-slate-600'}`}>{metric.label}</span>
                    </div>
                  </td>

                  {selectedSites.map(site => {
                    const value = metric.key === 'total_score' ? site.total_score : (site.layer_scores[metric.key] || 0);
                    const isMax = value === maxValues[metric.key];
                    const barColor = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-400' : 'bg-red-400';
                    const textColor = value >= 70 ? 'text-emerald-600' : value >= 40 ? 'text-amber-600' : 'text-red-500';
                    // Using accent color for progress bar

                    return (
                      <td key={site.site_id} className="py-5 align-top">
                        <div className={`p-4 rounded-2xl border transition-all ${isMax ? 'border-emerald-200 bg-emerald-50/20 ring-1 ring-emerald-100 shadow-sm' : 'border-transparent'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-lg font-black tabular-nums transition-all ${isMax ? 'text-emerald-700 scale-110' : textColor}`}>
                              {value.toFixed(0)}
                            </span>
                            {isMax && (
                              <div className="flex items-center gap-1 text-emerald-600 font-bold text-[9px] uppercase tracking-tighter">
                                <Zap size={10} fill="currentColor" /> Best
                              </div>
                            )}
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor} transition-all duration-1000`} style={{ width: `${value}%` }} />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Recommendation */}
        <div className="p-8 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 space-y-2">
            <h4 className="text-slate-400 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2">
              <ArrowRight size={12} /> AI-Powered Recommendation
            </h4>
            <p className="text-slate-700 text-sm leading-relaxed">
              Based on the combined weights of demographics, competition, and infrastructure, <span className="font-bold text-indigo-600">{bestSite.locationName || 'the first location'}</span> is the optimal choice. It offers a superior <span className="font-semibold text-emerald-600">Overall Score of {bestSite.total_score}</span> with the highest viability for your selected use-case.
            </p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button onClick={onClose} className="flex-1 md:flex-none px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button className="flex-1 md:flex-none px-8 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-500 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
              Select {bestSite.locationName?.split(',')[0]} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComparisonModal;
