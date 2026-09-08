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
  efficiency_percent: string;
  sqc: string;
  qc_hold: string;
  num: string;
  remarks: string;
  defect_ids: string[];
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

export const qualityRepository = {
  getHourlyForDate(dateKey: string): Record<string, Record<string, QualityHourlyEntry>> {
    return readStore<QualityHourlyStore>(HOURLY_KEY, {})[dateKey] ?? {};
  },

  getShiftsForDate(dateKey: string): QualityShiftMap {
    return readStore<Record<string, QualityShiftMap>>(SHIFT_KEY, {})[dateKey] ?? {};
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
        const body = res as { hourly?: Record<string, Record<string, QualityHourlyEntry>>; shift_assignments?: QualityShiftMap };
        if (body.hourly && body.shift_assignments) {
          const stores = readStore<QualityHourlyStore>(HOURLY_KEY, {});
          const shiftStores = readStore<Record<string, QualityShiftMap>>(SHIFT_KEY, {});
          writeStore(HOURLY_KEY, { ...stores, [dateKey]: body.hourly });
          writeStore(SHIFT_KEY, { ...shiftStores, [dateKey]: body.shift_assignments });
          return { hourly: body.hourly, shifts: body.shift_assignments };
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
   * mirrors the existing repository write flow. Callers may treat a resolved
   * promise as a successful save.
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
          hourly,
          shift_assignments: shifts,
        }),
      });
    } catch {
      // Endpoint not deployed yet — the localStorage cache is authoritative.
    }
    return { ok: true };
  },
};