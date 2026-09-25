import { BottleEntry, DateRow, MachineEntry, MachineLists } from '../types/planning';
import { calculateDraw, calculateProductionMetrics, resolveMachineNumber, getGobCountFromDB } from './calculations';
import { BottleConfigurationRow } from '../data/planningSchema';
import { planningRepository } from '../services/planningRepository';

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
  return calculateDrawForProductionHours(entry.cut, entry.wt, PRODUCTION_DAY_DURATION_HOURS, machineNo);
}

export function calculateQuantityForProductionDay(
  dayValue: Date | string,
  entry: Pick<MachineEntry, 'cut' | 'wt' | 'qty' | 'requiredBottles' | 'startTime' | 'endTime'>,
  machineNo?: string | number
): number {
  const { windowStart, windowEnd } = getProductionDayWindow(dayValue);
  const jobStartTime = buildDateTime(dayValue, entry.startTime || '07:00');
  const productionEnd = entry.endTime
    ? buildDateTime(dayValue, entry.endTime)
    : new Date(windowEnd);

  while (productionEnd <= jobStartTime) {
    productionEnd.setDate(productionEnd.getDate() + 1);
  }

  // Clamp to production day window [7AM, next 7AM]
  const productionHours = clampIntervalToWindow(jobStartTime, productionEnd, windowStart, windowEnd);
  if (productionHours <= 0) return 0;

  // Partial Qty = Full 24-Hour Qty × Production Hours / 24
  // Use actual production hours only — no hoursNeededToMeetQty cap.
  return (entry.cut > 0 && entry.wt > 0 && productionHours > 0)
    ? Number(((entry.cut * (machineNo !== undefined ? getGobCountFromDB(resolveMachineNumber(machineNo) ?? 1) : 1) * 60 * productionHours)).toFixed(0))
    : 0;
}

export function calculateDailyDrawForEntries(
  dayValue: Date | string,
  entries: Array<Pick<MachineEntry, 'cut' | 'wt' | 'qty' | 'requiredBottles' | 'startTime' | 'endTime'> & { machineNo?: string | number }>
): number {
  let totalDraw = 0;

  for (const entry of entries) {
    if (!entry || (entry.cut <= 0 && entry.wt <= 0 && (entry.qty ?? 0) <= 0)) continue;
    totalDraw += calculateDrawForProductionHours(entry.cut, entry.wt, PRODUCTION_DAY_DURATION_HOURS, entry.machineNo);
  }

  return Number(totalDraw.toFixed(2));
}

// ─── Dynamic lookups from machine_master + bottle_configuration (DB is source of truth) ──

const FALLBACK_MAX_SECTIONS = (mIdx: number) => (mIdx === 0 || mIdx === 3) ? 8 : 10;

/**
 * Max sections for a machine — reads the highest section from getMachineSections.
 */
export const MAX_SECTIONS = (mIdx: number): number => {
  const sections = VALID_SECTIONS(mIdx);
  if (sections.length > 0) return sections[sections.length - 1];
  return FALLBACK_MAX_SECTIONS(mIdx);
};

/**
 * Valid section options for a machine.
 * Uses planningRepository.getMachineSections which always includes base sections
 * plus any user-added sections from the database.
 */
export const VALID_SECTIONS = (mIdx: number): number[] => {
  const machineId = `MAC-${String(mIdx + 1).padStart(2, '0')}`;
  return planningRepository.getMachineSections(machineId);
};

/**
 * Returns the sections that actually have a bottle_configuration row for the
 * exact machine + bottle pair, intersected with the machine's valid sections.
 *
 * The Planning table's Section dropdown uses this so that every selectable
 * section maps to a real saved speed for that bottle + machine + section.
 * Falls back to the machine's valid sections only when the bottle has no
 * configuration at all.
 */
export const VALID_SECTIONS_FOR_BOTTLE = (mIdx: number, bottleId: string): number[] => {
  const machineSections = VALID_SECTIONS(mIdx);
  if (!bottleId) return machineSections;

  const machineId = `MAC-${String(mIdx + 1).padStart(2, '0')}`;
  const configured = planningRepository
    .getBottleConfigurations(machineId, bottleId)
    .filter((c) => c.machine_no === machineId)
    .map((c) => c.section)
    .filter((s) => machineSections.includes(s));

  const unique = [...new Set(configured)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : machineSections;
};

/**
 * Returns sections sorted descending (highest first) for display/dropdowns.
 */
export const VALID_SECTIONS_DESC = (mIdx: number, bottleId?: string): number[] => {
  const secs = bottleId ? VALID_SECTIONS_FOR_BOTTLE(mIdx, bottleId) : VALID_SECTIONS(mIdx);
  return [...secs].sort((a, b) => b - a);
};

// Cut per Section = speeds (shown as "Cut" in the table) ÷ number of sections
export const calcCutPerSection = (speeds: number, sections: number): number =>
  sections > 0 ? Math.round((speeds / sections) * 100) / 100 : 0;

// ─── Bottle lookup helpers (DB is source of truth) ────────────────────────────

export const NONE_ENTRY: BottleEntry = { name: "None", wt: 0, speeds: 0 };

const machineIdOf = (machineNo: number): string => `MAC-${String(machineNo).padStart(2, '0')}`;

/**
 * Exact bottle_configuration row for the composite key
 * (machine, bottle_id, section). Returns undefined when that exact row does
 * not exist — never another section's and never another machine's row.
 */
export const lookupConfig = (
  machineNo: number,
  bottleId: string,
  section: number
): BottleConfigurationRow | undefined => {
  if (!bottleId || !section) return undefined;
  return planningRepository.getBottleConfiguration(machineIdOf(machineNo), bottleId, section);
};

/**
 * Exact configured cut speed for (machine, bottle_id, section).
 * 0 when no matching bottle_configuration row exists.
 */
export const lookupSpeedForBottle = (machineNo: number, bottleId: string, section: number): number =>
  lookupConfig(machineNo, bottleId, section)?.speeds ?? 0;

/**
 * Resolves bottle_master.bottle_id for a bottle NAME on ONE machine
 * (optionally narrowed to a single section).
 *
 * Names are not unique — several bottle ids can share a name (e.g. two
 * "230 ml Protone" records configured on different machines) — so the name is
 * only ever matched against the configs that actually exist for THIS machine
 * (and section). Returns undefined when nothing matches or when the match is
 * ambiguous, so callers surface a validation error instead of guessing.
 */
export const resolveBottleIdForMachine = (
  machineNo: number,
  bottleName: string,
  section?: number
): string | undefined => {
  const name = (bottleName || '').trim().toLowerCase();
  if (!name || name === 'none') return undefined;

  const machineId = machineIdOf(machineNo);
  const machineConfigs = planningRepository.getBottleConfigurations(machineId, '*');
  const configuredIds = new Set(
    (section ? machineConfigs.filter((c) => c.section === section) : machineConfigs).map((c) => c.bottle_id)
  );
  if (configuredIds.size === 0) return undefined;

  const matches = planningRepository
    .getBottles()
    .filter((b) => configuredIds.has(b.bottle_id) && b.bottle_name.trim().toLowerCase() === name);

  if (matches.length === 0) return undefined;
  if (matches.length > 1) return undefined; // ambiguous — never guess between ids
  return matches[0].bottle_id;
};

/**
 * Looks up the configured cut speed for a bottle on a specific machine and section.
 * Reads from bottle_configuration table (via planningRepository cache).
 *
 * The name is resolved ONLY against this machine's (and section's)
 * configuration rows, so a same-named bottle configured on another machine can
 * never leak its speed in.
 */
export const lookupSpeed = (machineNo: number, bottleName: string, section: number): number => {
  const bottleId = resolveBottleIdForMachine(machineNo, bottleName, section);
  if (!bottleId) return 0;
  return lookupSpeedForBottle(machineNo, bottleId, section);
};

/**
 * Looks up a bottle entry (name, weight, speeds) for a given machine and bottle name.
 * Reads from bottle_configuration + bottle_master tables.
 */
export function lookupBottle(machineNo: number, name: string): BottleEntry {
  if (name === "None" || !name) return NONE_ENTRY;
  if (planningRepository.getMachines().length === 0) return NONE_ENTRY;
  const bottleId = resolveBottleIdForMachine(machineNo, name);
  if (!bottleId) return NONE_ENTRY;
  const configs = planningRepository.getBottleConfigurations(machineIdOf(machineNo), bottleId);
  if (configs.length === 0) return NONE_ENTRY;
  const bottle = planningRepository.getBottles().find((b) => b.bottle_id === bottleId);
  const defaultSection = configs[configs.length - 1].section;
  const config = configs.find((c) => c.section === defaultSection) ?? configs[0];
  return {
    name: bottle ? bottle.bottle_name : name,
    wt: config.weight,
    speeds: config.speeds,
    bottleId,
  };
}

/**
 * Returns all bottles available for a specific machine (with at least one configuration).
 * Reads from bottle_master + bottle_configuration tables.
 */
export function getMachineBottles(machineNo: number): BottleEntry[] {
  const machines = planningRepository.getMachines();
  if (machines.length === 0) return [];
  const machineId = machineIdOf(machineNo);
  const allConfigs = planningRepository.getAllConfigurations();
  const machineConfigs = allConfigs.filter((c) => c.machine_no === machineId);
  const bottleIds = new Set(machineConfigs.map((c) => c.bottle_id));
  const bottles = planningRepository.getBottles();
  return bottles
    .filter((b) => bottleIds.has(b.bottle_id))
    .map((b) => {
      // Sort ascending by section so the representative config is deterministic
      // (getAllConfigurations preserves DB/insertion order, which is not sorted).
      const configs = machineConfigs
        .filter((c) => c.bottle_id === b.bottle_id)
        .sort((a, c) => a.section - c.section);
      // Weight is shared across a bottle's sections; take it from the highest
      // section. The cut speed is deliberately NOT taken from any single
      // section — callers must resolve it per section via lookupSpeed so one
      // section's speed is never copied onto another.
      const representative = configs[configs.length - 1] ?? configs[0];
      return {
        name: b.bottle_name,
        wt: representative?.weight ?? 0,
        speeds: 0,
        // Exact bottle_master id — the only safe identity (names collide).
        bottleId: b.bottle_id,
      };
    });
}

// Module-level entry ID counter
let _eid = 1;
export const nextEid = () => _eid++;

// Module-level job ID sequence. Used ONLY when creating a brand-new job
// (bottle changed) or as a fallback for legacy rows — never inside the
// "+"/extend logic, where the source job's ID must be inherited.
let _jobIdSeq = 1;
export const nextJobId = (): string => `JOB-${Date.now()}-${_jobIdSeq++}`;

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
    bottleId: b.bottleId,
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
  return { eid: nextEid(), product: "None", wt: 0, speeds: 0, cut: 0, draw: 0, qty: 0, salesExec: "", packingCategory: "", palletPacking: null, section: MAX_SECTIONS(mIdx), startTime: '09:00' };
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
    weekday: d.toLocaleDateString("en-GB", { weekday: "long" }),
  };
});


export const INITIAL_MACHINE_LISTS: MachineLists = [
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(0)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(1)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(2)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(3)),
];
