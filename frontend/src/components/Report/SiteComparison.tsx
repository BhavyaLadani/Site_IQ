import React from 'react';
import { useStore } from '../../store/useStore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Download, X } from 'lucide-react';

const SiteComparison: React.FC = () => {
  const { pinnedSites, unpinSite } = useStore();

  if (pinnedSites.length === 0) return null;

  // Format data for Recharts Radar
  // Recharts expects array of objects: [{ subject: 'Demographics', SiteA: 80, SiteB: 60 }, ...]
  const formatRadarData = () => {
    const metrics = ['demographics', 'transport', 'poi', 'land_use', 'environment'];
    return metrics.map(metric => {
      const dataPoint: any = { subject: metric.replace('_', ' ').toUpperCase() };
      pinnedSites.forEach(site => {
        dataPoint[site.site_id] = site.layer_scores[metric] || 0;
      });
      return dataPoint;
    });
  };

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
  const chartData = formatRadarData();

  const handleExport = async (siteId: string) => {
    try {
      const resp = await fetch(`http://localhost:8000/export/${siteId}`);
      if (!resp.ok) throw new Error("Failed to export PDF");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${siteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Export failed. Ensure backend API is active.");
    }
  };

  return (
    <div className="absolute bottom-0 left-72 right-80 bg-slate-900 border-t border-slate-800 text-slate-100 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10 transition-all duration-300 h-64 flex">
      
      {/* Pinned Site Cards */}
      <div className="flex-1 flex gap-4 overflow-x-auto pr-4">
        {pinnedSites.map((site, idx) => (
          <div key={site.site_id} className="min-w-48 bg-slate-800 rounded-lg p-3 border-l-4 relative" style={{ borderColor: colors[idx] }}>
            <button 
              onClick={() => unpinSite(site.site_id)}
              className="absolute top-2 right-2 text-slate-500 hover:text-red-400"
            >
              <X size={14} />
            </button>
            <h4 className="text-xs font-bold font-mono text-slate-300 overflow-hidden text-ellipsis whitespace-nowrap pr-4">
              {site.site_id}
            </h4>
            <div className="text-3xl font-black mt-2 mb-3" style={{ color: colors[idx] }}>
              {site.total_score}
            </div>
            
            <button
              onClick={() => handleExport(site.site_id)}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded transition-colors"
            >
              <Download size={12} /> Export PDF
            </button>
          </div>
        ))}
      </div>

      {/* Radar Chart */}
      <div className="w-96 flex-shrink-0 h-full border-l border-slate-800 pl-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            {pinnedSites.map((site, idx) => (
              <Radar
                key={site.site_id}
                name={site.site_id.substring(0, 8)}
                dataKey={site.site_id}
                stroke={colors[idx]}
                fill={colors[idx]}
                fillOpacity={0.3}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

export default SiteComparison;
