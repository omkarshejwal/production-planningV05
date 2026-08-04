import React, { createContext, useContext, useState } from 'react';
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
  INITIAL_BOTTLES,
  INITIAL_BOTTLE_MASTER,
  INITIAL_DISPATCH,
  INITIAL_INVENTORY,
  INITIAL_JOBS,
  INITIAL_MACHINES,
  INITIAL_NOTIFICATIONS,
  INITIAL_QUALITY_INSPECTIONS,
  INITIAL_SHIFT_REPORTS,
  generateInitialPlanningEntries,
} from '../data/mockData';
import { calculateDrawTonsPerDay, calculateGrossDayQuantity } from '../utils/calculations';

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
  
  // Drawer state
  isDrawerOpen: boolean;
  editingJob: ProductionJob | null;
  drawerDefaultMachineId?: string;
  drawerDefaultDate?: string;
  openDrawerForEdit: (job?: ProductionJob | null, defaultMachineId?: string, defaultDate?: string) => void;
  closeDrawer: () => void;
  
  // Actions
  saveJob: (jobData: Partial<ProductionJob>) => void;
  deleteJob: (jobId: string) => void;
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

export const ERPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModule] = useState<ActiveModule>('Production Planning');
  const [machines, setMachines] = useState<ISMachine[]>(INITIAL_MACHINES);
  const [bottles, setBottles] = useState<BottleMaster[]>(INITIAL_BOTTLES);
  const [bottleMasterRecords, setBottleMasterRecords] = useState<BottleMasterRecord[]>(INITIAL_BOTTLE_MASTER);
  const [jobs, setJobs] = useState<ProductionJob[]>(INITIAL_JOBS);
  const [planningEntries, setPlanningEntries] = useState<DailyPlanningEntry[]>(generateInitialPlanningEntries());
  const [shiftReports, setShiftReports] = useState<ShiftProductionReport[]>(INITIAL_SHIFT_REPORTS);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [qualityInspections, setQualityInspections] = useState<QualityInspection[]>(INITIAL_QUALITY_INSPECTIONS);
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrder[]>(INITIAL_DISPATCH);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [fromDate, setFromDate] = useState('2026-08-01');
  const [toDate, setToDate] = useState('2026-08-31');

  // Job Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ProductionJob | null>(null);
  const [drawerDefaultMachineId, setDrawerDefaultMachineId] = useState<string | undefined>();
  const [drawerDefaultDate, setDrawerDefaultDate] = useState<string | undefined>();

  const [user] = useState({
    name: 'Ahmed S.',
    email: 'ahmed.s@vitrumglass.com',
    role: 'Chief Plant Production Manager',
    plantLocation: 'Furnace Line #2 - Vitrum Glass Ind.',
  });

  const openDrawerForEdit = (job?: ProductionJob | null, defaultMachineId?: string, defaultDate?: string) => {
    setEditingJob(job || null);
    setDrawerDefaultMachineId(defaultMachineId);
    setDrawerDefaultDate(defaultDate);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setEditingJob(null);
    setDrawerDefaultMachineId(undefined);
    setDrawerDefaultDate(undefined);
  };

  const updateMachineSectionsCount = (machineId: string, sectionsCount: number) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === machineId ? { ...m, sectionsCount } : m))
    );

    // Automatically update existing planning entries for this machine to reflect new section count and corresponding speed
    setPlanningEntries((prev) =>
      prev.map((entry) => {
        if (entry.machineId !== machineId) return entry;
        const targetMachine = machines.find((m) => m.id === machineId);
        if (!targetMachine) return entry;

        // Try to look up the bottle master record for this bottle name, machine name, and new section
        const matchingRecord = bottleMasterRecords.find(
          (r) =>
            (r.mch === targetMachine.name || r.mch === targetMachine.id) &&
            r.bottleName === entry.bottleName &&
            r.section === sectionsCount
        );

        const newSpeed = matchingRecord ? matchingRecord.speed : entry.cutPerMin;
        const newWeight = matchingRecord ? matchingRecord.weightGrams : entry.weightGrams;
        const dayQty = calculateGrossDayQuantity(newSpeed, sectionsCount);
        const drawTons = calculateDrawTonsPerDay(newSpeed, sectionsCount, newWeight);

        return {
          ...entry,
          section: sectionsCount,
          cutPerMin: newSpeed,
          weightGrams: newWeight,
          dayQuantity: entry.status === 'Changeover' ? dayQty / 2 : dayQty,
          drawTons: entry.status === 'Changeover' ? drawTons / 2 : drawTons,
        };
      })
    );
  };

  const importBottleMasterData = (records: BottleMasterRecord[]) => {
    setBottleMasterRecords(records);
  };

  const resetBottleMasterData = () => {
    setBottleMasterRecords(INITIAL_BOTTLE_MASTER);
  };

  const saveJob = (jobData: Partial<ProductionJob>) => {
    let updatedJobs: ProductionJob[];
    const isEdit = Boolean(jobData.id);
    const bottleObj = bottles.find((b) => b.id === jobData.bottleId);

    const calculatedDraw = calculateDrawTonsPerDay(
      jobData.cutPerMin || 28,
      jobData.sectionCount || 8,
      jobData.weightGrams || bottleObj?.weightGrams || 400
    );

    const fullJob: ProductionJob = {
      id: jobData.id || `JOB-2026-${Math.floor(100 + Math.random() * 900)}`,
      jobNumber: jobData.jobNumber || `JOB-2026-${Math.floor(100 + Math.random() * 900)}`,
      machineId: jobData.machineId || 'MAC-01',
      bottleId: jobData.bottleId || bottles[0].id,
      customerName: jobData.customerName || bottleObj?.customerName || 'Standard Production',
      sectionCount: jobData.sectionCount || 8,
      weightGrams: jobData.weightGrams || bottleObj?.weightGrams || 400,
      cutPerMin: jobData.cutPerMin || 28,
      grossQuantity: jobData.grossQuantity || 300000,
      producedQuantity: jobData.producedQuantity || 0,
      remainingQuantity: (jobData.grossQuantity || 300000) - (jobData.producedQuantity || 0),
      drawTonsPerDay: calculatedDraw,
      startDate: jobData.startDate || '2026-08-01',
      endDate: jobData.endDate || '2026-08-15',
      status: jobData.status || 'Pending',
      priority: jobData.priority || 'Medium',
      packingCategory: jobData.packingCategory || 'Palletized',
      palletType: jobData.palletType || 'Wooden Standard (1200x1000)',
      changeoverHours: jobData.changeoverHours || 0,
      remarks: jobData.remarks || '',
    };

    if (isEdit) {
      updatedJobs = jobs.map((j) => (j.id === fullJob.id ? fullJob : j));
    } else {
      updatedJobs = [...jobs, fullJob];
    }
    setJobs(updatedJobs);

    // Update Planning entries for the specified machine and date range
    const updatedEntries = [...planningEntries];
    const targetBottle = bottles.find((b) => b.id === fullJob.bottleId);
    
    // Replace matching entries or append
    const start = new Date(fullJob.startDate);
    const end = new Date(fullJob.endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const index = updatedEntries.findIndex(
        (e) => e.date === dateStr && e.machineId === fullJob.machineId
      );

      const dayQty = calculateGrossDayQuantity(fullJob.cutPerMin, fullJob.sectionCount);
      const entryData: DailyPlanningEntry = {
        date: dateStr,
        machineId: fullJob.machineId,
        jobId: fullJob.id,
        bottleName: targetBottle?.name || 'Bottle',
        bottleColor: targetBottle?.color || 'Flint',
        drawingNumber: targetBottle?.drawingNumber || 'DWG-100',
        section: fullJob.sectionCount,
        weightGrams: fullJob.weightGrams,
        cutPerMin: fullJob.cutPerMin,
        dayQuantity: fullJob.status === 'Changeover' ? dayQty / 2 : dayQty,
        drawTons: fullJob.status === 'Changeover' ? fullJob.drawTonsPerDay / 2 : fullJob.drawTonsPerDay,
        status: fullJob.status,
        changeoverHours: fullJob.changeoverHours,
      };

      if (index >= 0) {
        updatedEntries[index] = entryData;
      } else {
        updatedEntries.push(entryData);
      }
    }
    setPlanningEntries(updatedEntries);
    closeDrawer();
  };

  const deleteJob = (jobId: string) => {
    setJobs(jobs.filter((j) => j.id !== jobId));
    setPlanningEntries(planningEntries.filter((e) => e.jobId !== jobId));
  };

  const addBottle = (bottle: BottleMaster) => {
    setBottles([...bottles, bottle]);
  };

  const updateMachineStatus = (machineId: string, status: ISMachine['status']) => {
    setMachines(
      machines.map((m) => (m.id === machineId ? { ...m, status } : m))
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const clearAllNotifications = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
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
        openDrawerForEdit,
        closeDrawer,
        saveJob,
        deleteJob,
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
