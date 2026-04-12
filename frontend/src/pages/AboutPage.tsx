import React, { useEffect } from 'react';
import { Building2, Globe, Shield, Target, ArrowRight, CheckCircle2, ChevronRight, BarChart3, Database, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const FeatureBlock: React.FC<{ icon: React.ReactNode; title: string; desc: string; delay: string }> = ({ icon, title, desc, delay }) => (
  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-xl hover:-translate-y-2 transition-all duration-500 animate-fade-up" style={{ animationDelay: delay }}>
    <div className="w-14 h-14 rounded-2xl bg-indigo-50/50 flex items-center justify-center text-indigo-600 mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-extrabold text-slate-800 mb-3 tracking-tight">{title}</h3>
    <p className="text-slate-500 leading-relaxed text-sm">{desc}</p>
  </div>
);

const AboutPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      
      {/* ── HERO SECTION ── */}
      <section className="relative pt-24 pb-20 md:pt-36 md:pb-28 bg-white border-b border-slate-100 overflow-hidden">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[500px] h-[500px] bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-full blur-3xl opacity-50 animate-pulse-ring" />
        
        <div className="max-w-4xl mx-auto px-6 text-center position-relative z-10 animate-fade-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-50 text-slate-500 font-bold text-xs rounded-full mb-8 border border-slate-200">
            <Globe size={12} className="text-indigo-500" /> Defining the future of spatial intelligence
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-800 tracking-tight leading-[1.1] mb-8">
            Decisions powered by <span className="text-indigo-600">data,</span> not deduction.
          </h1>
          <p className="text-lg md:text-xl text-slate-500 leading-relaxed max-w-3xl mx-auto font-medium">
            SiteIQ is an advanced geospatial analytics company. We give retail, logistics, telecom, and green energy enterprises the exact data they need to select the perfect physical location—in seconds.
          </p>
        </div>
      </section>

      {/* ── CORE MISSION ── */}
      <section className="py-24 max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <h2 className="text-sm font-bold text-indigo-600 tracking-widest uppercase mb-3">Our Mission</h2>
            <h3 className="text-4xl font-extrabold text-slate-800 mb-6 tracking-tight leading-tight">
              Democratizing location data for modern enterprises.
            </h3>
            <p className="text-slate-500 leading-relaxed mb-6 font-medium text-lg">
              Traditionally, comprehensive geospatial analysis has been prohibitively slow, expensive, and limited to domain experts using specialized desktop software. SiteIQ changes the paradigm completely.
            </p>
            <p className="text-slate-500 leading-relaxed mb-10 text-md">
              By leveraging concurrent processing, localized machine learning scoring models, and vast arrays of real-time map data, we allow decision makers to evaluate market potential, infrastructural risk, and competitive density instantaneously.
            </p>
            <Link to="/analysis" className="inline-flex items-center gap-2 text-indigo-600 font-bold hover:text-indigo-700 transition-colors group">
              Experience the engine <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-5 relative animate-fade-up" style={{ animationDelay: '0.2s' }}>
             {/* Decorative blob behind grid */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-slate-100 to-indigo-50 rounded-full blur-3xl -z-10 opacity-70" />
             
             <div className="p-8 bg-white border border-slate-100 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] mb-5 hover:-translate-y-1 transition-transform">
               <Database size={24} className="text-indigo-600 mb-4" />
               <h4 className="font-extrabold text-slate-800 mb-1">Global Data</h4>
               <p className="text-[13px] text-slate-500">Live integration with massive global infrastructure registries.</p>
             </div>
             <div className="p-8 bg-white border border-slate-100 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] mt-5 hover:-translate-y-1 transition-transform">
               <Target size={24} className="text-emerald-500 mb-4" />
               <h4 className="font-extrabold text-slate-800 mb-1">High Precision</h4>
               <p className="text-[13px] text-slate-500">Sub-meter accuracy scoring mapping multi-faceted inputs.</p>
             </div>
             <div className="p-8 bg-white border border-slate-100 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] -mt-5 hover:-translate-y-1 transition-transform">
               <Building2 size={24} className="text-purple-500 mb-4" />
               <h4 className="font-extrabold text-slate-800 mb-1">Cross Industry</h4>
               <p className="text-[13px] text-slate-500">Dynamic layer weighting depending on the commercial use-case.</p>
             </div>
             <div className="p-8 bg-white border border-slate-100 rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:-translate-y-1 transition-transform">
               <Shield size={24} className="text-amber-500 mb-4" />
               <h4 className="font-extrabold text-slate-800 mb-1">Risk Averse</h4>
               <p className="text-[13px] text-slate-500">Immediate detection of physical and legislative anomalies.</p>
             </div>
          </div>
        </div>
      </section>

      {/* ── WHY CHOOSE US ── */}
      <section className="py-24 bg-white border-y border-slate-100 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16 animate-fade-up">
            <h2 className="text-sm font-bold text-indigo-600 tracking-widest uppercase mb-3">Our Core Differentiators</h2>
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight">Why the market chooses SiteIQ</h3>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureBlock 
              icon={<Zap size={24} />} 
              title="Unmatched Speed" 
              desc="Complex spatial queries, distance-decay algorithms, and routing protocols that once took dedicated teams days to aggregate are executed in under two seconds." 
              delay="0s" 
            />
            <FeatureBlock 
              icon={<BarChart3 size={24} />} 
              title="Actionable Clarity" 
              desc="Instead of providing you with mountains of raw polygon data, our engine synthesizes inputs to generate a clean 'Grade A-F' metric paired directly with tailored insights." 
              delay="0.1s" 
            />
            <FeatureBlock 
              icon={<Globe size={24} />} 
              title="Constant Evolution" 
              desc="As geospatial cloud capabilities expand, so do our models. We continually refine our heuristics, weights, and processing pipelines to maintain competitive exclusivity." 
              delay="0.2s" 
            />
          </div>
        </div>
      </section>

      {/* ── VALUES SECTION ── */}
      <section className="py-24 max-w-4xl mx-auto px-6 animate-fade-up">
        <div className="bg-slate-900 rounded-[2.5rem] p-12 md:p-16 text-center shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
           <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-8 tracking-tight">Built for expansion.</h2>
              <div className="space-y-6 text-left max-w-2xl mx-auto">
                <div className="flex items-start gap-4">
                  <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="text-white font-bold text-lg mb-1">Precision</h4>
                    <p className="text-slate-400 text-sm">Every data point we ingest is verified. If the underlying data is sparse, our engine explicitly communicates the margin of uncertainty.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="text-white font-bold text-lg mb-1">Simplicity</h4>
                    <p className="text-slate-400 text-sm">Intelligence should not require a manual. We place heavy emphasis on creating a UI/UX logic that feels completely intuitive.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="text-white font-bold text-lg mb-1">Scale</h4>
                    <p className="text-slate-400 text-sm">Whether you are verifying a single location or conducting a batch analysis for a 500-store rollout, our infrastructure handles the load seamlessly.</p>
                  </div>
                </div>
              </div>
              <div className="mt-12 pt-12 border-t border-slate-800">
                <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors">
                  Join the Platform <ArrowRight size={18} />
                </Link>
              </div>
           </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AboutPage;
