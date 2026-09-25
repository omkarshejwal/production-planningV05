export type PackCatKey = "ST" | "SN" | "SB" | "BT";

export interface BottleEntry {
  name: string;
  wt: number;
  speeds: number;
  // bottle_master.bottle_id of the EXACT row this entry came from. Names are
  // NOT unique (e.g. two bottles can both be "230 ml Protone"), so the id is
  // the only safe identity when saving.
  bottleId?: string;
}

export interface MachineEntry {
  eid: number;
  // Logical job grouping ID. Continuation rows created with "+" inherit the
  // source job's jobId; it only changes when the bottle is swapped (new job).
  jobId?: string;
  product: string;
  // bottle_master.bottle_id backing `product`. Populated when the row is
  // hydrated from the DB or picked in the edit modal; `product` alone can not
  // identify a bottle because names are not unique.
  bottleId?: string;
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
  estimatedCompletion?: string;
  cumulativeQty?: number;
  section?: number;
  startTime?: string; // "HH:MM" 24-h
  endTime?: string; // set when job is completed
  productionHours?: number | null; // user-overridden production duration in hours
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
  weekday: string;
}

export type MachineLists = [MachineEntry[], MachineEntry[], MachineEntry[], MachineEntry[]];

export interface EditSavePayload {
  bottle: BottleEntry;
  packingCategory: PackCatKey | "";
  packingAllocations: Partial<Record<PackCatKey, number>>;
  palletPacking: boolean | null;
  palletPackingQty: number | null;
  requiredBottles: number | null;
  section: number;
  startTime: string;
  productionHours: number | null;
}
