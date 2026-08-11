import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  Clock,
  Edit2,
  Lock,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { ProductionJob } from '../../types';
import {
  addCalendarDays,
  calculateProductionMetrics,
  calculateEstimatedCompletionDays,
  formatDateDisplay,
  formatDateTime,
  formatDecimal,
  formatNumber,
  generateMonthDates,
} from '../../utils/calculations';

type DraftFields = {
  sectionCount?: string;
  quantity?: string;
};

const PAGE_SIZE = 20;

interface PlanningTableProps {
  onRefresh?: () => void;
}

const getJobDate = (job: ProductionJob): string => job.date || job.startDate;

const toMinutes = (value?: string): number => {
  if (!value || !value.includes(':')) return 0;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

const formatTimeDisplay = (time?: string): string => {
  if (!time) return '--:--';
  const [hRaw, mRaw] = time.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
};

const isCompletedJob = (job: ProductionJob): boolean =>
  job.lifecycleStatus === 'COMPLETED' || Boolean(job.locked);

export const PlanningTable: React.FC<PlanningTableProps> = ({ onRefresh }) => {
  const {
    machines,
    jobs,
    bottles,
    fromDate,
    toDate,
    selectedMonth,
    openDrawerForEdit,
    deleteJob,
    extendJob,
    updateJobInline,
    getBottleConfiguration,
    saveJob,
    searchQuery,
  } = useERP();

  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [page, setPage] = useState(1);
  const [showSection, setShowSection] = useState(true);
  const [tooltip, setTooltip] = useState<{ job: ProductionJob; x: number; y: number } | null>(null);

  const [activeEntry, setActiveEntry] = useState<{ date: string; machineId: string } | null>(null);
  const [entryBottleQuery, setEntryBottleQuery] = useState('');
  const [entryBottleId, setEntryBottleId] = useState('');
  const [entrySectionCount, setEntrySectionCount] = useState(8);
  const [entryWeight, setEntryWeight] = useState('');
  const [entryCut, setEntryCut] = useState('');
  const [entryQty, setEntryQty] = useState('');
  const entryMetrics = calculateProductionMetrics(
    Number(entryCut || 0),
    Number(entryWeight || 0),
    activeEntry?.machineId,
    Number(entryQty || 0)
  );
  const entryDraw = entryMetrics.drawTons;

  const displayedMachines = machines;

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = Number(yearStr) || 2026;
  const monthIndex = (Number(monthStr) || 8) - 1;

  const allMonthDates = generateMonthDates(year, monthIndex);
  const filteredDates = allMonthDates.filter((date) => {
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });

  const totalEntries = filteredDates.length;
  const pageCount = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleDates = filteredDates.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const firstEntry = totalEntries === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastEntry = Math.min(safePage * PAGE_SIZE, totalEntries);

  const isDirty = activeEntry !== null || Object.keys(drafts).length > 0;

  const bottleById = useMemo(() => {
    const map = new Map<string, (typeof bottles)[number]>();
    bottles.forEach((b) => map.set(b.id, b));
    return map;
  }, [bottles]);

  const packagingByJobKey = useMemo(() => {
    const map = new Map<string, Array<{ packaging_type: string; quantity: number; pallet_packing: string; pallet_quantity: number }>>();
    const currentPackaging = JSON.parse(localStorage.getItem('vitrum-job_packaging-v1') || '[]') as Array<{
      plan_date: string;
      machine_no: string;
      bottle_id: string;
      section: number;
      start_time: string;
      packaging_type: string;
      quantity: number;
      pallet_packing: string;
      pallet_quantity: number;
    }>;

    currentPackaging.forEach((row) => {
      const key = [row.plan_date, row.machine_no, row.bottle_id, row.section, row.start_time].join('|');
      const current = map.get(key) || [];
      map.set(key, [...current, row]);
    });
    return map;
  }, [jobs]);

  const passesFilters = (job: ProductionJob): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    const dateText = getJobDate(job).toLowerCase();
    const bottle = bottleById.get(job.bottleId);
    const bottleName = bottle?.name.toLowerCase() || '';
    return dateText.includes(q) || bottleName.includes(q);
  };

  const getCellJobs = (date: string, machineId: string) => {
    return jobs
      .filter((job) => job.machineId === machineId && getJobDate(job) === date)
      .filter(passesFilters)
      .sort((a, b) => {
        const seqA = a.sequenceNumber || 0;
        const seqB = b.sequenceNumber || 0;
        if (seqA !== seqB) return seqA - seqB;
        return toMinutes(a.startTime) - toMinutes(b.startTime);
      });
  };

  const getJobKey = (job: ProductionJob): string =>
    [job.date || job.startDate, job.machineId, job.bottleId, job.sectionCount, job.startTime || '07:00'].join('|');

  const getJobSummary = (job: ProductionJob) => {
    const bottle = bottleById.get(job.bottleId);
    const config = getBottleConfiguration(job.machineId, job.bottleId, job.sectionCount);
    const weight = config?.weight ?? job.weightGrams;
    const cutSpeed = config?.speeds ?? job.cutPerMin;
    const startDateTime = new Date(`${job.date || job.startDate}T${job.startTime || '07:00'}:00`);

    const requiredQty =
      job.productionQuantity || job.grossQuantity;

    const metrics = calculateProductionMetrics(cutSpeed, weight, job.machineId, requiredQty);

    const hourlyProduction = metrics.hourlyQuantity;
    const dailyProduction = metrics.totalQuantity;
    const plannedProduction = metrics.goodBottles;
    const dailyPerDay = metrics.totalQuantity;

    const estimatedDays =
      calculateEstimatedCompletionDays(
        requiredQty,
        dailyPerDay
      );

    const completion = addCalendarDays(startDateTime, estimatedDays);
    const packagingRows = packagingByJobKey.get(getJobKey(job)) || [];
    const selectedPackaging = ['ST', 'SN', 'SB', 'BT']
      .map((code) => ({
        code,
        quantity: packagingRows.filter((row) => row.packaging_type === code).reduce((sum, row) => sum + row.quantity, 0),
      }))
      .filter((item) => item.quantity > 0);

    return {
      bottleName: bottle?.name || job.bottleId,
      bottleWeight: `${weight} g`,
      machineNumber: job.machineId,
      sections: job.sectionCount,
      status: job.status,
      cutSpeed: formatDecimal(cutSpeed, 2),
      hourlyProduction: formatNumber(hourlyProduction),
      dailyProduction: formatNumber(dailyProduction),
      plannedProduction: formatNumber(plannedProduction),
      // goodBottlesLabel: `${formatDecimal(metrics.goodLiters, 2)}L (${formatNumber(goodPerDay)} bottles)`,
      startDateTime: formatDateTime(job.date || job.startDate, job.startTime || '07:00'),
      endDateTime: formatDateTime(completion.toISOString().split('T')[0], completion.toTimeString().slice(0, 5)),
      totalRequired: formatNumber(job.productionQuantity || job.grossQuantity),
      jobDuration: `${estimatedDays.toFixed(2)} Days`,
      draw: `${formatDecimal(metrics.drawTons, 2)} T`,
      selectedPackaging,
      palletPacking: packagingRows.some((row) => row.pallet_packing === 'YES') ? 'YES' : 'NO',
      palletQuantity: packagingRows.find((row) => row.packaging_type === 'SN')?.pallet_quantity || 0,
    };
  };

  const calculateTotalDraw = (date: string): number => {
    return jobs
      .filter((job) => getJobDate(job) === date)
      .reduce((sum, job) => {
        const quantity =
          job.productionQuantity ||
          job.grossQuantity;

        const config = getBottleConfiguration(job.machineId, job.bottleId, job.sectionCount);
        const resolvedWeight = config?.weight ?? job.weightGrams;
        const resolvedCut = config?.speeds ?? job.cutPerMin;

        return sum + calculateProductionMetrics(
          resolvedCut,
          resolvedWeight,
          job.machineId,
          quantity
        ).drawTons;
      }, 0);
  };

  const setDraft = (jobId: string, field: keyof DraftFields, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [jobId]: {
        ...(prev[jobId] || {}),
        [field]: value,
      },
    }));
  };

  const clearDraftField = (jobId: string, field: keyof DraftFields) => {
    setDrafts((prev) => {
      const current = { ...(prev[jobId] || {}) };
      delete current[field];
      const next = { ...prev };
      if (Object.keys(current).length === 0) {
        delete next[jobId];
      } else {
        next[jobId] = current;
      }
      return next;
    });
  };

  const getDraftValue = (
    job: ProductionJob,
    field: keyof DraftFields,
    fallback: string
  ): string => {
    const value = drafts[job.id]?.[field];
    return value !== undefined ? value : fallback;
  };

  const commitNumeric = (
    job: ProductionJob,
    field: keyof DraftFields,
    key: 'productionQuantity',
    decimals: number = 0
  ) => {
    const raw = drafts[job.id]?.[field];
    if (raw === undefined) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      clearDraftField(job.id, field);
      return;
    }

    const normalized = decimals > 0 ? Number(parsed.toFixed(decimals)) : Math.round(parsed);
    const ok = updateJobInline(job.id, { [key]: normalized });
    if (ok) clearDraftField(job.id, field);
  };

  const resetEntryDraft = () => {
    setEntryBottleQuery('');
    setEntryBottleId('');
    setEntryWeight('');
    setEntryCut('');
    setEntryQty('');
  };

  const startEntry = (date: string, machineId: string) => {
    const machine = displayedMachines.find((m) => m.id === machineId);
    resetEntryDraft();
    setEntrySectionCount(machine?.defaultSectionsCount || 8);
    setActiveEntry({ date, machineId });
  };

  const applyEntryConfig = (machineId: string, bottleId: string, section: number) => {
    const config = getBottleConfiguration(machineId, bottleId, section);
    if (!config) return;
    setEntryWeight(String(config.weight));
    setEntryCut(formatDecimal(config.speeds, 2));
  };

  const handleEntryBottleChange = (machineId: string, value: string) => {
    setEntryBottleQuery(value);
    const match = bottles.find((b) => b.name.toLowerCase() === value.trim().toLowerCase());
    setEntryBottleId(match?.id || '');
    if (match) applyEntryConfig(machineId, match.id, entrySectionCount);
  };

  const handleEntrySectionChange = (machineId: string, value: number) => {
    setEntrySectionCount(value);
    if (entryBottleId) applyEntryConfig(machineId, entryBottleId, value);
  };

  const handleSaveChanges = () => {
    if (activeEntry) {
      if (!entryBottleId) {
        alert('Select a bottle from the bottle master to create the job.');
        return;
      }
      const qty = Number(entryQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        alert('Enter a valid quantity for the job.');
        return;
      }

      const saved = saveJob({
        machineId: activeEntry.machineId,
        date: activeEntry.date,
        startDate: activeEntry.date,
        endDate: activeEntry.date,
        bottleId: entryBottleId,
        sectionCount: entrySectionCount,
        grossQuantity: qty,
        productionQuantity: qty,
        startTime: '07:00',
      });

      if (!saved) return;

      setActiveEntry(null);
      resetEntryDraft();
      onRefresh?.();
      return;
    }

    onRefresh?.();
  };

  const showTooltip = (e: React.MouseEvent, job: ProductionJob) => {
    setTooltip({ job, x: e.clientX, y: e.clientY });
  };
  const moveTooltip = (e: React.MouseEvent) => {
    if (tooltip) setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null));
  };
  const hideTooltip = () => setTooltip(null);

  return (
    <div className="space-y-4">
      {/* Table Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#E5E7EB] bg-[#F8FAFC]">
          <span className="text-xs font-medium text-[#6B7280]">Production Register</span>
          <button
            onClick={() => setShowSection((s) => !s)}
            className={`flex items-center gap-2 h-7 px-3 text-xs font-semibold rounded-full border transition-all
              ${showSection
                ? 'bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#7C3AED] hover:text-[#7C3AED]'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${showSection ? 'bg-white' : 'bg-[#D1D5DB]'}`} />
            Section {showSection ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-240px)]">
          <table className="w-full min-w-375 border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              {/* Machine group header */}
              <tr className="bg-[#DBEAFE] border-b border-[#BFDBFE]">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#1E40AF] border-r border-[#BFDBFE] w-27.5 sticky left-0 z-40 bg-[#DBEAFE]">
                  Date
                </th>
                {displayedMachines.map((machine) => (
                  <th key={machine.id} colSpan={showSection ? 6 : 5} className="px-3 py-2.5 text-center text-xs font-semibold text-[#1E40AF] border-r border-[#BFDBFE]">
                    {machine.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-[#1E40AF] w-20">
                  Total Draw
                </th>
              </tr>
              {/* Sub-header */}
              <tr className="bg-[#EFF6FF] border-b border-[#E5E7EB]">
                <th className="px-3 py-2 text-left text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] sticky left-0 z-40 bg-[#EFF6FF]"></th>
                {displayedMachines.map((machine) => (
                  <React.Fragment key={`sub-${machine.id}`}>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-[#2563EB] border-r border-[#E5E7EB] w-40 bg-[#EFF6FF]">
                      Bottle Name
                    </th>
                    {showSection && (
                      <th className="px-1 py-2 text-center text-xs font-semibold text-[#7C3AED] border-r border-[#E5E7EB] w-10 bg-[#F5F3FF]">Sec</th>
                    )}
                    <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-13.75">Wt</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-15">Cut</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-15">Qty</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-13.75">Draw</th>
                  </React.Fragment>
                ))}
                <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151]"></th>
              </tr>
            </thead>
            <tbody>
              {visibleDates.map((date, displayIdx) => {
                const baseBg = displayIdx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]';
                const totalDraw = calculateTotalDraw(date);

                const machineSlots = displayedMachines.map((machine) => {
                  const cellJobs = getCellJobs(date, machine.id);
                  const completed = cellJobs.filter(isCompletedJob);
                  const activeJobs = cellJobs.filter((job) => !isCompletedJob(job));
                  const running = activeJobs[activeJobs.length - 1] || null;
                  return { machine, completed, running };
                });

                const maxSlots = Math.max(1, ...machineSlots.map((s) => s.completed.length + 1));

                return Array.from({ length: maxSlots }, (_, slotIdx) => {
                  const isFirstSlot = slotIdx === 0;
                  const isLastSlot = slotIdx === maxSlots - 1;

                  return (
                    <tr key={`${date}-${slotIdx}`}
                      className={`${baseBg} ${isLastSlot ? 'border-b border-[#E5E7EB]' : 'border-b border-[#F0F4F8]'}`}>
                      {isFirstSlot && (
                        <td rowSpan={maxSlots}
                          className={`px-3 text-[11px] text-[#111827] border-r border-[#E5E7EB] font-semibold whitespace-nowrap sticky left-0 z-20 align-top pt-2.5 ${baseBg}`}>
                          {formatDateDisplay(date)}
                        </td>
                      )}

                      {machineSlots.map(({ machine, completed, running }) => {
                        const isRunningSlot = slotIdx === maxSlots - 1;
                        const completedOffset = maxSlots - 1 - completed.length;
                        const completedIdx = slotIdx - completedOffset;
                        const completedJob = !isRunningSlot && completedIdx >= 0 && completedIdx < completed.length
                          ? completed[completedIdx]
                          : null;
                        const isEmpty = !isRunningSlot && completedJob === null;

                        if (isEmpty) {
                          return (
                            <React.Fragment key={machine.id}>
                              <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                              {showSection && <td className={`border-r border-[#E5E7EB] ${baseBg}`} />}
                              <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                              <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                              <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                              <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                            </React.Fragment>
                          );
                        }

                        if (completedJob) {
                          const cellBg = 'bg-[#F3F4F6]';
                          const txt = 'text-[10px] text-[#6B7280]';
                          const completedMetrics = calculateProductionMetrics(
                            completedJob.cutPerMin,
                            completedJob.weightGrams,
                            completedJob.machineId
                          );

                          const completedQuantity =
                            completedJob.productionQuantity || completedJob.grossQuantity;

                          const completedDraw = calculateProductionMetrics(
                            completedJob.cutPerMin,
                            completedJob.weightGrams,
                            completedJob.machineId,
                            completedQuantity
                          ).drawTons;
                          const good = completedMetrics.goodBottles;
                          return (
                            <React.Fragment key={machine.id}>
                              <td className={`px-2 py-1.5 border-l-2 border-r border-[#E5E7EB] ${cellBg}`}
                                style={{ borderLeftColor: '#9CA3AF' }}>
                                <div className="flex items-center gap-1 mb-0.5">
                                  <Lock size={7} className="text-[#9CA3AF] shrink-0" />
                                  <span className="text-[9px] font-bold text-[#9CA3AF]">JOB {completedIdx + 1}</span>
                                </div>
                                <p className="text-[10px] font-semibold text-[#4B5563] truncate leading-tight">
                                  {bottleById.get(completedJob.bottleId)?.name || completedJob.bottleId}
                                </p>
                                <div className="flex items-center gap-0.5 mt-0.5">
                                  <Clock size={7} className="text-[#9CA3AF] shrink-0" />
                                  <span className="text-[8px] text-[#9CA3AF]">
                                    {formatTimeDisplay(completedJob.startTime)} → {formatTimeDisplay(completedJob.expectedEndTime)}
                                  </span>
                                </div>
                                <div className="mt-1 px-1.5 py-0.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded text-center">
                                  <span className="text-[8px] text-[#1D4ED8] font-semibold">
                                    Good: {good.toLocaleString()} bottles
                                  </span>
                                </div>
                              </td>
                              {showSection && (
                                <td className={`px-1 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className={txt}>{completedJob.sectionCount ?? '—'}</span>
                                </td>
                              )}
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className={txt}>{completedJob.weightGrams || '—'}</span>
                              </td>
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className={txt}>{completedJob.cutPerMin || '—'}</span>
                              </td>
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                {/* <span className={txt}>{completedMetrics.goodBottles > 0 ? `${formatDecimal(completedMetrics.goodLiters, 2)}L` : '—'}</span> */}
                              </td>
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className={txt}>
                                  {completedDraw > 0
                                    ? formatDecimal(completedDraw, 2)
                                    : '—'}                                </span>
                              </td>
                            </React.Fragment>
                          );
                        }

                        // ── Running slot ──────────────────────────────────────
                        const isEntryActive = activeEntry !== null &&
                          activeEntry.date === date &&
                          activeEntry.machineId === machine.id;
                        const cellBg = 'bg-white';
                        const isLowSec = running !== null && running.sectionCount < machine.defaultSectionsCount;
                        const accentColor = isLowSec ? '#EF4444' : '#16A34A';

                        return (
                          <React.Fragment key={machine.id}>
                            <td className={`px-2 py-1.5 border-l-2 border-r border-[#E5E7EB] ${cellBg}`}
                              style={{ borderLeftColor: accentColor }}>
                              {isEntryActive ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setActiveEntry(null)}
                                    title="Cancel entry"
                                    className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] transition-colors">
                                    <X size={8} />
                                  </button>
                                  <input
                                    type="search"
                                    value={entryBottleQuery}
                                    onChange={(e) => handleEntryBottleChange(machine.id, e.target.value)}
                                    placeholder="Bottle name..."
                                    list="planning-inline-bottles"
                                    className="w-full min-w-0 h-5 text-[10px] border border-[#BFDBFE] rounded px-1 bg-white focus:outline-none focus:border-[#2563EB]"
                                  />
                                  <datalist id="planning-inline-bottles">
                                    {bottles.map((bottle) => (
                                      <option key={bottle.id} value={bottle.name} />
                                    ))}
                                  </datalist>
                                </div>
                              ) : running ? (
                                <>
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <p
                                      onMouseEnter={(e) => showTooltip(e, running)}
                                      onMouseMove={moveTooltip}
                                      onMouseLeave={hideTooltip}
                                      className="text-[11px] font-semibold truncate leading-tight flex-1 cursor-default text-[#111827]">
                                      {bottleById.get(running.bottleId)?.name || running.bottleId}
                                    </p>
                                    <button
                                      onClick={() => openDrawerForEdit(running, machine.id, date)}
                                      title="Edit"
                                      className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors">
                                      <Edit2 size={7} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Delete Job?')) deleteJob(running.id);
                                      }}
                                      title="Remove job"
                                      className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] transition-colors">
                                      <Trash2 size={7} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-0.5 mb-1">
                                    <Clock size={7} className="text-[#6B7280] shrink-0" />
                                    <span className="text-[8px] text-[#6B7280]">{formatTimeDisplay(running.startTime)}</span>
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <button
                                      onClick={() => extendJob(running.id, 1)}
                                      title="Continue to next day"
                                      className="w-5 h-5 flex items-center justify-center rounded text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] transition-colors">
                                      <Plus size={8} />
                                    </button>
                                    <button
                                      onClick={() => openDrawerForEdit(null, machine.id, date)}
                                      title="Schedule a new job"
                                      className="flex items-center gap-0.5 h-5 px-1.5 text-[9px] font-semibold text-[#7C3AED] bg-[#F5F3FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] rounded transition-colors whitespace-nowrap">
                                      <ClipboardPlus size={8} /> Add Job
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-1 py-0.5">
                                  <button
                                    onClick={() => startEntry(date, machine.id)}
                                    title="Add Job"
                                    className="w-5 h-5 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors">
                                    <Edit2 size={8} />
                                  </button>
                                </div>
                              )}
                            </td>
                            {/* Sec */}
                            <td className={`px-0.5 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                              {isEntryActive ? (
                                <select
                                  value={entrySectionCount}
                                  onChange={(e) => handleEntrySectionChange(machine.id, Number(e.target.value))}
                                  className="w-full text-xs font-semibold text-[#7C3AED] border border-[#E5E7EB] rounded bg-white focus:outline-none focus:border-[#2563EB]">
                                  {(machine.availableSections || []).map((section) => (
                                    <option key={section} value={section}>{section}</option>
                                  ))}
                                </select>
                              ) : running ? (
                                <div className="relative inline-flex items-center justify-center">
                                  <select
                                    value={String(running.sectionCount)}
                                    onChange={(event) => {
                                      const nextSection = Number(event.target.value);
                                      updateJobInline(running.id, { sectionCount: nextSection });
                                    }}
                                    className={`text-xs font-semibold appearance-none focus:outline-none cursor-pointer pr-5 pl-2 py-1 rounded-md border transition-colors ${isLowSec
                                      ? 'bg-red-500 text-white border border-red-700'
                                      : 'bg-transparent text-[#7C3AED]'
                                      }`}>
                                    {(machine.availableSections || []).map((section) => (
                                      <option key={section} value={section}>{section}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={10}
                                    className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none ${isLowSec
                                      ? 'text-red-800'
                                      : 'text-[#7C3AED]'
                                      }`} />
                                </div>
                              ) : null}
                            </td>
                            {/* Wt */}
                            <td className={`px-1 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                              {isEntryActive ? (
                                <input
                                  type="text"
                                  value={entryWeight}
                                  readOnly
                                  className="w-full h-5 text-[10px] text-center border border-[#E5E7EB] rounded bg-white focus:outline-none"
                                />
                              ) : running ? (
                                <span className="text-sm text-[#6B7280]">{running.weightGrams || '—'}</span>
                              ) : null}
                            </td>
                            {/* Cut */}
                            <td className={`px-1 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                              {isEntryActive ? (
                                <input
                                  type="text"
                                  value={entryCut}
                                  readOnly
                                  className="w-full h-5 text-[10px] text-center border border-[#E5E7EB] rounded bg-white focus:outline-none"
                                />
                              ) : running ? (
                                <span className="text-sm text-[#6B7280]">{formatDecimal(running.cutPerMin, 2)}</span>
                              ) : null}
                            </td>
                            {/* Qty */}
                            <td className={`px-1 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                              {isEntryActive ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={entryQty}
                                  onChange={(e) => setEntryQty(e.target.value)}
                                  placeholder="Qty"
                                  className="w-full h-5 text-[10px] text-center border border-[#E5E7EB] rounded bg-white focus:outline-none focus:border-[#2563EB]"
                                />
                              ) : running ? (
                                <input
                                  type="number"
                                  step="1"
                                  min={0}
                                  value={getDraftValue(running, 'quantity', String(running.productionQuantity || running.grossQuantity))}
                                  onChange={(event) => setDraft(running.id, 'quantity', event.target.value)}
                                  onBlur={() => commitNumeric(running, 'quantity', 'productionQuantity', 0)}
                                  className="w-full bg-transparent text-sm font-medium text-[#111827] text-center focus:outline-none focus:ring-1 focus:ring-[#2563EB] rounded"
                                />
                              ) : null}
                            </td>
                            {/* Draw */}
                            <td className={`px-1 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                              {isEntryActive ? (
                                <input
                                  type="text"
                                  value={formatDecimal(entryDraw, 2)}
                                  readOnly
                                  className="w-full h-5 text-[10px] text-center border border-[#E5E7EB] rounded bg-white focus:outline-none focus:border-[#2563EB]"
                                />
                              ) : running ? (
                                (() => {
                                  const runningQuantity =
                                    running.productionQuantity || running.grossQuantity;

                                  const runningQuantityValue = getDraftValue(running, 'quantity', String(runningQuantity));
                                  const runningDraftQuantity = runningQuantityValue === '' ? runningQuantity : Number(runningQuantityValue);

                                  const runningDraw = calculateProductionMetrics(
                                    running.cutPerMin,
                                    running.weightGrams,
                                    running.machineId,
                                    runningDraftQuantity
                                  ).drawTons;

                                  return (
                                    <input
                                      type="text"
                                      value={formatDecimal(runningDraw, 2)}
                                      readOnly
                                      className="w-full bg-transparent text-sm text-[#6B7280] text-center focus:outline-none rounded"
                                    />
                                  );
                                })()
                              ) : null}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Total Draw — only on the last slot row */}
                      {isLastSlot ? (
                        <td className="px-3 text-center text-sm font-semibold text-[#111827]">
                          {totalDraw > 0 ? `${totalDraw.toFixed(1)} T` : '—'}
                        </td>
                      ) : (
                        <td className={baseBg} />
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB]">
          <span className="text-sm text-[#6B7280]">
            Showing {firstEntry}–{lastEntry} of {totalEntries} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="h-8 w-8 flex items-center justify-center rounded border border-[#E5E7EB] text-[#374151] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`h-8 w-8 text-sm rounded border transition-colors
                  ${p === safePage
                    ? 'bg-[#2563EB] border-[#2563EB] text-white font-semibold'
                    : 'border-[#E5E7EB] text-[#374151] hover:bg-[#F8FAFC]'
                  }`}>
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
              className="h-8 w-8 flex items-center justify-center rounded border border-[#E5E7EB] text-[#374151] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Save Bar ── */}
      <div className={`flex items-center justify-between gap-4 bg-white border rounded-lg px-5 py-3 transition-colors ${isDirty ? 'border-[#BFDBFE] bg-[#EFF6FF]' : 'border-[#E5E7EB]'}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isDirty ? 'bg-[#F59E0B]' : 'bg-[#16A34A]'}`} />
          <span className="text-sm text-[#374151]">
            {isDirty
              ? 'You have unsaved changes. Click Save to store them in the database.'
              : 'All changes are saved.'}
          </span>
        </div>
        <button
          onClick={handleSaveChanges}
          disabled={!isDirty}
          className={`h-10 flex items-center gap-2 px-5 text-sm font-semibold rounded-md transition-colors
            ${isDirty
              ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
              : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
            }`}>
          <Save size={15} />
          Save Changes
        </button>
      </div>

      {/* Fixed-position tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-9999"
          style={{ left: tooltip.x + 14, top: tooltip.y - 8, transform: 'translateY(-100%)' }}
        >
          <div className="bg-[#1E293B] text-white rounded-xl shadow-2xl p-3.5 min-w-60 text-xs space-y-2.5">
            {(() => {
              const s = getJobSummary(tooltip.job);
              return (
                <>
                  <div className="pb-2 border-b border-[#334155]">
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Bottle</p>
                    <p className="font-bold text-white text-sm leading-tight">{s.bottleName}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div>
                      <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Machine</p>
                      <p className="font-semibold text-[#38BDF8] text-sm">{s.machineNumber}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Sections</p>
                      <p className="font-semibold text-[#38BDF8] text-sm">{s.sections}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Weight</p>
                      <p className="font-semibold text-white text-sm">{s.bottleWeight}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Cut Speed</p>
                      <p className="font-semibold text-white text-sm">{s.cutSpeed}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Daily Good Bottles (90%)</p>
                    {/* <p className="font-bold text-[#38BDF8] text-sm">{s.goodBottlesLabel}</p> */}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div>
                      <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Total Quantity (24h)</p>
                      <p className="font-semibold text-white text-sm">{s.dailyProduction}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Draw (Ton)</p>
                      <p className="font-semibold text-white text-sm">{s.draw}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Total Required Bottles</p>
                    <p className="font-semibold text-[#FCD34D] text-sm">{s.totalRequired}</p>
                  </div>
                  <div>
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Start Time</p>
                    <p className="font-semibold text-white text-sm">{s.startDateTime}</p>
                  </div>
                  <div>
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Estimated Completion</p>
                    <p className="font-semibold text-[#34D399] text-sm">{s.jobDuration} · {s.endDateTime}</p>
                  </div>
                  <div>
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Current Status</p>
                    <p className="font-semibold text-white text-sm">{s.status}</p>
                  </div>
                  <div className="border-t border-[#334155] pt-2 space-y-2">
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Packing Allocation</p>
                    {s.selectedPackaging.length > 0 ? (
                      <div className="space-y-0.5">
                        {s.selectedPackaging.map((item) => (
                          <div key={item.code} className="flex items-center justify-between">
                            <span className="text-white text-xs">
                              <span className="bg-[#334155] px-1.5 py-0.5 rounded mr-1.5 font-bold text-[10px]">{item.code}</span>
                            </span>
                            <span className="text-[#38BDF8] font-semibold text-xs">{formatNumber(item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#94A3B8] text-xs">No packaging selected</p>
                    )}
                  </div>
                  <div className="border-t border-[#334155] pt-2 flex items-center justify-between">
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px]">Pallet Packing</p>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${s.palletPacking === 'YES' ? 'bg-[#16A34A] text-white' : 'bg-[#DC2626] text-white'}`}>
                      {s.palletPacking}
                    </span>
                  </div>
                </>
              );
            })()}
            <div className="absolute top-full left-4 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#1E293B]" />
          </div>
        </div>
      )}
    </div>
  );
};
