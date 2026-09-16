/**
 * qualityRepository.ts — persistence layer for the Production Quality Monitor.
 *
 * Follows the same pattern as planningRepository.ts: data is stored per
 * production date, keyed by machine and hour slot. Writes go to the FastAPI
 * backend when the endpoint is available; a localStorage cache guarantees the
 * entered data survives navigation and refreshes even while offline.
 *
 * Record structure (preserves data by date + machine + shift + hour):
 *   hourly:  { [dateISO]: { [machineNo]: { [time]: QualityHourlyEntry } } }
 *   shifts:  { [dateISO]: { [shiftId]: { supervisor, executive } } }
 *
 * The component works with a string-based form model (inputs are string
 * driven). At the API boundary entries are mapped to `QualityEntryPayload`,
 * which matches the database columns and their types exactly:
 *   - numeric columns are sent as numbers (or null)
 *   - qc_hold / sqc are integers, not booleans or strings
 *   - defects stay attached to their entry (hourly_production_defect is a
 *     join of entry_id + defect_id that the backend persists)
 */

import { apiFetch } from '../utils/api';

export interface QualityHourlyEntry {
  entry_id: string;
  report_id: string;
  machine_no: number;
  shift_id: number;
  production_time: string;
  bottle_id: string;
  section: string;
  weight_front: string;
  weight_middle: string;
  weight_rear: string;
  weight_avg: string;
  speed_per_min: string;
  packing_category: string[];
  packing_size: string;
  cartons: string;
  bottles_in_nos: string;
  efficiency_percentage: string;
  sqc: string;
  qc_hold: number;
  num: string;
  remarks: string;
  defect_ids: string[];
  job_id: string;
}

export interface DefectMasterItem {
  defect_id: number;
  defect_type: 'Critical' | 'Major' | 'Minor';
  defect_sr: number;
  defect_name: string;
  is_active: boolean;
}

/**
 * Database-shaped hourly entry used for request payloads and API responses.
 * Field names and types mirror the database schema exactly:
 * hourly_production (entry_id, report_id, machine_no, shift_id,
 * production_time, bottle_id, section, weight_front, weight_middle,
 * weight_rear, weight_avg, speed_per_min, packing_category, packing_size,
 * cartons, bottles_in_nos, efficiency_percentage, sqc, qc_hold, num, remarks)
 * plus defect_ids (the per-entry defect names; hourly_production_defect is
 * the entry_id + defect_id join created by the backend).
 */
export interface QualityEntryPayload {
  entry_id: number | string | null;
  report_id: number | string | null;
  machine_no: number;
  shift_id: number;
  production_time: string;
  bottle_id: number | null;
  section: number | null;
  weight_front: number | null;
  weight_middle: number | null;
  weight_rear: number | null;
  weight_avg: number | null;
  speed_per_min: number | null;
  packing_category: string | null;
  packing_size: number | null;
  cartons: number | null;
  bottles_in_nos: number | null;
  efficiency_percentage: number | null;
  sqc: number | null;
  qc_hold: number;
  num: number | null;
  remarks: string | null;
  defect_ids: string[];
  job_id: string | null;
}

export interface QualityShiftAssignment {
  supervisor: string;
  executive: string;
}

export type QualityShiftMap = Record<number, QualityShiftAssignment>;
export type QualityHourlyStore =
  Record<string, Record<string, Record<string, QualityHourlyEntry>>>;

const HOURLY_KEY = 'vitrum.quality.hourly.v1';
const SHIFT_KEY = 'vitrum.quality.shift.v1';

export { HOURLY_KEY as QUALITY_HOURLY_KEY };

const readStore = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) as Partial<T> };
  } catch {
    return fallback;
  }
};

const writeStore = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy-mode failures — in-memory copy still works.
  }
};

// ─── Mapping helpers (string-based UI form <-> database-typed payload) ───────

const toNumOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toIntOrZero = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
};

const toStrOrEmpty = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v);
};

const toPackingArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => toStrOrEmpty(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const toPackingString = (v: unknown): string | null => {
  const list = toPackingArray(v);
  return list.length > 0 ? list.join(', ') : null;
};

const toDefectArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((d: unknown) =>
      typeof d === 'string'
        ? d
        : toStrOrEmpty((d as { defect_name?: unknown; defect_id?: unknown })?.defect_name ??
            (d as { defect_id?: unknown })?.defect_id)
    )
    .filter(Boolean);
};

/** Maps a string-based form entry to the database-shaped payload. */
const toDbEntry = (entry: QualityHourlyEntry): QualityEntryPayload => ({
  entry_id: entry.entry_id || null,
  report_id: entry.report_id || null,
  machine_no: entry.machine_no,
  shift_id: entry.shift_id,
  production_time: entry.production_time,
  bottle_id: toNumOrNull(entry.bottle_id),
  section: toNumOrNull(entry.section),
  weight_front: toNumOrNull(entry.weight_front),
  weight_middle: toNumOrNull(entry.weight_middle),
  weight_rear: toNumOrNull(entry.weight_rear),
  weight_avg: toNumOrNull(entry.weight_avg),
  speed_per_min: toNumOrNull(entry.speed_per_min),
  packing_category: toPackingString(entry.packing_category),
  packing_size: toNumOrNull(entry.packing_size),
  cartons: toNumOrNull(entry.cartons),
  bottles_in_nos: toNumOrNull(entry.bottles_in_nos),
  efficiency_percentage: toNumOrNull(entry.efficiency_percentage),
  sqc: toNumOrNull(entry.sqc),
  qc_hold: toIntOrZero(entry.qc_hold),
  num: toNumOrNull(entry.num),
  remarks: toStrOrEmpty(entry.remarks) || null,
  defect_ids: toDefectArray(entry.defect_ids),
  job_id: entry.job_id || null,
});

/** Maps a database-shaped entry (or already-normalised form entry) back to the form model. */
const fromDbEntry = (raw: Record<string, unknown>): QualityHourlyEntry => ({
  entry_id: toStrOrEmpty(raw.entry_id),
  report_id: toStrOrEmpty(raw.report_id),
  machine_no: toNumOrNull(raw.machine_no) ?? 0,
  shift_id: toNumOrNull(raw.shift_id) ?? 1,
  production_time: toStrOrEmpty(raw.production_time),
  bottle_id: toStrOrEmpty(raw.bottle_id),
  section: toStrOrEmpty(raw.section),
  weight_front: toStrOrEmpty(raw.weight_front),
  weight_middle: toStrOrEmpty(raw.weight_middle),
  weight_rear: toStrOrEmpty(raw.weight_rear),
  weight_avg: toStrOrEmpty(raw.weight_avg),
  speed_per_min: toStrOrEmpty(raw.speed_per_min),
  packing_category: toPackingArray(raw.packing_category),
  packing_size: toStrOrEmpty(raw.packing_size),
  cartons: toStrOrEmpty(raw.cartons),
  bottles_in_nos: toStrOrEmpty(raw.bottles_in_nos),
  efficiency_percentage: toStrOrEmpty(raw.efficiency_percentage),
  sqc: toStrOrEmpty(raw.sqc),
  qc_hold: toIntOrZero(raw.qc_hold),
  num: toStrOrEmpty(raw.num),
  remarks: toStrOrEmpty(raw.remarks),
  defect_ids: toDefectArray(raw.defect_ids),
  job_id: toStrOrEmpty(raw.job_id),
});

type NestedPayload =
  Record<string, Record<string, QualityEntryPayload>>;
type NestedForm =
  Record<string, Record<string, QualityHourlyEntry>>;

const buildDbHourly = (hourly: NestedForm): NestedPayload => {
  const out: NestedPayload = {};
  for (const machineKey of Object.keys(hourly ?? {})) {
    out[machineKey] = {};
    const byTime = hourly[machineKey] ?? {};
    for (const timeKey of Object.keys(byTime)) {
      out[machineKey][timeKey] = toDbEntry(byTime[timeKey]);
    }
  }
  return out;
};

const normalizeDbHourly = (raw: Record<string, Record<string, Record<string, unknown>>>): NestedForm => {
  const out: NestedForm = {};
  for (const machineKey of Object.keys(raw ?? {})) {
    out[machineKey] = {};
    const byTime = raw[machineKey] ?? {};
    for (const timeKey of Object.keys(byTime)) {
      out[machineKey][timeKey] = fromDbEntry(byTime[timeKey] ?? {});
    }
  }
  return out;
};

export const qualityRepository = {
  getHourlyForDate(dateKey: string): Record<string, Record<string, QualityHourlyEntry>> {
    return readStore<QualityHourlyStore>(HOURLY_KEY, {})[dateKey] ?? {};
  },

  getShiftsForDate(dateKey: string): QualityShiftMap {
    return readStore<Record<string, QualityShiftMap>>(SHIFT_KEY, {})[dateKey] ?? {};
  },

  /**
   * Fetches active defects from GET /api/production/quality/defects/?active_only=true.
   */
  async getDefects(activeOnly: boolean = true): Promise<DefectMasterItem[]> {
    try {
      const res = await apiFetch(`/api/production/quality/defects/?active_only=${activeOnly}`);
      if (Array.isArray(res)) {
        return res as DefectMasterItem[];
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Loads the hourly + shift assignment data for a single production date.
   * Tries the API first, falling back to the persisted localStorage cache.
   */
  async load(dateKey: string): Promise<{
    hourly: Record<string, Record<string, QualityHourlyEntry>>;
    shifts: QualityShiftMap;
  }> {
    try {
      const res = await apiFetch(`/api/production/quality/daily/?date=${dateKey}`);
      if (res && typeof res === 'object') {
        const body = res as {
          hourly?: Record<string, Record<string, Record<string, unknown>>>;
          shift_assignments?: QualityShiftMap;
        };
        if (body.hourly) {
          const hourly = normalizeDbHourly(body.hourly);
          const shifts = body.shift_assignments ?? {};
          const stores = readStore<QualityHourlyStore>(HOURLY_KEY, {});
          const shiftStores = readStore<Record<string, QualityShiftMap>>(SHIFT_KEY, {});
          writeStore(HOURLY_KEY, { ...stores, [dateKey]: hourly });
          writeStore(SHIFT_KEY, { ...shiftStores, [dateKey]: shifts });
          return { hourly, shifts };
        }
      }
    } catch {
      // API endpoint unavailable (e.g. offline dev) — use local cache below.
    }
    return {
      hourly: this.getHourlyForDate(dateKey),
      shifts: this.getShiftsForDate(dateKey),
    };
  },

  /**
   * Persists one day of hourly production + shift assignments.
   * Always writes the localStorage cache; best-effort POST to the backend
   * mirrors the existing repository write flow. The request body uses the
   * exact database field names and numeric/null types defined by the schema.
   */
  async save(
    dateKey: string,
    hourly: Record<string, Record<string, QualityHourlyEntry>>,
    shifts: QualityShiftMap
  ): Promise<{ ok: boolean }> {
    const stores = readStore<QualityHourlyStore>(HOURLY_KEY, {});
    const shiftStores = readStore<Record<string, QualityShiftMap>>(SHIFT_KEY, {});
    writeStore(HOURLY_KEY, { ...stores, [dateKey]: hourly });
    writeStore(SHIFT_KEY, { ...shiftStores, [dateKey]: shifts });

    try {
      await apiFetch('/api/production/quality/daily/', {
        method: 'POST',
        body: JSON.stringify({
          production_date: dateKey,
          hourly: buildDbHourly(hourly),
          shift_assignments: shifts,
        }),
      });
    } catch {
      // Endpoint not deployed yet — the localStorage cache is authoritative.
    }
    return { ok: true };
  },
};