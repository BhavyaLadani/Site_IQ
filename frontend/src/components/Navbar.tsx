import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapPin, LogOut, User } from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;
  const linkClass = (path: string) =>
    `px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      isActive(path)
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
    }`;

  return (
    <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md shadow-indigo-200">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-slate-800 text-sm tracking-tight">Site</span>
          <span className="text-indigo-600 font-bold text-sm">IQ</span>
        </div>
      </Link>

      {/* Nav Links */}
      <nav className="flex items-center gap-1">
        <Link to="/" className={linkClass('/')}>Home</Link>
        <Link to="/about" className={linkClass('/about')}>About</Link>
        <Link to="/analysis" className={linkClass('/analysis')}>Map Analysis</Link>
        {user && <Link to="/dashboard" className={linkClass('/dashboard')}>Dashboard</Link>}
        <Link to="/contact" className={linkClass('/contact')}>Contact</Link>
      </nav>

      {/* Auth */}
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
              <User size={14} className="text-indigo-500" />
              <span className="text-sm text-slate-700 font-medium">{user.name}</span>
            </div>
            <button onClick={() => { logout(); navigate('/'); }}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Logout">
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="px-4 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all">
              Login
            </Link>
            <Link to="/signup" className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-200 transition-all">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;
