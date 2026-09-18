/**
 * qualityRepository.ts — API-backed persistence layer for the Production
 * Quality Monitor. The database is the single source of truth: the module
 * always reads from (and writes to) the FastAPI backend, which connects to
 * AWS PostgreSQL. No localStorage / offline cache is kept for Quality Monitor
 * records, so deleted or externally-changed DB rows can never be resurrected
 * as stale UI state.
 *
 * Record structure (preserves data by date + machine + shift + hour):
 *   hourly:  { [machineNo]: { [time]: QualityHourlyEntry } }  (one date)
 *   shifts:  { [shiftId]: { supervisor, executive } }         (one date)
 *
 * The component works with a string-based form model (inputs are string
 * driven). At the API boundary entries are mapped to `QualityEntryPayload`,
 * which matches the database columns and their types exactly:
 *   - numeric columns are sent as numbers (or null)
 *   - qc_hold / sqc are integers, not booleans or strings
 *   - defects stay attached to their entry (hourly_production_defect is a
 *     join of entry_id + defect_id that the backend persists)
 *
 * Concurrency notes:
 *   - `load()` deduplicates concurrent requests per date (StrictMode
 *     double-effects, rapid date navigation) via one shared in-flight promise.
 *   - `getDefects()` caches only the static defect master list, never Quality
 *     Monitor records.
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
/** One date's hourly map: { [machineNo]: { [time]: entry } } */
export type QualityDayHourly =
  Record<string, Record<string, QualityHourlyEntry>>;

// A row counts as "content" when any meaningful field is filled. Empty
// default-shape slots (the API returns a full 24 x 4 grid) are ignored, so
// they never shadow real local rows and never bloat a save payload.
export const hasMeaningfulData = (e?: QualityHourlyEntry | null): boolean => {
  if (!e) return false;
  if (e.bottle_id || e.section || e.job_id) return true;
  if (e.weight_front || e.weight_middle || e.weight_rear || e.weight_avg) return true;
  if (e.speed_per_min || e.packing_size || e.cartons || e.bottles_in_nos || e.efficiency_percentage) return true;
  if (e.sqc || e.num || e.remarks) return true;
  if (Number(e.qc_hold ?? 0) !== 0) return true;
  if ((e.packing_category?.length ?? 0) > 0) return true;
  if ((e.defect_ids?.length ?? 0) > 0) return true;
  return false;
};

// Deduplicates concurrent load requests per date (StrictMode double-effects,
// rapid date navigation, etc. all share one in-flight request).
const inFlightLoads = new Map<string, Promise<{ hourly: QualityDayHourly; shifts: QualityShiftMap; ok?: boolean }>>();

const defectNamesCache: {
  resolved: DefectMasterItem[] | null;
  pending: Promise<DefectMasterItem[]> | null;
} = { resolved: null, pending: null };

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
  /**
   * Fetches active defects from GET /api/production/quality/defects/?active_only=true.
   * The result is cached so master data is never fetched more than once, and
   * concurrent callers share a single in-flight request.
   */
  async getDefects(activeOnly: boolean = true): Promise<DefectMasterItem[]> {
    if (!activeOnly) {
      const res = await apiFetch('/api/production/quality/defects/?active_only=false');
      return Array.isArray(res) ? (res as DefectMasterItem[]) : [];
    }
    if (defectNamesCache.resolved) return defectNamesCache.resolved;
    if (!defectNamesCache.pending) {
      defectNamesCache.pending = (async () => {
        try {
          const res = await apiFetch('/api/production/quality/defects/?active_only=true');
          const list = Array.isArray(res) ? (res as DefectMasterItem[]) : [];
          // Cache successes only, so a transient failure can be retried later.
          defectNamesCache.resolved = list;
          return list;
        } catch {
          return [];
        } finally {
          defectNamesCache.pending = null;
        }
      })();
    }
    return defectNamesCache.pending;
  },

  /**
   * Loads the hourly + shift assignment data for a single production date
   * straight from the backend. The returned state is exactly what the database
   * currently holds for that date — no local cache or previously loaded rows
   * are merged in, so records deleted from the DB never reappear.
   *
   * `ok` is true only when the API responded successfully. On any failure the
   * result is an empty store with `ok: false` so the caller can surface an
   * error state instead of silently reusing stale data. The backend always
   * returns the full 24 x 4 grid for a reachable date (even when the day has
   * no records), so the UI correctly shows an empty grid when no rows exist.
   * Concurrent calls for the same date share one request.
   */
  async load(dateKey: string): Promise<{
    hourly: QualityDayHourly;
    shifts: QualityShiftMap;
    ok?: boolean;
  }> {
    const pending = inFlightLoads.get(dateKey);
    if (pending) return pending;
    const promise = this._load(dateKey).finally(() => {
      inFlightLoads.delete(dateKey);
    });
    inFlightLoads.set(dateKey, promise);
    return promise;
  },

  async _load(dateKey: string): Promise<{
    hourly: QualityDayHourly;
    shifts: QualityShiftMap;
    ok?: boolean;
  }> {
    try {
      const res = await apiFetch(`/api/production/quality/daily/?date=${dateKey}`);
      if (res && typeof res === 'object') {
        const body = res as {
          hourly?: Record<string, Record<string, Record<string, unknown>>>;
          shift_assignments?: QualityShiftMap;
        };
        if (body.hourly && typeof body.hourly === 'object') {
          return {
            hourly: normalizeDbHourly(body.hourly),
            shifts: body.shift_assignments ?? {},
            ok: true,
          };
        }
      }
    } catch {
      // API endpoint unavailable — report the failure; never fall back to a
      // local cache that may hold rows deleted from the database.
    }
    return { hourly: {}, shifts: {}, ok: false };
  },

  /**
   * Persists one day of hourly production + shift assignments to the backend.
   * No local cache is written: the database is the source of truth, so a
   * failed POST fails loudly instead of pretending the data was saved.
   *
   * The backend owns job_id: on success it returns the full day's state with
   * the DB-generated job ids, which are returned to the caller so the frontend
   * can reuse them verbatim.
   */
  async save(
    dateKey: string,
    hourly: QualityDayHourly,
    shifts: QualityShiftMap
  ): Promise<{ ok: boolean; persisted: boolean; hourly?: QualityDayHourly }> {
    try {
      const res = await apiFetch('/api/production/quality/daily/', {
        method: 'POST',
        body: JSON.stringify({
          production_date: dateKey,
          hourly: buildDbHourly(hourly),
          shift_assignments: shifts,
        }),
      });
      const body = res as {
        hourly?: Record<string, Record<string, Record<string, unknown>>>;
      } | null;
      return {
        ok: true,
        persisted: true,
        hourly: body?.hourly ? normalizeDbHourly(body.hourly) : undefined,
      };
    } catch {
      // API unreachable — nothing was persisted.
      return { ok: false, persisted: false };
    }
  },
};