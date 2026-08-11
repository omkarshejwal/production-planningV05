import { BottleEntry, DateRow, MachineEntry, MachineLists } from '../types/planning';
import { BOTTLE_SPEEDS, MACHINE_BOTTLES, NONE_ENTRY } from '../data/bottleReference';
import { calculateDraw, calculateProductionMetrics } from './calculations';

export const PRODUCTION_DAY_START_HOUR = 7;
export const PRODUCTION_DAY_DURATION_HOURS = 24;

const toDateParts = (value: Date | string): { year: number; month: number; day: number } => {
  if (value instanceof Date) {
    return {
      year: value.getFullYear(),
      month: value.getMonth(),
      day: value.getDate(),
    };
  }

  const trimmed = String(value).trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]) - 1,
      day: Number(isoMatch[3]),
    };
  }

  const displayMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!displayMatch) {
    const parsed = new Date(trimmed);
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth(),
      day: parsed.getDate(),
    };
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = monthNames.indexOf(displayMatch[2]);
  return {
    year: Number(displayMatch[3]),
    month: monthIndex >= 0 ? monthIndex : 0,
    day: Number(displayMatch[1]),
  };
};

const parseClockTime = (timeValue?: string): { hours: number; minutes: number } => {
  const raw = (timeValue || '07:00').trim();
  const [hoursRaw, minutesRaw] = raw.split(':');
  const hours = Number(hoursRaw) || 0;
  const minutes = Number(minutesRaw) || 0;
  return { hours, minutes };
};

const buildDateTime = (dayValue: Date | string, timeValue?: string): Date => {
  const day = typeof dayValue === 'string' ? new Date(dayValue) : new Date(dayValue);
  const { hours, minutes } = parseClockTime(timeValue);
  day.setHours(hours, minutes, 0, 0);
  if (hours < PRODUCTION_DAY_START_HOUR) {
    day.setDate(day.getDate() - 1);
  }
  return day;
};

const getProductionDayWindow = (dayValue: Date | string) => {
  const day = typeof dayValue === 'string' ? new Date(dayValue) : new Date(dayValue);
  const windowStart = new Date(day);
  windowStart.setHours(PRODUCTION_DAY_START_HOUR, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 1);
  return { windowStart, windowEnd };
};

const clampIntervalToWindow = (start: Date, end: Date, windowStart: Date, windowEnd: Date): number => {
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd <= overlapStart) return 0;
  return (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
};

export function calculateDrawForProductionHours(
  cutPerMin: number,
  weightGrams: number,
  productionHours: number,
  machineNo?: string | number
): number {
  const safeHours = Number.isFinite(productionHours) && productionHours > 0 ? productionHours : 0;
  if (safeHours <= 0) return 0;
  const metrics = calculateProductionMetrics(cutPerMin, weightGrams, machineNo);
  const drawRatePer24Hours = metrics.totalQuantity > 0 ? calculateDraw(metrics.totalQuantity, weightGrams) : 0;
  return drawRatePer24Hours > 0 ? drawRatePer24Hours * (safeHours / PRODUCTION_DAY_DURATION_HOURS) : 0;
}

export function calculateDrawForProductionDay(
  dayValue: Date | string,
  entry: Pick<MachineEntry, 'cut' | 'wt' | 'qty' | 'requiredBottles' | 'startTime' | 'endTime'>,
  machineNo?: string | number
): number {
  const { windowStart, windowEnd } = getProductionDayWindow(dayValue);
  const productionStart = buildDateTime(dayValue, entry.startTime || '07:00');
  const productionEnd = entry.endTime
    ? buildDateTime(dayValue, entry.endTime)
    : new Date(windowEnd);

  if (productionEnd <= productionStart) {
    return 0;
  }

  const productionHours = clampIntervalToWindow(productionStart, productionEnd, windowStart, windowEnd);
  if (productionHours <= 0) return 0;

  const requiredQty = entry.requiredBottles && entry.requiredBottles > 0 ? entry.requiredBottles : entry.qty;
  const metrics = calculateProductionMetrics(entry.cut, entry.wt, machineNo);
  const hourlyQuantity = metrics.totalQuantity > 0 ? metrics.totalQuantity / PRODUCTION_DAY_DURATION_HOURS : 0;
  const hoursNeededToMeetQty = hourlyQuantity > 0 && requiredQty > 0 ? requiredQty / hourlyQuantity : 0;
  const effectiveHours = Math.min(productionHours, hoursNeededToMeetQty);
  return calculateDrawForProductionHours(entry.cut, entry.wt, effectiveHours, machineNo);
}

export function calculateDailyDrawForEntries(
  dayValue: Date | string,
  entries: Array<Pick<MachineEntry, 'cut' | 'wt' | 'qty' | 'requiredBottles' | 'startTime' | 'endTime'> & { machineNo?: string | number }>
): number {
  const { windowStart, windowEnd } = getProductionDayWindow(dayValue);
  const sortedEntries = entries
    .filter((entry) => entry && (entry.cut > 0 || entry.wt > 0 || entry.qty > 0))
    .map((entry) => ({
      ...entry,
      productionStart: buildDateTime(dayValue, entry.startTime || '07:00'),
      productionEnd: entry.endTime
        ? buildDateTime(dayValue, entry.endTime)
        : new Date(windowEnd),
    }))
    .sort((a, b) => a.productionStart.getTime() - b.productionStart.getTime());

  let totalDraw = 0;

  sortedEntries.forEach((entry, index) => {
    const productionStart = entry.productionStart;
    const productionEnd = entry.productionEnd;
    const segmentStart = productionStart > windowStart ? productionStart : windowStart;
    const segmentEnd = productionEnd < windowEnd ? productionEnd : windowEnd;

    if (segmentEnd > segmentStart) {
      const productionHours = (segmentEnd.getTime() - segmentStart.getTime()) / (1000 * 60 * 60);
      const requiredQty = entry.requiredBottles && entry.requiredBottles > 0 ? entry.requiredBottles : entry.qty;
      const metrics = calculateProductionMetrics(entry.cut, entry.wt, entry.machineNo);
      const hourlyQuantity = metrics.totalQuantity > 0 ? metrics.totalQuantity / PRODUCTION_DAY_DURATION_HOURS : 0;
      const hoursNeededToMeetQty = hourlyQuantity > 0 && requiredQty > 0 ? requiredQty / hourlyQuantity : 0;
      const effectiveHours = Math.min(productionHours, hoursNeededToMeetQty);
      totalDraw += calculateDrawForProductionHours(entry.cut, entry.wt, effectiveHours, entry.machineNo);
    }

    const nextEntry = sortedEntries[index + 1];
    if (!nextEntry) return;

    const nextStart = nextEntry.productionStart;
    const changeoverStart = productionEnd > windowStart ? productionEnd : windowStart;
    const changeoverEnd = nextStart < windowEnd ? nextStart : windowEnd;
    const effectiveChangeoverStart = changeoverStart > windowStart ? changeoverStart : windowStart;
    const effectiveChangeoverEnd = changeoverEnd < windowEnd ? changeoverEnd : windowEnd;
    if (effectiveChangeoverEnd > effectiveChangeoverStart) {
      const changeoverHours = (effectiveChangeoverEnd.getTime() - effectiveChangeoverStart.getTime()) / (1000 * 60 * 60);
      const previousMetrics = calculateProductionMetrics(entry.cut, entry.wt, entry.machineNo);
      const previousDrawRatePer24Hours = previousMetrics.totalQuantity > 0 ? calculateDraw(previousMetrics.totalQuantity, entry.wt) : 0;
      totalDraw += previousDrawRatePer24Hours > 0 ? previousDrawRatePer24Hours * (changeoverHours / PRODUCTION_DAY_DURATION_HOURS) : 0;
    }
  });

  return Number(totalDraw.toFixed(2));
}

// Machine 1 & 4 → max 8 sections, Machine 2 & 3 → max 10 sections (mIdx is 0-based)
export const MAX_SECTIONS = (mIdx: number) => (mIdx === 0 || mIdx === 3) ? 8 : 10;

// Cut per Section = speeds (shown as "Cut" in the table) ÷ number of sections
export const calcCutPerSection = (speeds: number, sections: number): number =>
  sections > 0 ? Math.round((speeds / sections) * 100) / 100 : 0;

// Valid section options per machine (mIdx 0-based)
export const VALID_SECTIONS = (mIdx: number): number[] =>
  (mIdx === 0 || mIdx === 3) ? [6, 7, 8] : [8, 9, 10];

// Exact cut speed from master sheet; falls back to MACHINE_BOTTLES speed
export const lookupSpeed = (machineNo: number, bottleName: string, section: number): number => {
  return BOTTLE_SPEEDS[machineNo]?.[bottleName]?.[section] ?? 0;
};

export function lookupBottle(machineNo: number, name: string): BottleEntry {
  if (name === "None") return NONE_ENTRY;
  return MACHINE_BOTTLES[machineNo]?.find(b => b.name === name) ?? NONE_ENTRY;
}

// Module-level entry ID counter
let _eid = 1;
export const nextEid = () => _eid++;

export function calcQty(cut: number, machineNo: number): number {
  return calculateProductionMetrics(cut, 0, machineNo).totalQuantity;
}

export function calcGoodBottles(totalQuantity: number): number {
  return totalQuantity > 0 ? Math.round(totalQuantity * 0.9) : 0;
}

export function calcGoodLiters(goodBottles: number): number {
  return goodBottles > 0 ? goodBottles / 100000 : 0;
}

export function calcProductionMetrics(cut: number, weightGrams: number, machineNo: number): {
  totalQuantity: number;
  goodBottles: number;
  drawTons: number;
  goodLiters: number;
} {
  const metrics = calculateProductionMetrics(cut, weightGrams, machineNo);
  return {
    totalQuantity: metrics.totalQuantity,
    goodBottles: metrics.goodBottles,
    drawTons: metrics.drawTons,
    goodLiters: metrics.goodLiters,
  };
}

// Add hours to a "HH:MM" 24-h string, wrapping at 24 h (shift day is 07:00–06:59).
export function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h * 60 + m + hours * 60) % (24 * 60);
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

// Add minutes to a "HH:MM" 24-h string, wrapping at 24 h.
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h * 60 + m + minutes) % (24 * 60);
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

// Returns true if the given "HH:MM" 24-h time falls within the overnight
// portion of a shift (00:00–06:59) — i.e. it belongs to the PREVIOUS calendar day.
export function isOvernightShift(time: string): boolean {
  const [h] = time.split(":").map(Number);
  return h < 7;
}

// Draw in metric tons per day: (bottle weight g × daily qty bottles) ÷ 1,000,000
export function calcDraw(wt: number, qty: number): number {
  return calculateDraw(qty, wt);
}

export function makeEntry(name: string, machineNo: number): MachineEntry {
  const b = lookupBottle(machineNo, name);
  const cut = b.speeds > 0 ? b.speeds : 0;
  const qty = calcQty(cut, machineNo);
  const draw = calcDraw(b.wt, qty);
  return {
    eid: nextEid(),
    product: b.name,
    wt: b.wt,
    speeds: b.speeds,
    cut,
    draw,
    qty,
  };
}

export function makeBlankEntry(mIdx = 0): MachineEntry {
  return { eid: nextEid(), product: "", wt: 0, speeds: 0, cut: 0, draw: 0, qty: 0, isBlank: true, salesExec: "", packingCategory: "", palletPacking: null, section: MAX_SECTIONS(mIdx) };
}

export function makeNoneEntry(mIdx = 0): MachineEntry {
  return { eid: nextEid(), product: "None", wt: 0, speeds: 0, cut: 0, draw: 0, qty: 0, salesExec: "", packingCategory: "", palletPacking: null, section: MAX_SECTIONS(mIdx) };
}

// ─── Initial Data ─────────────────────────────────────────────────────────────

// Auto-generate every date of the current month
const _now = new Date();
export const _year = _now.getFullYear();
export const _month = _now.getMonth();
const NUM_ROWS = new Date(_year, _month + 1, 0).getDate(); // days in current month

export const INITIAL_DATE_ROWS: DateRow[] = Array.from({ length: NUM_ROWS }, (_, i) => {
  const d = new Date(_year, _month, i + 1);
  return {
    id: i + 1,
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    isoDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
});


export const INITIAL_MACHINE_LISTS: MachineLists = [
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(0)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(1)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(2)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(3)),
];
