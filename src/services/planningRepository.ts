import {
  BOTTLE_CONFIGURATION,
  BOTTLE_MASTER,
  JOB_PACKAGING_SEED,
  MACHINE_MASTER,
  PRODUCTION_JOB_SEED,
  BottleConfigurationRow,
  JobPackagingRow,
  ProductionJobRow,
} from '../data/planningSchema';
import { calculateProductionMetrics } from '../utils/calculations';

const JOBS_STORAGE_KEY = 'vitrum-production_job-v1';
const PACKAGING_STORAGE_KEY = 'vitrum-job_packaging-v1';

const readRows = <T>(key: string, fallback: T[]): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeRows = <T>(key: string, rows: T[]): void => {
  localStorage.setItem(key, JSON.stringify(rows));
};

const jobKey = (row: ProductionJobRow): string =>
  [row.plan_date, row.machine_no, row.bottle_id, row.section, row.start_time].join('|');

const parseTimeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const buildDateTime = (date: string, time: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const formatTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const estimateJobWindow = (row: ProductionJobRow): { start: Date; end: Date } => {
  const start = buildDateTime(row.plan_date, row.start_time);
  const dailyQty = calculateProductionMetrics(row.speeds, row.weight, row.machine_no).totalQuantity;
  const hourlyQty = dailyQty > 0 ? dailyQty / 24 : 0;
  const productionHours = row.production_hours && row.production_hours > 0
    ? row.production_hours
    : (hourlyQty > 0 ? row.quantity / hourlyQty : 0);
  const durationMinutes = productionHours > 0 ? productionHours * 60 : 0;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { start, end };
};

export const planningRepository = {
  getMachines() {
    return MACHINE_MASTER;
  },

  getBottles() {
    return BOTTLE_MASTER;
  },

  getBottleConfigurations(machine_no: string, bottle_id: string): BottleConfigurationRow[] {
    return BOTTLE_CONFIGURATION
      .filter((row) => row.machine_no === machine_no && row.bottle_id === bottle_id)
      .sort((a, b) => a.section - b.section);
  },

  getBottleConfiguration(machine_no: string, bottle_id: string, section: number): BottleConfigurationRow | undefined {
    return this.getBottleConfigurations(machine_no, bottle_id).find((row) => row.section === section);
  },

  getProductionJobs(): ProductionJobRow[] {
    return readRows(JOBS_STORAGE_KEY, PRODUCTION_JOB_SEED).sort((a, b) => {
      if (a.plan_date !== b.plan_date) return a.plan_date.localeCompare(b.plan_date);
      if (a.machine_no !== b.machine_no) return a.machine_no.localeCompare(b.machine_no);
      return a.start_time.localeCompare(b.start_time);
    });
  },

  getJobPackaging(): JobPackagingRow[] {
    return readRows(PACKAGING_STORAGE_KEY, JOB_PACKAGING_SEED);
  },

  replaceJobPackagingForJob(
    key: {
      plan_date: string;
      machine_no: string;
      bottle_id: string;
      section: number;
      start_time: string;
    },
    rows: JobPackagingRow[]
  ): { ok: boolean; error?: string } {
    const jobExists = this.getProductionJobs().some(
      (job) =>
        job.plan_date === key.plan_date &&
        job.machine_no === key.machine_no &&
        job.bottle_id === key.bottle_id &&
        job.section === key.section &&
        job.start_time === key.start_time
    );

    if (!jobExists) {
      return { ok: false, error: 'Packaging must reference an existing production_job' };
    }

    const current = this.getJobPackaging();
    const filtered = current.filter(
      (row) =>
        !(
          row.plan_date === key.plan_date &&
          row.machine_no === key.machine_no &&
          row.bottle_id === key.bottle_id &&
          row.section === key.section &&
          row.start_time === key.start_time
        )
    );

    writeRows(PACKAGING_STORAGE_KEY, [...filtered, ...rows]);
    return { ok: true };
  },

  createProductionJob(payload: ProductionJobRow): { ok: boolean; error?: string } {
    const machine = MACHINE_MASTER.find((m) => m.machine_no === payload.machine_no);
    if (!machine) return { ok: false, error: 'Invalid machine_no' };

    const bottle = BOTTLE_MASTER.find((b) => b.bottle_id === payload.bottle_id);
    if (!bottle) return { ok: false, error: 'Invalid bottle_id' };

    if (payload.section > machine.max_section || payload.section <= 0) {
      return { ok: false, error: 'Section out of machine range' };
    }

    if (payload.production_hours !== undefined) {
      if (!Number.isFinite(payload.production_hours) || payload.production_hours <= 0) {
        return { ok: false, error: 'production_hours must be a positive number' };
      }
      if (payload.production_hours > 24) {
        return { ok: false, error: 'A production row cannot exceed 24 hours' };
      }
    }

    const config = this.getBottleConfiguration(payload.machine_no, payload.bottle_id, payload.section);

    if (!config) {
      return { ok: false, error: 'No bottle_configuration for selected machine, bottle, and section' };
    }

    const jobs = this.getProductionJobs();

    const nextWindow = estimateJobWindow(payload);

    const overlaps = jobs.some((job) => {
      if (job.machine_no !== payload.machine_no) return false;
      const existingWindow = estimateJobWindow(job);
      return nextWindow.start < existingWindow.end && nextWindow.end > existingWindow.start;
    });

    if (overlaps) {
      return { ok: false, error: 'Overlapping job schedule on same machine/day' };
    }

    const duplicateKey = jobs.some((job) => jobKey(job) === jobKey(payload));
    if (duplicateKey) {
      return { ok: false, error: 'Duplicate production_job key fields' };
    }

    const persisted = [...jobs, payload];
    writeRows(JOBS_STORAGE_KEY, persisted);
    return { ok: true };
  },

  createProductionJobsBatch(payloads: ProductionJobRow[]): { ok: boolean; error?: string } {
    if (payloads.length === 0) return { ok: true };

    const existingJobs = this.getProductionJobs();
    const staged: ProductionJobRow[] = [];

    for (const payload of payloads) {
      const machine = MACHINE_MASTER.find((m) => m.machine_no === payload.machine_no);
      if (!machine) return { ok: false, error: 'Invalid machine_no' };

      const bottle = BOTTLE_MASTER.find((b) => b.bottle_id === payload.bottle_id);
      if (!bottle) return { ok: false, error: 'Invalid bottle_id' };

      if (payload.section > machine.max_section || payload.section <= 0) {
        return { ok: false, error: 'Section out of machine range' };
      }

      if (payload.production_hours !== undefined) {
        if (!Number.isFinite(payload.production_hours) || payload.production_hours <= 0) {
          return { ok: false, error: 'production_hours must be a positive number' };
        }
        if (payload.production_hours > 24) {
          return { ok: false, error: 'A production row cannot exceed 24 hours' };
        }
      }

      const config = this.getBottleConfiguration(payload.machine_no, payload.bottle_id, payload.section);
      if (!config) {
        return { ok: false, error: 'No bottle_configuration for selected machine, bottle, and section' };
      }

      const duplicateKey = [...existingJobs, ...staged].some((job) => jobKey(job) === jobKey(payload));
      if (duplicateKey) {
        return { ok: false, error: 'Duplicate production_job key fields' };
      }

      const nextWindow = estimateJobWindow(payload);
      const overlaps = [...existingJobs, ...staged].some((job) => {
        if (job.machine_no !== payload.machine_no) return false;
        const existingWindow = estimateJobWindow(job);
        return nextWindow.start < existingWindow.end && nextWindow.end > existingWindow.start;
      });

      if (overlaps) {
        return { ok: false, error: 'Overlapping job schedule on same machine' };
      }

      staged.push(payload);
    }

    writeRows(JOBS_STORAGE_KEY, [...existingJobs, ...staged]);
    return { ok: true };
  },

  updateProductionJob(
    originalKey: {
      plan_date: string;
      machine_no: string;
      bottle_id: string;
      section: number;
      start_time: string;
    },
    payload: ProductionJobRow
  ): { ok: boolean; error?: string } {
    const rows = this.getProductionJobs();
    const index = rows.findIndex(
      (row) =>
        row.plan_date === originalKey.plan_date &&
        row.machine_no === originalKey.machine_no &&
        row.bottle_id === originalKey.bottle_id &&
        row.section === originalKey.section &&
        row.start_time === originalKey.start_time
    );

    if (index < 0) return { ok: false, error: 'Production job not found' };

    const withoutCurrent = rows.filter((_, i) => i !== index);
    writeRows(JOBS_STORAGE_KEY, withoutCurrent);
    const created = this.createProductionJob(payload);
    if (!created.ok) {
      // rollback
      writeRows(JOBS_STORAGE_KEY, rows);
      return created;
    }

    // Move packaging if key changed
    const packagingRows = this.getJobPackaging();
    const migrated = packagingRows.map((pkg) => {
      const matchesOldKey =
        pkg.plan_date === originalKey.plan_date &&
        pkg.machine_no === originalKey.machine_no &&
        pkg.bottle_id === originalKey.bottle_id &&
        pkg.section === originalKey.section &&
        pkg.start_time === originalKey.start_time;

      if (!matchesOldKey) return pkg;

      return {
        ...pkg,
        plan_date: payload.plan_date,
        machine_no: payload.machine_no,
        bottle_id: payload.bottle_id,
        section: payload.section,
        start_time: payload.start_time,
      };
    });

    writeRows(PACKAGING_STORAGE_KEY, migrated);
    return { ok: true };
  },

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
    const rows = this.getProductionJobs();
    const index = rows.findIndex(
      (row) =>
        row.plan_date === key.plan_date &&
        row.machine_no === key.machine_no &&
        row.bottle_id === key.bottle_id &&
        row.section === key.section &&
        row.start_time === key.start_time
    );

    if (index < 0) return { ok: false, error: 'Production job not found' };

    const machine = MACHINE_MASTER.find((m) => m.machine_no === key.machine_no);
    if (!machine) return { ok: false, error: 'Invalid machine_no' };

    const bottle = BOTTLE_MASTER.find((b) => b.bottle_id === key.bottle_id);
    if (!bottle) return { ok: false, error: 'Invalid bottle_id' };

    const current = rows[index];
    const nextSection = patch.section ?? current.section;
    if (nextSection <= 0 || nextSection > machine.max_section) {
      return { ok: false, error: 'Section out of machine range' };
    }

    const updated: ProductionJobRow = {
      ...current,
      section: nextSection,
      weight: patch.weight ?? current.weight,
      speeds: patch.speeds ?? current.speeds,
      draw: patch.draw ?? current.draw,
      quantity: patch.quantity ?? current.quantity,
      production_hours: patch.production_hours ?? current.production_hours,
    };

    if (updated.production_hours !== undefined) {
      if (!Number.isFinite(updated.production_hours) || updated.production_hours <= 0) {
        return { ok: false, error: 'production_hours must be a positive number' };
      }
      if (updated.production_hours > 24) {
        return { ok: false, error: 'A production row cannot exceed 24 hours' };
      }
    }

    // Guard against duplicate key collision if section changes.
    const duplicate = rows.some((row, i) => {
      if (i === index) return false;
      return (
        row.plan_date === updated.plan_date &&
        row.machine_no === updated.machine_no &&
        row.bottle_id === updated.bottle_id &&
        row.section === updated.section &&
        row.start_time === updated.start_time
      );
    });
    if (duplicate) {
      return { ok: false, error: 'A job with same plan_date, machine_no, bottle_id, section, and start_time already exists' };
    }

    const next = [...rows];
    next[index] = updated;
    writeRows(JOBS_STORAGE_KEY, next);

    // Keep packaging FK fields in sync when section changes.
    if (patch.section !== undefined && patch.section !== current.section) {
      const pkgRows = this.getJobPackaging();
      const migrated = pkgRows.map((pkg) => {
        const matches =
          pkg.plan_date === key.plan_date &&
          pkg.machine_no === key.machine_no &&
          pkg.bottle_id === key.bottle_id &&
          pkg.section === key.section &&
          pkg.start_time === key.start_time;
        return matches ? { ...pkg, section: updated.section } : pkg;
      });
      writeRows(PACKAGING_STORAGE_KEY, migrated);
    }

    return { ok: true, row: updated };
  },

  deleteProductionJob(key: {
    plan_date: string;
    machine_no: string;
    bottle_id: string;
    section: number;
    start_time: string;
  }): { ok: boolean } {
    const jobs = this.getProductionJobs();
    const filteredJobs = jobs.filter(
      (row) =>
        !(
          row.plan_date === key.plan_date &&
          row.machine_no === key.machine_no &&
          row.bottle_id === key.bottle_id &&
          row.section === key.section &&
          row.start_time === key.start_time
        )
    );
    writeRows(JOBS_STORAGE_KEY, filteredJobs);

    const packaging = this.getJobPackaging();
    const filteredPackaging = packaging.filter(
      (row) =>
        !(
          row.plan_date === key.plan_date &&
          row.machine_no === key.machine_no &&
          row.bottle_id === key.bottle_id &&
          row.section === key.section &&
          row.start_time === key.start_time
        )
    );
    writeRows(PACKAGING_STORAGE_KEY, filteredPackaging);
    return { ok: true };
  },

  upsertJobPackaging(payload: JobPackagingRow): { ok: boolean; error?: string } {
    const exists = this.getProductionJobs().some(
      (job) =>
        job.plan_date === payload.plan_date &&
        job.machine_no === payload.machine_no &&
        job.bottle_id === payload.bottle_id &&
        job.section === payload.section &&
        job.start_time === payload.start_time
    );

    if (!exists) {
      return { ok: false, error: 'Packaging must reference an existing production_job' };
    }

    const rows = this.getJobPackaging();
    const idx = rows.findIndex(
      (row) =>
        row.plan_date === payload.plan_date &&
        row.machine_no === payload.machine_no &&
        row.bottle_id === payload.bottle_id &&
        row.section === payload.section &&
        row.start_time === payload.start_time
    );

    const next = [...rows];
    if (idx >= 0) {
      next[idx] = payload;
    } else {
      next.push(payload);
    }
    writeRows(PACKAGING_STORAGE_KEY, next);
    return { ok: true };
  },
};
