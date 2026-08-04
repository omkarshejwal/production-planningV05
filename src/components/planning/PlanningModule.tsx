import React, { useState } from 'react';
import { PlanningFilters } from './PlanningFilters';
import { PlanningTable } from './PlanningTable';
import { PlanningDrawer } from './PlanningDrawer';

export const PlanningModule: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <PlanningFilters
        onRefresh={handleRefresh}
      />

      <PlanningTable key={refreshKey} />

      <PlanningDrawer />
    </div>
  );
};
