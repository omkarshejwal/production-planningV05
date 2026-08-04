import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  ActiveModule,
  BottleMaster,
  BottleMasterRecord,
  DailyPlanningEntry,
  DispatchOrder,
  InventoryItem,
  ISMachine,
  NotificationItem,
  ProductionJob,
  QualityInspection,
  ShiftProductionReport,
} from '../types';
import {
  INITIAL_DISPATCH,
  INITIAL_INVENTORY,
  INITIAL_NOTIFICATIONS,
  INITIAL_QUALITY_INSPECTIONS,
  INITIAL_SHIFT_REPORTS,
} from '../data/mockData';
import {
  BottleConfigurationRow,
  JobStatusSchema,
  ProductionJobRow,
} from '../data/planningSchema';
import { calculateDrawTonsPerDay } from '../utils/calculations';
import { planningRepository } from '../services/planningRepository';

interface ERPContextType {
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;
  machines: ISMachine[];
  bottles: BottleMaster[];
  bottleMasterRecords: BottleMasterRecord[];
  jobs: ProductionJob[];
  planningEntries: DailyPlanningEntry[];
  shiftReports: ShiftProductionReport[];
  inventory: InventoryItem[];
  qualityInspections: QualityInspection[];
  dispatchOrders: DispatchOrder[];
  notifications: NotificationItem[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  fromDate: string;
  setFromDate: (d: string) => void;
  toDate: string;
  setToDate: (d: string) => void;

  isDrawerOpen: boolean;
  editingJob: ProductionJob | null;
  drawerDefaultMachineId?: string;
  drawerDefaultDate?: string;
  drawerSourceJobId?: string;
  drawerSuggestedStartTime?: string;
  openDrawerForEdit: (
    job?: ProductionJob | null,
    defaultMachineId?: string,
    defaultDate?: string,
    sourceJobId?: string,
    suggestedStartTime?: string
  ) => void;
  closeDrawer: () => void;

  saveJob: (jobData: Partial<ProductionJob>) => boolean;
  deleteJob: (jobId: string) => boolean;
  updateJobInline: (
    jobId: string,
    patch: Partial<Pick<ProductionJob, 'sectionCount' | 'weightGrams' | 'cutPerMin' | 'productionQuantity' | 'grossQuantity' | 'drawTonsPerDay'>>
  ) => boolean;
  extendJob: (jobId: string, numberOfDays: number) => boolean;
  finishJob: (jobId: string) => boolean;
  addBottle: (bottle: BottleMaster) => void;
  updateMachineStatus: (machineId: string, status: ISMachine['status']) => void;
  updateMachineSectionsCount: (machineId: string, sectionsCount: number) => void;
  importBottleMasterData: (records: BottleMasterRecord[]) => void;
  resetBottleMasterData: () => void;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  user: {
    name: string;
    email: string;
    role: string;
    plantLocation: string;
  };
}

const ERPContext = createContext<ERPContextType | undefined>(undefined);

const jobIdFromRow = (row: ProductionJobRow): string =>
  [row.plan_date, row.machine_no, row.bottle_id, row.section, row.start_time].join('|');

const addDays = (date: string, days: number): string => {
  const dt = new Date(`${date}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().split('T')[0];
};

const schemaStatusToUiStatus = (status: JobStatusSchema): ProductionJob['status'] => {
  if (status === 'Planned') return 'Planned';
  if (status === 'Running') return 'Running';
  if (status === 'Completed') return 'Completed';
  return 'Hold';
};

const uiStatusToSchemaStatus = (status?: ProductionJob['status']): JobStatusSchema => {
  if (status === 'Completed') return 'Completed';
  if (status === 'Hold') return 'Hold';
  if (status === 'Running') return 'Running';
  return 'Planned';
};

const getMachineDisplayName = (machineNo: string) => {
  const suffix = machineNo.split('-')[1] || machineNo;
  const parsed = Number(suffix);
  return Number.isNaN(parsed) ? machineNo : `Machine No ${parsed}`;
};

export const ERPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModule] = useState<ActiveModule>('Production Planning');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [fromDate, setFromDate] = useState('2026-08-01');
  const [toDate, setToDate] = useState('2026-08-31');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ProductionJob | null>(null);
  const [drawerDefaultMachineId, setDrawerDefaultMachineId] = useState<string | undefined>();
  const [drawerDefaultDate, setDrawerDefaultDate] = useState<string | undefined>();
  const [drawerSourceJobId, setDrawerSourceJobId] = useState<string | undefined>();
  const [drawerSuggestedStartTime, setDrawerSuggestedStartTime] = useState<string | undefined>();

  const [machineSectionOverrides, setMachineSectionOverrides] = useState<Record<string, number>>({});
  const [plannerVersion, setPlannerVersion] = useState(0);

  const [shiftReports] = useState<ShiftProductionReport[]>(INITIAL_SHIFT_REPORTS);
  const [inventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [qualityInspections] = useState<QualityInspection[]>(INITIAL_QUALITY_INSPECTIONS);
  const [dispatchOrders] = useState<DispatchOrder[]>(INITIAL_DISPATCH);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const [user] = useState({
    name: 'Ahmed S.',
    email: 'ahmed.s@vitrumglass.com',
    role: 'Chief Plant Production Manager',
    plantLocation: 'Furnace Line #2 - Vitrum Glass Ind.',
  });

  const refreshPlanner = () => setPlannerVersion((v) => v + 1);

  const machines = useMemo<ISMachine[]>(() => {
    void plannerVersion;
    return planningRepository.getMachines().map((row) => {
      const sectionCap = Math.max(1, row.max_section);
      const sectionStart = Math.max(1, sectionCap - 2);
      const sectionOptions = Array.from({ length: sectionCap - sectionStart + 1 }, (_, i) => sectionStart + i);
      const selectedSections = machineSectionOverrides[row.machine_no] || row.max_section;

      return {
        id: row.machine_no,
        name: getMachineDisplayName(row.machine_no),
        code: row.machine_no,
        sectionsCount: Math.min(sectionCap, Math.max(1, selectedSections)),
        defaultSectionsCount: row.max_section,
        availableSections: sectionOptions,
        sectionType: (row.gob_type as ISMachine['sectionType']) || 'Double Gob',
        status: 'Running',
        feederTemperatureC: 0,
        gobCutSpeed: 0,
        oeePercent: 0,
        packRatePercent: 0,
        dailyTargetTons: 0,
      };
    });
  }, [machineSectionOverrides, plannerVersion]);

  const bottles = useMemo<BottleMaster[]>(() => {
    void plannerVersion;
    return planningRepository.getBottles().map((row) => {
      const config = planningRepository
        .getBottleConfigurations('MAC-01', row.bottle_id)[0] ||
        planningRepository
          .getMachines()
          .map((m) => planningRepository.getBottleConfigurations(m.machine_no, row.bottle_id)[0])
          .find(Boolean);

      return {
        id: row.bottle_id,
        name: row.bottle_name,
        drawingNumber: row.bottle_id,
        weightGrams: config?.weight || 0,
        capacityMl: 0,
        color: 'Flint',
        sectionType: 'Double Gob',
        standardCutPerMin: config?.speeds || 0,
        customerName: '',
        category: 'Beverage',
      };
    });
  }, [plannerVersion]);

  const bottleMasterRecords = useMemo<BottleMasterRecord[]>(() => {
    void plannerVersion;
    const rows = planningRepository.getMachines().flatMap((machine) => {
      return planningRepository
        .getBottles()
        .flatMap((bottle) => planningRepository.getBottleConfigurations(machine.machine_no, bottle.bottle_id));
    });

    return rows.map((row) => {
      const bottle = planningRepository.getBottles().find((b) => b.bottle_id === row.bottle_id);
      return {
        id: `${row.machine_no}-${row.bottle_id}-${row.section}`,
        mch: row.machine_no,
        bottleName: bottle?.bottle_name || row.bottle_id,
        drawingNumber: row.bottle_id,
        section: row.section,
        weightGrams: row.weight,
        speed: row.speeds,
        color: 'Flint',
      };
    });
  }, [plannerVersion]);

  const jobs = useMemo<ProductionJob[]>(() => {
    void plannerVersion;
    const rows = planningRepository.getProductionJobs();

    return rows.map((row) => {
      const maxSeqForDayMachine = rows
        .filter((j) => j.plan_date === row.plan_date && j.machine_no === row.machine_no)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const sequenceNumber = maxSeqForDayMachine.findIndex((j) => jobIdFromRow(j) === jobIdFromRow(row)) + 1;

      return {
        id: jobIdFromRow(row),
        jobNumber: `JOB-${row.plan_date}-${row.machine_no}-${row.start_time}`,
        machineId: row.machine_no,
        bottleId: row.bottle_id,
        customerName: '',
        sectionCount: row.section,
        weightGrams: row.weight,
        cutPerMin: row.speeds,
        grossQuantity: row.quantity,
        producedQuantity: 0,
        remainingQuantity: row.quantity,
        drawTonsPerDay: row.draw,
        startDate: row.plan_date,
        endDate: row.plan_date,
        status: schemaStatusToUiStatus(row.status),
        priority: 'Medium',
        packingCategory: 'Palletized',
        palletType: 'Wooden Standard (1200x1000)',
        remarks: '',
        date: row.plan_date,
        startTime: row.start_time,
        expectedEndTime: row.estimated_completion,
        productionQuantity: row.quantity,
        linkedJobGroupId: `${row.machine_no}|${row.bottle_id}|${row.section}|${row.start_time}`,
        sequenceNumber,
        lifecycleStatus: row.status === 'Completed' ? 'COMPLETED' : 'ACTIVE',
        locked: row.status === 'Completed',
        changeoverHours: (row.changeover_minutes || 0) / 60,
      };
    });
  }, [plannerVersion]);

  const planningEntries = useMemo<DailyPlanningEntry[]>(() => {
    return jobs.map((job) => {
      const bottle = bottles.find((b) => b.id === job.bottleId);
      return {
        date: job.date || job.startDate,
        machineId: job.machineId,
        jobId: job.id,
        bottleName: bottle?.name || job.bottleId,
        bottleColor: bottle?.color || 'Flint',
        drawingNumber: bottle?.drawingNumber || job.bottleId,
        section: job.sectionCount,
        weightGrams: job.weightGrams,
        cutPerMin: job.cutPerMin,
        dayQuantity: job.productionQuantity || job.grossQuantity,
        drawTons: job.drawTonsPerDay,
        status: job.status,
        changeoverHours: job.changeoverHours,
      };
    });
  }, [jobs, bottles]);

  const openDrawerForEdit = (
    job?: ProductionJob | null,
    defaultMachineId?: string,
    defaultDate?: string,
    sourceJobId?: string,
    suggestedStartTime?: string
  ) => {
    setEditingJob(job || null);
    setDrawerDefaultMachineId(defaultMachineId);
    setDrawerDefaultDate(defaultDate);
    setDrawerSourceJobId(sourceJobId);
    setDrawerSuggestedStartTime(suggestedStartTime);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setEditingJob(null);
    setDrawerDefaultMachineId(undefined);
    setDrawerDefaultDate(undefined);
    setDrawerSourceJobId(undefined);
    setDrawerSuggestedStartTime(undefined);
  };

  const saveJob = (jobData: Partial<ProductionJob>): boolean => {
    const machine_no = jobData.machineId || drawerDefaultMachineId;
    const plan_date = jobData.date || jobData.startDate || drawerDefaultDate;
    const bottle_id = jobData.bottleId;
    const start_time = jobData.startTime || drawerSuggestedStartTime || '07:00';
    const estimated_completion = jobData.expectedEndTime || '23:00';

    if (!machine_no || !plan_date || !bottle_id) {
      alert('Machine, date and bottle are required.');
      return false;
    }

    const machine = planningRepository.getMachines().find((m) => m.machine_no === machine_no);
    if (!machine) {
      alert('Machine does not exist in machine_master.');
      return false;
    }

    const section = jobData.sectionCount || machine.max_section;
    const configs = planningRepository.getBottleConfigurations(machine_no, bottle_id);
    const resolvedConfig =
      configs.find((c) => c.section === section) || configs[0];

    if (!resolvedConfig) {
      alert('No configuration found in bottle_configuration for selected machine and bottle.');
      return false;
    }

    const weight = resolvedConfig.weight;
    const speeds = resolvedConfig.speeds;
    const quantity = jobData.productionQuantity || jobData.grossQuantity || 0;
    const draw = Number(calculateDrawTonsPerDay(speeds, resolvedConfig.section, weight).toFixed(2));

    const row: ProductionJobRow = {
      plan_date,
      machine_no,
      bottle_id,
      section: resolvedConfig.section,
      weight,
      speeds,
      draw,
      quantity,
      start_time,
      estimated_completion,
      completion_time: jobData.lifecycleStatus === 'COMPLETED' ? estimated_completion : undefined,
      changeover_minutes: Math.round((jobData.changeoverHours || 0) * 60),
      status: uiStatusToSchemaStatus(jobData.status),
    };

    if (editingJob) {
      const updated = planningRepository.updateProductionJob(
        {
          plan_date: editingJob.date || editingJob.startDate,
          machine_no: editingJob.machineId,
          bottle_id: editingJob.bottleId,
          section: editingJob.sectionCount,
          start_time: editingJob.startTime || '07:00',
        },
        row
      );
      if (!updated.ok) {
        alert(updated.error || 'Unable to update production job.');
        return false;
      }
    } else {
      const created = planningRepository.createProductionJob(row);
      if (!created.ok) {
        alert(created.error || 'Unable to create production job.');
        return false;
      }

      if (drawerSourceJobId) {
        const source = jobs.find((j) => j.id === drawerSourceJobId);
        if (source) {
          const sourceStatusUpdated: ProductionJobRow = {
            plan_date: source.date || source.startDate,
            machine_no: source.machineId,
            bottle_id: source.bottleId,
            section: source.sectionCount,
            weight: source.weightGrams,
            speeds: source.cutPerMin,
            draw: source.drawTonsPerDay,
            quantity: source.productionQuantity || source.grossQuantity,
            start_time: source.startTime || '07:00',
            estimated_completion: source.expectedEndTime || '23:00',
            completion_time: source.expectedEndTime || '23:00',
            changeover_minutes: Math.round((source.changeoverHours || 0) * 60),
            status: 'Completed',
          };

          planningRepository.updateProductionJob(
            {
              plan_date: source.date || source.startDate,
              machine_no: source.machineId,
              bottle_id: source.bottleId,
              section: source.sectionCount,
              start_time: source.startTime || '07:00',
            },
            sourceStatusUpdated
          );
        }
      }
    }

    closeDrawer();
    refreshPlanner();
    return true;
  };

  const deleteJob = (jobId: string): boolean => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return false;
    if (job.lifecycleStatus === 'COMPLETED' || job.locked) {
      alert('Completed jobs are locked and cannot be deleted.');
      return false;
    }

    planningRepository.deleteProductionJob({
      plan_date: job.date || job.startDate,
      machine_no: job.machineId,
      bottle_id: job.bottleId,
      section: job.sectionCount,
      start_time: job.startTime || '07:00',
    });
    refreshPlanner();
    return true;
  };

  const updateJobInline = (
    jobId: string,
    patch: Partial<Pick<ProductionJob, 'sectionCount' | 'weightGrams' | 'cutPerMin' | 'productionQuantity' | 'grossQuantity' | 'drawTonsPerDay'>>
  ): boolean => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return false;
    if (job.lifecycleStatus === 'COMPLETED' || job.locked) {
      alert('Completed or locked jobs cannot be edited.');
      return false;
    }

    const result = planningRepository.patchProductionJob(
      {
        plan_date: job.date || job.startDate,
        machine_no: job.machineId,
        bottle_id: job.bottleId,
        section: job.sectionCount,
        start_time: job.startTime || '07:00',
      },
      {
        section: patch.sectionCount,
        weight: patch.weightGrams,
        speeds: patch.cutPerMin,
        quantity: patch.productionQuantity ?? patch.grossQuantity,
        draw: patch.drawTonsPerDay,
      }
    );

    if (!result.ok) {
      alert(result.error || 'Unable to update job.');
      return false;
    }

    refreshPlanner();
    return true;
  };

  const extendJob = (jobId: string, numberOfDays: number): boolean => {
    const source = jobs.find((j) => j.id === jobId);
    if (!source || numberOfDays < 1) return false;

    for (let d = 1; d <= numberOfDays; d += 1) {
      const nextDate = addDays(source.date || source.startDate, d);
      const created = planningRepository.createProductionJob({
        plan_date: nextDate,
        machine_no: source.machineId,
        bottle_id: source.bottleId,
        section: source.sectionCount,
        weight: source.weightGrams,
        speeds: source.cutPerMin,
        draw: source.drawTonsPerDay,
        quantity: source.productionQuantity || source.grossQuantity,
        start_time: source.startTime || '07:00',
        estimated_completion: source.expectedEndTime || '23:00',
        completion_time: source.lifecycleStatus === 'COMPLETED' ? source.expectedEndTime : undefined,
        changeover_minutes: Math.round((source.changeoverHours || 0) * 60),
        status: source.lifecycleStatus === 'COMPLETED' ? 'Completed' : 'Planned',
      });

      if (!created.ok) {
        alert(created.error || `Failed to extend job to ${nextDate}`);
        refreshPlanner();
        return false;
      }
    }

    refreshPlanner();
    return true;
  };

  const finishJob = (jobId: string): boolean => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return false;

    const updated = planningRepository.updateProductionJob(
      {
        plan_date: job.date || job.startDate,
        machine_no: job.machineId,
        bottle_id: job.bottleId,
        section: job.sectionCount,
        start_time: job.startTime || '07:00',
      },
      {
        plan_date: job.date || job.startDate,
        machine_no: job.machineId,
        bottle_id: job.bottleId,
        section: job.sectionCount,
        weight: job.weightGrams,
        speeds: job.cutPerMin,
        draw: job.drawTonsPerDay,
        quantity: job.productionQuantity || job.grossQuantity,
        start_time: job.startTime || '07:00',
        estimated_completion: job.expectedEndTime || '23:00',
        completion_time: job.expectedEndTime || '23:00',
        changeover_minutes: Math.round((job.changeoverHours || 0) * 60),
        status: 'Completed',
      }
    );

    if (!updated.ok) {
      alert(updated.error || 'Unable to finish job.');
      return false;
    }

    refreshPlanner();
    return true;
  };

  const updateMachineSectionsCount = (machineId: string, sectionsCount: number) => {
    const machine = planningRepository.getMachines().find((m) => m.machine_no === machineId);
    if (!machine) return;
    const safeValue = Math.max(1, Math.min(sectionsCount, machine.max_section));
    setMachineSectionOverrides((prev) => ({ ...prev, [machineId]: safeValue }));
  };

  const addBottle = (_bottle: BottleMaster) => {
    alert('Bottle master is managed by bottle_master table and is read-only in this UI.');
  };

  const updateMachineStatus = (_machineId: string, _status: ISMachine['status']) => {
    // Machine runtime status is not persisted in machine_master schema.
  };

  const importBottleMasterData = (_records: BottleMasterRecord[]) => {
    alert('Bottle configuration source-of-truth is bottle_configuration table.');
  };

  const resetBottleMasterData = () => {
    refreshPlanner();
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const clearAllNotifications = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <ERPContext.Provider
      value={{
        activeModule,
        setActiveModule,
        machines,
        bottles,
        bottleMasterRecords,
        jobs,
        planningEntries,
        shiftReports,
        inventory,
        qualityInspections,
        dispatchOrders,
        notifications,
        searchQuery,
        setSearchQuery,
        selectedMonth,
        setSelectedMonth,
        fromDate,
        setFromDate,
        toDate,
        setToDate,
        isDrawerOpen,
        editingJob,
        drawerDefaultMachineId,
        drawerDefaultDate,
        drawerSourceJobId,
        drawerSuggestedStartTime,
        openDrawerForEdit,
        closeDrawer,
        saveJob,
        deleteJob,
        updateJobInline,
        extendJob,
        finishJob,
        addBottle,
        updateMachineStatus,
        updateMachineSectionsCount,
        importBottleMasterData,
        resetBottleMasterData,
        markNotificationRead,
        clearAllNotifications,
        user,
      }}
    >
      {children}
    </ERPContext.Provider>
  );
};

export function useERP() {
  const context = useContext(ERPContext);
  if (!context) {
    throw new Error('useERP must be used within an ERPProvider');
  }
  return context;
}
