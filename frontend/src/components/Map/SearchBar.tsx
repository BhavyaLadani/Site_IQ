import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, MapPin, Loader2, X, Navigation, Clock } from 'lucide-react';
import { useConfig } from '../../api/queries';

interface Suggestion {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  details?: string;
}

interface SearchBarProps {
  onSelect: (lat: number, lon: number, name: string) => void;
}

// ─── In-memory LRU cache for search results ───
const searchCache = new Map<string, { data: Suggestion[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE = 50;

function getCached(key: string): Suggestion[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Suggestion[]) {
  if (searchCache.size >= MAX_CACHE) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(key, { data, timestamp: Date.now() });
}

// ─── Recent searches (persisted in sessionStorage) ───
function getRecentSearches(): Suggestion[] {
  try {
    return JSON.parse(sessionStorage.getItem('siteiq_recent_searches') || '[]');
  } catch { return []; }
}

function addRecentSearch(s: Suggestion) {
  const recent = getRecentSearches().filter(r => r.place_id !== s.place_id);
  recent.unshift(s);
  sessionStorage.setItem('siteiq_recent_searches', JSON.stringify(recent.slice(0, 5)));
}

const SearchBar: React.FC<SearchBarProps> = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch dynamic config for geocoding bbox
  const { data: appConfig } = useConfig();
  const geoCenter = appConfig?.demo_center || { lat: 23.0225, lon: 72.5714 };
  const bbox = appConfig?.coverage_bbox;
  const geoBbox = bbox
    ? `${bbox.min_lon - 0.05},${bbox.min_lat - 0.05},${bbox.max_lon + 0.1},${bbox.max_lat + 0.05}`
    : '72.4,22.9,72.8,23.2';

  const recentSearches = useMemo(() => getRecentSearches(), [isFocused]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowRecent(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const cacheKey = searchQuery.trim().toLowerCase();

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setIsOpen(true);
      setShowRecent(false);
      setLoading(false);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      // Photon is based on Elasticsearch + OSM, giving true autocomplete
      // Restrict to region from dynamic config (defaults to Ahmedabad/Gujarat)
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&lat=${geoCenter.lat}&lon=${geoCenter.lon}&bbox=${geoBbox}&limit=7`;
      
      const res = await fetch(url, { signal: abortControllerRef.current.signal });
      if (!res.ok) throw new Error('Geocoding failed');
      
      const geojson = await res.json();
      const results: Suggestion[] = (geojson.features || []).map((f: any, idx: number) => {
        const p = f.properties;
        const _lon = f.geometry.coordinates[0];
        const _lat = f.geometry.coordinates[1];
        
        const namePart = p.name || p.street || 'Unknown';
        const contextParts = [p.district, p.city, p.state].filter(Boolean);
        // Ensure "Ahmedabad" is always in the context if applicable
        if (!contextParts.includes('Ahmedabad') && p.county === 'Ahmedabad') contextParts.push('Ahmedabad');

        return {
          place_id: `photon_${idx}_${p.osm_id}`,
          display_name: `${namePart}, ${contextParts.join(', ')}`,
          lat: _lat.toString(),
          lon: _lon.toString(),
          details: contextParts.join(', ')
        };
      });

      setCache(cacheKey, results);
      setSuggestions(results);
      setIsOpen(true);
      setShowRecent(false);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error(error);
        setSuggestions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (value.trim().length > 0) {
      setShowRecent(false);
      typingTimeoutRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, 300); // 300ms debounce
    } else {
      setSuggestions([]);
      setIsOpen(false);
      if (isFocused && recentSearches.length > 0) {
        setShowRecent(true);
      }
    }
  };

  const handleSelect = (s: Suggestion) => {
    setQuery(s.display_name.split(',')[0]);
    setIsOpen(false);
    setShowRecent(false);
    setIsFocused(false);
    inputRef.current?.blur();
    addRecentSearch(s);
    onSelect(parseFloat(s.lat), parseFloat(s.lon), s.display_name);
  };

  const clearSearch = () => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (suggestions.length > 0) {
      setIsOpen(true);
    } else if (!query && recentSearches.length > 0) {
      setShowRecent(true);
    }
  };

  const hasDropdown = (isOpen && suggestions.length > 0) || showRecent || (isOpen && query.length > 0 && suggestions.length === 0 && !loading);

  return (
    <div ref={containerRef} className="absolute top-3 left-3 z-20 w-[260px] max-w-[calc(100vw-2rem)]">
      {/* Search input */}
      <div className={`relative flex items-center bg-white border rounded-2xl transition-all duration-200 ${
        isFocused
          ? 'border-indigo-300 shadow-lg shadow-indigo-100/60 ring-4 ring-indigo-50'
          : 'border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
      }`}>
        <div className="pl-4 flex items-center">
          {loading
            ? <Loader2 size={17} className="animate-spin text-indigo-500" />
            : <Search size={17} className={isFocused ? 'text-indigo-500' : 'text-slate-400'} />
          }
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="Search Ahmedabad…"
          className="w-full bg-transparent border-none py-2.5 px-2.5 text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none font-medium"
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button onClick={clearSearch} className="pr-3 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Dropdown container */}
      {hasDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl animate-fade-up">

          {/* Recents panel */}
          {showRecent && recentSearches.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={10} /> Recent searches
              </div>
              <ul className="pb-1.5">
                {recentSearches.map((s) => (
                  <li key={s.place_id}>
                    <button onClick={() => handleSelect(s)}
                      className="w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-3 group">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center flex-shrink-0 transition-colors">
                        <Clock size={12} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <span className="text-sm text-slate-700 font-medium truncate group-hover:text-indigo-700 transition-colors">
                        {s.display_name.split(',')[0]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Suggestions panel */}
          {isOpen && suggestions.length > 0 && (
            <ul className="py-1.5">
              {suggestions.map((s, idx) => (
                <li key={s.place_id}>
                  <button
                    onClick={() => handleSelect(s)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors flex items-start gap-3 group ${
                      idx === 0 ? 'bg-slate-50/60' : ''
                    }`}
                  >
                    <div className="mt-0.5 w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center flex-shrink-0 transition-colors">
                      <MapPin size={14} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm text-slate-800 font-medium truncate group-hover:text-indigo-700 transition-colors">
                        {s.display_name.split(',')[0]}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                        {s.details || s.display_name.split(',').slice(1).join(',').trim()}
                      </span>
                    </div>
                    <Navigation size={12} className="ml-auto mt-1.5 text-transparent group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* No results */}
          {isOpen && query.length > 0 && suggestions.length === 0 && !loading && (
            <div className="p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-100 flex items-center justify-center">
                <MapPin size={18} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 font-medium">No locations found</p>
              <p className="text-xs text-slate-400 mt-0.5">Try a different area name or landmark</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
