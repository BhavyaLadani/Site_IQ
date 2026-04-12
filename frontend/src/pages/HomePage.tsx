import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Zap, Shield, BarChart3, Building2, BatteryCharging,
  Radio, Warehouse, ArrowRight, CheckCircle, Globe, Brain,
  TrendingUp, Star, Target, Activity, Layers, ChevronRight
} from 'lucide-react';
import { useStats } from '../api/queries';
import Footer from '../components/Footer';

const StatCard: React.FC<{ value: string; label: string; icon: React.ReactNode; loading?: boolean }> = ({ value, label, icon, loading }) => (
  <div className="flex flex-col items-center gap-1.5 px-6 py-8 bg-white border border-slate-200 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.1)] hover:-translate-y-1 transition-all duration-500">
    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3 transition-transform duration-500 hover:scale-110">
      {icon}
    </div>
    {loading ? (
      <div className="w-16 h-8 bg-slate-100 rounded-lg animate-pulse" />
    ) : (
      <div className="text-3xl font-black text-slate-800 tracking-tight">{value}</div>
    )}
    <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{label}</div>
  </div>
);

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; delay: string }> = ({ icon, title, desc, delay }) => (
  <div className="group bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-2 transition-all duration-500 animate-fade-up" style={{ animationDelay: delay }}>
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-inner">
      {icon}
    </div>
    <h3 className="text-slate-800 font-extrabold text-xl mb-3 tracking-tight group-hover:text-indigo-600 transition-colors">{title}</h3>
    <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
  </div>
);

const UseCaseCard: React.FC<{ icon: React.ReactNode; label: string; desc: string; delay: string }> = ({ icon, label, desc, delay }) => (
  <div className="group p-8 bg-gradient-to-b from-white to-slate-50/50 rounded-[2rem] border border-slate-200 shadow-sm text-center hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-500 cursor-pointer animate-fade-up" style={{ animationDelay: delay }}>
    <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mx-auto mb-6 text-indigo-600 group-hover:scale-110 group-hover:bg-indigo-50 transition-all duration-500">
      {icon}
    </div>
    <p className="text-slate-800 font-extrabold text-lg mb-2">{label}</p>
    <p className="text-slate-500 text-sm leading-relaxed px-2">{desc}</p>
  </div>
);

const HomePage: React.FC = () => {
  const { data: stats, isLoading: statsLoading } = useStats();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 font-sans">

      {/* ── HERO SECTION ── */}
      <section className="relative bg-white pt-24 pb-16 md:pt-36 md:pb-28 overflow-hidden">
        {/* Subtle animated background shapes */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[600px] bg-gradient-to-br from-indigo-50 to-blue-50 rounded-full blur-3xl opacity-60 animate-pulse-ring" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[500px] h-[500px] bg-gradient-to-tr from-purple-50 to-indigo-50 rounded-full blur-3xl opacity-60 animate-pulse-ring" style={{ animationDelay: '1s' }} />
        
        <div className="relative max-w-6xl mx-auto px-6 text-center animate-fade-up">
          <div className="inline-flex items-center gap-2 px-5 py-2 hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-full mb-8 shadow-sm transition-colors cursor-default">
            <span className="flex items-center justify-center w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Geospatial Intelligence · {stats?.coverage_area || 'Ahmedabad Metro'}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-slate-800 leading-[1.1] tracking-tight mb-8">
            Decide where to build.<br />
            <span className="text-indigo-600 inline-block mt-2">Instantly.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-500 leading-relaxed mb-12 max-w-3xl mx-auto font-medium">
            Transform complex multi-layer geographic data into clear, actionable site readiness metrics. Whether you're planning retail outposts, logistics hubs, or critical infrastructure.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-14">
            <Link to="/analysis"
              className="group w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all duration-300 hover:-translate-y-1 flex items-center justify-center gap-2 text-md"
            >
              Open Intelligence Map <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/about"
              className="group w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl border-2 border-slate-200 transition-all duration-300 flex items-center justify-center gap-2 text-md"
            >
              Learn about our engine <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 text-slate-500 text-sm font-bold">
            <span className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl"><CheckCircle size={16} className="text-emerald-500" /> API Access Included</span>
            <span className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl"><CheckCircle size={16} className="text-emerald-500" /> Instant PDF Reports</span>
            <span className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl"><CheckCircle size={16} className="text-emerald-500" /> Commercial Zoning Data</span>
          </div>
        </div>
      </section>

      {/* ── STATS SECTION ── */}
      <section className="py-16 max-w-6xl mx-auto px-6 relative z-10 -mt-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <StatCard value={stats?.search_radius || '2km'} label="Proximity Radii" icon={<Target size={28} />} loading={statsLoading} />
          <StatCard value={stats?.analysis_layers || '5+'} label="Data Dimensions" icon={<Layers size={28} />} loading={statsLoading} />
          <StatCard value={stats?.grade_system || 'A–F'} label="Scoring Precision" icon={<Activity size={28} />} loading={statsLoading} />
          <StatCard value={stats?.analysis_speed || '< 2s'} label="Response Time" icon={<Zap size={28} />} loading={statsLoading} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16 animate-fade-up">
            <h2 className="text-4xl font-black text-slate-800 mb-5 tracking-tight">Streamlined Analysis Flow</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">Remove the friction from site evaluation. Our platform is built to deliver fast, transparent, and completely data-backed results.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<MapPin size={28} />}
              title="1. Locate & Pin"
              desc="Select any geography within our coverage zone. The system utilizes real-time reverse-geocoding to establish the localized context."
              delay="0s"
            />
            <FeatureCard
              icon={<BarChart3 size={28} />}
              title="2. Spatial Computation"
              desc="Our engine crunches structured datasets including foot traffic markers, transport grids, and competitor boundaries concurrently."
              delay="0.1s"
            />
            <FeatureCard
              icon={<Target size={28} />}
              title="3. Grade Initialization"
              desc="Receive an absolute readiness grade along with layer breakdowns. Compare the insights directly to determine optimal expansion."
              delay="0.2s"
            />
          </div>
        </div>
      </section>

      {/* ── CAPABILITIES ── */}
      <section className="py-24 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 animate-fade-up">
          <h2 className="text-4xl font-black text-slate-800 mb-5 tracking-tight">Enterprise Platform Features</h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">Equipped with everything required to scale your physical footprint intelligently.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: <Globe size={24} />, title: 'Cartographic Interface', desc: 'Fluid, high-performance base maps with multi-dimensional overlays and localized cluster aggregations.' },
              { icon: <Brain size={24} />, title: 'Intelligent Suggestion', desc: 'When a site fails constraints, the AI engine dynamically scans adjacent areas for higher-scoring alternatives.' },
              { icon: <TrendingUp size={24} />, title: 'Historical Dashboard', desc: 'Maintain a comprehensive archive of every site you assess. Visualize scoring trends over large timescales.' },
              { icon: <Shield size={24} />, title: 'Constraint Validation', desc: 'Automatically flag severe physical and administrative roadblocks such as flood zones or restricted commercial areas.' },
              { icon: <BarChart3 size={24} />, title: 'Comparative Matrices', desc: 'Put up to 5 prospective locations side-by-side to perform deep dive, factor-by-factor evaluations.' },
              { icon: <Star size={24} />, title: 'Export & Presentation', desc: 'Download meticulously formatted PDF deliverables containing analytical rationale to share with key stakeholders.' },
            ].map((f, i) => (
              <div key={i} className="group flex gap-6 p-6 items-start bg-white rounded-3xl border border-slate-100 hover:border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg mb-2">{f.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ── USE CASES ── */}
      <section className="py-24 bg-white border-y border-slate-200 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="text-center mb-16 animate-fade-up">
            <h2 className="text-4xl font-black text-slate-800 mb-5 tracking-tight">Targeted Sector Models</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">Generic data isn't enough. Our engine dynamically adjusts parameter weightings depending on the chosen commercial sector.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <UseCaseCard icon={<Building2 size={32} />} label="Retail Franchises" desc="Evaluating consumer demographics, footfall drivers, and competition." delay="0s" />
            <UseCaseCard icon={<Warehouse size={32} />} label="Logistics & Warehousing" desc="Focusing on highway accessibility, land-use zoning, and transport grids." delay="0.1s" />
            <UseCaseCard icon={<BatteryCharging size={32} />} label="EV Infrastructure" desc="Prioritizing transit corridors, civic amenities, and expected dwell times." delay="0.2s" />
            <UseCaseCard icon={<Radio size={32} />} label="Telecom & 5G" desc="Analyzing environmental constraints, elevation gaps, and structural zones." delay="0.3s" />
          </div>
        </div>
      </section>

      {/* ── CTA SECTION ── */}
      <section className="py-24 bg-slate-50">
         <div className="max-w-4xl mx-auto px-6 text-center animate-fade-up">
            <h2 className="text-4xl font-black text-slate-800 mb-6 tracking-tight">Ready to leverage spatial data?</h2>
            <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto">Create a free account to begin storing your evaluations and extracting comprehensive location reports.</p>
            <Link to="/signup" className="inline-flex items-center gap-3 px-10 py-5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-xl transition-all hover:-translate-y-1 text-lg group">
              Start your analysis <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
            </Link>
         </div>
      </section>

      <Footer />
    </div>
  );
};

export default HomePage;
