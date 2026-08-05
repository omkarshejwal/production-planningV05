import { DailyPlanningEntry, ISMachine, ProductionJob } from '../types';

/**
 * Calculates Glass Melt Draw in Metric Tons Per Day
 * Formula: (Cut/min * 60 min/hr * 24 hrs/day * Weight in Grams) / 1,000,000 g/Ton
 */
export function calculateDrawTonsPerDay(
  cutPerMin: number,
  sectionsOrWeight: number,
  weightGrams?: number
): number {
  const resolvedWeight = weightGrams ?? sectionsOrWeight;
  if (!cutPerMin || !resolvedWeight) return 0;
  const totalGrams = cutPerMin * 60 * 24 * resolvedWeight;
  return Number((totalGrams / 1000000).toFixed(2));
}

/**
 * Calculates good bottles per day using a 90% yield.
 */
export function calculateGoodBottlesPerDay(cutPerMin: number): number {
  if (!cutPerMin) return 0;
  return Math.round(calculateDailyProductionPcs(cutPerMin) * 0.9);
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
 * Calculates Gross Day Production Quantity in Pieces
 * Formula: Cut/min * 60 * 24 * Sections
 */
export function calculateGrossDayQuantity(cutPerMin: number, sections: number): number {
  if (!cutPerMin || !sections) return 0;
  return Math.round(cutPerMin * 60 * 24 * sections);
}

/**
 * Calculates Bottles Per Minute
 * Formula: Production Speed (Cut/min) * Sections
 */
export function calculateBottlesPerMin(speed: number, sections: number): number {
  if (!speed || !sections) return 0;
  return speed * sections;
}

/**
 * Calculates Bottles Per Hour
 * Formula: Speed * Sections * 60 min
 */
export function calculateBottlesPerHour(speed: number, sections: number): number {
  if (!speed || !sections) return 0;
  return speed * sections * 60;
}

/**
 * Calculates Daily Production in Pieces (24 hours).
 * When sections are supplied, preserves the legacy section-aware behavior.
 */
export function calculateDailyProductionPcs(speed: number, sections?: number): number {
  if (!speed) return 0;
  if (!sections) return Math.round(speed * 60 * 24);
  return Math.round(speed * sections * 60 * 24);
}

/**
 * Calculates Daily Production in Metric Tons
 */
export function calculateDailyProductionTons(speed: number, sections: number, weightGrams: number): number {
  if (!speed || !sections || !weightGrams) return 0;
  const totalGrams = speed * sections * 60 * 24 * weightGrams;
  return Number((totalGrams / 1000000).toFixed(2));
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
export function calculateProductionDuration(remainingQuantity: number, speed: number, sections: number): { days: number; hours: number; durationText: string } {
  const bpm = calculateBottlesPerHour(speed, sections);
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
  sections: number
): string {
  if (!startDateStr || !grossQuantity || !cutPerMin || !sections) return startDateStr;
  const dailyPcs = calculateGrossDayQuantity(cutPerMin, sections);
  if (dailyPcs <= 0) return startDateStr;
  const daysNeeded = Math.ceil(grossQuantity / dailyPcs);
  
  const start = new Date(startDateStr);
  start.setDate(start.getDate() + daysNeeded);
  return start.toISOString().split('T')[0];
}

/**
 * Format numbers with commas (e.g. 125,000)
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}

/**
 * Format decimal numbers (e.g. 12.50)
 */
export function formatDecimal(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
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
