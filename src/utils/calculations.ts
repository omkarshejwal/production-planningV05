import { DailyPlanningEntry, ISMachine, ProductionJob } from '../types';

export interface ProductionMetrics {
  totalQuantity: number;
  goodBottles: number;
  goodLiters: number;
  drawTons: number;
  drawQuantity: number;
  hourlyQuantity: number;
  machineGob: number;
}

export const MACHINE_GOB_COUNTS: Record<number, number> = {
  1: 3,
  2: 2,
  3: 2,
  4: 3,
};

export function calculateDraw(quantity: number, weightGrams: number): number {
  const safeQuantity = normalizePositive(quantity);
  const safeWeight = normalizePositive(weightGrams);
  return safeQuantity > 0 && safeWeight > 0
    ? Number(((safeQuantity * safeWeight) / 1000000).toFixed(2))
    : 0;
}

const normalizePositive = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
};

const resolveMachineNumber = (machineNo?: string | number): number | null => {
  if (machineNo === undefined || machineNo === null) return null;
  if (typeof machineNo === 'number') return Number.isFinite(machineNo) ? machineNo : null;
  const digits = machineNo.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const parsed = Number(digits[digits.length - 1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveMachineGob = (
  machine?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): number => {
  if (machine && typeof machine === 'object') {
    const explicitGob = Number(machine.gobCount);
    if (Number.isFinite(explicitGob) && explicitGob > 0) {
      return explicitGob;
    }
    const fromId = resolveMachineNumber(machine.id);
    if (fromId !== null && MACHINE_GOB_COUNTS[fromId]) {
      return MACHINE_GOB_COUNTS[fromId];
    }
    return 1;
  }

  const machineNumber = resolveMachineNumber(machine as string | number);
  if (machineNumber === null) return 1;
  return MACHINE_GOB_COUNTS[machineNumber] ?? 1;
};

export function calculateProductionMetrics(
  cutPerMin: number,
  weightGrams: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>,
  requiredQuantity?: number
): ProductionMetrics {
  const safeCut = normalizePositive(cutPerMin);
  const safeWeight = normalizePositive(weightGrams);
  const machineGob = resolveMachineGob(machineNo);

  const totalQuantity = safeCut > 0
    ? Math.round(safeCut * machineGob * 60 * 24)
    : 0;
  const requiredQty = normalizePositive(requiredQuantity ?? 0);
  const drawQuantity = requiredQty > 0 ? Math.round(requiredQty) : totalQuantity;
  const goodBottles = totalQuantity > 0 ? Math.round(totalQuantity * 0.90) : 0;
  const drawTons = calculateDraw(drawQuantity, safeWeight);

  return {
    totalQuantity,
    goodBottles,
    goodLiters: goodBottles > 0 ? Number((goodBottles / 100000).toFixed(2)) : 0,
    drawTons,
    drawQuantity,
    hourlyQuantity: totalQuantity > 0 ? Math.round(totalQuantity / 24) : 0,
    machineGob,
  };
}

/**
 * Calculates Glass Melt Draw in Metric Tons Per Day
 * Formula: (Cut/min * 60 min/hr * 24 hrs/day * Weight in Grams) / 1,000,000 g/Ton
 */
export function calculateDrawTonsPerDay(
  cutPerMin: number,
  weightGrams: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>,
  requiredQuantity?: number
): number {
  return calculateProductionMetrics(cutPerMin, weightGrams, machineNo, requiredQuantity).drawTons;
}

/**
 * Calculates good bottles per day using a 90% yield.
 */
export function calculateGoodBottlesPerDay(
  cutPerMin: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): number {
  return calculateProductionMetrics(cutPerMin, 0, machineNo).goodBottles;
}

/**
 * Calculates estimated production days from required bottles and good bottles per day.
 */
export function calculateEstimatedCompletionDays(requiredBottles: number, goodBottlesPerDay: number): number {
  if (!requiredBottles || !goodBottlesPerDay) return 0;
  return Number((requiredBottles / goodBottlesPerDay).toFixed(2));
}

/**
 * Formats a date/time pair in a human readable form.
 */
export function formatDateTime(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Calculates Gross Day Production Quantity in Pieces.
 * Uses machine gob count when machineNo is provided; otherwise falls back to sections.
 */
export function calculateGrossDayQuantity(
  cutPerMin: number,
  sections?: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): number {
  if (!cutPerMin) return 0;
  if (machineNo !== undefined) {
    return calculateProductionMetrics(cutPerMin, 0, machineNo).totalQuantity;
  }
  if (!sections) return 0;
  return Math.round(cutPerMin * sections * 60 * 24);
}

/**
 * Calculates Bottles Per Minute.
 * Uses machine gob count when machineNo is provided; otherwise falls back to sections.
 */
export function calculateBottlesPerMin(
  speed: number,
  sections?: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): number {
  if (!speed) return 0;
  const gob = machineNo !== undefined ? resolveMachineGob(machineNo) : 0;
  if (gob > 0) return speed * gob;
  if (!sections) return 0;
  return speed * sections;
}

/**
 * Calculates Bottles Per Hour.
 * Uses machine gob count when machineNo is provided; otherwise falls back to sections.
 */
export function calculateBottlesPerHour(
  speed: number,
  sections?: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): number {
  return calculateBottlesPerMin(speed, sections, machineNo) * 60;
}

/**
 * Calculates Daily Production in Pieces (24 hours).
 * When sections are supplied, preserves the legacy section-aware behavior.
 */
export function calculateDailyProductionPcs(speed: number, sections?: number, machineNo?: string | number): number {
  if (!speed) return 0;
  const hasKnownMachine = machineNo !== undefined && machineNo !== null && resolveMachineNumber(machineNo) !== null;
  if (hasKnownMachine) return calculateProductionMetrics(speed, 0, machineNo).totalQuantity;
  if (!sections) return Math.round(speed * 60 * 24);
  return Math.round(speed * sections * 60 * 24);
}

/**
 * Calculates Daily Production in Metric Tons
 */
export function calculateDailyProductionTons(speed: number, sections: number, weightGrams: number): number {
  if (!speed || !weightGrams) return 0;
  const totalQuantity = sections > 0
    ? speed * sections * 60 * 24
    : calculateProductionMetrics(speed, weightGrams).totalQuantity;
  return calculateDraw(totalQuantity, weightGrams);
}

/**
 * Calculates Remaining Quantity for a Job
 */
export function calculateRemainingQuantity(grossTarget: number, produced: number): number {
  const remaining = grossTarget - produced;
  return remaining > 0 ? remaining : 0;
}

/**
 * Calculates Production Duration in Days and Hours
 */
export function calculateProductionDuration(
  remainingQuantity: number,
  speed: number,
  sections?: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): { days: number; hours: number; durationText: string } {
  const bpm = calculateBottlesPerHour(speed, sections, machineNo);
  if (bpm <= 0 || remainingQuantity <= 0) {
    return { days: 0, hours: 0, durationText: '0d 0h' };
  }
  const totalHours = remainingQuantity / bpm;
  const days = Math.floor(totalHours / 24);
  const remainingHours = Math.round(totalHours % 24);
  return {
    days,
    hours: remainingHours,
    durationText: `${days}d ${remainingHours}h (${formatDecimal(totalHours, 1)} hrs)`,
  };
}

/**
 * Calculates Estimated Completion Date based on current rate
 */
export function calculateEstimatedCompletionDate(
  startDateStr: string,
  grossQuantity: number,
  cutPerMin: number,
  sections?: number,
  machineNo?: string | number | Pick<ISMachine, 'gobCount' | 'id'>
): string {
  if (!startDateStr || !grossQuantity || !cutPerMin) return startDateStr;
  const dailyPcs = calculateGrossDayQuantity(cutPerMin, sections, machineNo);
  if (dailyPcs <= 0) return startDateStr;
  const daysNeeded = Math.ceil(grossQuantity / dailyPcs);

  const start = new Date(startDateStr);
  start.setDate(start.getDate() + daysNeeded);
  return start.toISOString().split('T')[0];
}

export function addCalendarDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  if (!Number.isFinite(days) || days === 0) return nextDate;

  const wholeDays = days >= 0 ? Math.floor(days) : Math.ceil(days);
  const fractionalDays = days - wholeDays;

  nextDate.setDate(nextDate.getDate() + wholeDays);
  if (fractionalDays !== 0) {
    nextDate.setMinutes(nextDate.getMinutes() + fractionalDays * 24 * 60);
  }
  return nextDate;
}

/**
 * Format numbers with commas (e.g. 125,000)
 */
export function formatNumber(num: number): string {
  const safeNumber = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US').format(Math.round(safeNumber));
}

/**
 * Format decimal numbers (e.g. 12.50)
 */
export function formatDecimal(num: number, decimals: number = 2): string {
  const safeNumber = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeNumber);
}

/**
 * Date formatter (e.g. 01 Aug 2026)
 */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Generate full month dates array for August 2026 or any target month
 */
export function generateMonthDates(year: number = 2026, monthIndex: number = 7): string[] {
  // monthIndex 7 = August (0-indexed)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const dates: string[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const dayStr = i < 10 ? `0${i}` : `${i}`;
    const monthStr = monthIndex + 1 < 10 ? `0${monthIndex + 1}` : `${monthIndex + 1}`;
    dates.push(`${year}-${monthStr}-${dayStr}`);
  }
  return dates;
}

/**
 * Export data to Excel/CSV format and initiate download
 */
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent =
    'data:text/csv;charset=utf-8,' +
    [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Triggers Browser Print Mode optimized for ERP reports
 */
export function printPage() {
  window.print();
}
