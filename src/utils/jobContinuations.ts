import { ProductionJob } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const getJobDate = (job: ProductionJob): string => job.date || job.startDate;

const getJobStartTime = (job: ProductionJob): string => job.startTime || '07:00';

const parseJobStart = (job: ProductionJob): Date => new Date(`${getJobDate(job)}T${getJobStartTime(job)}:00`);

const normalizePositive = (value: number | undefined): number => {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return 0;
  return value;
};

export const getPlannedJobQuantity = (job: ProductionJob): number =>
  normalizePositive(job.productionQuantity ?? job.grossQuantity);

export const getActualProducedQuantity = (job: ProductionJob): number =>
  Math.min(normalizePositive(job.producedQuantity), getPlannedJobQuantity(job));

export const isJobCompleted = (job: ProductionJob): boolean =>
  job.lifecycleStatus === 'COMPLETED' || Boolean(job.locked) || job.status === 'Completed';

const compareJobs = (left: ProductionJob, right: ProductionJob): number => {
  const timeDiff = parseJobStart(left).getTime() - parseJobStart(right).getTime();
  if (timeDiff !== 0) return timeDiff;
  return left.id.localeCompare(right.id);
};

export const getJobContinuationGroupId = (job: ProductionJob): string =>
  job.linkedJobGroupId || [job.machineId, job.bottleId, job.sectionCount, getJobStartTime(job)].join('|');

export const getJobContinuationChain = (
  job: ProductionJob,
  jobs: ProductionJob[]
): ProductionJob[] => {
  const groupId = getJobContinuationGroupId(job);
  return jobs
    .filter((candidate) => getJobContinuationGroupId(candidate) === groupId)
    .sort(compareJobs);
};

const getChainTargetQuantity = (chain: ProductionJob[]): number => {
  const hasPersistedTarget = chain.some((job) => normalizePositive(job.grossQuantity) > getPlannedJobQuantity(job));
  if (hasPersistedTarget) {
    return chain.reduce((max, job) => Math.max(max, normalizePositive(job.grossQuantity)), 0);
  }

  return chain.reduce((sum, job) => sum + getPlannedJobQuantity(job), 0);
};

const getCoveredQuantityForPastRow = (job: ProductionJob): number => {
  const actual = getActualProducedQuantity(job);
  if (actual > 0) return actual;
  return getPlannedJobQuantity(job);
};

const getCoveredQuantityForScheduledRow = (job: ProductionJob): number => {
  const actual = getActualProducedQuantity(job);
  if (isJobCompleted(job) && actual > 0) {
    return actual;
  }

  return getPlannedJobQuantity(job);
};

export interface JobContinuationProgress {
  groupId: string;
  chain: ProductionJob[];
  currentIndex: number;
  totalRequiredQuantity: number;
  plannedQuantity: number;
  scheduledQuantityTotal: number;
  producedBeforeCurrent: number;
  currentActualProduced: number;
  remainingQuantity: number;
  remainingAfterCurrentPlanned: number;
  remainingToSchedule: number;
}

export const getJobContinuationProgress = (
  job: ProductionJob,
  jobs: ProductionJob[]
): JobContinuationProgress => {
  const chain = getJobContinuationChain(job, jobs);
  const currentIndex = chain.findIndex((candidate) => candidate.id === job.id);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const totalRequiredQuantity = getChainTargetQuantity(chain);
  const plannedQuantity = getPlannedJobQuantity(job);
  const scheduledQuantityTotal = chain.reduce((sum, candidate) => sum + getPlannedJobQuantity(candidate), 0);
  const producedBeforeCurrent = chain
    .slice(0, safeIndex)
    .reduce((sum, candidate) => sum + getCoveredQuantityForPastRow(candidate), 0);
  const currentActualProduced = getActualProducedQuantity(job);
  const scheduledCoverage = chain.reduce((sum, candidate) => sum + getCoveredQuantityForScheduledRow(candidate), 0);
  const remainingQuantity = Math.max(totalRequiredQuantity - producedBeforeCurrent - currentActualProduced, 0);
  const remainingAfterCurrentPlanned = Math.max(totalRequiredQuantity - producedBeforeCurrent - plannedQuantity, 0);
  const remainingToSchedule = Math.max(totalRequiredQuantity - scheduledCoverage, 0);

  return {
    groupId: getJobContinuationGroupId(job),
    chain,
    currentIndex: safeIndex,
    totalRequiredQuantity,
    plannedQuantity,
    scheduledQuantityTotal,
    producedBeforeCurrent,
    currentActualProduced,
    remainingQuantity,
    remainingAfterCurrentPlanned,
    remainingToSchedule,
  };
};

export const areJobsOnAdjacentDays = (left: ProductionJob, right: ProductionJob): boolean => {
  const leftStart = parseJobStart(left);
  const rightStart = parseJobStart(right);
  return Math.round((rightStart.getTime() - leftStart.getTime()) / DAY_MS) === 1;
};
