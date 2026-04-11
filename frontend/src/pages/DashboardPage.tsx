import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { History, MapPin, Download, TrendingUp } from 'lucide-react';

interface HistoryItem {
  id: number;
  lat: number;
  lon: number;
  location_name: string;
  composite_score: number;
  grade: string;
  use_case: string;
  created_at: string;
}

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400 bg-green-500/10 border-green-500/30',
  B: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  C: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  F: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const DashboardPage: React.FC = () => {
  const { user, token } = useAuth();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch('http://localhost:8000/history', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(d => setHistory(d.history || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [token]);

  const avgScore = history.length > 0
    ? Math.round(history.reduce((sum, h) => sum + h.composite_score, 0) / history.length)
    : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-sm text-slate-400">Welcome back, {user?.name}. Here's your analysis history.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <History size={18} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{history.length}</p>
                <p className="text-xs text-slate-400">Total Analyses</p>
              </div>
            </div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{avgScore}</p>
                <p className="text-xs text-slate-400">Average Score</p>
              </div>
            </div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {history.filter(h => h.grade === 'A' || h.grade === 'B').length}
                </p>
                <p className="text-xs text-slate-400">Top Rated Sites</p>
              </div>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <History size={14} /> Analysis History
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No analyses yet. Go to Map Analysis and click a location!</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {history.map(h => (
                <div key={h.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-800/40 transition-colors">
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center font-black text-sm ${GRADE_COLOR[h.grade] || 'text-slate-400 bg-slate-800'}`}>
                    {h.grade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{h.location_name || `${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}`}</p>
                    <p className="text-xs text-slate-500">{h.use_case} &middot; Score: {h.composite_score}/100</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {new Date(h.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
