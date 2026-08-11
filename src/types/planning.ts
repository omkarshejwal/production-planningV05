export type PackCatKey = "ST" | "SN" | "SB" | "BT";

export interface BottleEntry {
  name: string;
  wt: number;
  speeds: number;
}

export interface MachineEntry {
  eid: number;
  product: string;
  wt: number;
  speeds: number;
  cut: number;
  draw: number;
  qty: number;
  isBlank?: boolean;
  salesExec?: string;
  packingCategory?: PackCatKey | "";
  packingAllocations?: Partial<Record<PackCatKey, number>>;
  palletPacking?: boolean | null;
  palletPackingQty?: number | null;
  requiredBottles?: number | null;
  cumulativeQty?: number;
  section?: number;
  startTime?: string; // "HH:MM" 24-h
  endTime?: string; // set when job is completed
  status?: "running" | "completed";
}

// Completed jobs keyed by `${mIdx}-${rowIdx}`, ordered oldest-first
export type CompletedJobMap = Record<string, MachineEntry[]>;

// Date rows are fixed — they never shift.
// Each machine owns an independent flat array (MachineLists[mIdx][rowIdx]).
export interface DateRow {
  id: number;
  date: string;
  isoDate: string;
}

export type MachineLists = [MachineEntry[], MachineEntry[], MachineEntry[], MachineEntry[]];

export interface EditSavePayload {
  bottle: BottleEntry;
  salesExec: string;
  packingCategory: PackCatKey | "";
  packingAllocations: Partial<Record<PackCatKey, number>>;
  palletPacking: boolean | null;
  palletPackingQty: number | null;
  requiredBottles: number | null;
  section: number;
  startTime: string;
}
