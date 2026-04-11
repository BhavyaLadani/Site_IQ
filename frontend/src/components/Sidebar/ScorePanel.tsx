import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  AlertCircle, Plus, ChevronDown, ChevronUp, CheckCircle,
  MapPin, TrendingUp, Users, ShieldAlert, Zap, Download,
  Building2, Warehouse, BatteryCharging, Radio
} from 'lucide-react';

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400 border-green-500 bg-green-500/10',
  B: 'text-emerald-400 border-emerald-500 bg-emerald-500/10',
  C: 'text-amber-400 border-amber-500 bg-amber-500/10',
  D: 'text-orange-400 border-orange-500 bg-orange-500/10',
  F: 'text-red-400 border-red-500 bg-red-500/10',
  'N/A': 'text-slate-400 border-slate-600 bg-slate-800/50',
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
  const { activeSite, pinSite, pinnedSites } = useStore();
  const [showReasoning, setShowReasoning] = useState(false);

  if (!activeSite) {
    return (
      <div className="w-96 h-full flex flex-col items-center justify-center bg-slate-900 border-l border-slate-800 p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/20 flex items-center justify-center mb-5">
          <MapPin className="w-9 h-9 text-blue-400" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">Site Readiness Analyzer</h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          Click any location within the <span className="text-blue-400 font-semibold">Ahmedabad metro area</span> to run AI-powered site readiness evaluation.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 w-full">
          {Object.entries(USE_CASE_SUITABILITY).map(([key, uc]) => (
            <div key={key} className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 rounded-lg text-xs text-slate-400">
              {uc.icon} {uc.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { total_score, layer_scores, warnings, grade, recommendation, reasoning } = activeSite;
  const isPinned = pinnedSites.some(s => s.site_id === activeSite.site_id);

  const getBarColor = (s: number) => s > 70 ? 'bg-green-500' : s >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const getTextColor = (s: number) => s > 70 ? 'text-green-400' : s >= 40 ? 'text-amber-400' : 'text-red-400';
  const getSuitLabel = (s: number) => s > 70 ? 'Highly Suitable' : s >= 40 ? 'Moderately Suitable' : 'Not Suitable';

  // SVG circular dial
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (total_score / 100) * circ;
  const dialColor = total_score > 70 ? '#22c55e' : total_score >= 40 ? '#f59e0b' : '#ef4444';

  const handleExport = async () => {
    try {
      const resp = await fetch(`http://localhost:8000/export/${activeSite.site_id}?lat=${activeSite.lat}&lon=${activeSite.lon}`);
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
    <div className="w-96 flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-100 overflow-y-auto">

      {/* Section 1: Location Details */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={14} className="text-blue-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</span>
            </div>
            {activeSite.locationName && (
              <p className="text-sm font-bold text-white truncate mb-0.5">{activeSite.locationName}</p>
            )}
            <p className="text-[11px] text-slate-500 font-mono">
              {activeSite.lat.toFixed(5)}, {activeSite.lon.toFixed(5)}
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0 ml-2">
            <button onClick={handleExport} title="Download PDF Report"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
              <Download size={15} />
            </button>
            <button onClick={() => pinSite(activeSite)} disabled={isPinned} title={isPinned ? 'Pinned' : 'Pin for comparison'}
              className={`p-2 rounded-lg transition-all ${isPinned ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}`}>
              {isPinned ? <CheckCircle size={15} /> : <Plus size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 2: Suitability Score Card ──────── */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <svg className="-rotate-90 w-24 h-24" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} stroke="#1e293b" strokeWidth="7" fill="none" />
              <circle cx="50" cy="50" r={radius}
                stroke={dialColor} strokeWidth="7" fill="none"
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black leading-none">{total_score}</span>
              <span className="text-[9px] text-slate-500 font-semibold">/ 100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {grade && (
              <div className={`inline-flex items-center border rounded-lg px-3 py-1 mb-1.5 ${GRADE_COLOR[grade] || GRADE_COLOR['N/A']}`}>
                <span className="text-xl font-black mr-1.5">{grade}</span>
                <span className="text-[10px] font-semibold uppercase">Grade</span>
              </div>
            )}
            <p className="text-xs font-bold" style={{ color: dialColor }}>{getSuitLabel(total_score)}</p>
            {recommendation && (
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1 line-clamp-2">{recommendation}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Hard Constraint Warnings ───── */}
      {warnings && warnings.length > 0 && (
        <div className="mx-3 mt-3 p-3 bg-red-950/40 border border-red-900/50 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-xs mb-1.5">
            <AlertCircle size={13} /> Constraint Violations
          </div>
          <ul className="space-y-1">
            {warnings.map((w, i) => <li key={i} className="text-[11px] text-red-300/80 leading-tight">- {w}</li>)}
          </ul>
        </div>
      )}

      {/* ── Section 4: Layer-by-Layer Analysis ────── */}
      <div className="p-4 space-y-3 flex-1">
        {Object.entries(layer_scores || {}).map(([key, score]) => {
          const meta = LAYER_META[key] || { icon: <Zap size={14} />, section: key, desc: '' };
          return (
            <div key={key} className="p-3 bg-slate-800/40 rounded-lg border border-slate-800/60">
              <div className="flex items-center gap-2 mb-1">
                <span className={`${getTextColor(score)}`}>{meta.icon}</span>
                <span className="text-xs font-bold text-slate-200">{meta.section}</span>
                <span className={`ml-auto text-sm font-black tabular-nums ${getTextColor(score)}`}>{score.toFixed(0)}</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2">{meta.desc}</p>
              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${getBarColor(score)} transition-all duration-1000`}
                  style={{ width: `${Math.max(score, 2)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section 5: Use-Case Suitability Grid ──── */}
      <div className="px-4 pb-3">
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Use-Case Suitability</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(USE_CASE_SUITABILITY).map(([key, uc]) => {
            const keyScores = uc.keyLayers.map(l => layer_scores?.[l] ?? 0);
            const avg = keyScores.length > 0 ? keyScores.reduce((a, b) => a + b, 0) / keyScores.length : 0;
            const color = avg > 60 ? 'border-green-600/40 bg-green-950/20' : avg >= 35 ? 'border-amber-600/40 bg-amber-950/20' : 'border-red-600/40 bg-red-950/20';
            const txt = avg > 60 ? 'text-green-400' : avg >= 35 ? 'text-amber-400' : 'text-red-400';
            return (
              <div key={key} className={`flex items-center gap-2 p-2.5 rounded-lg border ${color} transition-all`}>
                <span className={txt}>{uc.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-200 truncate">{uc.label}</p>
                  <p className={`text-[10px] font-bold ${txt}`}>{avg.toFixed(0)}/100</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 6: AI Reasoning Trace ──────────── */}
      {reasoning && reasoning.length > 0 && (
        <div className="mx-3 mb-3 border border-slate-800 rounded-lg overflow-hidden">
          <button onClick={() => setShowReasoning(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-400 hover:bg-slate-800/60 transition-colors">
            <span className="font-semibold">AI Reasoning Trace ({reasoning.length} steps)</span>
            {showReasoning ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showReasoning && (
            <div className="max-h-44 overflow-y-auto px-3 py-2 bg-slate-950 font-mono text-[10px] text-slate-400 space-y-0.5 leading-relaxed">
              {reasoning.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScorePanel;
