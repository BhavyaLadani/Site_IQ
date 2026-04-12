import React, { useState } from 'react';
import MapView from '../components/Map/MapView';
import ScorePanel from '../components/Sidebar/ScorePanel';
import ComparisonDashboard from '../components/Sidebar/ComparisonDashboard';
import ComparisonModal from '../components/Report/ComparisonModal';
import ErrorBoundary from '../components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const MapAnalysisPage: React.FC = () => {
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="flex flex-1 overflow-hidden relative">
          <div className="flex-1 relative">
            <MapView />
            
            {/* Floating Comparison Dashboard */}
            <ComparisonDashboard onOpenCompare={() => setIsCompareOpen(true)} />
          </div>
          
          <ScorePanel />

          {/* Comparison Modal Overlay */}
          <ComparisonModal 
            isOpen={isCompareOpen} 
            onClose={() => setIsCompareOpen(false)} 
          />
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default MapAnalysisPage;

