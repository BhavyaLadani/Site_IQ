import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, MessageCircle, Globe, Code } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 pt-20 pb-10 border-t border-slate-900 border-opacity-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="flex items-center gap-3 mb-6 group inline-flex">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30 group-hover:scale-105 group-hover:bg-indigo-600 transition-all duration-300">
                <MapPin size={18} className="text-indigo-400 group-hover:text-white transition-colors" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-white text-xl tracking-tight leading-none group-hover:text-indigo-200 transition-colors">SiteIQ</span>
                <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Intelligence</span>
              </div>
            </Link>
            <p className="text-sm leading-relaxed mb-6">
              AI-driven geospatial analytics platform. Transforming spatial data into actionable intelligence for enterprise scaling.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"><MessageCircle size={14} /></a>
              <a href="#" className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"><Globe size={14} /></a>
              <a href="#" className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"><Code size={14} /></a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-bold mb-6">Platform</h4>
            <ul className="space-y-4 text-sm">
              <li><Link to="/analysis" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Map Editor</Link></li>
              <li><Link to="/features" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Capabilities</Link></li>
              <li><Link to="/dashboard" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Intelligence Hub</Link></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> API Access</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6">Company</h4>
            <ul className="space-y-4 text-sm">
              <li><Link to="/about" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Introduction</Link></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Careers</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Case Studies</a></li>
              <li><Link to="/contact" className="hover:text-indigo-400 transition-colors flex items-center gap-2 group"><ArrowRight size={12} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-400"/> Support</Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-white font-bold mb-6">Stay Updated</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 mb-4 flex">
              <input type="email" placeholder="Enter your email" className="bg-transparent border-none text-sm px-4 py-2 w-full focus:outline-none text-white placeholder-slate-600" />
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 transition-colors flex-shrink-0">
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500">Subscribe for industry insights and platform updates. No spam.</p>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs font-medium">
          <p>&copy; {new Date().getFullYear()} SiteIQ Analytics. All rights reserved.</p>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-indigo-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Cookie Guidelines</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
