/**
 * planningRepository.ts — API-backed data layer
 *
 * This module replaces the old localStorage-based repository.
 * It fetches real data from the FastAPI backend (which connects to AWS PostgreSQL)
 * and caches it in-memory so the synchronous useMemo calls in ERPContext still work.
 *
 * Flow:
 *   1. On app boot, ERPProvider calls planningRepository.init() which fetches all data from API.
 *   2. All sync getters (getMachines, getBottles, etc.) read from the in-memory cache.
 *   3. All writes (createProductionJob, updateProductionJob, etc.) POST to the API.
 *   4. After any write, ERPProvider calls planningRepository.init() again to refresh the cache.
 */

import { apiFetch } from '../utils/api';
import {
  BottleConfigurationRow,
  BottleMasterRow,
  MachineMasterRow,
  ProductionJobRow,
  JobPackagingRow,
} from '../data/planningSchema';

// ─── In-Memory Cache ───────────────────────────────────────────────────────────
let _machines: MachineMasterRow[] = [];
let _bottles: BottleMasterRow[] = [];
let _configs: BottleConfigurationRow[] = [];
let _jobs: ProductionJobRow[] = [];
let _holidays: { holiday_date: string; holiday_name: string }[] = [];
let _initialized = false;
let _cacheVersion = 0;

// Complete chronological production-job history, independent of the currently
// filtered planning window (_jobs). The cumulative Qty column must continue a
// Job ID from BEFORE the selected date range (e.g. a job spanning a month
// boundary), so the full history is loaded once on boot and kept in sync on
// writes instead of being scoped by from_date/to_date like the display window.
let _allJobs: ProductionJobRow[] = [];
let _allJobsLoaded = false;

/**
 * Derived-config lookups for getBottleConfigurations / getBottleConfiguration /
 * getMachineSections.  These are re-computed lazily only when _configs or
 * _machines change (init, addMachineSection, removeMachineSection), so the
 * render loops that previously filtered + sorted the full config list on every
 * call now hit an O(1) map lookup instead.
 */
let _configLookups: {
  byMachine: Map<string, BottleConfigurationRow[]>;
  byMachineBottle: Map<string, BottleConfigurationRow[]>;
  byBottle: Map<string, BottleConfigurationRow[]>;
  byMachineBottleSection: Map<string, BottleConfigurationRow>;
  byBottleSection: Map<string, BottleConfigurationRow>;
} | null = null;
let _machineSections: Map<string, number[]> | null = null;

const invalidateConfigLookups = () => {
  _configLookups = null;
  _machineSections = null;
};

const bySection = (a: BottleConfigurationRow, b: BottleConfigurationRow): number => a.section - b.section;

const ensureConfigLookups = () => {
  if (_configLookups) return _configLookups;

  const byMachine = new Map<string, BottleConfigurationRow[]>();
  const byMachineBottle = new Map<string, BottleConfigurationRow[]>();
  const byBottle = new Map<string, BottleConfigurationRow[]>();
  const byMachineBottleSection = new Map<string, BottleConfigurationRow>();
  const byBottleSection = new Map<string, BottleConfigurationRow>();

  for (const config of _configs) {
    let list = byMachine.get(config.machine_no);
    if (!list) { list = []; byMachine.set(config.machine_no, list); }
    list.push(config);

    const key = `${config.machine_no}|${config.bottle_id}`;
    list = byMachineBottle.get(key);
    if (!list) { list = []; byMachineBottle.set(key, list); }
    list.push(config);

    list = byBottle.get(config.bottle_id);
    if (!list) { list = []; byBottle.set(config.bottle_id, list); }
    list.push(config);

    byMachineBottleSection.set(`${key}|${config.section}`, config);
    byBottleSection.set(`${config.bottle_id}|${config.section}`, config);
  }

  for (const list of byMachine.values()) list.sort(bySection);
  for (const list of byMachineBottle.values()) list.sort(bySection);
  for (const list of byBottle.values()) list.sort(bySection);

  _configLookups = { byMachine, byMachineBottle, byBottle, byMachineBottleSection, byBottleSection };
  return _configLookups;
};

/**
 * Monotonically-increasing counter bumped on every successful cache refresh.
 * ERPContext compares this on each render to detect external cache updates
 * (e.g. after Machine Master or Bottle Master saves).
 */
export const getCacheVersion = () => _cacheVersion;

// ─── Type Guards ───────────────────────────────────────────────────────────────
const toStr = (v: unknown): string => String(v ?? '');
const toNum = (v: unknown): number => Number(v) || 0;

const sortJobsChronological = (rows: ProductionJobRow[]): ProductionJobRow[] =>
  rows.sort((a, b) => {
    if (a.plan_date !== b.plan_date) return a.plan_date.localeCompare(b.plan_date);
    if (a.machine_no !== b.machine_no) return a.machine_no.localeCompare(b.machine_no);
    return a.start_time.localeCompare(b.start_time);
  });

/**
 * Maps a raw API job response (with numeric IDs) to a ProductionJobRow
 * (with string IDs, matching the format the rest of the UI expects).
 */
const mapJobRow = (raw: Record<string, unknown>): ProductionJobRow => {
  // start_time from backend is a full ISO datetime — extract just HH:MM
  const startRaw = toStr(raw.start_time);
  const startTime = startRaw.includes('T')
    ? startRaw.split('T')[1].substring(0, 5)
    : startRaw.length >= 5
    ? startRaw.substring(0, 5)
    : startRaw;

  const estRaw = toStr(raw.estimated_completion ?? '');
  const estimatedCompletion = estRaw.includes('T') ? estRaw.substring(0, 16) : estRaw;

  const completionRaw = toStr(raw.completion_time ?? '');
  const completionTime = completionRaw.includes('T') ? completionRaw.substring(0, 16) : (completionRaw || undefined);

  // machine_no from API is an integer like 1, 2, 3, 4 — map to MAC-0X format
  const machineNo = toStr(raw.machine_no);
  const machineId = machineNo.startsWith('MAC-')
    ? machineNo
    : `MAC-${machineNo.padStart(2, '0')}`;

  // bottle_id from API is an integer — keep as string
  const bottleId = toStr(raw.bottle_id);

  return {
  job_id: raw.job_id != null ? toStr(raw.job_id) : undefined,
  plan_date: toStr(raw.plan_date),
  machine_no: machineId,
  bottle_id: bottleId,

  section: toNum(raw.section),
  weight: toNum(raw.weight),
  speeds: toNum(raw.speeds),
  draw: toNum(raw.draw),
  quantity: toNum(raw.quantity),

  // Required bottles from database
  requiredBottles:
    toNum(raw.required_bottles ?? raw.requiredBottles) || undefined,

  production_hours:
    toNum(raw.production_hours) || undefined,

  start_time: startTime,

  // Estimated completion from database
  estimated_completion: estimatedCompletion,

  completion_time: completionTime,

  changeover_minutes:
    toNum(raw.changeover_minutes),

  status:
    (raw.status as ProductionJobRow['status']) || 'Planned',

  packaging: Array.isArray(raw.packaging)
    ? raw.packaging.map((p: any) => ({
        plan_date: toStr(raw.plan_date),
        machine_no: machineId,
        bottle_id: bottleId,
        section: toNum(raw.section),
        start_time: startTime,
        packaging_type: p.packaging_type,
        quantity: toNum(p.quantity),
        pallet_packing: p.pallet_packing ? 'YES' : 'NO',
        pallet_quantity: toNum(p.pallet_quantity)
      }))
    : []
};
};

/**
 * Maps a raw API machine response to a MachineMasterRow.
 * Backend returns machine_no as integer (1, 2, 3, 4) — convert to MAC-01 format.
 */
const mapMachineRow = (raw: Record<string, unknown>): MachineMasterRow => {
  const no = toStr(raw.machine_no);
  const machineId = no.startsWith('MAC-') ? no : `MAC-${no.padStart(2, '0')}`;
  const gobType = toNum(raw.gob_type);
  return {
    machine_no: machineId,
    gob_type: gobType === 3 ? 'Triple Gob' : 'Double Gob',
    gob_count: gobType,
    max_section: toNum(raw.max_section),
  };
};

/**
 * Maps a raw API bottle config response to a BottleConfigurationRow.
 * machine_no comes as integer from API — convert to MAC-0X format.
 */
const mapConfigRow = (raw: Record<string, unknown>): BottleConfigurationRow => {
  const no = toStr(raw.machine_no);
  const machineId = no.startsWith('MAC-') ? no : `MAC-${no.padStart(2, '0')}`;
  return {
    machine_no: machineId,
    bottle_id: toStr(raw.bottle_id),
    section: toNum(raw.section),
    weight: toNum(raw.weight),
    speeds: toNum(raw.speeds),
  };
};

// ─── Public API ────────────────────────────────────────────────────────────────

export const planningRepository = {
  /**
   * Fetches all master data and jobs from the FastAPI backend and populates the cache.
   * Must be called once on app boot, and again after any write operation.
   *
   * @param fromDate - ISO date string (YYYY-MM-DD). When provided with toDate,
   *   the jobs fetch is scoped to this date range. Machines, bottles, and
   *   configurations are always fetched in full (they are small master-data tables).
   * @param toDate   - ISO date string (YYYY-MM-DD). Must be paired with fromDate.
   */
  async init(fromDate?: string, toDate?: string): Promise<void> {
    try {
      const jobsUrl =
        fromDate && toDate
          ? `/api/production/jobs/?from_date=${fromDate}&to_date=${toDate}`
          : '/api/production/jobs/';

      const tasks: Promise<unknown>[] = [
        apiFetch('/api/production/machines/'),
        apiFetch('/api/production/products/bottles/'),
        apiFetch('/api/production/products/configurations/'),
        apiFetch(jobsUrl),
        apiFetch('/api/production/holidays/'),
      ];
      // Load the full job history once (on boot); later window-scoped fetches
      // only refresh _jobs so the cumulative Qty source stays complete.
      if (!_allJobsLoaded) {
        tasks.push(apiFetch('/api/production/jobs/'));
      }
      const [
        rawMachines,
        rawBottles,
        rawConfigs,
        rawJobs,
        rawHolidays,
        rawAllJobs,
      ] = await Promise.all(tasks);

      _machines = (rawMachines as Record<string, unknown>[]).map(mapMachineRow);
      _bottles = (rawBottles as Record<string, unknown>[]).map((b) => ({
        bottle_id: toStr(b.bottle_id),
        bottle_name: toStr(b.bottle_name),
      }));
      _configs = (rawConfigs as Record<string, unknown>[]).map(mapConfigRow);
      invalidateConfigLookups();
      _jobs = (rawJobs as Record<string, unknown>[]).map(mapJobRow);
      if (!_allJobsLoaded) {
        _allJobs = (rawAllJobs as Record<string, unknown>[]).map(mapJobRow);
        _allJobsLoaded = true;
      }
      _holidays = (rawHolidays as Record<string, unknown>[]).map((h) => ({
        holiday_date: toStr(h.holiday_date),
        holiday_name: toStr(h.holiday_name),
      }));
      _initialized = true;
      _cacheVersion++;
    } catch (err) {
      console.error('planningRepository.init() failed:', err);
      // Keep existing cache on error — don't wipe good data
    }
  },

  isInitialized(): boolean {
    return _initialized;
  },

  // ── Sync Getters (read from cache) ──────────────────────────────────────────

  getMachines(): MachineMasterRow[] {
    return _machines;
  },

  getBottles(): BottleMasterRow[] {
    return _bottles;
  },

  getBottleConfigurations(machine_no: string, bottle_id: string): BottleConfigurationRow[] {
    const { byMachine, byMachineBottle, byBottle } = ensureConfigLookups();
    if (bottle_id === '*') {
      const machineConfigs = byMachine.get(machine_no);
      return machineConfigs ? [...machineConfigs] : [];
    }
    const specific = byMachineBottle.get(`${machine_no}|${bottle_id}`);
    if (specific && specific.length > 0) return [...specific];
    const anyForBottle = byBottle.get(bottle_id);
    return anyForBottle ? [...anyForBottle] : [];
  },

  getAllConfigurations(): BottleConfigurationRow[] {
    return [..._configs];
  },

  /**
   * Exact-equivalent O(1) lookup mirroring getBottleConfigurations' fallback
   * semantics: when the (machine, bottle) pair has no configs, falls back to the
   * bottle's config from any machine for the requested section.
   */
  getBottleConfiguration(machine_no: string, bottle_id: string, section: number): BottleConfigurationRow | undefined {
    const { byMachineBottle, byMachineBottleSection, byBottleSection } = ensureConfigLookups();
    const hasSpecific = (byMachineBottle.get(`${machine_no}|${bottle_id}`)?.length ?? 0) > 0;
    if (hasSpecific) {
      return byMachineBottleSection.get(`${machine_no}|${bottle_id}|${section}`);
    }
    return byBottleSection.get(`${bottle_id}|${section}`);
  },

  getProductionJobs(): ProductionJobRow[] {
    return sortJobsChronological([..._jobs]);
  },

  /**
   * Complete production-job history in chronological order, independent of the
   * currently filtered planning window. Used to seed the cumulative Qty column
   * so a Job ID that continues from outside the selected date range still starts
   * from its previous accumulated value.
   */
  getFullProductionJobs(): ProductionJobRow[] {
    if (!_allJobsLoaded) return [];
    return sortJobsChronological([..._allJobs]);
  },

  getCachedHolidays(): { holiday_date: string; holiday_name: string }[] {
    return _holidays;
  },

  getJobPackaging(): JobPackagingRow[] {
    // Packaging is embedded in jobs — return empty for now (packaging is handled in backend)
    return [];
  },

  // ── Write Operations (POST to API, then caller must call init() to refresh) ─

  async createProductionJob(payload: ProductionJobRow): Promise<{ ok: boolean; error?: string }> {
    try {
      await this._postJob(payload);
      return { ok: true };
    } catch (err: any) {
      console.error('createProductionJob failed:', err);
      return { ok: false, error: err.message || 'Failed to create job' };
    }
  },

  /**
   * Reserves the next available job_id for a machine so a brand-new job can be
   * assigned its business Job ID immediately (before the user saves anything).
   *
   * The backend registers the id in job_master (using the existing
   * machine_no * 100 + sequence architecture) and advances the machine's
   * sequence, so the returned id is a valid job_id that later saves reuse and
   * different new jobs always receive different ids.
   */
  async reserveNextJobId(machineNo: number): Promise<{ ok: boolean; jobId?: string; error?: string }> {
    try {
      const result = await apiFetch(`/api/production/jobs/reserve-id/${machineNo}`, {
        method: 'POST',
      });
      return { ok: true, jobId: toStr(result.job_id) };
    } catch (err: any) {
      console.error('reserveNextJobId failed:', err);
      return { ok: false, error: err.message || 'Failed to reserve job id' };
    }
  },

  async createProductionJobsBatch(payloads: ProductionJobRow[]): Promise<{ ok: boolean; error?: string }> {
    try {
      // Send all changed rows in ONE request to the backend bulk endpoint.
      // The backend processes rows in order so job_id assignment is
      // identical to the old sequential POST-per-row behaviour, and it only
      // touches the rows that were actually sent.
      const jobs = payloads.map((p) => this._buildJobBody(p));
      const results = await apiFetch('/api/production/jobs/bulk/', {
        method: 'POST',
        body: JSON.stringify({ jobs }),
      });
      // Merge the rows the backend persisted into the in-memory cache so the
      // caller can refresh the grid without re-fetching the full dataset.
      this._applyRowsToCache((results as Record<string, unknown>[]).map(mapJobRow));
      return { ok: true };
    } catch (err: any) {
      console.error('createProductionJobsBatch failed:', err);
      return { ok: false, error: err.message || 'Failed to create batch' };
    }
  },

  /**
   * Extends a production job by `days` extra days. The backend inserts a
   * continuation row for the job and shifts every subsequent job on the same
   * machine forward by the same number of days.
   */
  async extendProductionJob(params: {
    plan_date: string;
    machine_no: string;
    start_time: string;
    days: number;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const machineInt = this._machineIdToInt(params.machine_no);
      const startTimeIso = this._buildStartTime(params.plan_date, params.start_time);
      await apiFetch('/api/production/jobs/extend/', {
        method: 'POST',
        body: JSON.stringify({
          plan_date: params.plan_date,
          machine_no: machineInt,
          start_time: startTimeIso,
          days: params.days,
        }),
      });
      return { ok: true };
    } catch (err: any) {
      console.error('extendProductionJob failed:', err);
      return { ok: false, error: err.message || 'Failed to extend job' };
    }
  },

  async updateProductionJob(
    _originalKey: {
      plan_date: string;
      machine_no: string;
      bottle_id: string;
      section: number;
      start_time: string;
    },
    payload: ProductionJobRow
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this._postJob(payload);
      return { ok: true };
    } catch (err: any) {
      console.error('updateProductionJob failed:', err);
      return { ok: false, error: err.message || 'Failed to update job' };
    }
  },

  /**
   * Patches a job (section/quantity/hours). Re-posts it to the backend (upsert).
   */
  patchProductionJob(
    key: {
      plan_date: string;
      machine_no: string;
      bottle_id: string;
      section: number;
      start_time: string;
    },
    patch: Partial<Pick<ProductionJobRow, 'section' | 'weight' | 'speeds' | 'draw' | 'quantity' | 'production_hours'>>
  ): { ok: boolean; error?: string; row?: ProductionJobRow } {
    const existing = _jobs.find(
      (j) =>
        j.plan_date === key.plan_date &&
        j.machine_no === key.machine_no &&
        j.bottle_id === key.bottle_id &&
        j.section === key.section &&
        j.start_time === key.start_time
    );
    if (!existing) return { ok: false, error: 'Production job not found' };

    const updated: ProductionJobRow = { ...existing, ...patch };
    this._postJob(updated).catch((err) => console.error('patchProductionJob failed:', err));
    return { ok: true, row: updated };
  },

  async deleteProductionJob(
    plan_date: string,
    machine_no: string,
    start_time: string,
    job_id?: string,
    section?: number
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const machineInt = this._machineIdToInt(machine_no);
      const query = new URLSearchParams();
      if (job_id) {
        const parsedJobId = parseInt(job_id, 10);
        if (Number.isFinite(parsedJobId)) query.set('job_id', String(parsedJobId));
      }
      if (typeof section === 'number' && Number.isFinite(section)) {
        query.set('section', String(section));
      }
      const qs = query.toString();
      await apiFetch(
        `/api/production/jobs/${plan_date}/${machineInt}/${encodeURIComponent(start_time)}${qs ? `?${qs}` : ''}`,
        { method: 'DELETE', }
      );
      // Drop the deleted row(s) from the in-memory cache so the grid reflects
      // the deletion without a full dataset re-fetch. When job_id/section are
      // supplied, only the exact rows are removed — other jobs that share the
      // same (plan_date, machine_no, start_time) slot stay in the cache.
      const machineId = this._machineIdToStr(machineInt);
      const normStart = start_time.includes('T') ? start_time.split('T')[1].substring(0, 5) : start_time;
      const prevLen = _jobs.length;
      const filterFn = (j: ProductionJobRow) => !(
        j.plan_date === plan_date &&
        j.machine_no === machineId &&
        j.start_time === normStart &&
        (job_id == null || toStr(j.job_id) === toStr(job_id)) &&
        (section == null || j.section === section)
      );
      _jobs = _jobs.filter(filterFn);
      if (_jobs.length !== prevLen) {
        _cacheVersion++;
        if (_allJobsLoaded) _allJobs = _allJobs.filter(filterFn);
      }
      return { ok: true };
    } catch (err: any) {
      console.error('deleteProductionJob failed:', err);
      return { ok: false, error: err.message || 'Failed to delete job' };
    }
  },

  replaceJobPackagingForJob(
    _key: {
      plan_date: string;
      machine_no: string;
      bottle_id: string;
      section: number;
      start_time: string;
    },
    _rows: JobPackagingRow[]
  ): { ok: boolean; error?: string } {
    // Packaging is now handled directly in the POST job payload
    return { ok: true };
  },

  upsertJobPackaging(_payload: JobPackagingRow): { ok: boolean; error?: string } {
    return { ok: true };
  },

  // ── Bottle Master CRUD ──────────────────────────────────────────────────────

  async createBottle(bottle_name: string): Promise<{ ok: boolean; id?: number; error?: string }> {
    try {
      const result = await apiFetch('/api/production/products/bottles/', {
        method: 'POST',
        body: JSON.stringify({ bottle_name }),
      });
      _bottles.push({ bottle_id: toStr(result.bottle_id), bottle_name });
      _cacheVersion++;
      return { ok: true, id: result.bottle_id };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to create bottle' };
    }
  },

  async updateBottle(bottle_id: number, bottle_name: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiFetch(`/api/production/products/bottles/${bottle_id}`, {
        method: 'PUT',
        body: JSON.stringify({ bottle_name }),
      });
      const idStr = String(bottle_id);
      const existing = _bottles.find((b) => b.bottle_id === idStr);
      if (existing) existing.bottle_name = bottle_name;
      _cacheVersion++;
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to update bottle' };
    }
  },

  // ── Bottle Configuration CRUD ───────────────────────────────────────────────

  async upsertBottleConfiguration(config: {
    machine_no: number;
    bottle_id: number;
    section: number;
    weight: number;
    speeds: number;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const existing = _configs.find(
        (c) =>
          c.machine_no === `MAC-${String(config.machine_no).padStart(2, '0')}` &&
          c.bottle_id === String(config.bottle_id) &&
          c.section === config.section
      );
      if (existing) {
        await apiFetch(
          `/api/production/products/configurations/${config.machine_no}/${config.bottle_id}/${config.section}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              machine_no: config.machine_no,
              bottle_id: config.bottle_id,
              section: config.section,
              weight: config.weight,
              speeds: config.speeds,
            }),
          }
        );
      } else {
        await apiFetch('/api/production/products/configurations/', {
          method: 'POST',
          body: JSON.stringify({
            machine_no: config.machine_no,
            bottle_id: config.bottle_id,
            section: config.section,
            weight: config.weight,
            speeds: config.speeds,
          }),
        });
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to save configuration' };
    }
  },

  /**
   * Saves all given bottle configurations in ONE bulk API request. The backend
   * upserts the rows atomically in a single transaction (INSERT ... ON CONFLICT
   * DO UPDATE). On success the in-memory cache is updated so callers can avoid a
   * full application refresh.
   */
  async bulkUpsertBottleConfigurations(
    configs: {
      machine_no: number;
      bottle_id: number;
      section: number;
      weight: number;
      speeds: number;
    }[]
  ): Promise<{ ok: boolean; error?: string }> {
    if (configs.length === 0) return { ok: true };
    try {
      await apiFetch('/api/production/products/configurations/bulk/', {
        method: 'POST',
        body: JSON.stringify({ configurations: configs }),
      });

      for (const config of configs) {
        const row: BottleConfigurationRow = {
          machine_no: this._machineIdToStr(config.machine_no),
          bottle_id: String(config.bottle_id),
          section: config.section,
          weight: config.weight,
          speeds: config.speeds,
        };
        const idx = _configs.findIndex(
          (c) =>
            c.machine_no === row.machine_no &&
            c.bottle_id === row.bottle_id &&
            c.section === row.section
        );
        if (idx >= 0) _configs[idx] = row;
        else _configs.push(row);
      }
      invalidateConfigLookups();
      _cacheVersion++;
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to save configurations' };
    }
  },

  async deleteBottleConfiguration(
    machine_no: number,
    bottle_id: number,
    section: number
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiFetch(
        `/api/production/products/configurations/${machine_no}/${bottle_id}/${section}`,
        { method: 'DELETE' }
      );
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to delete configuration' };
    }
  },

  // ── Holiday Master CRUD ─────────────────────────────────────────────────────

  async getHolidays(): Promise<{ holiday_date: string; holiday_name: string }[]> {
    try {
      const raw = await apiFetch('/api/production/holidays/');
      return (raw as any[]).map((h: any) => ({
        holiday_date: h.holiday_date,
        holiday_name: h.holiday_name,
      }));
    } catch {
      return [];
    }
  },

  async createHoliday(holiday_date: string, holiday_name: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiFetch('/api/production/holidays/', {
        method: 'POST',
        body: JSON.stringify({ holiday_date, holiday_name }),
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to create holiday' };
    }
  },

  async updateHoliday(original_date: string, holiday_date: string, holiday_name: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiFetch(`/api/production/holidays/${original_date}`, {
        method: 'PUT',
        body: JSON.stringify({ holiday_date, holiday_name }),
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to update holiday' };
    }
  },

  async deleteHoliday(holiday_date: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiFetch(`/api/production/holidays/${holiday_date}`, { method: 'DELETE' });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to delete holiday' };
    }
  },

  // ── Machine Section Management ──────────────────────────────────────────────

  /**
   * Returns the base (non-removable) sections for a machine.
   * Machine 1 & 4: [5, 6, 7, 8]
   * Machine 2 & 3: [7, 8, 9, 10]
   */
  getBaseSections(machineNo: string): number[] {
    const num = parseInt(machineNo.replace(/\D/g, ''), 10);
    if (num === 1 || num === 4) return [5, 6, 7, 8];
    return [7, 8, 9, 10];
  },

  /**
   * Returns all unique sections for a machine, sorted ascending.
   * Always includes base sections + any contiguous user-added sections from DB.
   * Non-contiguous DB entries (e.g. stray section 9 on Machine 1) are excluded.
   */
  getMachineSections(machineNo: string): number[] {
    const cached = _machineSections?.get(machineNo);
    if (cached) return [...cached];

    const base = this.getBaseSections(machineNo);
    const machine = _machines.find((m) => m.machine_no === machineNo);
    const maxSection = machine && machine.max_section > 0 ? machine.max_section : 12;
    const fromDb = _configs
      .filter((c) => c.machine_no === machineNo)
      .map((c) => c.section);
    const all = [...new Set([...base, ...fromDb])].filter((s) => s <= maxSection).sort((a, b) => a - b);
    // Only keep contiguous sections starting from the base minimum
    const minBase = Math.min(...base);
    const contiguous: number[] = [];
    let expected = minBase;
    for (const s of all) {
      if (s === expected) {
        contiguous.push(s);
        expected++;
      } else if (s > expected) {
        break;
      }
    }
    if (!_machineSections) _machineSections = new Map();
    _machineSections.set(machineNo, contiguous);
    return [...contiguous];
  },

  /**
   * Returns the next section available to add for a machine.
   * Each click adds exactly one new higher section: current highest + 1.
   * Max section number is 12.
   */
  getAvailableSectionsToAdd(machineNo: string): number[] {
    const current = this.getMachineSections(machineNo);
    const highest = current[current.length - 1];
    if (highest >= 12) return [];
    return [highest + 1];
  },

  /**
   * Returns removable sections for a machine (non-base sections present in config).
   */
  getRemovableSections(machineNo: string): number[] {
    const base = this.getBaseSections(machineNo);
    const current = this.getMachineSections(machineNo);
    return current.filter((s) => !base.includes(s)).sort((a, b) => b - a);
  },

  /**
   * Adds a section to ALL bottles configured on a machine.
   * - Creates bottle_configuration rows for every bottle on that machine.
   * - Weight is copied from the first existing config for that bottle on this machine.
   * - New section speed = highest section speed + 10 (auto-calculated step).
   * Returns { ok, section } where section is the number that was added.
   */
  async addMachineSection(machineNo: string, section: number): Promise<{ ok: boolean; section?: number; error?: string }> {
    const machineInt = parseInt(machineNo.replace(/\D/g, ''), 10);
    const machineConfigs = _configs.filter((c) => c.machine_no === machineNo);

    if (machineConfigs.length === 0) {
      return { ok: false, error: 'No bottle configurations exist for this machine.' };
    }

    const bottleIds: string[] = [...new Set(machineConfigs.map((c) => c.bottle_id))];

    const currentSections = this.getMachineSections(machineNo);
    const highestSection = currentSections[currentSections.length - 1];
    const highestConfig = machineConfigs.find((c) => c.section === highestSection);
    const highestSpeed = highestConfig ? highestConfig.speeds : 0;
    const newSpeed = highestSpeed + 10;

    let allOk = true;
    for (const bottleId of bottleIds) {
      const existingConfig = machineConfigs.find((c) => c.bottle_id === bottleId);
      const weight = existingConfig ? existingConfig.weight : 0;

      const upsertResult = await this.upsertBottleConfiguration({
        machine_no: machineInt,
        bottle_id: parseInt(bottleId, 10),
        section,
        weight,
        speeds: newSpeed,
      });
      if (!upsertResult.ok) allOk = false;
    }

    if (allOk) {
      const macStr = `MAC-${String(machineInt).padStart(2, '0')}`;
      for (const bottleId of bottleIds) {
        const existingConfig = machineConfigs.find((c) => c.bottle_id === bottleId);
        const weight = existingConfig ? existingConfig.weight : 0;
        const idx = _configs.findIndex(
          (c) => c.machine_no === macStr && c.bottle_id === bottleId && c.section === section
        );
        if (idx >= 0) {
          _configs[idx] = { machine_no: macStr, bottle_id: bottleId, section, weight, speeds: newSpeed };
        } else {
          _configs.push({ machine_no: macStr, bottle_id: bottleId, section, weight, speeds: newSpeed });
        }
      }
      invalidateConfigLookups();
      return { ok: true, section };
    }
    return { ok: false, error: 'Failed to add section to all bottles.' };
  },

  /**
   * Removes a section from ALL bottles on a machine.
   * Cannot remove base sections.
   */
  async removeMachineSection(machineNo: string, section: number): Promise<{ ok: boolean; error?: string }> {
    const base = this.getBaseSections(machineNo);
    if (base.includes(section)) {
      return { ok: false, error: 'Cannot remove a base section.' };
    }

    const machineInt = parseInt(machineNo.replace(/\D/g, ''), 10);
    const machineConfigs = _configs.filter(
      (c) => c.machine_no === machineNo && c.section === section
    );

    if (machineConfigs.length === 0) {
      return { ok: false, error: 'Section not found on this machine.' };
    }

    let allOk = true;
    for (const config of machineConfigs) {
      const bottleIdInt = parseInt(config.bottle_id, 10);
      const delResult = await this.deleteBottleConfiguration(machineInt, bottleIdInt, section);
      if (!delResult.ok) allOk = false;
    }

    if (allOk) {
      for (const config of machineConfigs) {
        const idx = _configs.findIndex(
          (c) => c.machine_no === machineNo && c.bottle_id === config.bottle_id && c.section === section
        );
        if (idx >= 0) _configs.splice(idx, 1);
      }
      invalidateConfigLookups();
      return { ok: true };
    }
    return { ok: false, error: 'Failed to remove section from all bottles.' };
  },

  /**
   * Returns the highest section for a given machine + bottle, or null if none.
   * Uses getMachineSections which always includes base sections.
   */
  getHighestSection(machineNo: string): number | null {
    const sections = this.getMachineSections(machineNo);
    if (sections.length === 0) return null;
    return sections[sections.length - 1];
  },

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Converts an integer machine number to the MAC-XX format the frontend uses.
   */
  _machineIdToStr(machineInt: number): string {
    return `MAC-${String(machineInt).padStart(2, '0')}`;
  },

  /**
   * Converts a MAC-01 style machine_no to the integer the backend expects (1, 2, 3, 4).
   */
  _machineIdToInt(machineId: string): number {
    const match = machineId.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : parseInt(machineId, 10) || 1;
  },

  /**
   * Converts a start_time string "HH:MM" to a full ISO datetime for the backend.
   * Uses the plan_date to build the full datetime.
   */
  _buildStartTime(plan_date: string, start_time: string): string {
    const time = start_time && start_time.includes(':') ? start_time : '07:00';
    return `${plan_date}T${time}:00`;
  },

  /**
   * Builds an ISO datetime for completion times, accounting for next-day rollover.
   * Because segments are <= 24 hours, if completion_time < start_time, it rolled over to the next day.
   */
  _buildCompletionTime(plan_date: string, start_time: string, completion_time: string): string {
    const sTime = start_time && start_time.includes(':') ? start_time : '07:00';
    const cTime = completion_time && completion_time.includes(':') ? completion_time : '00:00';
    
    let dateObj = new Date(`${plan_date}T00:00:00`);
    if (cTime < sTime) {
      dateObj.setDate(dateObj.getDate() + 1);
    }
    
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    
    return `${y}-${m}-${d}T${cTime}:00`;
  },

  /**
   * Translates a ProductionJobRow to the JSON body expected by the backend.
   * Used by both _postJob (single) and createProductionJobsBatch (bulk).
   */
  _buildJobBody(payload: ProductionJobRow): Record<string, unknown> {
    const machineInt = this._machineIdToInt(payload.machine_no);
    const bottleInt = parseInt(payload.bottle_id, 10);

    const body: Record<string, unknown> = {
      plan_date: payload.plan_date,
      machine_no: machineInt,
      bottle_id: bottleInt,
      section: payload.section,
      start_time: this._buildStartTime(payload.plan_date, payload.start_time),
      estimated_completion: payload.estimated_completion
        ? (payload.estimated_completion.includes('T') ? payload.estimated_completion : this._buildCompletionTime(payload.plan_date, payload.start_time, payload.estimated_completion))
        : null,
      completion_time: payload.completion_time
        ? (payload.completion_time.includes('T') ? payload.completion_time : this._buildCompletionTime(payload.plan_date, payload.start_time, payload.completion_time))
        : null,
      changeover_minutes: payload.changeover_minutes || 0,
      draw: payload.draw || 0,
      required_bottles: payload.requiredBottles || payload.quantity || 0,
      status: payload.status || null,
      packaging: payload.packaging ? payload.packaging.map(p => ({
        packaging_type: p.packaging_type,
        quantity: p.quantity,
        pallet_packing: p.pallet_packing === 'YES',
        pallet_quantity: p.pallet_quantity || null
      })) : [],
    };

    if (payload.job_id) {
      const parsedId = parseInt(payload.job_id, 10);
      if (Number.isFinite(parsedId) && parsedId > 0) {
        body.job_id = parsedId;
      }
    }

    return body;
  },

  /**
   * Posts a single ProductionJobRow to the backend API.
   * Returns the API response including the backend-generated job_id.
   * On success the persisted row is merged into the in-memory cache.
   */
  async _postJob(payload: ProductionJobRow): Promise<Record<string, unknown> | null> {
    const resp = await apiFetch('/api/production/jobs/', {
      method: 'POST',
      body: JSON.stringify(this._buildJobBody(payload)),
    });
    this._applyRowsToCache([mapJobRow(resp as Record<string, unknown>)]);
    return resp;
  },

  /**
   * Merges persisted rows into the in-memory jobs cache so the caller can
   * refresh the grid without re-fetching the entire planning dataset.
   * Rows are matched by DB identity (plan_date + machine_no + start_time +
   * section); an existing match is replaced, anything new is appended.
   * Also keeps the full-history cache (_allJobs) in sync for cumulative Qty.
   */
  _applyRowsToCache(rows: ProductionJobRow[]): void {
    if (rows.length === 0) return;
    let changed = false;
    for (const row of rows) {
      const key = `${row.plan_date}|${row.machine_no}|${row.start_time}|${row.section}`;
      const idx = _jobs.findIndex(
        (j) => `${j.plan_date}|${j.machine_no}|${j.start_time}|${j.section}` === key
      );
      if (idx >= 0) {
        _jobs[idx] = row;
        changed = true;
      } else {
        _jobs.push(row);
        changed = true;
      }
      if (_allJobsLoaded) {
        const idxAll = _allJobs.findIndex(
          (j) => `${j.plan_date}|${j.machine_no}|${j.start_time}|${j.section}` === key
        );
        if (idxAll >= 0) _allJobs[idxAll] = row;
        else _allJobs.push(row);
      }
    }
    if (changed) _cacheVersion++;
  },
};
