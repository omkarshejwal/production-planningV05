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
let _initialized = false;

// ─── Type Guards ───────────────────────────────────────────────────────────────
const toStr = (v: unknown): string => String(v ?? '');
const toNum = (v: unknown): number => Number(v) || 0;

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
    plan_date: toStr(raw.plan_date),
    machine_no: machineId,
    bottle_id: bottleId,
    section: toNum(raw.section),
    weight: toNum(raw.weight),
    speeds: toNum(raw.speeds),
    draw: toNum(raw.draw),
    quantity: toNum(raw.quantity),
    production_hours: toNum(raw.production_hours) || undefined,
    start_time: startTime,
    estimated_completion: estimatedCompletion,
    completion_time: completionTime,
    changeover_minutes: toNum(raw.changeover_minutes),
    status: (raw.status as ProductionJobRow['status']) || 'Planned',
    packaging: Array.isArray(raw.packaging) ? raw.packaging.map((p: any) => ({
      plan_date: toStr(raw.plan_date),
      machine_no: machineId,
      bottle_id: bottleId,
      section: toNum(raw.section),
      start_time: startTime,
      packaging_type: p.packaging_type,
      quantity: toNum(p.quantity),
      pallet_packing: p.pallet_packing ? 'YES' : 'NO',
      pallet_quantity: toNum(p.pallet_quantity)
    })) : []
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
   */
  async init(): Promise<void> {
    try {
      const [rawMachines, rawBottles, rawConfigs, rawJobs] = await Promise.all([
        apiFetch('/api/production/machines/'),
        apiFetch('/api/production/products/bottles/'),
        apiFetch('/api/production/products/configurations/'),
        apiFetch('/api/production/jobs/'),
      ]);

      _machines = (rawMachines as Record<string, unknown>[]).map(mapMachineRow);
      _bottles = (rawBottles as Record<string, unknown>[]).map((b) => ({
        bottle_id: toStr(b.bottle_id),
        bottle_name: toStr(b.bottle_name),
      }));
      _configs = (rawConfigs as Record<string, unknown>[]).map(mapConfigRow);
      _jobs = (rawJobs as Record<string, unknown>[]).map(mapJobRow);
      _initialized = true;
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
    const specific = _configs
      .filter((row) => row.machine_no === machine_no && row.bottle_id === bottle_id)
      .sort((a, b) => a.section - b.section);
      
    if (specific.length > 0) return specific;

    // Fallback: if no config exists for this specific machine, use any available config for this bottle
    return _configs
      .filter((row) => row.bottle_id === bottle_id)
      .sort((a, b) => a.section - b.section);
  },

  getBottleConfiguration(machine_no: string, bottle_id: string, section: number): BottleConfigurationRow | undefined {
    return this.getBottleConfigurations(machine_no, bottle_id).find((row) => row.section === section);
  },

  getProductionJobs(): ProductionJobRow[] {
    return [..._jobs].sort((a, b) => {
      if (a.plan_date !== b.plan_date) return a.plan_date.localeCompare(b.plan_date);
      if (a.machine_no !== b.machine_no) return a.machine_no.localeCompare(b.machine_no);
      return a.start_time.localeCompare(b.start_time);
    });
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

  async createProductionJobsBatch(payloads: ProductionJobRow[]): Promise<{ ok: boolean; error?: string }> {
    try {
      await Promise.all(payloads.map((p) => this._postJob(p)));
      return { ok: true };
    } catch (err: any) {
      console.error('createProductionJobsBatch failed:', err);
      return { ok: false, error: err.message || 'Failed to create batch' };
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
    start_time: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const machineInt = this._machineIdToInt(machine_no);
      const startTimeIso = this._buildStartTime(plan_date, start_time);
      await apiFetch(`/api/production/jobs/${plan_date}/${machineInt}/${encodeURIComponent(startTimeIso)}`, {
        method: 'DELETE',
      });
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
    // Packaging is now handled directly in the POST job payload
    return { ok: true };
  },

  // ── Internal helpers ────────────────────────────────────────────────────────

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
   * Posts a single ProductionJobRow to the backend API.
   * Translates frontend format (MAC-01, BOT-001 strings) to backend format (integers).
   */
  async _postJob(payload: ProductionJobRow): Promise<void> {
    const machineInt = this._machineIdToInt(payload.machine_no);
    const bottleInt = parseInt(payload.bottle_id, 10);

    const body = {
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
      status: payload.status || null,
      packaging: payload.packaging ? payload.packaging.map(p => ({
        packaging_type: p.packaging_type,
        quantity: p.quantity,
        pallet_packing: p.pallet_packing === 'YES',
        pallet_quantity: p.pallet_quantity || null
      })) : [],
    };

    await apiFetch('/api/production/jobs/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
