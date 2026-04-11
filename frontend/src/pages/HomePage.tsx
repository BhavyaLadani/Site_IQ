import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Zap, Shield, BarChart3, Building2, BatteryCharging, Radio, Warehouse } from 'lucide-react';

const HomePage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Hero */}
      <section className="relative px-6 py-20 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-transparent" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-semibold mb-6">
            <Zap size={12} /> AI-Powered Location Intelligence
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-4">
            Find the <span className="text-blue-400">Perfect Location</span> for Your Business
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl mx-auto">
            Analyze any location in seconds. Get AI-powered insights on demographics, accessibility, competition, and risk factors for retail stores, warehouses, EV stations & more.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/analysis"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm">
              Start Analysis →
            </Link>
            <Link to="/signup"
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl border border-slate-700 transition-all text-sm">
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center mb-10">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <MapPin size={20} />, title: 'Click Any Location', desc: 'Click anywhere on the map to instantly analyze that exact coordinate.' },
            { icon: <BarChart3 size={20} />, title: 'AI Scoring Engine', desc: '5-layer geospatial analysis: demographics, transport, competition, zoning, and environment risk.' },
            { icon: <Shield size={20} />, title: 'Actionable Insights', desc: 'Get grades, recommendations, and use-case suitability for retail, warehouse, EV, and telecom.' },
          ].map((f, i) => (
            <div key={i} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl hover:border-blue-500/30 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4">{f.icon}</div>
              <h3 className="text-white font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="px-6 py-16 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-10">Analyze for Any Use Case</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: <Building2 size={22} />, label: 'Retail Store', color: 'text-green-400 bg-green-500/10' },
              { icon: <Warehouse size={22} />, label: 'Warehouse', color: 'text-amber-400 bg-amber-500/10' },
              { icon: <BatteryCharging size={22} />, label: 'EV Charging', color: 'text-blue-400 bg-blue-500/10' },
              { icon: <Radio size={22} />, label: 'Telecom Tower', color: 'text-purple-400 bg-purple-500/10' },
            ].map((uc, i) => (
              <div key={i} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl text-center hover:scale-105 transition-transform">
                <div className={`w-12 h-12 mx-auto rounded-xl ${uc.color} flex items-center justify-center mb-3`}>{uc.icon}</div>
                <p className="text-white font-semibold text-sm">{uc.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 text-center">
        <div className="max-w-lg mx-auto p-8 bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-2xl">
          <h2 className="text-xl font-bold text-white mb-3">Ready to Find Your Next Location?</h2>
          <p className="text-sm text-slate-400 mb-6">Sign up for free and start analyzing locations in Ahmedabad, Gujarat.</p>
          <Link to="/analysis"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm">
            Launch Map Analysis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-slate-800 text-center text-xs text-slate-500">
        &copy; 2026 SiteIQ &mdash; Site Readiness Analyzer. Built for Ahmedabad, Gujarat.
      </footer>
    </div>
  );
};

export default HomePage;
