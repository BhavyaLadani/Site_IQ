import React from 'react';
import MapView from '../components/Map/MapView';
import ScorePanel from '../components/Sidebar/ScorePanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const MapAnalysisPage: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <MapView />
        </div>
        <ScorePanel />
      </div>
    </QueryClientProvider>
  );
};

export default MapAnalysisPage;
