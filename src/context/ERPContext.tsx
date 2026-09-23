import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActiveModule,
  BottleMaster,
  BottleMasterRecord,
  DailyPlanningEntry,
  ISMachine,
  ProductionJob,
} from '../types';
import {
  BottleConfigurationRow,
  JobStatusSchema,
  ProductionJobRow,
  JobPackagingRow,
} from '../data/planningSchema';
import {
  addCalendarDays,
  calculateProductionMetrics,
  calculateEstimatedCompletionDays,
} from '../utils/calculations';
import { planningRepository, getCacheVersion } from '../services/planningRepository';

interface ERPContextType {
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;
  machines: ISMachine[];
  bottles: BottleMaster[];
  bottleMasterRecords: BottleMasterRecord[];
  jobs: ProductionJob[];
  productionHistory: ProductionJob[];
  holidays: { holiday_date: string; holiday_name: string }[];
  planningEntries: DailyPlanningEntry[];
  totalRawMaterialConsumptionTons: number;
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

  saveJob: (jobData: Partial<ProductionJob>, packagingRows?: JobPackagingRow[]) => Promise<boolean>;
  deleteJob: (jobId: string) => boolean;
  updateJobInline: (
    jobId: string,
    patch: Partial<Pick<ProductionJob, 'sectionCount' | 'productionQuantity' | 'grossQuantity'>>
  ) => boolean;
  extendJob: (jobId: string, numberOfDays: number) => Promise<boolean>;
  refreshPlanner: () => void;
  reloadJobsForWindow: (from: string, to: string) => void;
  getBottleConfiguration: (machineId: string, bottleId: string, section: number) => BottleConfigurationRow | undefined;
  addBottle: (bottle: BottleMaster) => void;
  updateMachineStatus: (machineId: string, status: ISMachine['status']) => void;
  updateMachineSectionsCount: (machineId: string, sectionsCount: number) => void;
  importBottleMasterData: (records: BottleMasterRecord[]) => void;
  resetBottleMasterData: () => void;
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

/**
 * Maps raw production-job rows into the UI ProductionJob objects the planning
 * grid consumes. Shared by the window-scoped `jobs` (display) and the full
 * `productionHistory` (cumulative Qty source) so both use identical mapping.
 */
const mapRowsToProductionJobs = (rows: ProductionJobRow[]): ProductionJob[] => {
  if (rows.length === 0) return [];

  // Pre-compute the per-day/machine sequence once (O(n log n)) instead of
  // filtering + sorting the full row list for every job (O(n^2) before).
  const sequenceById = new Map<string, number>();
  const groups = new Map<string, ProductionJobRow[]>();
  for (const row of rows) {
    const key = `${row.plan_date}|${row.machine_no}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.start_time.localeCompare(b.start_time));
    group.forEach((job, index) => {
      const id = jobIdFromRow(job);
      // keep the first occurrence index, matching the original findIndex semantics
      if (!sequenceById.has(id)) sequenceById.set(id, index + 1);
    });
  }

  return rows.map((row) => {
    const config = planningRepository.getBottleConfiguration(row.machine_no, row.bottle_id, row.section);
    const resolvedWeight = config?.weight ?? row.weight;
    const resolvedCutSpeed = config?.speeds ?? row.speeds;
    const resolvedMetrics = calculateProductionMetrics(
      resolvedCutSpeed,
      resolvedWeight,
      row.machine_no,
      row.quantity
    );
    const resolvedEstimatedDays = calculateEstimatedCompletionDays(row.quantity, resolvedMetrics.totalQuantity);
    const startDateTime = parseDateTime(row.plan_date, row.start_time);
    const endDateTime = addCalendarDays(startDateTime, resolvedEstimatedDays);
    const resolvedEndDate = endDateTime.toISOString().split('T')[0];
    const resolvedEndTime = formatTimeOnly(endDateTime);
    const resolvedProductionHours = row.production_hours && row.production_hours > 0
      ? row.production_hours
      : (resolvedMetrics.hourlyQuantity > 0 ? Number((row.quantity / resolvedMetrics.hourlyQuantity).toFixed(2)) : 0);

    const sequenceNumber = sequenceById.get(jobIdFromRow(row)) ?? 0;

    return {
      id: jobIdFromRow(row),
      jobId: row.job_id,
      jobNumber: `JOB-${row.plan_date}-${row.machine_no}-${row.start_time}`,
      machineId: row.machine_no,
      bottleId: row.bottle_id,
      customerName: '',
      sectionCount: row.section,
      weightGrams: resolvedWeight,
      cutPerMin: resolvedCutSpeed,
      grossQuantity: row.quantity,
      producedQuantity: 0,
      remainingQuantity: row.quantity,
      drawTonsPerDay: resolvedMetrics.drawTons,
      startDate: row.plan_date,
      endDate: resolvedEndDate,
      status: schemaStatusToUiStatus(row.status),
      priority: 'Medium',
      packingCategory: 'Palletized',
      palletType: 'Wooden Standard (1200x1000)',
      remarks: '',
      date: row.plan_date,
      startTime: row.start_time,
      expectedEndTime: resolvedEndTime,
      completionTime: row.completion_time,
      productionQuantity: row.quantity,
      productionHours: resolvedProductionHours,
      requiredBottles: row.requiredBottles ?? null,
      linkedJobGroupId: `${row.machine_no}|${row.bottle_id}|${row.section}|${row.start_time}`,
      sequenceNumber,
      lifecycleStatus: row.status === 'Completed' ? 'COMPLETED' : 'ACTIVE',
      locked: row.status === 'Completed',
      changeoverHours: (row.changeover_minutes || 0) / 60,
      packaging: row.packaging,
    };
  });
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

const parseDateTime = (date: string, time: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const formatTimeOnly = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const getDerivedJobWindow = (job: ProductionJob): { start: Date; end: Date } => {
  const start = parseDateTime(job.date || job.startDate, job.startTime || '07:00');
  const dailyQty = calculateProductionMetrics(job.cutPerMin, job.weightGrams, job.machineId).totalQuantity;
  const durationDays = dailyQty > 0 ? (job.productionQuantity || job.grossQuantity) / dailyQty : 0;
  const end = addCalendarDays(start, durationDays);
  return { start, end };
};

const MODULE_TO_SLUG: Record<ActiveModule, string> = {
  'Production Planning': 'production',
  'Quality Control': 'quality',
  'Master Management': 'master-management',
  'Settings': 'settings',
  'Profile': 'profile',
  'Dashboard': 'dashboard',
};

const SLUG_TO_MODULE: Record<string, ActiveModule> = {
  production: 'Production Planning',
  quality: 'Quality Control',
  'master-management': 'Master Management',
  machines: 'Master Management',
  settings: 'Settings',
  profile: 'Profile',
  dashboard: 'Dashboard',
};

const getModuleFromHash = (): ActiveModule => {
  if (typeof window === 'undefined') return 'Production Planning';
  const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return SLUG_TO_MODULE[raw] || 'Production Planning';
};

const setHashForModule = (module: ActiveModule) => {
  if (typeof window === 'undefined') return;
  const slug = MODULE_TO_SLUG[module] || 'production';
  const targetHash = `/${slug}`;
  if (window.location.hash.replace(/^#/, '') !== targetHash) {
    window.history.replaceState(null, '', `#${targetHash}`);
  }
};

export const ERPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModuleState] = useState<ActiveModule>(getModuleFromHash);

  const setActiveModule = useCallback((mod: ActiveModule) => {
    setActiveModuleState(mod);
    setHashForModule(mod);
  }, []);

  // Listen for hashchange events (e.g. browser back/forward or manual hash change)
  useEffect(() => {
    const handleHashChange = () => {
      setActiveModuleState(getModuleFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Keep the URL hash in sync with the current module on every mount and on
  // every module change. This ensures the address bar is correct even after
  // a React StrictMode remount or an HMR-triggered remount, instead of only
  // updating when the user clicks a nav item.
  useEffect(() => {
    setHashForModule(activeModule);
  }, [activeModule]);

  const [searchQuery, setSearchQuery] = useState('');

  // Derive the default planning range dynamically from the current date so
  // defaults are always a rolling window around today (10 days before through
  // 20 days after), never a hardcoded value that becomes stale over time.
  const _bootNow = new Date();
  const _bootMonth = `${_bootNow.getFullYear()}-${String(_bootNow.getMonth() + 1).padStart(2, '0')}`;
  const _bootStartDate = new Date(_bootNow.getFullYear(), _bootNow.getMonth(), _bootNow.getDate() - 10);
  const _bootEndDate = new Date(_bootNow.getFullYear(), _bootNow.getMonth(), _bootNow.getDate() + 20);
  const _bootToIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const _bootRangeStart = _bootToIso(_bootStartDate);
  const _bootRangeEnd = _bootToIso(_bootEndDate);

  const [selectedMonth, setSelectedMonth] = useState(_bootMonth);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Tracks the date range that was passed to the last planningRepository.init() call.
  // All write-then-reinit paths use these to re-fetch the same window, not the full table.
  const [fetchWindowFrom, setFetchWindowFrom] = useState(_bootRangeStart);
  const [fetchWindowTo, setFetchWindowTo] = useState(_bootRangeEnd);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ProductionJob | null>(null);
  const [drawerDefaultMachineId, setDrawerDefaultMachineId] = useState<string | undefined>();
  const [drawerDefaultDate, setDrawerDefaultDate] = useState<string | undefined>();
  const [drawerSourceJobId, setDrawerSourceJobId] = useState<string | undefined>();
  const [drawerSuggestedStartTime, setDrawerSuggestedStartTime] = useState<string | undefined>();

  const [machineSectionOverrides, setMachineSectionOverrides] = useState<Record<string, number>>({});
  const [plannerVersion, setPlannerVersion] = useState(0);

  const [user] = useState({
    name: 'Omkar S.',
    email: 'omkar.s@vitrumglass.com',
    role: 'Chief Plant Production Manager',
    plantLocation: 'Furnace Line #2 - Vitrum Glass Ind.',
  });

  const refreshPlanner = useCallback(() => setPlannerVersion((v) => v + 1), []);

  /**
   * Fetches jobs scoped to [from, to], updates the fetch-window record,
   * and triggers a re-render so useMemo picks up the new cache.
   *
   * useCallback with [from, to] in the dep array means callers always get
   * the latest version — no stale-closure risk on the window values.
   */
  const reloadJobsForWindow = useCallback((from: string, to: string) => {
    setFetchWindowFrom(from);
    setFetchWindowTo(to);
    planningRepository.init(from, to).then(() => setPlannerVersion((v) => v + 1));
  }, []);

  // Fetch master data + jobs scoped to the default rolling planning range on
  // app boot. Uses the same _bootRangeStart/_bootRangeEnd computed above so the
  // initial fetch is always today's window regardless of when the app is deployed.
  useEffect(() => {
    planningRepository.init(_bootRangeStart, _bootRangeEnd).then(() => {
      // Force a re-render once cache is populated so useMemo picks up real data
      setPlannerVersion((v) => v + 1);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for external cache refreshes (e.g. after Machine Master or Bottle
  // Master saves) so the Planning Table picks up the new data automatically.
  useEffect(() => {
    let lastVersion = getCacheVersion();
    const interval = setInterval(() => {
      const currentVersion = getCacheVersion();
      if (currentVersion !== lastVersion) {
        lastVersion = currentVersion;
        setPlannerVersion((v) => v + 1);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const machines = useMemo<ISMachine[]>(() => {
    void plannerVersion;
    return planningRepository.getMachines().map((row) => {
      const sectionCap = Math.max(1, row.max_section);
      const sectionStart = Math.max(1, sectionCap - 2);
      const sectionOptions = Array.from({ length: sectionCap - sectionStart + 1 }, (_, i) => sectionStart + i);
      const selectedSections = machineSectionOverrides[row.machine_no] || row.max_section;
      const machineNo = Number((row.machine_no.match(/\d+/)?.[0]) || 0);
      const gobCount = Number.isFinite(Number(row.gob_count)) && Number(row.gob_count) > 0
        ? Number(row.gob_count)
        : (machineNo === 1 || machineNo === 4 ? 3 : 2);

      return {
        id: row.machine_no,
        name: getMachineDisplayName(row.machine_no),
        code: row.machine_no,
        gobCount,
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
    return mapRowsToProductionJobs(planningRepository.getProductionJobs());
  }, [plannerVersion]);

  /**
   * Complete production-job history (every job, every date) in chronological
   * order. The planning table uses this only to seed the cumulative Qty column
   * so a Job ID spanning a date-range boundary continues from its previous
   * accumulated value instead of restarting at zero.
   */
  const productionHistory = useMemo<ProductionJob[]>(() => {
    void plannerVersion;
    return mapRowsToProductionJobs(planningRepository.getFullProductionJobs());
  }, [plannerVersion]);

  const planningEntries = useMemo<DailyPlanningEntry[]>(() => {
    return jobs.map((job) => {
      const bottle = bottles.find((b) => b.id === job.bottleId);
      return {
        date: job.date || job.startDate,
        machineId: job.machineId,
        jobId: job.id,
        bottleName: bottle?.name || job.bottleId,
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

  const totalRawMaterialConsumptionTons = useMemo(() => {
    return jobs.reduce((sum, job) => sum + job.drawTonsPerDay, 0);
  }, [jobs]);

  // Holidays arrive with the master-data init fetch; expose them from the
  // cache so consumers don't issue a second /api/production/holidays call.
  const holidays = useMemo(() => {
    void plannerVersion;
    return planningRepository.getCachedHolidays();
  }, [plannerVersion]);

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

  const saveJob = async (jobData: Partial<ProductionJob>, packagingRows?: JobPackagingRow[]): Promise<boolean> => {
    const machine_no = jobData.machineId || drawerDefaultMachineId;
    const plan_date = jobData.date || jobData.startDate || drawerDefaultDate;
    const bottle_id = jobData.bottleId;
    const start_time = jobData.startTime || drawerSuggestedStartTime || '07:00';

    console.log('saveJob: start', { machine_no, plan_date, bottle_id, start_time });
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
    const resolvedConfig = planningRepository.getBottleConfiguration(machine_no, bottle_id, section);

    if (!resolvedConfig) {
      alert('No configuration found in bottle_configuration for selected machine and bottle.');
      return false;
    }

    const weight = resolvedConfig.weight;
    const speeds = resolvedConfig.speeds;
    const quantity = jobData.productionQuantity || jobData.grossQuantity || 0;
    const dailyMetrics = calculateProductionMetrics(speeds, weight, machine_no);
    const hourlyQty = dailyMetrics.hourlyQuantity;

    console.log('saveJob: dailyMetrics', dailyMetrics);
    
    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert('Quantity must be greater than zero.');
      return false;
    }

    if (hourlyQty <= 0) {
      alert('Unable to calculate hourly production for selected machine and bottle configuration.');
      return false;
    }

    const createSegmentRow = (segmentDate: string, segmentQuantity: number): ProductionJobRow => {
      const segmentHours = segmentQuantity / hourlyQty;
      const segmentMetrics = calculateProductionMetrics(speeds, weight, machine_no, segmentQuantity);
      const segmentStart = parseDateTime(segmentDate, start_time);
      const segmentEnd = addCalendarDays(segmentStart, segmentHours / 24);
      const segmentCompletion = formatTimeOnly(segmentEnd);

      return {
        job_id: editingJob?.jobId,
        plan_date: segmentDate,
        machine_no,
        bottle_id,
        section: resolvedConfig.section,
        weight,
        speeds,
        draw: segmentMetrics.drawTons,
        quantity: segmentQuantity,
        production_hours: Number(segmentHours.toFixed(2)),
        start_time,
        estimated_completion: segmentCompletion,
        completion_time: jobData.lifecycleStatus === 'COMPLETED' ? segmentCompletion : undefined,
        changeover_minutes: Math.round((jobData.changeoverHours || 0) * 60),
        status: uiStatusToSchemaStatus(jobData.status),
        packaging: packagingRows,
      };
    };

    console.log('saveJob: is editingJob?', !!editingJob);
    
    if (editingJob) {
      const row = createSegmentRow(plan_date, quantity);
      const updated = await planningRepository.updateProductionJob(
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
      const maxDayQuantity = dailyMetrics.totalQuantity;
      if (maxDayQuantity <= 0) {
        alert('Unable to calculate 24-hour production quantity for selected configuration.');
        return false;
      }

      const rows: ProductionJobRow[] = [];
      let remainingQuantity = Math.round(quantity);
      let dayOffset = 0;
      while (remainingQuantity > 0) {
        const segmentQuantity = Math.min(remainingQuantity, maxDayQuantity);
        const segmentDate = addDays(plan_date, dayOffset);
        rows.push(createSegmentRow(segmentDate, segmentQuantity));
        remainingQuantity -= segmentQuantity;
        dayOffset += 1;
      }

      console.log('saveJob: calculated rows', rows);
      const created = await planningRepository.createProductionJobsBatch(rows);
      console.log('saveJob: batch result', created);
      if (!created.ok) {
        alert(created.error || 'Unable to create production job.');
        return false;
      }
    }

    closeDrawer();
    // The repository already merged the persisted rows into the in-memory
    // cache, so we only need to re-render — no full-window API re-fetch.
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

    planningRepository.deleteProductionJob(
      job.date || job.startDate,
      job.machineId,
      job.startTime || '07:00'
    );
    refreshPlanner();
    return true;
  };

  const updateJobInline = (
    jobId: string,
    patch: Partial<Pick<ProductionJob, 'sectionCount' | 'productionQuantity' | 'grossQuantity'>>
  ): boolean => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return false;
    if (job.lifecycleStatus === 'COMPLETED' || job.locked) {
      alert('Completed or locked jobs cannot be edited.');
      return false;
    }

    const nextSection = patch.sectionCount ?? job.sectionCount;
    const resolvedConfig = planningRepository.getBottleConfiguration(job.machineId, job.bottleId, nextSection);
    if (!resolvedConfig) {
      alert('No bottle configuration found for the selected section.');
      return false;
    }

    const quantity = Math.round(
      patch.productionQuantity ?? patch.grossQuantity ?? job.productionQuantity ?? job.grossQuantity
    );

    const dailyMetrics = calculateProductionMetrics(
      resolvedConfig.speeds,
      resolvedConfig.weight,
      job.machineId
    );
    if (dailyMetrics.totalQuantity > 0 && quantity > dailyMetrics.totalQuantity) {
      alert(`A single planner row cannot exceed 24 hours. Max quantity for this row is ${dailyMetrics.totalQuantity.toLocaleString()}.`);
      return false;
    }

    const metrics = calculateProductionMetrics(
      resolvedConfig.speeds,
      resolvedConfig.weight,
      job.machineId,
      quantity
    );
    const productionHours = metrics.hourlyQuantity > 0 ? Number((quantity / metrics.hourlyQuantity).toFixed(2)) : 0;

    const result = planningRepository.patchProductionJob(
      {
        plan_date: job.date || job.startDate,
        machine_no: job.machineId,
        bottle_id: job.bottleId,
        section: job.sectionCount,
        start_time: job.startTime || '07:00',
      },
      {
        section: nextSection,
        weight: resolvedConfig.weight,
        speeds: resolvedConfig.speeds,
        quantity,
        draw: metrics.drawTons,
        production_hours: productionHours,
      }
    );

    if (!result.ok) {
      alert(result.error || 'Unable to update job.');
      return false;
    }

    refreshPlanner();
    return true;
  };

  const extendJob = async (jobId: string, numberOfDays: number): Promise<boolean> => {
    const source = jobs.find((j) => j.id === jobId);
    if (!source || numberOfDays < 1) return false;

    const days = Math.max(1, Math.min(10, Math.floor(numberOfDays) || 1));
    const planDate = source.date || source.startDate;
    if (!planDate) return false;

    const created = await planningRepository.extendProductionJob({
      plan_date: planDate,
      machine_no: source.machineId,
      start_time: source.startTime || '07:00',
      days,
    });

    if (!created.ok) {
      alert(created.error || 'Failed to extend production job.');
      refreshPlanner();
      return false;
    }

    refreshPlanner();
    return true;
  };



  const getBottleConfiguration = (machineId: string, bottleId: string, section: number) =>
    planningRepository.getBottleConfiguration(machineId, bottleId, section);

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

  return (
    <ERPContext.Provider
      value={{
        activeModule,
        setActiveModule,
        machines,
        bottles,
        bottleMasterRecords,
        jobs,
        productionHistory,
        holidays,
        planningEntries,
        totalRawMaterialConsumptionTons,
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
        refreshPlanner,
        reloadJobsForWindow,
        getBottleConfiguration,
        addBottle,
        updateMachineStatus,
        updateMachineSectionsCount,
        importBottleMasterData,
        resetBottleMasterData,
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
