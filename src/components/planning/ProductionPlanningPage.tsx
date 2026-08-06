import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  Clock,
  Download,
  Filter,
  Lock,
  Minus,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
} from 'lucide-react';
import {
  CompletedJobMap,
  MachineEntry,
  MachineLists,
  PackCatKey,
} from '../../types/planning';
import {
  INITIAL_DATE_ROWS,
  INITIAL_MACHINE_LISTS,
  VALID_SECTIONS,
  _month,
  _year,
  addMinutesToTime,
  calcGoodBottles,
  calcProductionMetrics,
  calcDraw,
  calcQty,
  lookupSpeed,
  makeNoneEntry,
} from '../../utils/planningCalculations';
import { addCalendarDays } from '../../utils/calculations';
import { EditSavePayload, DateRow } from '../../types/planning';
import { EditMachineModal } from './EditMachineModal';
import { EndJobModal } from './EndJobModal';

// ─── Production Planning Page ─────────────────────────────────────────────────

const STORAGE_KEY = 'vitrum_production_data_v4';

function loadFromStorage(): { machineLists: MachineLists; completedJobMap: CompletedJobMap } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // backward-compat: old flat array format
    if (Array.isArray(parsed) && parsed.length === 4) {
      return { machineLists: parsed as MachineLists, completedJobMap: {} };
    }
    if (parsed && Array.isArray(parsed.machineLists) && parsed.machineLists.length === 4) {
      return {
        machineLists: parsed.machineLists as MachineLists,
        completedJobMap: (parsed.completedJobMap ?? {}) as CompletedJobMap,
      };
    }
    return null;
  } catch { return null; }
}

export const ProductionPlanningPage: React.FC = () => {
  // Date rows are fixed; each machine owns an independent flat array.
  const [dateRows] = useState<DateRow[]>(INITIAL_DATE_ROWS);
  const [machineLists, setMachineLists] = useState<MachineLists>(() => {
    const stored = loadFromStorage();
    return stored?.machineLists ?? INITIAL_MACHINE_LISTS;
  });
  const [completedJobMap, setCompletedJobMap] = useState<CompletedJobMap>(() => {
    const stored = loadFromStorage();
    return stored?.completedJobMap ?? {};
  });
  const [editModal, setEditModal] = useState<{ mIdx: number; rowIdx: number; newJobStartTime?: string } | null>(null);
  const [endJobModal, setEndJobModal] = useState<{ mIdx: number; rowIdx: number } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{ entry: MachineEntry; mIdx: number; rowIdx: number; x: number; y: number } | null>(null);
  const [showSection, setShowSection] = useState(true);

  // Wrap setMachineLists to mark dirty on every change
  const updateMachineLists = useCallback((updater: (prev: MachineLists) => MachineLists) => {
    setMachineLists(prev => {
      const next = updater(prev);
      setIsDirty(true);
      return next;
    });
  }, []);

  const handleSaveToDb = async () => {
    setIsSaving(true);
    try {
      // Simulate a short async write (replace with real API / Supabase call here)
      await new Promise(res => setTimeout(res, 600));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ machineLists, completedJobMap }));
      setIsDirty(false);
      toast.success('Production data saved successfully.', { duration: 3000 });
    } catch {
      toast.error('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const totalVisualRows = Math.max(dateRows.length, ...machineLists.map(l => l.length));

  const allRowIndices = useMemo(() =>
    Array.from({ length: totalVisualRows }, (_, i) => i),
  [totalVisualRows]);

  const totalPages = Math.max(1, Math.ceil(allRowIndices.length / PAGE_SIZE));
  const pageIndices = allRowIndices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleApply = () => { setPage(1); };
  const handleReset = () => { setFromDate(''); setToDate(''); setPage(1); };

  // Continue the same bottle into the next date row for this machine only
  const handleContinueToNextDay = (mIdx: number, rowIdx: number) => {
    updateMachineLists(prev => {
      const source = prev[mIdx][rowIdx];
      if (!source || !source.product || source.product === 'None') return prev;
      const nextIdx = rowIdx + 1;
      if (nextIdx >= prev[mIdx].length) return prev;
      const nextEntry = prev[mIdx][nextIdx];
      if (
        nextEntry && !nextEntry.isBlank &&
        nextEntry.product && nextEntry.product !== 'None' &&
        nextEntry.product !== source.product
      ) {
        toast.error('The next day already has a different production entry.');
        return prev;
      }
      const next = [...prev] as MachineLists;
      const list = [...next[mIdx]];
      list[nextIdx] = {
        ...source,
        eid: Date.now() + mIdx,
        isBlank: false,
        startTime: undefined,
        endTime: undefined,
        status: 'running',
      };
      next[mIdx] = list;
      return next;
    });
  };

  // Remove blank entry at rowIdx from machine mIdx only
  const deleteBlankEntry = (mIdx: number, rowIdx: number) => {
    updateMachineLists(prev => {
      if (!prev[mIdx][rowIdx]?.isBlank) return prev;
      const next = [...prev] as MachineLists;
      const list = [...next[mIdx]];
      list.splice(rowIdx, 1);
      next[mIdx] = list;
      return next;
    });
  };

  const openEdit = (mIdx: number, rowIdx: number) => setEditModal({ mIdx, rowIdx });

  const updateSection = (mIdx: number, rowIdx: number, val: number) => {
    updateMachineLists(prev => {
      const next = [...prev] as MachineLists;
      const list = [...next[mIdx]];
      const entry = list[rowIdx];
      const newSpeed = lookupSpeed(mIdx + 1, entry.product, val);
      const speeds = newSpeed > 0 ? newSpeed : entry.speeds;
      const qty = calcQty(speeds, mIdx + 1);
      const requiredQty = entry.requiredBottles && entry.requiredBottles > 0 ? entry.requiredBottles : qty;
      const draw = calcDraw(entry.wt, requiredQty);
      list[rowIdx] = { ...entry, section: val, speeds, cut: speeds, qty, draw };
      next[mIdx] = list;
      return next;
    });
  };

  // ── Add Job workflow ──
  const handleAddJob = (mIdx: number, rowIdx: number) => {
    const entry = machineLists[mIdx][rowIdx];
    if (!entry) return;
    setEndJobModal({ mIdx, rowIdx });
  };

  const handleEndJobConfirm = (endTime: string, delayMinutes: number) => {
    if (!endJobModal) return;
    const { mIdx, rowIdx } = endJobModal;
    const currentEntry = machineLists[mIdx][rowIdx];
    const key = `${mIdx}-${rowIdx}`;
    const product = currentEntry.product;

    // Sum qty across all consecutive linked rows (same product, walking backward)
    let cumulativeQty = 0;
    if (product && product !== 'None') {
      let r = rowIdx;
      while (r >= 0) {
        const e = machineLists[mIdx][r];
        if (!e || e.isBlank || e.product !== product) break;
        cumulativeQty += e.cut > 0 ? calcQty(e.cut, mIdx + 1) : 0;
        r--;
      }
    }

    // Archive the current running job as completed, storing the job-wide total
    const completedJob: MachineEntry = { ...currentEntry, endTime, status: 'completed', cumulativeQty };
    setCompletedJobMap(prev => ({ ...prev, [key]: [...(prev[key] ?? []), completedJob] }));

    // New job starts after machine changeover (minutes, shift-day aware: wraps at 24 h)
    const newStartTime = delayMinutes > 0 ? addMinutesToTime(endTime, delayMinutes) : endTime;

    // Create a new blank running entry pre-seeded with the calculated start time
    const newEntry: MachineEntry = {
      ...makeNoneEntry(mIdx),
      startTime: newStartTime,
      status: 'running',
    };
    updateMachineLists(prev => {
      const next = [...prev] as MachineLists;
      const list = [...next[mIdx]];
      list[rowIdx] = newEntry;
      next[mIdx] = list;
      return next;
    });

    setEndJobModal(null);
    // Open the edit modal pre-seeded with the calculated start time
    setEditModal({ mIdx, rowIdx, newJobStartTime: newStartTime });
  };

  const handleSave = (payload: EditSavePayload) => {
    if (!editModal) return;
    const { bottle, salesExec, packingCategory, packingAllocations, palletPacking, palletPackingQty, requiredBottles, section, startTime } = payload;
    updateMachineLists(prev => {
      const next = [...prev] as MachineLists;
      const list = [...next[editModal.mIdx]];
      const cut = bottle.speeds > 0 ? bottle.speeds : 0;
      const qty = calcQty(cut, editModal.mIdx + 1);
      const requiredQtyValue = requiredBottles && requiredBottles > 0 ? requiredBottles : qty;
      const draw = calcDraw(bottle.wt, requiredQtyValue);
      list[editModal.rowIdx] = {
        ...list[editModal.rowIdx],
        isBlank: false,
        product: bottle.name,
        wt: bottle.wt,
        speeds: bottle.speeds,
        cut,
        draw,
        qty,
        salesExec,
        packingCategory,
        packingAllocations,
        palletPacking,
        palletPackingQty: palletPackingQty ?? null,
        requiredBottles: requiredBottles ?? null,
        section,
        startTime: startTime || undefined,
      };
      next[editModal.mIdx] = list;
      return next;
    });
    setEditModal(null);
  };

  // Total draw for a visual row: sum tons/day across all machines.
  // During changeover (running entry has no bottle set) we continue
  // counting the previous completed job's draw rate — the furnace keeps
  // pulling glass at the same rate while the machine is being changed over.
  const calcTotal = (rowIdx: number) =>
    machineLists.reduce((sum, list, mIdx) => {
      const e = list[rowIdx];
      const hasProduct = e && !e.isBlank && !!e.product && e.product !== 'None';
      if (hasProduct) {
        const qty = e.requiredBottles && e.requiredBottles > 0 ? e.requiredBottles : e.qty;
        return sum + calcDraw(e.wt, qty);
      }
      // Changeover period: fall back to last completed job's draw rate
      const completed = completedJobMap[`${mIdx}-${rowIdx}`] ?? [];
      if (completed.length > 0) {
        const last = completed[completed.length - 1];
        const qty = last.requiredBottles && last.requiredBottles > 0 ? last.requiredBottles : last.qty;
        return sum + calcDraw(last.wt, qty);
      }
      return sum;
    }, 0);

  const editingEntry = editModal ? machineLists[editModal.mIdx]?.[editModal.rowIdx] : null;

  const showTooltip = (e: React.MouseEvent, entry: MachineEntry, mIdx: number, rowIdx: number) => {
    setTooltip({ entry, mIdx, rowIdx, x: e.clientX, y: e.clientY });
  };
  const moveTooltip = (e: React.MouseEvent) => {
    if (tooltip) setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  };
  const hideTooltip = () => setTooltip(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Production Planning</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            {new Date(_year, _month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} &mdash; Current Month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <Printer size={14} /> Print
          </button>
          <button className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <Download size={14} /> Export
          </button>
          <button className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[#6B7280]" />
          <span className="text-sm font-semibold text-[#374151]">Filters</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">From Date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="h-9 px-2.5 text-sm border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">To Date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="h-9 px-2.5 text-sm border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleApply}
              className="h-9 px-4 text-sm font-semibold bg-[#2563EB] text-white rounded hover:bg-[#1D4ED8] transition-colors">
              Apply
            </button>
            <button onClick={handleReset}
              className="h-9 px-4 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#E5E7EB] bg-[#F8FAFC]">
          <span className="text-xs font-medium text-[#6B7280]">Production Register</span>
          <button
            onClick={() => setShowSection(s => !s)}
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
        <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
            <table className="w-full min-w-375 border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                {/* Machine group header */}
                <tr className="bg-[#DBEAFE] border-b border-[#BFDBFE]">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#1E40AF] border-r border-[#BFDBFE] w-27.5 sticky left-0 bg-[#DBEAFE]">
                    Date
                  </th>
                  {[1, 2, 3, 4].map(n => (
                    <th key={n} colSpan={showSection ? 6 : 5} className="px-3 py-2.5 text-center text-xs font-semibold text-[#1E40AF] border-r border-[#BFDBFE]">
                      Machine No {n}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-[#1E40AF] w-20">
                    Total Draw
                  </th>
                </tr>
                {/* Sub-header */}
                <tr className="bg-[#EFF6FF] border-b border-[#E5E7EB]">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] sticky left-0 bg-[#EFF6FF]"></th>
                  {[0, 1, 2, 3].map(mIdx => (
                    <React.Fragment key={mIdx}>
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
                {pageIndices.flatMap((rowIdx, displayIdx) => {
                  const dateRow = dateRows[rowIdx];
                  const baseBg = displayIdx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]';

                  const fmtTime = (t?: string) => {
                    if (!t) return '—';
                    const [h, m] = t.split(':');
                    const hr = parseInt(h, 10);
                    return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
                  };

                  // Per-machine: build ordered job list [completed..., running]
                  const machineJobs = machineLists.map((list, mIdx) => {
                    const completed = completedJobMap[`${mIdx}-${rowIdx}`] ?? [];
                    const running = list[rowIdx] ?? null;
                    return { completed, running };
                  });

                  const maxSlots = Math.max(
                    ...machineJobs.map(({ completed, running }) =>
                      completed.length + (running ? 1 : 0)
                    ), 1
                  );

                  return Array.from({ length: maxSlots }, (_, slotIdx) => {
                    const isFirstSlot = slotIdx === 0;
                    const isLastSlot  = slotIdx === maxSlots - 1;

                    return (
                      <tr key={`${rowIdx}-${slotIdx}`}
                        className={`${baseBg} ${isLastSlot ? 'border-b border-[#E5E7EB]' : 'border-b border-[#F0F4F8]'}`}>

                        {/* Date — rowSpan across all sub-rows for this date */}
                        {isFirstSlot && (
                          <td rowSpan={maxSlots}
                            className={`px-3 text-[11px] text-[#111827] border-r border-[#E5E7EB] font-semibold whitespace-nowrap sticky left-0 align-top pt-2.5 ${baseBg}`}>
                            {dateRow?.date ?? ''}
                          </td>
                        )}

                        {/* Machine columns — one <td> per column, per slot */}
                        {machineJobs.map(({ completed, running }, mIdx) => {
                          const numCompleted  = completed.length;
                          const hasRunning    = running !== null;

                          // Running job is always pinned to the LAST slot so all machines' active
                          // jobs land on the same horizontal row regardless of completed count.
                          const isRunningSlot = hasRunning && slotIdx === maxSlots - 1;

                          // Completed jobs are packed to the top; empty slots fill the gap above them.
                          const completedOffset = maxSlots - 1 - numCompleted; // slots before first completed
                          const completedIdx    = slotIdx - completedOffset;
                          const completedJob    = !isRunningSlot && completedIdx >= 0 && completedIdx < numCompleted
                            ? completed[completedIdx]
                            : null;
                          const isEmpty         = !isRunningSlot && completedJob === null;

                          // ── Empty slot ──────────────────────────────────────────
                          if (isEmpty) {
                            return (
                              <React.Fragment key={mIdx}>
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                                {showSection && <td className={`border-r border-[#E5E7EB] ${baseBg}`} />}
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                              </React.Fragment>
                            );
                          }

                          // ── Completed job row ────────────────────────────────────
                          if (completedJob) {
                            const completedMetrics = calcProductionMetrics(completedJob.cut, completedJob.wt, mIdx + 1);
                            const completedQty = completedJob.requiredBottles && completedJob.requiredBottles > 0
                              ? completedJob.requiredBottles
                              : completedJob.qty;
                            const completedDraw = calcDraw(completedJob.wt, completedQty);
                            const cellBg = 'bg-[#F3F4F6]';
                            const txt    = 'text-[10px] text-[#6B7280]';
                            return (
                              <React.Fragment key={mIdx}>
                                {/* BN */}
                                <td className={`px-2 py-1.5 border-l-2 border-r border-[#E5E7EB] ${cellBg}`}
                                  style={{ borderLeftColor: '#9CA3AF' }}>
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <Lock size={7} className="text-[#9CA3AF] shrink-0" />
                                    <span className="text-[9px] font-bold text-[#9CA3AF]">JOB {completedIdx + 1}</span>
                                  </div>
                                  <p className="text-[10px] font-semibold text-[#4B5563] truncate leading-tight">
                                    {completedJob.product && completedJob.product !== 'None' ? completedJob.product : '—'}
                                  </p>
                                  <div className="flex items-center gap-0.5 mt-0.5">
                                    <Clock size={7} className="text-[#9CA3AF] shrink-0" />
                                    <span className="text-[8px] text-[#9CA3AF]">
                                      {fmtTime(completedJob.startTime)} → {fmtTime(completedJob.endTime)}
                                    </span>
                                  </div>
                                  {/* Job-wide cumulative total — shown only on the final completed row */}
                                  {(completedJob.cumulativeQty ?? 0) > 0 && (
                                    <div className="mt-1 px-1.5 py-0.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded text-center">
                                      <span className="text-[8px] text-[#1D4ED8] font-semibold">
                                        Good: {calcGoodBottles(completedJob.cumulativeQty ?? 0).toLocaleString()} bottles
                                      </span>
                                    </div>
                                  )}
                                </td>
                                {/* Sec */}
                                {showSection && (
                                  <td className={`px-1 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                    <span className={txt}>{completedJob.section ?? '—'}</span>
                                  </td>
                                )}
                                {/* Wt */}
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className={txt}>{completedJob.wt || '—'}</span>
                                </td>
                                {/* Cut */}
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className={txt}>{completedJob.speeds || '—'}</span>
                                </td>
                                {/* Qty */}
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className={txt}>{completedMetrics.goodBottles > 0 ? `${completedMetrics.goodLiters.toFixed(2)}L` : '—'}</span>
                                </td>
                                {/* Draw */}
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className={txt}>
                                    {completedDraw > 0
                                      ? completedDraw.toFixed(1)
                                      : '—'}
                                  </span>
                                </td>
                              </React.Fragment>
                            );
                          }

                          // ── Running job row ──────────────────────────────────────
                          const entry = running!;
                          const isBlank    = !!entry.isBlank;
                          const hasProduct = !isBlank && !!entry.product && entry.product !== 'None';
                          const valid      = VALID_SECTIONS(mIdx);
                          const defaultSec = valid[valid.length - 1];
                          const secVal     = entry.section && valid.includes(entry.section) ? entry.section : defaultSec;
                          const isLowSec   = secVal < defaultSec;

                          const nextEntry    = machineLists[mIdx][rowIdx + 1];
                          const isContinuing = hasProduct &&
                            !!nextEntry && !nextEntry.isBlank &&
                            nextEntry.product === entry.product && nextEntry.product !== 'None';
                          const isLastDay  = !isContinuing;
                          const canExtend  = hasProduct && rowIdx + 1 < machineLists[mIdx].length;
                          const runningMetrics = calcProductionMetrics(entry.cut, entry.wt, mIdx + 1);
                          const runningQty = entry.requiredBottles && entry.requiredBottles > 0 ? entry.requiredBottles : entry.qty;
                          const runningDraw = calcDraw(entry.wt, runningQty);
                          const accentColor = isLowSec ? '#EF4444' : '#16A34A';
                          const cellBg      = 'bg-white';

                          return (
                            <React.Fragment key={mIdx}>
                              {/* BN */}
                              <td className={`px-2 py-1.5 border-l-2 border-r border-[#E5E7EB] ${cellBg}`}
                                style={{ borderLeftColor: accentColor }}>
                                {hasProduct || completed.length > 0 ? (
                                  <>
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <p
                                        onMouseEnter={e => hasProduct ? showTooltip(e, entry, mIdx, rowIdx) : undefined}
                                        onMouseMove={hasProduct ? moveTooltip : undefined}
                                        onMouseLeave={hasProduct ? hideTooltip : undefined}
                                        className={`text-[11px] font-semibold truncate leading-tight flex-1 cursor-default ${hasProduct ? 'text-[#111827]' : 'text-[#9CA3AF] italic'}`}>
                                        {hasProduct ? entry.product : 'No bottle set'}
                                      </p>
                                      {/* Quick-edit shortcut beside "No bottle set" */}
                                      {!hasProduct && (
                                        <button onClick={() => openEdit(mIdx, rowIdx)} title="Add bottle to this job"
                                          className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors">
                                          <Pencil size={7} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          updateMachineLists(prev => {
                                            const nxt = [...prev] as MachineLists;
                                            const l   = [...nxt[mIdx]];
                                            l[rowIdx] = makeNoneEntry(mIdx);
                                            nxt[mIdx] = l;
                                            return nxt;
                                          });
                                          setCompletedJobMap(prev => {
                                            const u = { ...prev };
                                            delete u[`${mIdx}-${rowIdx}`];
                                            return u;
                                          });
                                        }}
                                        title="Remove this job"
                                        className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] transition-colors">
                                        <Minus size={7} />
                                      </button>
                                    </div>
                                    {entry.startTime && (
                                      <div className="flex items-center gap-0.5 mb-1">
                                        <Clock size={7} className="text-[#6B7280] shrink-0" />
                                        <span className="text-[8px] text-[#6B7280]">{fmtTime(entry.startTime)}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {hasProduct && (
                                        <button onClick={() => openEdit(mIdx, rowIdx)} title="Edit"
                                          className="w-5 h-5 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors">
                                          <Pencil size={8} />
                                        </button>
                                      )}
                                      {canExtend && (
                                        <button onClick={() => handleContinueToNextDay(mIdx, rowIdx)}
                                          disabled={isContinuing}
                                          title={isContinuing ? 'Already continuing to next day' : 'Continue to next day'}
                                          className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
                                            isContinuing
                                              ? 'text-[#9CA3AF] bg-[#F3F4F6] border-[#E5E7EB] cursor-default'
                                              : 'text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] border-[#BBF7D0]'
                                          }`}>
                                          <Plus size={8} />
                                        </button>
                                      )}
                                      {hasProduct && isLastDay && (
                                        <button onClick={() => handleAddJob(mIdx, rowIdx)}
                                          title="Schedule a new job after this one finishes"
                                          className="flex items-center gap-0.5 h-5 px-1.5 text-[9px] font-semibold text-[#7C3AED] bg-[#F5F3FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] rounded transition-colors whitespace-nowrap">
                                          <ClipboardPlus size={8} /> Add Job
                                        </button>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-1 py-0.5">
                                    <button onClick={() => openEdit(mIdx, rowIdx)} title="Edit"
                                      className="w-5 h-5 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors">
                                      <Pencil size={8} />
                                    </button>
                                    {isBlank && (
                                      <button onClick={() => deleteBlankEntry(mIdx, rowIdx)} title="Remove row"
                                        className="w-5 h-5 flex items-center justify-center rounded text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] transition-colors">
                                        <Minus size={8} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                              {/* Sec */}
                              {showSection && (
                                <td className={`px-0.5 text-center border-r border-[#E5E7EB] ${isLowSec ? 'bg-[#FEF2F2]' : cellBg}`}>
                                  {hasProduct && (
                                    <div className="relative inline-flex items-center justify-center">
                                      <select value={secVal}
                                        onChange={e => updateSection(mIdx, rowIdx, Number(e.target.value))}
                                        className={`text-xs font-semibold appearance-none bg-transparent focus:outline-none cursor-pointer pr-3 ${isLowSec ? 'text-[#991B1B]' : 'text-[#7C3AED]'}`}>
                                        {valid.map(n => <option key={n} value={n}>{n}</option>)}
                                      </select>
                                      <ChevronDown size={8} className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none ${isLowSec ? 'text-[#991B1B]' : 'text-[#7C3AED]'}`} />
                                    </div>
                                  )}
                                </td>
                              )}
                              {/* Wt */}
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className="text-sm text-[#6B7280]">{hasProduct ? (entry.wt || '—') : ''}</span>
                              </td>
                              {/* Cut */}
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className="text-sm text-[#6B7280]">{hasProduct ? (entry.speeds || '—') : ''}</span>
                              </td>
                              {/* Qty */}
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className="text-sm font-medium text-[#111827]">
                                  {hasProduct ? (runningMetrics.goodBottles > 0 ? `${runningMetrics.goodLiters.toFixed(2)}L` : '—') : ''}
                                </span>
                              </td>
                              {/* Draw — during changeover use previous job's draw rate */}
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                {(() => {
                                  if (hasProduct) {
                                    return <span className="text-sm text-[#6B7280]">{runningDraw > 0 ? runningDraw.toFixed(1) : '—'}</span>;
                                  }
                                  // Changeover: show previous completed job's draw
                                  if (completed.length > 0) {
                                    const last = completed[completed.length - 1];
                                    const lastQty = last.requiredBottles && last.requiredBottles > 0 ? last.requiredBottles : last.qty;
                                    const lastDraw = calcDraw(last.wt, lastQty);
                                    return <span className="text-sm text-[#9CA3AF] italic">{lastDraw > 0 ? lastDraw.toFixed(1) : '—'}</span>;
                                  }
                                  return <span className="text-sm text-[#6B7280]"></span>;
                                })()}
                              </td>
                            </React.Fragment>
                          );
                        })}

                        {/* Total — rendered only on the last slot (running job row) */}
                        {isLastSlot ? (
                          <td className="px-3 text-center text-sm font-semibold text-[#111827]">
                            {(() => { const t = calcTotal(rowIdx); return t > 0 ? `${t.toFixed(1)} T` : '—'; })()}
                          </td>
                        ) : (
                          <td className={`${baseBg}`} />
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB]">
          <span className="text-sm text-[#6B7280]">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, allRowIndices.length)} of {allRowIndices.length} entries
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-8 w-8 flex items-center justify-center rounded border border-[#E5E7EB] text-[#374151] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`h-8 w-8 text-sm rounded border transition-colors
                  ${p === page
                    ? 'bg-[#2563EB] border-[#2563EB] text-white font-semibold'
                    : 'border-[#E5E7EB] text-[#374151] hover:bg-[#F8FAFC]'
                  }`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
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
          onClick={handleSaveToDb}
          disabled={!isDirty || isSaving}
          className={`h-10 flex items-center gap-2 px-5 text-sm font-semibold rounded-md transition-colors
            ${isDirty && !isSaving
              ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
              : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
            }`}
        >
          <Save size={15} />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Edit Modal */}
      {editModal && editingEntry && (
        <EditMachineModal
          machineNo={editModal.mIdx + 1}
          currentEntry={editingEntry}
          onSave={handleSave}
          onClose={() => setEditModal(null)}
          newJobStartTime={editModal.newJobStartTime}
        />
      )}

      {/* End Job Modal */}
      {endJobModal && (() => {
        const { mIdx, rowIdx } = endJobModal;
        const entry = machineLists[mIdx][rowIdx];
        const completed = completedJobMap[`${mIdx}-${rowIdx}`] ?? [];
        return (
          <EndJobModal
            jobNumber={completed.length + 1}
            startTime={entry?.startTime}
            onConfirm={handleEndJobConfirm}
            onClose={() => setEndJobModal(null)}
          />
        );
      })()}

      {/* Fixed-position tooltip — renders above ALL table overflow */}
      {tooltip && (() => {
        const { entry, mIdx, rowIdx } = tooltip;
        const metrics = calcProductionMetrics(entry.cut, entry.wt, mIdx + 1);
        const dailyQty = metrics.totalQuantity;
        const reqBottles = entry.requiredBottles ?? null;
        const estDays = dailyQty > 0 && reqBottles ? reqBottles / dailyQty : null;

        // Estimate completion date from start date row + estDays
        let estCompletionStr = '—';
        if (estDays !== null) {
          const startRow = dateRows[rowIdx];
          if (startRow) {
            // dateRows date is "DD Mon YYYY" from en-GB locale
            const parts = startRow.date.split(' ');
            const startDate = new Date(`${parts[1]} ${parts[0]} ${parts[2]}`);
            if (!isNaN(startDate.getTime())) {
              const completionDate = addCalendarDays(startDate, estDays);
              estCompletionStr = completionDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              // Append start time offset if present
              if (entry.startTime) {
                const [sh, sm] = entry.startTime.split(':').map(Number);
                const totalMins = sh * 60 + sm + (estDays % 1) * 24 * 60;
                const ch = Math.floor(totalMins / 60) % 24;
                const cm = Math.round(totalMins % 60);
                const mer = ch < 12 ? 'AM' : 'PM';
                estCompletionStr += `, ${ch % 12 || 12}:${String(cm).padStart(2, '0')} ${mer}`;
              }
            } else {
              estCompletionStr = `≈ ${estDays.toFixed(2)} days`;
            }
          } else {
            estCompletionStr = `≈ ${estDays.toFixed(2)} days`;
          }
        }

        return (
          <div
            className="pointer-events-none fixed z-9999"
            style={{ left: tooltip.x + 14, top: tooltip.y - 8, transform: 'translateY(-100%)' }}
          >
            <div className="bg-[#1E293B] text-white rounded-xl shadow-2xl p-3.5 min-w-55 text-xs space-y-2.5">
              {/* Bottle name header */}
              {entry.product && entry.product !== 'None' && (
                <div className="pb-2 border-b border-[#334155]">
                  <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Bottle</p>
                  <p className="font-bold text-white text-sm leading-tight">{entry.product}</p>
                </div>
              )}

              {entry.salesExec && (
                <div>
                  <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Sales Executive</p>
                  <p className="font-semibold text-white text-sm">{entry.salesExec}</p>
                </div>
              )}

              <div>
                <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Daily Good Bottles (90%)</p>
                <p className="font-bold text-[#38BDF8] text-sm">
                  {metrics.goodBottles > 0 ? `${metrics.goodLiters.toFixed(2)} L (${metrics.goodBottles.toLocaleString()} bottles)` : '—'}
                </p>
              </div>

              {/* Total Required Bottles */}
              <div>
                <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Total Required Bottles</p>
                <p className="font-semibold text-[#FCD34D] text-sm">
                  {reqBottles ? reqBottles.toLocaleString() : '—'}
                </p>
              </div>

              {/* Estimated Completion */}
              <div>
                <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Estimated Completion</p>
                <p className="font-semibold text-[#34D399] text-sm">{estCompletionStr}</p>
              </div>

              <div className="border-t border-[#334155] pt-2 space-y-2.5">
                {(() => {
                  const allocs = entry.packingAllocations;
                  const descMap: Record<PackCatKey, string> = { ST: 'Shrink Tray', SN: 'Shrink Naked', SB: 'Shrink Box', BT: 'Bottom Tray' };
                  if (allocs && Object.keys(allocs).length > 0) {
                    return (
                      <div>
                        <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-1">Packing Allocation</p>
                        <div className="space-y-0.5">
                          {(Object.entries(allocs) as [PackCatKey, number][]).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between">
                              <span className="text-white text-xs">
                                <span className="bg-[#334155] px-1.5 py-0.5 rounded mr-1.5 font-bold text-[10px]">{k}</span>
                                {descMap[k]}
                              </span>
                              <span className="text-[#38BDF8] font-semibold text-xs ml-3">{v > 0 ? v.toLocaleString() : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (entry.packingCategory) {
                    return (
                      <div>
                        <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Packing Category</p>
                        <p className="font-semibold text-white">
                          <span className="bg-[#334155] px-1.5 py-0.5 rounded mr-1.5 font-bold">{entry.packingCategory}</span>
                          {descMap[entry.packingCategory as PackCatKey] ?? ''}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {entry.palletPacking !== null && entry.palletPacking !== undefined && (
                  <div>
                    <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-1">Pallet Packing</p>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${entry.palletPacking ? 'bg-[#16A34A]' : 'bg-[#DC2626]'}`}>
                      {entry.palletPacking ? 'YES' : 'NO'}
                    </span>
                  </div>
                )}

                {/* Pallet Packing Quantity */}
                <div>
                  <p className="text-[#94A3B8] font-medium uppercase tracking-widest text-[9px] mb-0.5">Pallet Packing Qty</p>
                  <p className="font-semibold text-white text-sm">
                    {entry.palletPacking && entry.palletPackingQty ? entry.palletPackingQty.toLocaleString() : '—'}
                  </p>
                </div>
              </div>

              {/* Arrow */}
              <div className="absolute top-full left-4 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#1E293B]" />
            </div>
          </div>
        );
      })()}
    </div>
  );
};
