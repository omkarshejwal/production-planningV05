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
 *
 * Caching notes:
 *   - The whole store is parsed from localStorage exactly once (lazily) and
 *     kept in an in-memory cache, so navigating dates never re-parses it.
 *   - `load()` never discards rows that already exist locally: the locally
 *     persisted rows are the authoritative copy, and the API result is merged
 *     in for slots the local cache has nothing for. This keeps next-day job
 *     continuations created with "+" (and any other local-only rows) alive
 *     across saves and reloads even if their individual backend POST is
 *     delayed or offline.
 *   - `load()` deduplicates concurrent requests per date, and `getDefects()`
 *     caches the master defect list, so the same data is never fetched twice.
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

// ─── In-memory store cache (loaded lazily, updated on every save/load) ─────
let hourlyCache: QualityHourlyStore | undefined;
let shiftCache: Record<string, QualityShiftMap> | undefined;

const ensureCache = (): { hourly: QualityHourlyStore; shifts: Record<string, QualityShiftMap> } => {
  if (!hourlyCache) hourlyCache = readStore<QualityHourlyStore>(HOURLY_KEY, {});
  if (!shiftCache) shiftCache = readStore<Record<string, QualityShiftMap>>(SHIFT_KEY, {});
  return { hourly: hourlyCache, shifts: shiftCache };
};

const writeCaches = (hourly: QualityHourlyStore, shifts: Record<string, QualityShiftMap>) => {
  hourlyCache = hourly;
  shiftCache = shifts;
  writeStore(HOURLY_KEY, hourly);
  writeStore(SHIFT_KEY, shifts);
};

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

// Merges an API snapshot with the locally persisted rows so a row that only
// exists locally (e.g. a just-created next-day continuation that has not been
// POSTed yet) is never dropped by a reload. For slots the local cache has no
// content for, the API row wins (so DB rows created elsewhere still appear).
const mergeLoadedHourly = (
  api: QualityDayHourly | undefined,
  cached: QualityDayHourly | undefined
): QualityDayHourly => {
  const out: QualityDayHourly = {};
  const machines = new Set<string>([
    ...Object.keys(api ?? {}),
    ...Object.keys(cached ?? {}),
  ]);
  for (const machineKey of machines) {
    const apiTimes = api?.[machineKey] ?? {};
    const cachedTimes = cached?.[machineKey] ?? {};
    const byTime: Record<string, QualityHourlyEntry> = {};
    const times = new Set<string>([...Object.keys(apiTimes), ...Object.keys(cachedTimes)]);
    for (const timeKey of times) {
      const local = cachedTimes[timeKey];
      const remote = apiTimes[timeKey];
      byTime[timeKey] = local && hasMeaningfulData(local) ? local : (remote ?? local);
    }
    out[machineKey] = byTime;
  }
  return out;
};

// Deduplicates concurrent load requests per date (StrictMode double-effects,
// rapid date navigation, etc. all share one in-flight request).
const inFlightLoads = new Map<string, Promise<{ hourly: QualityDayHourly; shifts: QualityShiftMap }>>();

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
  getHourlyForDate(dateKey: string): QualityDayHourly {
    return ensureCache().hourly[dateKey] ?? {};
  },

  getShiftsForDate(dateKey: string): QualityShiftMap {
    return ensureCache().shifts[dateKey] ?? {};
  },

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
   * Loads the hourly + shift assignment data for a single production date.
   * Tries the API first, falling back to the persisted localStorage cache.
   *
   * The API result is MERGED with the persisted local rows — local rows are
   * authoritative (a next-day continuation created with "+" that the backend
   * has not received yet is never dropped), while API rows fill the slots the
   * local cache has nothing for. Concurrent calls for the same date share one
   * request.
   */
  async load(dateKey: string): Promise<{
    hourly: QualityDayHourly;
    shifts: QualityShiftMap;
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
  }> {
    const { hourly, shifts } = ensureCache();
    const cachedHourly = hourly[dateKey] ?? {};
    const cachedShifts = shifts[dateKey] ?? {};
    try {
      const res = await apiFetch(`/api/production/quality/daily/?date=${dateKey}`);
      if (res && typeof res === 'object') {
        const body = res as {
          hourly?: Record<string, Record<string, Record<string, unknown>>>;
          shift_assignments?: QualityShiftMap;
        };
        if (body.hourly && typeof body.hourly === 'object') {
          const apiHourly = normalizeDbHourly(body.hourly);
          const apiShifts = body.shift_assignments ?? {};
          const mergedHourly = mergeLoadedHourly(apiHourly, cachedHourly);
          const mergedShifts = { ...cachedShifts, ...apiShifts };
          writeCaches(
            { ...hourly, [dateKey]: mergedHourly },
            { ...shifts, [dateKey]: mergedShifts }
          );
          return { hourly: mergedHourly, shifts: mergedShifts };
        }
      }
    } catch {
      // API endpoint unavailable (e.g. offline dev) — use local cache below.
    }
    return {
      hourly: cachedHourly,
      shifts: cachedShifts,
    };
  },

  /**
   * Persists one day of hourly production + shift assignments.
   * Always writes the localStorage cache; best-effort POST to the backend
   * mirrors the existing repository write flow. The request body uses the
   * exact database field names and numeric/null types defined by the schema.
   *
   * Only the given date's key is written, so saving today never touches a
   * next-day continuation stored under its own date key.
   */
  async save(
    dateKey: string,
    hourly: QualityDayHourly,
    shifts: QualityShiftMap
  ): Promise<{ ok: boolean; persisted: boolean }> {
    const { hourly: hc, shifts: sc } = ensureCache();
    const nextHourly = { ...hc, [dateKey]: hourly };
    const nextShifts = { ...sc, [dateKey]: shifts };
    writeCaches(nextHourly, nextShifts);

    try {
      await apiFetch('/api/production/quality/daily/', {
        method: 'POST',
        body: JSON.stringify({
          production_date: dateKey,
          hourly: buildDbHourly(hourly),
          shift_assignments: shifts,
        }),
      });
      return { ok: true, persisted: true };
    } catch {
      // Endpoint not deployed yet — the localStorage cache is authoritative.
      return { ok: true, persisted: false };
    }
  },
};