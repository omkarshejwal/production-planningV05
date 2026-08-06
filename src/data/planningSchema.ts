export type JobStatusSchema = 'Planned' | 'Running' | 'Completed' | 'Hold';

export interface MachineMasterRow {
  machine_no: string;
  gob_type: string;
  gob_count: number;
  max_section: number;
}

export interface BottleMasterRow {
  bottle_id: string;
  bottle_name: string;
}

export interface BottleConfigurationRow {
  machine_no: string;
  bottle_id: string;
  section: number;
  weight: number;
  speeds: number;
}

export interface ProductionJobRow {
  plan_date: string;
  machine_no: string;
  bottle_id: string;
  section: number;
  weight: number;
  speeds: number;
  draw: number;
  quantity: number;
  production_hours?: number;
  start_time: string;
  estimated_completion: string;
  completion_time?: string;
  changeover_minutes?: number;
  status: JobStatusSchema;
}

export interface JobPackagingRow {
  plan_date: string;
  machine_no: string;
  bottle_id: string;
  section: number;
  start_time: string;
  packaging_type: string;
  quantity: number;
  pallet_packing: string;
  pallet_quantity: number;
}

// machine_master
export const MACHINE_MASTER: MachineMasterRow[] = [
  { machine_no: 'MAC-01', gob_type: 'Triple Gob', gob_count: 3, max_section: 8 },
  { machine_no: 'MAC-02', gob_type: 'Double Gob', gob_count: 2, max_section: 10 },
  { machine_no: 'MAC-03', gob_type: 'Double Gob', gob_count: 2, max_section: 10 },
  { machine_no: 'MAC-04', gob_type: 'Triple Gob', gob_count: 3, max_section: 8 },
];

// bottle_master
export const BOTTLE_MASTER: BottleMasterRow[] = [
  { bottle_id: 'BOT-001', bottle_name: '750ml Bordeaux Wine Heavy' },
  { bottle_id: 'BOT-002', bottle_name: '330ml Amber Beer Longneck' },
  { bottle_id: 'BOT-003', bottle_name: '500ml Antico Olive Oil Square' },
  { bottle_id: 'BOT-004', bottle_name: '250ml Emerald Mineral Water' },
  { bottle_id: 'BOT-005', bottle_name: '700ml Cobalt Artisan Gin' },
  { bottle_id: 'BOT-006', bottle_name: '100ml Pharma Amber Vial' },
  { bottle_id: 'BOT-007', bottle_name: '400ml Mason Pickle Jar Wide' },
];

// bottle_configuration
export const BOTTLE_CONFIGURATION: BottleConfigurationRow[] = [
  { machine_no: 'MAC-01', bottle_id: 'BOT-001', section: 6, weight: 480, speeds: 24 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-001', section: 7, weight: 480, speeds: 26 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-001', section: 8, weight: 480, speeds: 28 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-002', section: 6, weight: 210, speeds: 38 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-002', section: 7, weight: 210, speeds: 40 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-002', section: 8, weight: 210, speeds: 42 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-003', section: 6, weight: 380, speeds: 28 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-003', section: 7, weight: 380, speeds: 30 },
  { machine_no: 'MAC-01', bottle_id: 'BOT-003', section: 8, weight: 380, speeds: 32 },

  { machine_no: 'MAC-02', bottle_id: 'BOT-002', section: 8, weight: 210, speeds: 38 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-002', section: 9, weight: 210, speeds: 40 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-002', section: 10, weight: 210, speeds: 42 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-001', section: 8, weight: 510, speeds: 25 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-001', section: 9, weight: 510, speeds: 27 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-001', section: 10, weight: 510, speeds: 29 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-006', section: 8, weight: 95, speeds: 50 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-006', section: 9, weight: 95, speeds: 53 },
  { machine_no: 'MAC-02', bottle_id: 'BOT-006', section: 10, weight: 95, speeds: 56 },

  { machine_no: 'MAC-03', bottle_id: 'BOT-003', section: 8, weight: 380, speeds: 30 },
  { machine_no: 'MAC-03', bottle_id: 'BOT-003', section: 9, weight: 380, speeds: 32 },
  { machine_no: 'MAC-03', bottle_id: 'BOT-003', section: 10, weight: 380, speeds: 35 },
  { machine_no: 'MAC-03', bottle_id: 'BOT-007', section: 8, weight: 270, speeds: 35 },
  { machine_no: 'MAC-03', bottle_id: 'BOT-007', section: 9, weight: 270, speeds: 38 },
  { machine_no: 'MAC-03', bottle_id: 'BOT-007', section: 10, weight: 270, speeds: 40 },

  { machine_no: 'MAC-04', bottle_id: 'BOT-004', section: 6, weight: 180, speeds: 42 },
  { machine_no: 'MAC-04', bottle_id: 'BOT-004', section: 7, weight: 180, speeds: 45 },
  { machine_no: 'MAC-04', bottle_id: 'BOT-004', section: 8, weight: 180, speeds: 48 },
  { machine_no: 'MAC-04', bottle_id: 'BOT-002', section: 6, weight: 210, speeds: 38 },
  { machine_no: 'MAC-04', bottle_id: 'BOT-002', section: 7, weight: 210, speeds: 41 },
  { machine_no: 'MAC-04', bottle_id: 'BOT-002', section: 8, weight: 210, speeds: 44 },
];

// production_job starts empty by default.
export const PRODUCTION_JOB_SEED: ProductionJobRow[] = [];

// job_packaging starts empty by default.
export const JOB_PACKAGING_SEED: JobPackagingRow[] = [];
