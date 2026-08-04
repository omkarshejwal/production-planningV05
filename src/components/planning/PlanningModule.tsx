import React, { useState } from 'react';
import { PlanningFilters } from './PlanningFilters';
import { PlanningTable } from './PlanningTable';
import { PlanningDrawer } from './PlanningDrawer';

export const PlanningModule: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <PlanningFilters
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        machineFilter={machineFilter}
        setMachineFilter={setMachineFilter}
        colorFilter={colorFilter}
        setColorFilter={setColorFilter}
        customerFilter={customerFilter}
        setCustomerFilter={setCustomerFilter}
        onRefresh={handleRefresh}
      />

      <PlanningTable
        key={refreshKey}
        statusFilter={statusFilter}
        machineFilter={machineFilter}
        colorFilter={colorFilter}
        customerFilter={customerFilter}
      />

      <PlanningDrawer />
    </div>
  );
};
