export type BottleColor = 'Flint' | 'Amber' | 'Emerald Green' | 'Cobalt Blue' | 'Olive Green';

export type SectionType = 'Single Gob' | 'Double Gob' | 'Triple Gob' | 'Quad Gob';

export type JobStatus = 'Planned' | 'Running' | 'Completed' | 'Hold' | 'Pending' | 'Changeover';

export type JobPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type PlanningLifecycleStatus = 'ACTIVE' | 'COMPLETED';

export type PackingCategory = 'Palletized' | 'Carton Pack' | 'Shrink Wrapped' | 'Bulk Tray';

export type PalletType = 'Wooden Standard (1200x1000)' | 'Euro Pallet (1200x800)' | 'Plastic Heavy Duty' | 'Heat Treated Export';

export interface BottleMasterRecord {
  id: string;
  mch: string; // Machine Name e.g. "Machine No. 1" or ID "MAC-01"
  bottleName: string; // e.g. "750ml Bordeaux Wine Heavy"
  section: number; // e.g. 6, 7, 8, 9, 10
  weightGrams: number; // Wt (grams)
  speed: number; // Speeds (cuts per min)
  drawingNumber?: string;
  capacityMl?: number;
  color?: BottleColor;
  customerName?: string;
  category?: 'Wine' | 'Beer' | 'Spirits' | 'Pharma' | 'Beverage' | 'Food Jar';
}

export interface BottleMaster {
  id: string;
  name: string;
  drawingNumber: string;
  weightGrams: number;
  capacityMl: number;
  color: BottleColor;
  sectionType: SectionType;
  standardCutPerMin: number;
  customerName: string;
  category: 'Wine' | 'Beer' | 'Spirits' | 'Pharma' | 'Beverage' | 'Food Jar';
}

export interface ISMachine {
  id: string;
  name: string;
  code: string;
  gobCount: number;
  sectionsCount: number; // Current active section count
  defaultSectionsCount: number; // Default section count (8 or 10)
  availableSections: number[]; // Configurable section options e.g. [6,7,8] or [8,9,10]
  sectionType: SectionType;
  status: 'Running' | 'Stopped' | 'Maintenance' | 'Changeover';
  currentJobId?: string;
  feederTemperatureC: number; // e.g. 1180°C
  gobCutSpeed: number; // cuts per min
  oeePercent: number; // e.g. 88.5%
  packRatePercent: number; // e.g. 89.2%
  dailyTargetTons: number;
}

export interface ProductionJob {
  id: string;
  jobNumber: string; // e.g. JOB-2026-089
  machineId: string;
  bottleId: string;
  customerName: string;
  sectionCount: number; // Sections used
  weightGrams: number;
  cutPerMin: number;
  grossQuantity: number; // Target quantity in pcs
  producedQuantity: number; // Actual produced so far
  remainingQuantity: number;
  drawTonsPerDay: number; // Calculated tons/day
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: JobStatus;
  priority: JobPriority;
  packingCategory: PackingCategory;
  palletType: PalletType;
  changeoverHours?: number; // e.g. 4.5 hours if Changeover
  remarks?: string;

  // Scheduler-specific fields (single-day planning unit)
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  expectedEndTime?: string; // HH:mm
  completionTime?: string; // Actual completion from backend (YYYY-MM-DDTHH:mm)
  productionQuantity?: number; // Planned quantity for this specific day job
  productionHours?: number; // Planned production hours for this specific day job (max 24)
  linkedJobGroupId?: string;
  sequenceNumber?: number; // Vertical stack order inside machine-day cell
  lifecycleStatus?: PlanningLifecycleStatus;
  locked?: boolean;
}

export interface DailyPlanningEntry {
  date: string; // YYYY-MM-DD
  machineId: string;
  jobId: string;
  bottleName: string;
  bottleColor: BottleColor;
  drawingNumber: string;
  section: number;
  weightGrams: number;
  cutPerMin: number;
  dayQuantity: number;
  drawTons: number;
  status: JobStatus;
  changeoverHours?: number;
}

export interface ShiftProductionReport {
  id: string;
  date: string;
  shift: 'Shift A (06:00 - 14:00)' | 'Shift B (14:00 - 22:00)' | 'Shift C (22:00 - 06:00)';
  machineId: string;
  grossPcs: number;
  packedPcs: number;
  rejectedPcs: number;
  packRate: number; // %
  topDefect: string;
  gobTempC: number;
  lehrTempC: number;
  operatorName: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: 'Raw Material' | 'Cullet' | 'Finished Goods' | 'Packing Material' | 'Mold Spares';
  stockQuantity: number;
  unit: 'Tons' | 'Pallets' | 'Pcs' | 'Sets' | 'Rolls';
  minReorderLevel: number;
  location: string;
  status: 'In Stock' | 'Low Stock' | 'Critical';
}

export interface QualityInspection {
  id: string;
  inspectionTime: string;
  machineId: string;
  bottleName: string;
  checkDefectCount: number; // Cracks
  blisterCount: number;
  stoneCount: number;
  moldMarkCount: number;
  dimensionPassRate: number; // %
  thermalShockPassed: boolean;
  pressureTestBar: number;
  inspectorName: string;
  status: 'PASSED' | 'WARNING' | 'REJECTED';
}

export interface DispatchOrder {
  id: string;
  dispatchNo: string;
  customerName: string;
  bottleName: string;
  bottleColor: BottleColor;
  palletsCount: number;
  totalQuantityPcs: number;
  truckNumber: string;
  driverName: string;
  gatePassNo: string;
  dispatchDate: string;
  status: 'Scheduled' | 'Loading' | 'Dispatched' | 'Delivered';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'alert' | 'success' | 'warning' | 'info';
  read: boolean;
}

export type ActiveModule =
  | 'Dashboard'
  | 'Production Planning'
  | 'Machines'
  | 'Settings'
  | 'Profile';
