import { BottleEntry, DateRow, MachineEntry, MachineLists } from '../types/planning';
import { BOTTLE_SPEEDS, MACHINE_BOTTLES, NONE_ENTRY } from '../data/bottleReference';
import { calculateDraw, calculateProductionMetrics } from './calculations';

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
  return { id: i + 1, date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) };
});

export const INITIAL_MACHINE_LISTS: MachineLists = [
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(0)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(1)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(2)),
  Array.from({ length: NUM_ROWS }, () => makeNoneEntry(3)),
];
