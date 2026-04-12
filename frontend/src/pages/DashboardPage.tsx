import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/useStore';
import { API_BASE_URL } from '../api/apiConfig';
import { 
  History,
  MapPin, 
  TrendingUp, 
  Calendar, 
  LayoutDashboard,
  Clock,
  Award,
  ArrowUpRight,
  ExternalLink,
  Target
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';

interface HistoryItem {
  id: number;
  lat: number;
  lon: number;
  location_name: string;
  composite_score: number;
  grade: string;
  use_case: string;
  created_at: string;
  layer_scores: Record<string, number>;
  recommendation: string;
}

const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  B: 'text-green-500 bg-green-500/10 border-green-500/20',
  C: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  D: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  F: 'text-red-500 bg-red-500/10 border-red-500/20',
};

const LocationDisplay: React.FC<{ lat: number, lon: number, initialName: string }> = ({ lat, lon, initialName }) => {
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isValid = initialName && initialName.trim() !== '' && initialName !== 'Unknown' && !initialName.match(/^-?[0-9.]+,\s*-?[0-9.]+$/);
    if (isValid) {
      setName(initialName);
      return;
    }
    
    setLoading(true);
    fetch(`${API_BASE_URL}/reverse_geocode?lat=${lat}&lon=${lon}`)
      .then(r => r.json())
      .then(d => {
        setName(d.display_name || 'Generic Site Location');
      })
      .catch(() => setName('Generic Site Location'))
      .finally(() => setLoading(false));
  }, [lat, lon, initialName]);

  return (
    <>
      <p className="text-[13px] font-bold text-slate-800 truncate mb-0.5 tracking-tight group-hover:text-indigo-600 group/loc-hover:text-indigo-600 transition-colors">
        Location: {loading ? <span className="animate-pulse text-indigo-400">Resolving...</span> : name}
      </p>
      <p className="text-[11px] text-slate-500 font-medium mb-1.5 flex items-center gap-1.5">
        Coordinates: {lat.toFixed(4)}, {lon.toFixed(4)}
      </p>
    </>
  );
};

const DashboardPage: React.FC = () => {
  const { user, token } = useAuth();
  const { setActiveSite, setMapCenter, setMapZoom, setSearchCenter } = useStore();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Fixed API port to 8001 as per start.bat
      fetch(`${API_BASE_URL}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(d => setHistory(d.history || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [token]);

  const stats = useMemo(() => {
    if (history.length === 0) return { avg: 0, top: 0, growth: 0 };
    const avg = Math.round(history.reduce((sum, h) => sum + h.composite_score, 0) / history.length);
    const top = history.filter(h => h.grade === 'A' || h.grade === 'B').length;
    // Growth calculation (simplified: increase in avg score compared to first half)
    const mid = Math.ceil(history.length / 2);
    const recentAvg = history.slice(0, mid).reduce((s, h) => s + h.composite_score, 0) / mid;
    const oldAvg = history.slice(mid).reduce((s, h) => s + h.composite_score, 0) / (history.length - mid) || recentAvg;
    const growth = oldAvg === 0 ? 0 : Math.round(((recentAvg - oldAvg) / oldAvg) * 100);
    return { avg, top, growth };
  }, [history]);

  const chartData = useMemo(() => {
    return [...history].reverse().map(h => ({
      name: new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      score: h.composite_score,
    }));
  }, [history]);

  const handleViewOnMap = (item: HistoryItem) => {
    if (!item.lat || !item.lon || isNaN(item.lat) || isNaN(item.lon)) {
      console.error('Invalid location data for history item:', item);
      return;
    }

    // Normalize layer_scores: backend may return nested {raw, weight, weighted} objects
    // ScorePanel and MapView expect flat {key: number} format
    const flatLayerScores: Record<string, number> = {};
    if (item.layer_scores && typeof item.layer_scores === 'object') {
      for (const [key, val] of Object.entries(item.layer_scores)) {
        if (typeof val === 'number') {
          flatLayerScores[key] = val;
        } else if (val && typeof val === 'object' && 'raw' in val) {
          flatLayerScores[key] = (val as any).raw ?? 0;
        } else {
          flatLayerScores[key] = 0;
        }
      }
    }

    setActiveSite({
      site_id: `hist_${item.id}`,
      lat: item.lat,
      lon: item.lon,
      total_score: item.composite_score ?? 0,
      grade: item.grade ?? 'N/A',
      locationName: item.location_name ?? '',
      layer_scores: flatLayerScores,
      recommendation: item.recommendation ?? '',
      warnings: [],
      reasoning: []
    });
    setSearchCenter({ lat: item.lat, lon: item.lon });
    setMapCenter(item.lat, item.lon);
    setMapZoom(15);
    navigate('/analysis');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8fafc] px-6 py-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Immersive Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <LayoutDashboard size={20} />
              </div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">Your Dashboard</h1>
            </div>
            <p className="text-[13px] text-slate-500 font-medium">
              Intelligence hub for <span className="text-indigo-600 font-bold">{user?.name}</span>. Track your high-potential site evaluations.
            </p>
          </div>
          
          <div className="flex items-center gap-4 text-xs font-bold text-slate-400 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-indigo-400" />
              <span>Joined {user ? new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '...'}</span>
            </div>
          </div>
        </div>

        {/* Hero Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="relative group overflow-hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300">
             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
             <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <History size={18} />
                  </div>
                  <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Lifetime</span>
                </div>
                <p className="text-2xl font-black text-slate-800 mb-0.5">{history.length}</p>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Total Evaluations</p>
             </div>
          </div>

          <div className="relative group overflow-hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300">
             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
             <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Target size={18} />
                  </div>
                  <div className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${stats.growth >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
                    {stats.growth >= 0 ? '+' : ''}{stats.growth}% Growth
                  </div>
                </div>
                <p className="text-2xl font-black text-slate-800 mb-0.5">{stats.avg}</p>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Median Site Score</p>
             </div>
          </div>

          <div className="relative group overflow-hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300">
             <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
             <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <Award size={18} />
                  </div>
                  <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Premium</span>
                </div>
                <p className="text-2xl font-black text-slate-800 mb-0.5">{stats.top}</p>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Grade A/B Locations</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Analytics Chart */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white border border-slate-200 rounded-[1.5rem] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-sm font-black text-slate-800 tracking-tight uppercase tracking-wider">Score Progression</h2>
                  <p className="text-[10px] text-slate-400 font-medium">Historical performance trend</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    <span className="text-slate-500">Composite Score</span>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
                        padding: '12px'
                      }}
                      itemStyle={{ fontWeight: '800', fontSize: '12px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#6366f1" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#scoreGradient)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent History Table Style Upgrade */}
            <div className="bg-white border border-slate-200 rounded-[1.5rem] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase tracking-wide">
                  <Clock size={16} className="text-indigo-600" /> Detailed History
                </h2>
                <button className="text-[9px] font-black text-indigo-600 hover:text-indigo-500 uppercase tracking-widest transition-colors">
                  View All
                </button>
              </div>

              {loading ? (
                <div className="p-16 flex flex-col items-center justify-center gap-4 text-slate-400">
                   <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin" />
                   <p className="text-sm font-bold">Synchronizing global intelligence...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mx-auto mb-4">
                    <History size={24} />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">Your analysis history is empty. Start exploring the map!</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {history.map((h) => (
                    <div key={h.id} className="px-6 py-3 flex items-center gap-4 group hover:bg-slate-50/50 transition-all cursor-default">
                      <div 
                        onClick={() => handleViewOnMap(h)}
                        title="View on Map"
                        className={`w-10 h-10 rounded-xl border flex flex-col items-center justify-center font-black transition-all cursor-pointer group-hover:scale-105 active:scale-95 ${GRADE_COLOR[h.grade] || 'text-slate-400 bg-slate-50'}`}
                      >
                        <span className="text-sm">{h.grade}</span>
                      </div>
                      <div 
                        className="flex-1 min-w-0 cursor-pointer group/loc"
                        onClick={() => handleViewOnMap(h)}
                      >
                        <LocationDisplay lat={h.lat} lon={h.lon} initialName={h.location_name} />
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                            <Target size={10} /> {h.use_case}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                            <TrendingUp size={10} /> {h.composite_score} Pts
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                        <button 
                          onClick={() => handleViewOnMap(h)}
                          title="View on Map"
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >
                          <MapPin size={16} />
                        </button>
                        <button 
                          title="Detailed Report"
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 shadow-sm"
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Profile & Tips */}
          <div className="space-y-8">
            {/* Profile Card */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[1.5rem] p-6 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <User size={24} className="text-indigo-300" />
                </div>
                <h3 className="text-lg font-black mb-0.5 tracking-tight">{user?.name}</h3>
                <p className="text-indigo-300 text-[11px] font-bold mb-4">{user?.email}</p>
                
                <div className="space-y-4 pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Total Analyses</span>
                    <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-500/30">{history.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Top Locations</span>
                    <span className="font-bold">{stats.top} sites</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Insights Card */}
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                 <Target size={16} className="text-indigo-600" /> Analysis Tips
               </h3>
               <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs">1</div>
                    <p className="text-xs text-slate-500 leading-relaxed pt-1">
                      <span className="font-bold text-slate-700 italic">"Retail focus"</span> locations benefit most from high transport scores.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex-shrink-0 flex items-center justify-center text-emerald-600 font-bold text-xs">2</div>
                    <p className="text-xs text-slate-500 leading-relaxed pt-1">
                       Sites with <span className="font-bold text-emerald-600">Grade B</span> might be better if competition is low.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-xl bg- amber-50 flex-shrink-0 flex items-center justify-center text-amber-600 font-bold text-xs">3</div>
                    <p className="text-xs text-slate-500 leading-relaxed pt-1">
                       Use the <span className="font-bold text-slate-700">Compare Tool</span> to check infrastructure gaps.
                    </p>
                  </div>
               </div>
               <button onClick={() => navigate('/analysis')} className="w-full mt-8 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center gap-2 uppercase tracking-widest">
                 Start New Analysis <ArrowUpRight size={14} />
               </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

// Mock User Icon if not available
const User = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default DashboardPage;
