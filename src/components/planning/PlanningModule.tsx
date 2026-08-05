import React from 'react';
import { Toaster } from 'sonner';
import { PlanningDrawer } from './PlanningDrawer';
import { ProductionPlanningPage } from './ProductionPlanningPage';

export const PlanningModule: React.FC = () => {
  return (
    <div className="p-4 md:p-5 space-y-4 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <ProductionPlanningPage />

      <PlanningDrawer />

      <Toaster position="bottom-right" richColors />
    </div>
  );
};
