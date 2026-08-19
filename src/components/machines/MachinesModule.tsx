import React, { useEffect, useState, useCallback } from 'react';
import { FlaskConical, Cpu, CalendarDays } from 'lucide-react';
import { MachineMasterPanel } from './MachineMasterPanel';
import { BottleMasterPanel } from './BottleMasterPanel';
import { HolidayMasterPanel } from './HolidayMasterPanel';
import { planningRepository } from '../../services/planningRepository';
import { MachineMasterRow, BottleMasterRow, BottleConfigurationRow } from '../../data/planningSchema';

type MasterTabId = 'bottle' | 'machine' | 'holiday';

interface MasterTab {
  id: MasterTabId;
  label: string;
  icon: React.ReactNode;
}

const MASTER_TABS: MasterTab[] = [
  { id: 'bottle', label: 'Bottle Master', icon: <FlaskConical size={16} /> },
  { id: 'machine', label: 'Machine Master', icon: <Cpu size={16} /> },
  { id: 'holiday', label: 'Holiday Master', icon: <CalendarDays size={16} /> },
];

export const MachinesModule: React.FC = () => {
  const [machineRows, setMachineRows] = useState<MachineMasterRow[]>([]);
  const [bottles, setBottles] = useState<BottleMasterRow[]>([]);
  const [configs, setConfigs] = useState<BottleConfigurationRow[]>([]);
  const [activeTab, setActiveTab] = useState<MasterTabId>('bottle');

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
      {/* Master tab navigation */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {MASTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active master panel */}
      {activeTab === 'bottle' && (
        <BottleMasterPanel
          machines={machineRows}
          bottles={bottles}
          configs={configs}
          onRefresh={refresh}
        />
      )}
      {activeTab === 'machine' && (
        <MachineMasterPanel
          machines={machineRows}
          onRefresh={refresh}
        />
      )}
      {activeTab === 'holiday' && <HolidayMasterPanel />}
    </div>
  );
};
