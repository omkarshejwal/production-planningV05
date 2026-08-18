import React, { useEffect, useState, useCallback } from 'react';
import { MachineMasterPanel } from './MachineMasterPanel';
import { BottleMasterPanel } from './BottleMasterPanel';
import { HolidayMasterPanel } from './HolidayMasterPanel';
import { planningRepository } from '../../services/planningRepository';
import { MachineMasterRow, BottleMasterRow, BottleConfigurationRow } from '../../data/planningSchema';

export const MachinesModule: React.FC = () => {
  const [machineRows, setMachineRows] = useState<MachineMasterRow[]>([]);
  const [bottles, setBottles] = useState<BottleMasterRow[]>([]);
  const [configs, setConfigs] = useState<BottleConfigurationRow[]>([]);

  const refresh = useCallback(() => {
    planningRepository.init().then(() => {
      setMachineRows(planningRepository.getMachines());
      setBottles(planningRepository.getBottles());
      setConfigs(planningRepository.getAllConfigurations());
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="p-4 md:p-6 max-w-[1920px] mx-auto min-h-[calc(100vh-9rem)]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <BottleMasterPanel
          machines={machineRows}
          bottles={bottles}
          configs={configs}
          onRefresh={refresh}
        />
        <MachineMasterPanel
          machines={machineRows}
          onRefresh={refresh}
        />
        <HolidayMasterPanel />
      </div>
    </div>
  );
};
