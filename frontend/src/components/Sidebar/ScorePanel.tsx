import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { API_BASE_URL } from '../../api/apiConfig';
import {
  AlertCircle, Plus, ChevronDown, ChevronUp, CheckCircle,
  MapPin, TrendingUp, Users, ShieldAlert, Zap, Download,
  Building2, Warehouse, BatteryCharging, Radio
} from 'lucide-react';

const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-600 border-emerald-300 bg-emerald-50',
  B: 'text-green-600 border-green-300 bg-green-50',
  C: 'text-amber-600 border-amber-300 bg-amber-50',
  D: 'text-orange-600 border-orange-300 bg-orange-50',
  F: 'text-red-600 border-red-300 bg-red-50',
  'N/A': 'text-slate-500 border-slate-300 bg-slate-50',
};

const LAYER_META: Record<string, { icon: React.ReactNode; section: string; desc: string }> = {
  demographics:   { icon: <Users size={14} />, section: 'Population Insights', desc: 'Population density, income, age distribution' },
  transportation: { icon: <TrendingUp size={14} />, section: 'Accessibility Score', desc: 'Road network, highway proximity, transit' },
  competition:    { icon: <Building2 size={14} />, section: 'Market Density', desc: 'Competitor proximity, market viability' },
  land_use:       { icon: <MapPin size={14} />, section: 'Land Use & Zoning', desc: 'Commercial viability, zoning classification' },
  environment:    { icon: <ShieldAlert size={14} />, section: 'Risk Analysis', desc: 'Flood risk, earthquake risk, air quality' },
};

const USE_CASE_SUITABILITY: Record<string, { icon: React.ReactNode; label: string; keyLayers: string[] }> = {
  retail:       { icon: <Building2 size={16} />, label: 'Retail Store', keyLayers: ['demographics', 'competition', 'transportation'] },
  warehouse:    { icon: <Warehouse size={16} />, label: 'Warehouse', keyLayers: ['transportation', 'land_use', 'environment'] },
  ev_charging:  { icon: <BatteryCharging size={16} />, label: 'EV Charging', keyLayers: ['transportation', 'demographics', 'land_use'] },
  telecom:      { icon: <Radio size={16} />, label: 'Telecom Tower', keyLayers: ['environment', 'land_use', 'demographics'] },
};

const ScorePanel: React.FC = () => {
  const { activeSite, setActiveSite, pinSite, pinnedSites, suggestedSites, isSuggesting } = useStore();
  const [showReasoning, setShowReasoning] = useState(false);

  if (!activeSite) {
    return (
      <div className="w-96 h-full flex flex-col items-center justify-center bg-white border-l border-slate-200 p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center mb-5">
          <MapPin className="w-9 h-9 text-indigo-500" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-2">Site Readiness Analyzer</h3>
        <p className="text-slate-500 text-sm leading-relaxed">
          Click any location within the <span className="text-indigo-600 font-semibold">Ahmedabad metro area</span> to run AI-powered site readiness evaluation.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 w-full">
          {Object.entries(USE_CASE_SUITABILITY).map(([key, uc]) => (
            <div key={key} className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 font-medium">
              <span className="text-slate-400">{uc.icon}</span> {uc.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { total_score, layer_scores, warnings, grade, recommendation, reasoning } = activeSite;
  const isPinned = pinnedSites.some(s => s.site_id === activeSite.site_id);

  const getBarColor = (s: number) => s > 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-400' : 'bg-red-400';
  const getTextColor = (s: number) => s > 70 ? 'text-emerald-600' : s >= 40 ? 'text-amber-600' : 'text-red-500';
  const getBgAccent = (s: number) => s > 70 ? 'bg-emerald-50' : s >= 40 ? 'bg-amber-50' : 'bg-red-50';
  const getSuitLabel = (s: number) => s > 70 ? 'Highly Suitable' : s >= 40 ? 'Moderately Suitable' : 'Not Suitable';

  // SVG circular dial
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (total_score / 100) * circ;
  const dialColor = total_score > 70 ? '#10b981' : total_score >= 40 ? '#f59e0b' : '#ef4444';

  const handleExport = async () => {
    try {
      const locName = encodeURIComponent(activeSite.locationName || 'Ahmedabad Metro');
      const resp = await fetch(`${API_BASE_URL}/export/${activeSite.site_id}?lat=${activeSite.lat}&lon=${activeSite.lon}&location_name=${locName}&_t=${Date.now()}`);
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `site_report_${activeSite.site_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('PDF export failed. Ensure the backend is running.');
    }
  };

  return (
    <div className="w-96 flex flex-col h-full bg-white border-l border-slate-200 text-slate-800 overflow-y-auto">

      {/* Section 1: Location Details */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                <MapPin size={13} className="text-indigo-500" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Location</span>
            </div>
            {activeSite.locationName && (
              <p className="text-sm font-bold text-slate-800 truncate mb-0.5">{activeSite.locationName}</p>
            )}
            <p className="text-[11px] text-slate-400 font-mono">
              {activeSite.lat.toFixed(5)}, {activeSite.lon.toFixed(5)}
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0 ml-2">
            <button onClick={handleExport} title="Download PDF Report"
              className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-500 transition-all">
              <Download size={15} />
            </button>
            <button onClick={() => pinSite(activeSite)} disabled={isPinned} 
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-semibold text-xs ${
                isPinned 
                ? 'bg-slate-50 border border-slate-200 text-slate-400 cursor-default' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-100'
              }`}>
              {isPinned ? (
                <>
                  <CheckCircle size={14} className="text-emerald-500" />
                  <span>Pinned for Compare</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Add to Compare</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 2: Suitability Score Card ──────── */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <svg className="-rotate-90 w-24 h-24" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} stroke="#f1f5f9" strokeWidth="7" fill="none" />
              <circle cx="50" cy="50" r={radius}
                stroke={dialColor} strokeWidth="7" fill="none"
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-slate-800 leading-none">{total_score}</span>
              <span className="text-[9px] text-slate-400 font-semibold">/ 100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {grade && (
              <div className={`inline-flex items-center border rounded-xl px-3 py-1 mb-2 ${GRADE_COLOR[grade] || GRADE_COLOR['N/A']}`}>
                <span className="text-xl font-black mr-1.5">{grade}</span>
                <span className="text-[10px] font-semibold uppercase">Grade</span>
              </div>
            )}
            <p className="text-xs font-bold" style={{ color: dialColor }}>{getSuitLabel(total_score)}</p>
            {recommendation && (
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1 line-clamp-2">{recommendation}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2.5: Smart Suggestions ───── */}
      {(isSuggesting || (suggestedSites && suggestedSites.length > 0)) && (
        <div className="p-4 border-b border-slate-100 bg-emerald-50/20">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs mb-3">
            <Zap size={14} className="text-emerald-500" /> Suggestions from our system
          </div>
          
          {isSuggesting && (
             <div className="flex items-center justify-center py-4 text-[11px] text-slate-500 font-medium bg-white rounded-xl border border-slate-100">
               <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mr-2" />
               Scanning 2km radius for better locations...
             </div>
          )}
          
          {!isSuggesting && suggestedSites && suggestedSites.length > 0 && (
            <div className="space-y-2">
              {suggestedSites.map((site, idx) => {
                const isSelected = activeSite?.lat === site.lat && activeSite?.lon === site.lon;
                return (
                 <div key={idx} 
                     onClick={() => setActiveSite(site as any)}
                     className={`group relative p-3 bg-white border ${isSelected ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500' : 'border-emerald-100 hover:border-emerald-300'} rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md`}>
                  {idx === 0 && (
                     <div className="absolute -top-2.5 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                       BEST CHOICE
                     </div>
                  )}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-700">Recommended Site #{idx + 1}</span>
                    <span className="text-sm font-black text-emerald-600">{site.total_score}/100</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                       <MapPin size={10} className="text-slate-400" /> {site.distance_km ? `${site.distance_km} km away` : 'Nearby'}
                    </span>
                    <span className={`text-emerald-500 ${isSelected ? 'opacity-100 font-bold' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                      {isSelected ? 'Viewing' : 'View Details →'}
                    </span>
                  </div>
                 </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: Hard Constraint Warnings ───── */}
      {warnings && warnings.length > 0 && (
        <div className="mx-4 mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-600 font-semibold text-xs mb-1.5">
            <AlertCircle size={13} /> Constraint Violations
          </div>
          <ul className="space-y-1">
            {warnings.map((w, i) => <li key={i} className="text-[11px] text-red-500 leading-tight">— {w}</li>)}
          </ul>
        </div>
      )}

      {/* ── Section 4: Layer-by-Layer Analysis ────── */}
      <div className="p-4 space-y-2.5 flex-1">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Layer Analysis</h3>
        {Object.entries(layer_scores || {}).map(([key, score]) => {
          const meta = LAYER_META[key] || { icon: <Zap size={14} />, section: key, desc: '' };
          return (
            <div key={key} className={`p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-all ${getBgAccent(score)}/30`}
              style={{ background: `linear-gradient(135deg, ${score > 70 ? 'rgba(16,185,129,0.03)' : score >= 40 ? 'rgba(245,158,11,0.03)' : 'rgba(239,68,68,0.03)'}, transparent)` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className={getTextColor(score)}>{meta.icon}</span>
                <span className="text-xs font-bold text-slate-700">{meta.section}</span>
                <span className={`ml-auto text-sm font-black tabular-nums ${getTextColor(score)}`}>{score.toFixed(0)}</span>
              </div>
              <p className="text-[10px] text-slate-400 mb-2">{meta.desc}</p>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${getBarColor(score)} transition-all duration-1000`}
                  style={{ width: `${Math.max(score, 2)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section 5: Use-Case Suitability Grid ──── */}
      <div className="px-4 pb-3">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Use-Case Suitability</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(USE_CASE_SUITABILITY).map(([key, uc]) => {
            const keyScores = uc.keyLayers.map(l => layer_scores?.[l] ?? 0);
            const avg = keyScores.length > 0 ? keyScores.reduce((a, b) => a + b, 0) / keyScores.length : 0;
            const color = avg > 60
              ? 'border-emerald-200 bg-emerald-50/60'
              : avg >= 35
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-red-200 bg-red-50/60';
            const txt = avg > 60 ? 'text-emerald-600' : avg >= 35 ? 'text-amber-600' : 'text-red-500';
            return (
              <div key={key} className={`flex items-center gap-2 p-3 rounded-xl border ${color} transition-all hover:shadow-sm`}>
                <span className={txt}>{uc.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-700 truncate">{uc.label}</p>
                  <p className={`text-[10px] font-bold ${txt}`}>{avg.toFixed(0)}/100</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 6: AI Reasoning Trace ──────────── */}
      {reasoning && reasoning.length > 0 && (
        <div className="mx-4 mb-4 border border-slate-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowReasoning(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors">
            <span className="font-semibold">AI Reasoning Trace ({reasoning.length} steps)</span>
            {showReasoning ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showReasoning && (
            <div className="max-h-44 overflow-y-auto px-4 py-3 bg-slate-50 font-mono text-[10px] text-slate-500 space-y-0.5 leading-relaxed border-t border-slate-100">
              {reasoning.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScorePanel;
