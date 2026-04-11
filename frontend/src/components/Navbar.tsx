import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapPin, LogOut, User, History } from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;
  const linkClass = (path: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
      isActive(path) ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`;

  return (
    <header className="flex-shrink-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-30 shadow-lg">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-white text-sm tracking-tight">Site</span>
          <span className="text-blue-400 font-bold text-sm">IQ</span>
        </div>
      </Link>

      {/* Nav Links */}
      <nav className="flex items-center gap-1">
        <Link to="/" className={linkClass('/')}>Home</Link>
        <Link to="/analysis" className={linkClass('/analysis')}>Map Analysis</Link>
        {user && <Link to="/dashboard" className={linkClass('/dashboard')}>Dashboard</Link>}
        <Link to="/contact" className={linkClass('/contact')}>Contact</Link>
      </nav>

      {/* Auth */}
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg">
              <User size={14} className="text-blue-400" />
              <span className="text-sm text-slate-300 font-medium">{user.name}</span>
            </div>
            <button onClick={() => { logout(); navigate('/'); }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all" title="Logout">
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-all">
              Login
            </Link>
            <Link to="/signup" className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;
