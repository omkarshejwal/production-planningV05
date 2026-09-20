import React, { useCallback, useMemo, useState, useEffect } from 'react';

import { toast } from 'sonner';
import { useERP } from '../../context/ERPContext';
import { planningRepository } from '../../services/planningRepository';
import { ProductionJobRow } from '../../data/planningSchema';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardPlus,
  Clock,
  Download,
  Filter,
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
  INITIAL_MACHINE_LISTS,
  MAX_SECTIONS,
  VALID_SECTIONS,
  VALID_SECTIONS_FOR_BOTTLE,
  _month,
  _year,
  addMinutesToTime,
  calcGoodBottles,
  calcProductionMetrics,
  calcDraw,
  calcQty,
  calculateDailyDrawForEntries,
  calculateDrawForProductionDay,
  calculateQuantityForProductionDay,
  lookupSpeed,
  makeNoneEntry,
} from '../../utils/planningCalculations';
import { addCalendarDays } from '../../utils/calculations';
import { buildExportData } from '../../utils/exportData';
import { EditSavePayload, DateRow } from '../../types/planning';
import { EditMachineModal } from './EditMachineModal';
import { EndJobModal } from './EndJobModal';
import { ConfirmationModal } from '../common/ConfirmationModal';
import ExcelJS, { Row, Cell, Column } from 'exceljs';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const normalizeMonthToken = (value: string): string => {
  const token = value.trim();
  if (!token) return token;
  return token.slice(0, 3);
};

const dateRowToIso = (dateText: string): string | null => {
  const [dayRaw, monthRaw, yearRaw] = dateText.split(' ');
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const monthIndex = MONTH_NAMES.indexOf(normalizeMonthToken(monthRaw));

  if (!Number.isInteger(day) || !Number.isInteger(year) || monthIndex < 0) return null;
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const asNumber = (value: string): number | null => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const calculateTimeDeltaMinutes = (
  date1: string, time1: string,
  date2: string, time2: string
): number => {
  const [y1, m1, d1] = date1.split('-').map(Number);
  const [h1, min1] = time1.split(':').map(Number);
  const dt1 = new Date(y1, m1 - 1, d1, h1, min1);

  const [y2, m2, d2] = date2.split('-').map(Number);
  const [h2, min2] = time2.split(':').map(Number);
  const dt2 = new Date(y2, m2 - 1, d2, h2, min2);

  return Math.round((dt2.getTime() - dt1.getTime()) / (1000 * 60));
};

const subtractMinutesFromTime = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = ((h * 60 + m - minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

const parseDisplayDate = (value: string): Date | null => {
  const [dayRaw, monthRaw, yearRaw] = value.trim().split(' ');
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const monthIndex = MONTH_NAMES.indexOf(normalizeMonthToken(monthRaw));
  if (!Number.isInteger(day) || !Number.isInteger(year) || monthIndex < 0) return null;
  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parseTimeToMinutes = (time?: string): number | null => {
  if (!time) return null;

  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const formatCompletionDateTime = (date: Date): string => {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const calculateEstimatedCompletion = (
  planDate: string,
  startTime: string | undefined,
  requiredBottles: number,
  cut: number,
  wt: number,
  machineNo: number
): string => {
  if (!planDate || !startTime || requiredBottles <= 0 || cut <= 0) {
    return '—';
  }

  const startMinutes = parseTimeToMinutes(startTime);

  if (startMinutes === null) {
    return '—';
  }

  // Reuse the application's existing production-rate calculation.
  const metrics = calcProductionMetrics(cut, wt, machineNo);

  const hourlyQty = metrics.totalQuantity / 24;

  if (!Number.isFinite(hourlyQty) || hourlyQty <= 0) {
    return '—';
  }

  const productionMinutes = (requiredBottles / hourlyQty) * 60;

  if (!Number.isFinite(productionMinutes) || productionMinutes < 0) {
    return '—';
  }

  const [year, month, day] = planDate.split('-').map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return '—';
  }

  const completion = new Date(
    year,
    month - 1,
    day,
    Math.floor(startMinutes / 60),
    startMinutes % 60,
    0,
    0
  );

  completion.setMinutes(
    completion.getMinutes() + Math.round(productionMinutes)
  );

  return formatCompletionDateTime(completion);
};


const normalizeMonthKey = (value: string): string => {
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || 1;
  return `${year}-${String(month).padStart(2, '0')}`;
};

const getMonthRange = (value: string) => {
  const normalized = normalizeMonthKey(value);
  const [yearStr, monthStr] = normalized.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || 1;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  return { normalized, year, month, monthStart, monthEnd };
};

const buildExportFilename = (
  month: number,
  year: number,
  fromDate: string,
  toDate: string,
  isFiltered: boolean
): string => {
  if (fromDate || toDate) {
    const start = fromDate || 'start';
    const end = toDate || 'end';
    return `Production_Planning_${start}_to_${end}.xlsx`;
  }

  if (isFiltered) {
    return 'Production_Planning_Filtered.xlsx';
  }

  const monthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' });
  return `Production_Planning_${monthName}_${year}.xlsx`;
};

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
  const { jobs, bottles, holidays, refreshPlanner, reloadJobsForWindow, selectedMonth, setSelectedMonth, fromDate, setFromDate, toDate, setToDate } = useERP();

  // Filters
  const [draftFromDate, setDraftFromDate] = useState(fromDate);
  const [draftToDate, setDraftToDate] = useState(toDate);
  const [appliedFromDate, setAppliedFromDate] = useState(fromDate);
  const [appliedToDate, setAppliedToDate] = useState(toDate);

  // Lowercase name → first matching bottle (for the per-cell product lookup)
  const bottleNameLookup = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const b of bottles) {
      const key = b.name.toLowerCase();
      if (!m.has(key)) m.set(key, b);
    }
    return m;
  }, [bottles]);

  const dateRows = useMemo<DateRow[]>(() => {
    const { monthStart, monthEnd } = getMonthRange(selectedMonth);
    const startIso = appliedFromDate || monthStart;
    const endIso = appliedToDate || monthEnd;

    const [startYear, startMonth, startDay] = startIso.split('-').map(Number);
    const [endYear, endMonth, endDay] = endIso.split('-').map(Number);

    const startDate = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const totalDays = Math.min(diffDays > 0 ? diffDays : 1, 65);

    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(startYear, startMonth - 1, startDay + i);
      return {
        id: i + 1,
        date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        isoDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        weekday: d.toLocaleDateString('en-GB', { weekday: 'long' }),
      };
    });
  }, [selectedMonth, appliedFromDate, appliedToDate]);

  // Set of row indices whose date falls on a Sunday (day 0)
  const sundayRowIndices = useMemo(() => {
    const s = new Set<number>();
    dateRows.forEach((dr, idx) => {
      const [y, m, d] = dr.isoDate.split('-').map(Number);
      if (new Date(y, m - 1, d).getDay() === 0) s.add(idx);
    });
    return s;
  }, [dateRows]);

  // Holiday lookup: isoDate → holiday_name, and set of row indices that are holidays
  // (holidays come from the shared cache via ERPContext — no extra API call)

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) {
      m.set(h.holiday_date, h.holiday_name);
    }
    return m;
  }, [holidays]);

  const holidayRowIndices = useMemo(() => {
    const s = new Set<number>();
    dateRows.forEach((dr, idx) => {
      if (holidayMap.has(dr.isoDate)) s.add(idx);
    });
    return s;
  }, [dateRows, holidayMap]);

  const [machineLists, setMachineLists] = useState<MachineLists>(INITIAL_MACHINE_LISTS);
  const [completedJobMap, setCompletedJobMap] = useState<CompletedJobMap>({});

  // Pending extend: queued when the target date is outside the current dateRows
  // and the range needs expanding + data reloading before the extend can proceed.
  const pendingExtendRef = React.useRef<{
    mIdx: number;
    sourceRowIdx: number;
    daysToAdd: number;
    completedIndex?: number;
  } | null>(null);

  // Track previous dateRows to detect incremental growth (extend) vs full rebuild (month nav).
  const prevDateRowsRef = React.useRef<DateRow[]>(dateRows);

  // Hydrate machineLists + completedJobMap from DB jobs.
  // When dateRows only grew (extend across month boundary), preserve existing
  // entries and append new ones from DB instead of rebuilding from scratch.
  // This prevents the extend expansion from wiping local/unsaved state.
  React.useEffect(() => {
    const prevRows = prevDateRowsRef.current;
    const currRows = dateRows;
    prevDateRowsRef.current = currRows;

    const isGrowth =
      currRows.length > prevRows.length &&
      prevRows.length > 0 &&
      currRows[0].isoDate === prevRows[0].isoDate &&
      currRows.length - prevRows.length <= 10;

    const buildEntryFromJob = (job: any): MachineEntry => {
      const packagingRows = (job as any).packaging || [];
      const packAllocations: Record<string, number> = {};
      let packCat = '';
      let palletPacking = false;
      let palletQty = null;

      if (packagingRows.length >= 1) {
        for (const p of packagingRows) {
          packAllocations[p.packaging_type] = p.quantity;
          if (p.pallet_packing) {
            palletPacking = true;
            palletQty = p.pallet_quantity;
          }
        }
        packCat = packagingRows[0].packaging_type;
      }

      const isCompleted = job.lifecycleStatus === 'COMPLETED' || (job as any).status === 'Completed';
      const completionClock = job.completionTime
        ? (job.completionTime.includes('T')
          ? job.completionTime.split('T')[1].substring(0, 5)
          : job.completionTime.substring(0, 5))
        : '';

      const backendQuantity = Number(
        (job as any).quantity ??
        (job as any).productionQuantity ??
        (job as any).grossQuantity ??
        0
      );
      const backendRequiredBottles = Number(
        (job as any).requiredBottles ??
        (job as any).required_bottles ??
        0
      );
      const backendSpeed = Number(
        (job as any).speeds ??
        (job as any).speed ??
        job.cutPerMin ??
        0
      );
      const backendStartTime =
        (job as any).start_time ??
        job.startTime ??
        '07:00';

      const bottle = bottles.find(b => b.id === job.bottleId || b.id === (job as any).bottle_id);
      const product = bottle ? bottle.name : (job.bottleId ? `Bottle ${job.bottleId}` : '');

      return {
        eid: Math.random(),
        jobId: job.jobId || '',
        product,
        wt: Number((job as any).weight ?? job.weightGrams ?? 0),
        speeds: backendSpeed,
        cut: backendSpeed,
        draw: Number((job as any).draw ?? job.drawTonsPerDay ?? 0),
        qty: backendQuantity,
        section: Number((job as any).section ?? job.sectionCount ?? 0),
        startTime: backendStartTime,
        endTime: isCompleted ? completionClock : '',
        requiredBottles: backendRequiredBottles > 0 ? backendRequiredBottles : backendQuantity,
        estimatedCompletion:
          (job as any).estimated_completion ??
          (job as any).estimatedCompletion ??
          '',
        status: isCompleted ? 'completed' : 'running',
        packingAllocations: packAllocations,
        packingCategory: packCat as any,
        palletPacking,
        palletPackingQty: palletQty
      };
    };

    if (isGrowth) {
      // Incremental: preserve existing machineLists, append new rows from DB.
      const prevLen = prevRows.length;

      setMachineLists(prev => {
        if (prev[0].length !== prevLen) return prev;

        const next = prev.map((list, mIdx) => {
          const extended = [...list];
          for (let i = prevLen; i < currRows.length; i++) {
            const isoDate = currRows[i].isoDate;
            const job = jobs.find(j => {
              if (!j.machineId || !(j.date || j.startDate)) return false;
              return (j.date || j.startDate) === isoDate &&
                parseInt(j.machineId.replace('MAC-', '')) - 1 === mIdx;
            });
            extended.push(job ? buildEntryFromJob(job) : makeNoneEntry(mIdx));
          }
          return extended;
        }) as MachineLists;

        return next;
      });

      setCompletedJobMap(prev => {
        const next = { ...prev };
        for (let i = prevLen; i < currRows.length; i++) {
          for (let m = 0; m < 4; m++) {
            const isoDate = currRows[i].isoDate;
            const matchingJobs = jobs.filter(j => {
              if (!j.machineId || !(j.date || j.startDate)) return false;
              const isCompleted = j.lifecycleStatus === 'COMPLETED' || (j as any).status === 'Completed';
              return (j.date || j.startDate) === isoDate &&
                parseInt(j.machineId.replace('MAC-', '')) - 1 === m &&
                isCompleted;
            });
            if (matchingJobs.length > 0) {
              next[`${m}-${i}`] = matchingJobs.map(j => buildEntryFromJob(j));
            }
          }
        }
        return next;
      });

      return;
    }

    // Full rebuild: dateRows changed completely (month nav, filter, initial load).
    const newLists: typeof INITIAL_MACHINE_LISTS = [
      Array.from({ length: dateRows.length }, () => makeNoneEntry(0)),
      Array.from({ length: dateRows.length }, () => makeNoneEntry(1)),
      Array.from({ length: dateRows.length }, () => makeNoneEntry(2)),
      Array.from({ length: dateRows.length }, () => makeNoneEntry(3)),
    ];
    const newCompleted: Record<string, any[]> = {};

    for (const job of jobs) {
      if (!job.machineId || !(job.date || job.startDate)) continue;
      const planDateStr = job.date || job.startDate;

      const mIdx = parseInt(job.machineId.replace('MAC-', '')) - 1;
      if (mIdx < 0 || mIdx > 3) continue;

      const rowIdx = dateRows.findIndex(r => r.isoDate === planDateStr);
      if (rowIdx === -1) continue;

      const entry = buildEntryFromJob(job);

      if (entry.status === 'completed') {
        const key = mIdx + "-" + rowIdx;
        if (!newCompleted[key]) newCompleted[key] = [];
        newCompleted[key].push(entry);
      } else {
        newLists[mIdx][rowIdx] = entry;
      }
    }

    setMachineLists(newLists);
    setCompletedJobMap(newCompleted);
  }, [jobs, bottles, dateRows, selectedMonth]);

  // Process a queued extend after the date range expanded and machineLists rebuilt.
  React.useEffect(() => {
    const pending = pendingExtendRef.current;
    if (!pending) return;
    pendingExtendRef.current = null;

    const { mIdx, sourceRowIdx, daysToAdd, completedIndex } = pending;
    const list = machineLists[mIdx];
    if (!list || sourceRowIdx < 0 || sourceRowIdx >= list.length) return;

    const sourceEntry = completedIndex !== undefined
      ? completedJobMap[`${mIdx}-${sourceRowIdx}`]?.[completedIndex]
      : list[sourceRowIdx];
    if (!sourceEntry || sourceEntry.product === 'None') return;

    const continuationJobId = sourceEntry.jobId;

    // Find the last consecutive row belonging to the same job
    let effectiveRowIdx = sourceRowIdx;
    while (effectiveRowIdx + 1 < list.length) {
      const nextEntry = list[effectiveRowIdx + 1];
      if (!nextEntry || nextEntry.isBlank || nextEntry.product === 'None') break;
      if (nextEntry.jobId !== continuationJobId) break;
      effectiveRowIdx++;
    }

    let filledCount = 0;
    let blockedDate = '';

    for (let d = 1; d <= daysToAdd; d++) {
      const targetRowIdx = effectiveRowIdx + d;
      if (targetRowIdx >= dateRows.length) break;

      const targetEntry = list[targetRowIdx];
      const targetCompleted = completedJobMap[`${mIdx}-${targetRowIdx}`];
      const isTargetBlank =
        (!targetEntry || targetEntry.product === 'None') &&
        (!targetCompleted || targetCompleted.length === 0);

      if (isTargetBlank) {
        filledCount++;
        continue;
      }

      const targetJobId = targetEntry?.jobId;
      if (targetJobId != null && targetJobId === continuationJobId) {
        filledCount++;
        continue;
      }

      blockedDate = dateRows[targetRowIdx].date;
      break;
    }

    if (filledCount === 0 && blockedDate) {
      toast.error(`Cannot extend job. A different job already exists on ${blockedDate}.`);
      return;
    }

    updateMachineLists(prev => {
      const next = [...prev] as MachineLists;
      const currentList = [...next[mIdx]];

      for (let d = 1; d <= filledCount; d++) {
        const targetRowIdx = effectiveRowIdx + d;
        currentList[targetRowIdx] = {
          ...sourceEntry,
          eid: Math.random(),
          jobId: continuationJobId,
          startTime: sourceEntry.startTime,
          endTime: '',
          status: 'running' as const,
        };
      }

      next[mIdx] = currentList;
      return next;
    });

    setIsDirty(true);

    if (filledCount < daysToAdd && blockedDate) {
      toast.error(`Cannot extend job. A different job already exists on ${blockedDate}.`);
    } else {
      toast.success(`Job extended by ${filledCount} day${filledCount === 1 ? '' : 's'}.`);
    }
  }, [machineLists, completedJobMap, dateRows]);

  // Date rows are fixed; each machine owns an independent flat array.

  const [editModal, setEditModal] = useState<{ mIdx: number; rowIdx: number; newJobStartTime?: string; completedIndex?: number } | null>(null);
  const [endJobModal, setEndJobModal] = useState<{ mIdx: number; rowIdx: number } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ planDate: string; machineNo: string; startTime: string; isCompleted?: boolean } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{ entry: MachineEntry; mIdx: number; rowIdx: number; x: number; y: number } | null>(null);
  const [showSection, setShowSection] = useState(false);
  const [showWt, setShowWt] = useState(false);
  const [showCut, setShowCut] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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
      const payloadRows: ProductionJobRow[] = [];
      console.log("handleSaveToDb started. dateRows:", dateRows.length, "isDirty:", isDirty);

      const calculateChangeover = (mIdx: number, rowIdx: number, startTime: string) => {
        const key = `${mIdx}-${rowIdx}`;
        const completed = completedJobMap[key];
        if (!completed || completed.length === 0) return 0;
        const lastEnd = completed[completed.length - 1].endTime;
        if (!lastEnd) return 0;
        const startParts = startTime.split(':').map(Number);
        const endParts = lastEnd.split(':').map(Number);
        let diff = (startParts[0] * 60 + startParts[1]) - (endParts[0] * 60 + endParts[1]);
        if (diff < 0) diff += 24 * 60;
        return diff;
      };

      for (let mIdx = 0; mIdx < 4; mIdx++) {
        for (let rowIdx = 0; rowIdx < dateRows.length; rowIdx++) {
          const plan_date = dateRows[rowIdx].isoDate;
          const machine_no = `MAC-${String(mIdx + 1).padStart(2, '0')}`;

          const entriesToSave: MachineEntry[] = [];
          const key = `${mIdx}-${rowIdx}`;
          if (completedJobMap[key]) {
            entriesToSave.push(...completedJobMap[key]);
          }
          const currentEntry = machineLists[mIdx][rowIdx];
          if (currentEntry && currentEntry.product !== 'None') {
            entriesToSave.push(currentEntry);
          }

          if (entriesToSave.length > 0) {
            console.log(`Found ${entriesToSave.length} entries for MAC-${mIdx + 1} at row ${rowIdx} (${plan_date})`, entriesToSave);
          }

          for (const entry of entriesToSave) {
            if (entry.product === 'None') continue;
            const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
            const bottle = bottles.find(b => normalize(b.name) === normalize(entry.product));
            if (!bottle) {
              console.error(`Bottle not found in DB: ${entry.product}`);
              toast.error(`Save failed: Bottle "${entry.product}" not found in system.`);
              continue;
            }

            // ✅ TypeScript safe
            const packagingRows: any[] = [];
            if (entry.packingAllocations && Object.keys(entry.packingAllocations).length > 0) {
              for (const [type, qty] of Object.entries(entry.packingAllocations)) {
                packagingRows.push({
                  packaging_type: type,
                  quantity: qty,
                  pallet_packing: entry.palletPacking || false,
                  pallet_quantity: entry.palletPackingQty || null
                });
              }
            } else if (entry.packingCategory) {
              // Removed the !== 'None' check to satisfy TypeScript
              packagingRows.push({
                packaging_type: entry.packingCategory,
                quantity: entry.qty,
                pallet_packing: entry.palletPacking || false,
                pallet_quantity: entry.palletPackingQty || null
              });
            }

            const changeover = entry.status === 'running' ? calculateChangeover(mIdx, rowIdx, entry.startTime || '07:00') : 0;

            const metrics = calcProductionMetrics(entry.cut, entry.wt, mIdx + 1);
            const hourlyQty = metrics.totalQuantity / 24;
            const segmentHours = hourlyQty > 0 ? entry.qty / hourlyQty : 0;

            const startParts = (entry.startTime || '07:00').split(':').map(Number);
            const startMins = startParts[0] * 60 + startParts[1];
            const totalMins = startMins + (segmentHours * 60);

            let estCompletion = '';
            if (entry.endTime) {
              estCompletion = entry.endTime;
            } else {
              const roundedTotalMins = Math.round(totalMins);
              const ch = Math.floor(roundedTotalMins / 60) % 24;
              const cm = roundedTotalMins % 60;
              estCompletion = `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`;
            }

            payloadRows.push({
              job_id: entry.jobId,
              plan_date,
              machine_no,
              bottle_id: bottle.id,
              section: entry.section || MAX_SECTIONS(mIdx),
              weight: entry.wt,
              speeds: entry.cut,
              draw: entry.draw,
              quantity: entry.qty,
              requiredBottles: entry.requiredBottles ?? undefined,
              production_hours: Number(segmentHours.toFixed(2)),
              start_time: entry.startTime || '07:00',
              estimated_completion: estCompletion,
              completion_time: entry.status === 'completed' ? (entry.endTime || estCompletion) : undefined,
              changeover_minutes: changeover,
              status: entry.status === 'completed' ? 'Completed' : 'Planned',
              packaging: packagingRows
            } as any);
          }
        }
      }

      console.log("[SAVE] Full payloadRows being sent:", JSON.stringify(payloadRows.map(r => ({ plan_date: (r as any).plan_date, machine_no: (r as any).machine_no, start_time: (r as any).start_time, job_id: (r as any).job_id })), null, 2));

      const batchResult = await planningRepository.createProductionJobsBatch(payloadRows as any);
      console.log("[SAVE] createProductionJobsBatch result:", batchResult);

      if (!batchResult.ok) {
        toast.error(batchResult.error || 'Save failed. Please try again.', { duration: 5000 });
        setIsSaving(false);
        return;
      }

      // Clean up stale DB rows: jobs that exist in the DB but are no longer
      // in the current grid state (e.g. user deleted a job).  Without this
      // step, deleted jobs would reappear on the next refresh because the
      // upsert only creates/updates.
      const currentKeys = new Set(
        payloadRows.map(r => `${r.plan_date}|${r.machine_no}|${r.start_time}`)
      );
      const dbJobs = planningRepository.getProductionJobs();
      const staleJobs = dbJobs.filter(j => {
        const key = `${j.plan_date}|${j.machine_no}|${j.start_time}`;
        return !currentKeys.has(key);
      });
      if (staleJobs.length > 0) {
        console.log(`[SAVE] Cleaning up ${staleJobs.length} stale job(s) from DB`);
        await Promise.all(
          staleJobs.map(j =>
            planningRepository.deleteProductionJob(j.plan_date, j.machine_no, j.start_time)
          )
        );
      }

      // Re-fetch scoped to the active window so the grid reflects saved data
      reloadJobsForWindow(appliedFromDate, appliedToDate);
      setIsDirty(false);
      toast.success('Production data saved successfully to AWS Database.', { duration: 3000 });
    } catch (e) {
      console.error("[SAVE] ERROR:", e);
      toast.error('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };


  const allRowIndices = useMemo(() =>
    Array.from({ length: dateRows.length }, (_, i) => i),
    [dateRows.length]);

  const filteredRowIndices = useMemo(() => {
    const hasCustomFilter = Boolean(appliedFromDate || appliedToDate);

    if (hasCustomFilter) {
      return allRowIndices.filter((rowIdx) => {
        const rowIso = dateRowToIso(dateRows[rowIdx]?.date || '');
        if (!rowIso) return false;
        if (appliedFromDate && rowIso < appliedFromDate) return false;
        if (appliedToDate && rowIso > appliedToDate) return false;
        return true;
      });
    }

    const { monthStart, monthEnd } = getMonthRange(selectedMonth);
    return allRowIndices.filter((rowIdx) => {
      const rowIso = dateRowToIso(dateRows[rowIdx]?.date || '');
      if (!rowIso) return false;
      if (rowIso < monthStart) return false;
      if (rowIso > monthEnd) return false;
      return true;
    });
  }, [allRowIndices, appliedFromDate, appliedToDate, dateRows, selectedMonth]);

  const handleApply = () => {
    console.log('CLICKED APPLY');
    if (draftFromDate && draftToDate && draftFromDate > draftToDate) {
      toast.error('From Date cannot be greater than To Date.');
      return;
    }
    if (draftFromDate && draftToDate) {
      const [fY, fM, fD] = draftFromDate.split('-').map(Number);
      const [tY, tM, tD] = draftToDate.split('-').map(Number);
      const rangeMs = new Date(tY, tM - 1, tD).getTime() - new Date(fY, fM - 1, fD).getTime();
      const rangeDays = Math.round(rangeMs / (1000 * 60 * 60 * 24)) + 1;
      if (rangeDays > 65) {
        toast.error('Date range cannot be more than 65 days.');
        return;
      }
    }
    if (isDirty) {
      const ok = window.confirm(
        'You have unsaved changes that will be lost when changing the date range. Discard them?'
      );
      if (!ok) return;
    }
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setIsDirty(false);
    // Trigger a fresh scoped fetch for the custom range
    if (draftFromDate && draftToDate) {
      reloadJobsForWindow(draftFromDate, draftToDate);
    }
  };

  const handleReset = () => {
    setDraftFromDate('');
    setDraftToDate('');
    setFromDate('');
    setToDate('');
    setAppliedFromDate('');
    setAppliedToDate('');
  };

  const isDateFilterActive = Boolean(appliedFromDate || appliedToDate);

  React.useEffect(() => {
    const { normalized, monthStart, monthEnd } = getMonthRange(selectedMonth);
    if (selectedMonth !== normalized) {
      setSelectedMonth(normalized);
    }
    if (!fromDate) {
      setFromDate(monthStart);
    }
    if (!toDate) {
      setToDate(monthEnd);
    }
    if (!draftFromDate) {
      setDraftFromDate(monthStart);
      setAppliedFromDate(monthStart);
    }
    if (!draftToDate) {
      setDraftToDate(monthEnd);
      setAppliedToDate(monthEnd);
    }
  }, [selectedMonth, fromDate, toDate, draftFromDate, draftToDate, appliedFromDate, setFromDate, setToDate, setSelectedMonth]);

  const switchToMonth = (targetMonth: string) => {
    if (isDirty) {
      const ok = window.confirm(
        'You have unsaved changes that will be lost when switching months. Discard them?'
      );
      if (!ok) return;
    }
    const normalized = normalizeMonthKey(targetMonth);
    const { monthStart, monthEnd } = getMonthRange(normalized);
    setSelectedMonth(normalized);
    setDraftFromDate(monthStart);
    setDraftToDate(monthEnd);
    setFromDate(monthStart);
    setToDate(monthEnd);
    setAppliedFromDate(monthStart);
    setAppliedToDate(monthEnd);
    setIsDirty(false);
    // Trigger a fresh scoped fetch for the new month
    reloadJobsForWindow(monthStart, monthEnd);
  };

  const handleExport = async () => {
    if (isExporting) return;

    setIsExporting(true);

    try {
      // exceljs is only needed for export — load it lazily so the initial
      // bundle stays small. CJS interop fallback via .default for safety.
      const exceljsModule: any = await import('exceljs');
      const ExcelJS = exceljsModule.Workbook ? exceljsModule : exceljsModule.default;

      const { monthStart, monthEnd } = getMonthRange(selectedMonth);
      const startIso = appliedFromDate || monthStart;
      const endIso = appliedToDate || monthEnd;

      const visibleDateIsos = filteredRowIndices
        .map(rowIdx => dateRows[rowIdx]?.isoDate ?? '')
        .filter(Boolean);

      const exportRows = await buildExportData(startIso, endIso, bottles, visibleDateIsos);

      if (exportRows.length === 0) {
        toast.info('No data available to export for this date range.');
        setIsExporting(false);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Production Planning');
      worksheet.views = [{ state: 'frozen', ySplit: 2 }];

      // Row 1: Grouped Headers
      const topRow = ['Date'];
      for (let i = 1; i <= 4; i++) {
        topRow.push(`Machine No ${i}`, '', '', '', '', '');
      }
      topRow.push('Total Draw');
      worksheet.addRow(topRow);

      // Row 2: Sub-headers
      const subRow = [''];
      for (let i = 1; i <= 4; i++) {
        subRow.push('Bottle Name', 'Sec', 'Wt', 'Cut', 'Qty', 'Draw');
      }
      subRow.push('');
      worksheet.addRow(subRow);

      // Merge grouped headers
      worksheet.mergeCells('A1:A2'); // Date
      worksheet.mergeCells('B1:G1'); // Machine 1
      worksheet.mergeCells('H1:M1'); // Machine 2
      worksheet.mergeCells('N1:S1'); // Machine 3
      worksheet.mergeCells('T1:Y1'); // Machine 4
      worksheet.mergeCells('Z1:Z2'); // Total Draw

      const dateColIndex = 1;

      // Add Data Rows
      for (const row of exportRows) {
        const rowValues: any[] = [];

        if (row.date) {
          const parsedDate = parseDisplayDate(row.date);
          if (parsedDate) {
            // exceljs converts JS Date objects to Excel serial numbers using their UTC values.
            // In positive timezones like IST (+05:30), a local midnight Date becomes the previous day in UTC.
            // We must construct an explicit UTC Date so exceljs writes the exact intended date to the file.
            const utcDateForExcel = new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()));
            rowValues.push(utcDateForExcel);
          } else {
            rowValues.push(row.date);
          }
        } else {
          rowValues.push('');
        }

        for (const m of row.machines) {
          rowValues.push(m.product, m.sec, m.wt, m.cut, m.qty, m.draw);
        }

        rowValues.push(row.totalDraw);
        worksheet.addRow(rowValues);
      }

      // Format Header Rows
      const headerRow1 = worksheet.getRow(1);
      const headerRow2 = worksheet.getRow(2);
      headerRow1.font = { bold: true };
      headerRow2.font = { bold: true };
      headerRow1.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow2.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };

          if (rowNumber > 2) {
            if (colNumber === dateColIndex && cell.value instanceof Date) {
              cell.numFmt = 'dd-mmm-yyyy';
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else if (typeof cell.value === 'number') {
              const isInteger = Number.isInteger(cell.value);
              cell.numFmt = isInteger ? '#,##0' : '#,##0.00';
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            }
          }
        });
      });

      worksheet.columns = worksheet.columns.map((column: ExcelJS.Column) => {
        let max = 10;

        column.eachCell?.(
          { includeEmpty: true },
          (cell: ExcelJS.Cell) => {
            const value = cell.value;

            const text =
              value instanceof Date
                ? value.toLocaleDateString('en-GB')
                : value === null || value === undefined
                  ? ''
                  : String(value);

            max = Math.max(max, text.length + 2);
          }
        );

        return {
          ...column,
          width: Math.min(48, max),
        };
      });

      const filename = buildExportFilename(
        _month,
        _year,
        appliedFromDate,
        appliedToDate,
        filteredRowIndices.length !== allRowIndices.length
      );

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success('Exported production planning to Excel.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to export Excel. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      // jspdf + autoTable are only needed for printing — load them lazily so
      // the initial bundle stays small. CJS interop fallback via .default.
      const jspdfModule: any = await import('jspdf');
      const jsPDF = jspdfModule.jsPDF ?? jspdfModule.default?.jsPDF;
      const autoTableModule: any = await import('jspdf-autotable');
      const autoTable = autoTableModule.autoTable ?? autoTableModule.default;

      const { monthStart, monthEnd } = getMonthRange(selectedMonth);
      const startIso = appliedFromDate || monthStart;
      const endIso = appliedToDate || monthEnd;

      const visibleDateIsos = filteredRowIndices
        .map(rowIdx => dateRows[rowIdx]?.isoDate ?? '')
        .filter(Boolean);

      const exportRows = await buildExportData(startIso, endIso, bottles, visibleDateIsos);

      if (exportRows.length === 0) {
        toast.info('No data available to print for this date range.');
        setIsPrinting(false);
        return;
      }

      const doc = new jsPDF('landscape');

      const title = `Production Planning (${startIso} to ${endIso})`;
      doc.setFontSize(14);
      doc.text(title, 14, 15);

      const head: any[] = [
        [
          { content: 'Date', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'Machine No 1', colSpan: 6, styles: { halign: 'center' } },
          { content: 'Machine No 2', colSpan: 6, styles: { halign: 'center' } },
          { content: 'Machine No 3', colSpan: 6, styles: { halign: 'center' } },
          { content: 'Machine No 4', colSpan: 6, styles: { halign: 'center' } },
          { content: 'Total Draw', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } }
        ],
        [
          'Bottle Name', 'Sec', 'Wt', 'Cut', 'Qty', 'Draw',
          'Bottle Name', 'Sec', 'Wt', 'Cut', 'Qty', 'Draw',
          'Bottle Name', 'Sec', 'Wt', 'Cut', 'Qty', 'Draw',
          'Bottle Name', 'Sec', 'Wt', 'Cut', 'Qty', 'Draw',
        ]
      ];

      const body = exportRows.map(row => {
        const rowValues: any[] = [];
        if (row.date) {
          const parsedDate = parseDisplayDate(row.date);
          rowValues.push(parsedDate instanceof Date ? parsedDate.toLocaleDateString('en-GB') : row.date);
        } else {
          rowValues.push('');
        }

        for (const m of row.machines) {
          rowValues.push(m.product, m.sec, m.wt, m.cut, m.qty, m.draw);
        }

        rowValues.push(row.totalDraw);
        return rowValues;
      });

      autoTable(doc, {
        head,
        body,
        startY: 20,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' }
      });

      const filename = buildExportFilename(
        _month,
        _year,
        appliedFromDate,
        appliedToDate,
        filteredRowIndices.length !== allRowIndices.length
      ).replace('.xlsx', '.pdf');

      doc.save(filename);
      toast.success('Generated PDF successfully.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Extend the selected job by N days entirely in local state.
  // Fills existing blank rows on subsequent dates with a continuation of the
  // same job. If the next date already holds the SAME Job ID, allow
  // continuation through it (same job, no error). If it holds a DIFFERENT
  // job, stop and show an error. Never shifts, inserts, or removes any rows.
  // `completedIndex` targets an ended job in the completed list.
  const handleExtendJob = (mIdx: number, rowIdx: number, days: number, completedIndex?: number) => {
    const daysToAdd = Math.max(1, Math.min(10, Math.floor(days) || 1));
    const list = machineLists[mIdx];
    if (!list || rowIdx < 0 || rowIdx >= list.length) return;

    const sourceEntry = completedIndex !== undefined
      ? completedJobMap[`${mIdx}-${rowIdx}`]?.[completedIndex]
      : list[rowIdx];
    if (!sourceEntry || sourceEntry.product === 'None') {
      toast.error('Cannot extend: no job found.');
      return;
    }

    const continuationJobId = sourceEntry.jobId;

    // Find the last consecutive row belonging to the same job
    let effectiveRowIdx = rowIdx;
    while (effectiveRowIdx + 1 < list.length) {
      const nextEntry = list[effectiveRowIdx + 1];
      if (!nextEntry || nextEntry.isBlank || nextEntry.product === 'None') break;
      if (nextEntry.jobId !== continuationJobId) break;
      effectiveRowIdx++;
    }

    // Classify each target row: blank, same-job, or different-job.
    // If a target falls outside the current dateRows, attempt to expand
    // the date range automatically (month-boundary support).
    let filledCount = 0;
    let blockedDate = '';

    for (let d = 1; d <= daysToAdd; d++) {
      const targetRowIdx = effectiveRowIdx + d;

      // Target is beyond the current date range — try to expand.
      if (targetRowIdx >= dateRows.length) {
        const sourceIso = dateRows[effectiveRowIdx]?.isoDate;
        if (!sourceIso) break;

        // Compute the target ISO date by offsetting `d` days from the source date.
        const [sy, sm, sd] = sourceIso.split('-').map(Number);
        const targetDate = new Date(sy, sm - 1, sd + d);
        const targetIso = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

        // Respect the 65-day planning limit.
        if (dateRows.length >= 65) {
          toast.error('Cannot extend: maximum 65-day planning range reached.');
          return;
        }

        // Compute expanded end date (just enough to include the target day).
        const currentEndIso = appliedToDate || (() => {
          const { monthEnd } = getMonthRange(selectedMonth);
          return monthEnd;
        })();
        const [ey, em, ed] = currentEndIso.split('-').map(Number);
        const currentEndDate = new Date(ey, em - 1, ed);
        const newEndIso = targetIso > currentEndIso ? targetIso : currentEndIso;

        // Expand date range. The hydration effect will preserve existing
        // machineLists and append new rows incrementally (no full DB reload).
        setAppliedToDate(newEndIso);
        setDraftToDate(newEndIso);
        setToDate(newEndIso);

        // Queue the extend to run after dateRows grows and new row is appended.
        pendingExtendRef.current = { mIdx, sourceRowIdx: effectiveRowIdx, daysToAdd, completedIndex };

        toast.success('Extending planning range to include the next date…');
        return;
      }

      const targetEntry = list[targetRowIdx];
      const targetCompleted = completedJobMap[`${mIdx}-${targetRowIdx}`];
      const isTargetBlank =
        (!targetEntry || targetEntry.product === 'None') &&
        (!targetCompleted || targetCompleted.length === 0);

      if (isTargetBlank) {
        filledCount++;
        continue;
      }

      // Target row is occupied – check if it belongs to the same job.
      const targetJobId = targetEntry?.jobId;
      if (targetJobId != null && targetJobId === continuationJobId) {
        filledCount++;
        continue;
      }

      // Different job or no matching ID – block extension here.
      blockedDate = dateRows[targetRowIdx].date;
      break;
    }

    if (filledCount === 0 && blockedDate) {
      toast.error(`Cannot extend job. A different job already exists on ${blockedDate}.`);
      return;
    }

    updateMachineLists(prev => {
      const next = [...prev] as MachineLists;
      const currentList = [...next[mIdx]];

      for (let d = 1; d <= filledCount; d++) {
        const targetRowIdx = effectiveRowIdx + d;
        currentList[targetRowIdx] = {
          ...sourceEntry,
          eid: Math.random(),
          jobId: continuationJobId,
          startTime: sourceEntry.startTime,
          endTime: '',
          status: 'running' as const,
        };
      }

      next[mIdx] = currentList;
      return next;
    });

    setIsDirty(true);

    if (filledCount < daysToAdd && blockedDate) {
      toast.error(`Cannot extend job. A different job already exists on ${blockedDate}.`);
    } else {
      toast.success(`Job extended by ${filledCount} day${filledCount === 1 ? '' : 's'}.`);
    }
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

  // Open the edit modal for a COMPLETED job entry (editable now)
  const openEditCompleted = (mIdx: number, rowIdx: number, completedIndex: number) =>
    setEditModal({ mIdx, rowIdx, completedIndex });

  const isEditingCompleted = !!editModal && editModal.completedIndex !== undefined;

  const updateSection = (mIdx: number, rowIdx: number, val: number) => {
    updateMachineLists(prev => {
      const next = [...prev] as MachineLists;
      const list = [...next[mIdx]];
      const entry = list[rowIdx];
      // Speed always comes from the exact (machine, bottle, section)
      // bottle_configuration row. Never carry one section's speed over.
      const speeds = lookupSpeed(mIdx + 1, entry.product, val);
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

    // Sum actual daily produced quantity across all consecutive rows
    // belonging to the SAME logical job.
    // Bottle/product identity must NOT determine job continuity.
    let cumulativeQty = 0;
    const currentJobId = currentEntry.jobId;

    if (currentJobId) {
      const machineNo = `MAC-${String(mIdx + 1).padStart(2, '0')}`;
      let r = rowIdx;

      while (r >= 0) {
        const e = machineLists[mIdx][r];

        if (!e || e.isBlank || e.jobId !== currentJobId) break;

        const rowDate = dateRows[r]?.isoDate;

        if (rowDate) {
          const entryForCalc =
            r === rowIdx
              ? { ...e, endTime }
              : e;

          cumulativeQty += calculateQuantityForProductionDay(
            rowDate,
            entryForCalc,
            machineNo
          );
        }

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
    const { bottle, packingCategory, packingAllocations, palletPacking, palletPackingQty, requiredBottles, section, startTime } = payload;
    const cut = bottle.speeds > 0 ? bottle.speeds : 0;
    const qty = calcQty(cut, editModal.mIdx + 1);
    const requiredQtyValue = requiredBottles && requiredBottles > 0 ? requiredBottles : qty;
    const draw = calcDraw(bottle.wt, requiredQtyValue);
    const updatedFields: Partial<MachineEntry> = {
      isBlank: false,
      product: bottle.name,
      wt: bottle.wt,
      speeds: bottle.speeds,
      cut,
      draw,
      qty,
      packingCategory,
      packingAllocations,
      palletPacking,
      palletPackingQty: palletPackingQty ?? null,
      requiredBottles: requiredBottles ?? null,
      section,
      startTime: startTime || undefined,
    };

    // jobId is NEVER cleared based on bottle identity.
    // A new job_id is generated only when the user explicitly starts a NEW job
    // (via "End Job" → blank entry → save), where the entry's jobId is undefined
    // from makeNoneEntry. Editing an existing job (even with a different bottle)
    // preserves its jobId. The "+" button also preserves the source jobId.
    const updatedFieldsFinal = { ...updatedFields };

    if (editModal.completedIndex !== undefined) {
      // Editing a COMPLETED job entry — write back to the completed map
      const key = `${editModal.mIdx}-${editModal.rowIdx}`;
      setCompletedJobMap(prev => {
        const list = prev[key] ?? [];
        const nextList = list.map((entry, idx) =>
          idx === editModal.completedIndex
            ? { ...entry, ...updatedFieldsFinal, status: 'completed' as const }
            : entry
        );
        return { ...prev, [key]: nextList };
      });
    } else {
      updateMachineLists(prev => {
        const next = [...prev] as MachineLists;
        const list = [...next[editModal.mIdx]];
        list[editModal.rowIdx] = {
          ...list[editModal.rowIdx],
          ...updatedFieldsFinal,
        };
        next[editModal.mIdx] = list;
        return next;
      });
    }
    setIsDirty(true);
    setEditModal(null);
  };

  const getDrawForDateRow = (rowIdx: number, entry: MachineEntry | null | undefined, mIdx: number) => {
    if (!entry || entry.isBlank || !entry.product || entry.product === 'None') return 0;

    const rowDate = dateRows[rowIdx]?.date;
    if (!rowDate) return 0;

    const rowDateValue = parseDisplayDate(rowDate);
    const dayValue = rowDateValue || new Date();
    const requiredQty = entry.requiredBottles && entry.requiredBottles > 0 ? entry.requiredBottles : entry.qty;

    const rawDraw = calculateDrawForProductionDay(dayValue, {
      ...entry,
      qty: requiredQty,
      requiredBottles: entry.requiredBottles,
    }, `MAC-${String(mIdx + 1).padStart(2, '0')}`);

    if (entry.status === 'completed') {
      console.log('[DRAW-DEBUG] Completed job draw trace:', {
        rowIdx,
        rowDate,
        parsedDate: rowDateValue ? rowDateValue.toISOString() : 'NULL (parseDisplayDate failed!)',
        startTime: entry.startTime,
        endTime: entry.endTime,
        cut: entry.cut,
        wt: entry.wt,
        qty: entry.qty,
        requiredBottles: entry.requiredBottles,
        rawDraw,
      });
    }

    return rawDraw;
  };

  // Produced quantity for a job on a given day — derived from the same
  // production-hours model as the Draw column (draw = wt × qty / 1e6).
  const getDailyProducedQty = (rowIdx: number, entry: MachineEntry | null | undefined, mIdx: number) => {
    if (!entry || entry.isBlank || !entry.product || entry.product === 'None') return 0;
    const rowDate = dateRows[rowIdx]?.date;
    if (!rowDate) return 0;
    const rowDateValue = parseDisplayDate(rowDate);
    const dayValue = rowDateValue || new Date();
    const requiredQty = entry.requiredBottles && entry.requiredBottles > 0 ? entry.requiredBottles : entry.qty;
    const rawQty = calculateQuantityForProductionDay(
      dayValue,
      { ...entry, qty: requiredQty, requiredBottles: entry.requiredBottles },
      `MAC-${String(mIdx + 1).padStart(2, '0')}`
    );
    return calcGoodBottles(rawQty);
  };

  // Format a bottle count in lakhs, e.g. 341000 → "3.41L".
  const formatLakh = (qty: number) => {
    if (qty <= 0) return '—';
    return `${(qty / 100000).toFixed(2)}L`;
  };

  // Cumulative produced quantity for a job spanning multiple dates on the same machine.
  // Walks backward from `rowIdx` through consecutive entries sharing the same jobId,
  // summing each day's produced quantity. Resets when jobId changes.
  // Checks BOTH completedJobMap and machineLists so that ended jobs' production
  // from previous days is included in the cumulative total.
  const getCumulativeQty = (rowIdx: number, entry: MachineEntry | null | undefined, mIdx: number): number => {
    if (!entry || entry.isBlank || !entry.product || entry.product === 'None' || !entry.jobId) return 0;
    const targetJobId = entry.jobId;
    let cumulative = 0;
    for (let r = rowIdx; r >= 0; r--) {
      // Check completedJobMap first — completed jobs have endTime for accurate partial-day calc
      const completed = completedJobMap[`${mIdx}-${r}`] ?? [];
      const completedMatch = completed.find(j => j.jobId === targetJobId);
      if (completedMatch) {
        cumulative += getDailyProducedQty(r, completedMatch, mIdx);
        continue;
      }
      // Check running entry in machineLists
      const e = machineLists[mIdx][r];
      if (!e || e.isBlank || e.jobId !== targetJobId) break;
      cumulative += getDailyProducedQty(r, e, mIdx);
    }
    return cumulative;
  };


  // Total draw for a visual row: sum tons/day across all machines.
  // During changeover (running entry has no bottle set) we continue
  // counting the previous completed job's draw rate — the furnace keeps
  // pulling glass at the same rate while the machine is being changed over.
  const calcTotal = (rowIdx: number) => {
    const rowDate = dateRows[rowIdx]?.date;
    if (!rowDate) return 0;

    const rowDateValue = parseDisplayDate(rowDate);
    const dayValue = rowDateValue || new Date();
    const perMachineEntries = machineLists.map((list, mIdx) => {
      const e = list[rowIdx];
      const completed = completedJobMap[`${mIdx}-${rowIdx}`] ?? [];
      const hasProduct = e && !e.isBlank && !!e.product && e.product !== 'None';

      const machineEntries = completed.map((job) => ({
        cut: job.cut,
        wt: job.wt,
        qty: job.requiredBottles && job.requiredBottles > 0 ? job.requiredBottles : job.qty,
        requiredBottles: job.requiredBottles,
        startTime: job.startTime || '07:00',
        endTime: job.endTime || undefined,
        machineNo: `MAC-${String(mIdx + 1).padStart(2, '0')}`,
      }));

      if (hasProduct) {
        machineEntries.push({
          cut: e.cut,
          wt: e.wt,
          qty: e.requiredBottles && e.requiredBottles > 0 ? e.requiredBottles : e.qty,
          requiredBottles: e.requiredBottles,
          startTime: e.startTime || '07:00',
          endTime: e.endTime || undefined,
          machineNo: `MAC-${String(mIdx + 1).padStart(2, '0')}`,
        });
      }

      if (machineEntries.length > 0) {
        return machineEntries;
      }

      return [];
    }).flat();

    return calculateDailyDrawForEntries(dayValue, perMachineEntries);
  };

  const editingEntry = (() => {
    if (!editModal) return null;
    const { mIdx, rowIdx, completedIndex } = editModal;
    if (completedIndex !== undefined) {
      return completedJobMap[`${mIdx}-${rowIdx}`]?.[completedIndex] ?? null;
    }
    return machineLists[mIdx]?.[rowIdx] ?? null;
  })();

  const showTooltip = (e: React.MouseEvent, entry: MachineEntry, mIdx: number, rowIdx: number) => {
    setTooltip({ entry, mIdx, rowIdx, x: e.clientX, y: e.clientY });
  };
  const moveTooltip = (e: React.MouseEvent) => {
    if (tooltip) setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  };
  const hideTooltip = () => setTooltip(null);

  const monthLabel = useMemo(() => {
    const { year, month } = getMonthRange(selectedMonth);
    return new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const isSelectedMonthCurrentMonth = useMemo(() => {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return normalizeMonthKey(selectedMonth) === currentMonthKey;
  }, [selectedMonth]);

  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <div className="bg-white border border-[#D1D5DB] rounded-lg">
        {/* Card Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#6B7280]" />
            <span className="text-sm font-semibold text-[#374151]">Filters</span>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-[#6B7280] border border-[#E5E7EB] rounded bg-white hover:bg-[#F8FAFC] transition-colors">
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {showFilters && (
          <>
            <div className="border-t border-[#E5E7EB]" />
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              {/* Left: Title + Month */}
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-[18px] font-bold text-[#111827] whitespace-nowrap">Production Planning</h1>
                <span className="text-sm font-semibold text-[#2563EB] whitespace-nowrap">{monthLabel}</span>
              </div>

              {/* Date filters */}
              <div className="flex items-center gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#6B7280] mb-0.5">From Date</label>
                  <input type="date" value={draftFromDate} onChange={e => setDraftFromDate(e.target.value)}
                    className="h-8 px-2 text-xs border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#6B7280] mb-0.5">To Date</label>
                  <input type="date" value={draftToDate} onChange={e => setDraftToDate(e.target.value)}
                    className="h-8 px-2 text-xs border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]" />
                </div>
                <div className="flex items-end gap-1.5">
                  <button type="button" onClick={handleApply}
                    className="h-8 px-3 text-xs font-semibold bg-[#2563EB] text-white rounded hover:bg-[#1D4ED8] transition-colors">
                    Apply
                  </button>
                  <button type="button" onClick={handleReset}
                    className="h-8 px-3 text-xs font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
                    Clear Filter
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-[#E5E7EB] hidden sm:block" />

              {/* Month nav buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const [currentYear, currentMonth] = normalizeMonthKey(selectedMonth).split('-').map(Number);
                    const previousDate = new Date(currentYear, currentMonth - 2, 1);
                    const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
                    switchToMonth(previousMonth);
                  }}
                  className="h-8 flex items-center gap-1 px-2.5 text-xs font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
                  <ChevronLeft size={12} /> Previous Month
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                    switchToMonth(currentMonth);
                  }}
                  className={`h-8 px-2.5 text-xs font-medium border rounded transition-colors ${
                    isSelectedMonthCurrentMonth
                      ? 'bg-[#2563EB] text-white border-[#2563EB] hover:bg-[#1D4ED8]'
                      : 'border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F8FAFC]'
                  }`}>
                  Current Month
                </button>
                <button
                  onClick={() => {
                    const [currentYear, currentMonth] = normalizeMonthKey(selectedMonth).split('-').map(Number);
                    const nextDate = new Date(currentYear, currentMonth, 1);
                    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
                    switchToMonth(nextMonth);
                  }}
                  className="h-8 flex items-center gap-1 px-2.5 text-xs font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
                  Next Month <ChevronRight size={12} />
                </button>
              </div>
            </div>

            <div className="border-t border-[#E5E7EB]" />
            <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2">
              {/* Left: Column toggles */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSection(s => !s)}
                  className={`flex items-center gap-1.5 h-7 px-2.5 text-xs font-semibold rounded-full border transition-all
                    ${showSection
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm'
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#7C3AED] hover:text-[#7C3AED]'
                    }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${showSection ? 'bg-white' : 'bg-[#D1D5DB]'}`} />
                  Section {showSection ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setShowWt(s => !s)}
                  className={`flex items-center gap-1.5 h-7 px-2.5 text-xs font-semibold rounded-full border transition-all
                    ${showWt
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm'
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#7C3AED] hover:text-[#7C3AED]'
                    }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${showWt ? 'bg-white' : 'bg-[#D1D5DB]'}`} />
                  Wt {showWt ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setShowCut(s => !s)}
                  className={`flex items-center gap-1.5 h-7 px-2.5 text-xs font-semibold rounded-full border transition-all
                    ${showCut
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm'
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#7C3AED] hover:text-[#7C3AED]'
                    }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${showCut ? 'bg-white' : 'bg-[#D1D5DB]'}`} />
                  Cut {showCut ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Right: Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="h-7 flex items-center gap-1.5 px-2.5 text-xs font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  <Printer size={12} /> {isPrinting ? 'Printing...' : 'Print'}
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="h-7 flex items-center gap-1.5 px-2.5 text-xs font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  <Download size={12} /> {isExporting ? 'Exporting...' : 'Export'}
                </button>
                <button
                  type="button"
                  onClick={() => { reloadJobsForWindow(appliedFromDate, appliedToDate); }}
                  className="h-7 flex items-center gap-1.5 px-2.5 text-xs font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Table Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center px-4 py-2 border-b border-[#E5E7EB] bg-[#F8FAFC]">
          <span className="text-xs font-medium text-[#6B7280]">Production Register</span>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
            <table id="production-planning-table" className="w-full min-w-375 border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                {/* Machine group header */}
                <tr className="bg-[#DBEAFE] border-b border-[#BFDBFE]">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#1E40AF] border-r border-[#BFDBFE] w-27.5 sticky left-0 bg-[#DBEAFE]">
                    Date
                  </th>
                  {[1, 2, 3, 4].map(n => (
                    <th key={n} colSpan={3 + (showSection ? 1 : 0) + (showWt ? 1 : 0) + (showCut ? 1 : 0)} className="px-3 py-2.5 text-center text-xs font-semibold text-[#1E40AF] border-r border-[#BFDBFE]">
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
                      {showWt && (
                        <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-13.75">Wt</th>
                      )}
                      {showCut && (
                        <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-15">Cut</th>
                      )}
                      <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-15">Qty</th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151] border-r border-[#E5E7EB] w-13.75">Draw</th>
                    </React.Fragment>
                  ))}
                  <th className="px-2 py-2 text-center text-xs font-semibold text-[#374151]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRowIndices.flatMap((rowIdx, displayIdx) => {
                  const dateRow = dateRows[rowIdx];
                  const isSunday = sundayRowIndices.has(rowIdx);
                  const isHoliday = holidayRowIndices.has(rowIdx);
                  const holidayName = isHoliday ? holidayMap.get(dateRow?.isoDate) ?? '' : '';
                  const baseBg = isHoliday
                    ? 'bg-red-100'
                    : isSunday
                      ? 'bg-[#ffe4b7]/40'
                      : displayIdx % 2 === 0
                        ? 'bg-white'
                        : 'bg-[#F8FAFC]';
                  const dateBg = isHoliday ? 'bg-red-200' : isSunday ? 'bg-[#fafa05]' : baseBg;

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
                    const isLastSlot = slotIdx === maxSlots - 1;

                    return (
                      <tr key={`${rowIdx}-${slotIdx}`}
                        className={`${baseBg} ${isLastSlot ? 'border-b border-[#E5E7EB]' : 'border-b border-[#F0F4F8]'}`}>

                        {/* Date — rowSpan across all sub-rows for this date */}
                        {isFirstSlot && (
                          <td rowSpan={maxSlots}
                            className={`px-3 text-[11px] text-[#111827] border-r border-[#E5E7EB] font-semibold whitespace-nowrap sticky left-0 align-top pt-2.5 ${dateBg}`}>
                            <div>{dateRow?.date ?? ''}</div>
                            <div className="text-[10px] font-normal text-[#6B7280]">{dateRow?.weekday ?? ''}</div>
                            {isHoliday && holidayName && (
                              <div className="text-[9px] font-medium text-red-600 mt-0.5">{holidayName}</div>
                            )}
                          </td>
                        )}

                        {/* Machine columns — one <td> per column, per slot */}
                        {machineJobs.map(({ completed, running }, mIdx) => {
                          const numCompleted = completed.length;
                          const hasRunning = running !== null;

                          const validMachine = VALID_SECTIONS(mIdx);

                          // Running job is always pinned to the LAST slot so all machines' active
                          // jobs land on the same horizontal row regardless of completed count.
                          const isRunningSlot = hasRunning && slotIdx === maxSlots - 1;

                          // Completed jobs are packed to the top; empty slots fill the gap above them.
                          const completedOffset = maxSlots - 1 - numCompleted; // slots before first completed
                          const completedIdx = slotIdx - completedOffset;
                          const completedJob = !isRunningSlot && completedIdx >= 0 && completedIdx < numCompleted
                            ? completed[completedIdx]
                            : null;
                          const isEmpty = !isRunningSlot && completedJob === null;

                          // ── Empty slot ──────────────────────────────────────────
                          if (isEmpty) {
                            return (
                              <React.Fragment key={mIdx}>
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                                {showSection && <td className={`border-r border-[#E5E7EB] ${baseBg}`} />}
                                {showWt && <td className={`border-r border-[#E5E7EB] ${baseBg}`} />}
                                {showCut && <td className={`border-r border-[#E5E7EB] ${baseBg}`} />}
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                                <td className={`border-r border-[#E5E7EB] ${baseBg}`} />
                              </React.Fragment>
                            );
                          }

                          // ── Completed/ended job row — rendered exactly like a
                          // running job (no special greyed-out layout) ─────────────
                          if (completedJob) {
                            const completedDraw = getDrawForDateRow(rowIdx, completedJob, mIdx);
                            const isLowSec = completedJob.section !== undefined &&
                              validMachine.includes(completedJob.section) &&
                              completedJob.section < validMachine[validMachine.length - 1];
                            const accentColor = isLowSec ? '#EF4444' : '#16A34A';
                            const cellBg = isHoliday ? 'bg-red-100' : isSunday ? 'bg-[#ffe4b7]/40' : 'bg-white';
                            const txt = 'text-sm text-[#6B7280]';
                            return (
                              <React.Fragment key={mIdx}>
                                {/* BN */}
                                <td className={`px-2 py-1.5 border-l-2 border-r border-[#E5E7EB] ${cellBg}`}
                                  style={{ borderLeftColor: accentColor }}>
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <div className="flex items-center gap-0.5">
                                      <Clock size={7} className="text-[#6B7280] shrink-0" />
                                      <span className="text-[8px] text-[#6B7280]">
                                        {fmtTime(completedJob.startTime)} → {fmtTime(completedJob.endTime)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => openEditCompleted(mIdx, rowIdx, completedIdx)}
                                        title="Edit completed job"
                                        className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors"
                                      >
                                        <Pencil size={8} />
                                      </button>
                                      <button
                                        onClick={() => handleExtendJob(mIdx, rowIdx, 1, completedIdx)}
                                        title="Extend this ended job by one day to the next blank date"
                                        className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] transition-colors"
                                      >
                                        <Plus size={8} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (!completedJob.startTime) {
                                            toast.error("Cannot delete: job start time is missing");
                                            return;
                                          }
                                          const planDate = dateRowToIso(dateRows[rowIdx]?.date || '');
                                          if (!planDate) return;
                                          const machineNo = `MAC-${String(mIdx + 1).padStart(2, '0')}`;
                                          setDeleteModal({ planDate, machineNo, startTime: completedJob.startTime, isCompleted: true });
                                        }}
                                        title="Delete historical job"
                                        className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] transition-colors"
                                      >
                                        <Minus size={8} />
                                      </button>
                                    </div>
                                  </div>
                                  <p
                                    onMouseEnter={e => completedJob.product && completedJob.product !== 'None' ? showTooltip(e, completedJob, mIdx, rowIdx) : undefined}
                                    onMouseMove={moveTooltip}
                                    onMouseLeave={hideTooltip}
                                    className={`text-[11px] font-semibold truncate leading-tight cursor-default ${completedJob.product && completedJob.product !== 'None' ? 'text-[#111827]' : 'text-[#9CA3AF] italic'}`}>
                                    {completedJob.product && completedJob.product !== 'None' ? completedJob.product : '—'}
                                  </p>
                                  {/* Job ID badge for completed jobs */}
                                  {completedJob.product && completedJob.product !== 'None' && completedJob.jobId && (
                                    <span className="text-[8px] font-mono text-[#6B7280] leading-none">
                                      Job {completedJob.jobId}
                                    </span>
                                  )}
                                  {/* Job-wide cumulative total */}
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
                                  <td className={`px-0.5 text-center border-r border-[#E5E7EB] ${isLowSec ? 'bg-[#FEF2F2]' : cellBg}`}>
                                    <span className="text-sm text-[#7C3AED]">{completedJob.section ?? '—'}</span>
                                  </td>
                                )}
                                {/* Wt */}
                                {showWt && (
                                  <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                    <span className={txt}>{completedJob.wt || '—'}</span>
                                  </td>
                                )}
                                {/* Cut */}
                                {showCut && (
                                  <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                    <span className={txt}>{completedJob.speeds || '—'}</span>
                                  </td>
                                )}
                                {/* Qty */}
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className="text-sm font-medium text-[#111827]">
                                    {(() => {
                                      const cQty = getCumulativeQty(rowIdx, completedJob, mIdx);
                                      return formatLakh(cQty);
                                    })()}
                                  </span>
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
                          const isBlank = !!entry.isBlank;
                          const hasProduct = !isBlank && !!entry.product && entry.product !== 'None';
                          // Dynamic sections from bottle_configuration for this bottle+machine
                          const bottleForSec = hasProduct
                            ? bottleNameLookup.get(entry.product.toLowerCase())
                            : null;
                          const bidForSec = bottleForSec?.id;
                          const validForEntry = bidForSec
                            ? VALID_SECTIONS_FOR_BOTTLE(mIdx, bidForSec)
                            : validMachine;
                          const valid = [...validForEntry].sort((a, b) => a - b);
                          const defaultSec = valid[valid.length - 1];
                          const secVal = entry.section && valid.includes(entry.section) ? entry.section : defaultSec;
                          const isLowSec = secVal < defaultSec;

                          const nextEntry = machineLists[mIdx][rowIdx + 1];
                          const isContinuing = hasProduct &&
                            !!nextEntry && !nextEntry.isBlank &&
                            nextEntry.product === entry.product && nextEntry.product !== 'None';
                          const isLastDay = !isContinuing;
                          const canExtend = hasProduct;
                          const runningDraw = getDrawForDateRow(rowIdx, entry, mIdx);
                          const accentColor = isLowSec ? '#EF4444' : '#16A34A';
                          const cellBg = isHoliday ? 'bg-red-100' : isSunday ? 'bg-[#ffe4b7]/40' : 'bg-white';

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
                                      {/* Job ID badge under bottle name */}
                                      {hasProduct && entry.jobId && (
                                        <span className="text-[8px] font-mono text-[#6B7280] leading-none">
                                          Job {entry.jobId}
                                        </span>
                                      )}
                                      {/* Quick-edit shortcut beside "No bottle set" */}
                                      {!hasProduct && (
                                        <button onClick={() => openEdit(mIdx, rowIdx)} title="Add bottle to this job"
                                          className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors">
                                          <Pencil size={7} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          if (!entry.startTime) {
                                            toast.error("Cannot delete: job start time is missing");
                                            return;
                                          }

                                          const planDate = dateRowToIso(dateRows[rowIdx]?.date || '');
                                          if (!planDate) return;

                                          // Consistent with how machine_no is built in handleSaveToDb (line 289)
                                          const machineNo = `MAC-${String(mIdx + 1).padStart(2, '0')}`;

                                          setDeleteModal({ planDate, machineNo, startTime: entry.startTime });
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
                                        <button onClick={() => handleExtendJob(mIdx, rowIdx, 1)}
                                          title="Extend this job by one day to the next blank date"
                                          className="w-5 h-5 flex items-center justify-center rounded text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] transition-colors">
                                          <Plus size={8} />
                                        </button>
                                      )}
                                      {hasProduct && isLastDay && (
                                        <button onClick={() => handleAddJob(mIdx, rowIdx)}
                                          title="Schedule a new job after this one finishes"
                                          className="flex items-center gap-0.5 h-5 px-1.5 text-[9px] font-semibold text-[#7C3AED] bg-[#F5F3FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] rounded transition-colors whitespace-nowrap">
                                          <ClipboardPlus size={8} /> End Job
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
                                        {[...valid].sort((a, b) => b - a).map(n => <option key={n} value={n}>{n}</option>)}
                                      </select>
                                      <ChevronDown size={8} className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none ${isLowSec ? 'text-[#991B1B]' : 'text-[#7C3AED]'}`} />
                                    </div>
                                  )}
                                </td>
                              )}
                              {/* Wt */}
                              {showWt && (
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className="text-sm text-[#6B7280]">{hasProduct ? (entry.wt || '—') : ''}</span>
                                </td>
                              )}
                              {/* Cut */}
                              {showCut && (
                                <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                  <span className="text-sm text-[#6B7280]">{hasProduct ? (entry.speeds || '—') : ''}</span>
                                </td>
                              )}
                              {/* Qty */}
                              <td className={`px-2 text-center border-r border-[#E5E7EB] ${cellBg}`}>
                                <span className="text-sm font-medium text-[#111827]">
                                  {hasProduct
                                    ? (() => {
                                      const rQty = getCumulativeQty(rowIdx, entry, mIdx);
                                      return formatLakh(rQty);
                                    })()
                                    : ''}
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
                                    const lastDraw = getDrawForDateRow(rowIdx, last, mIdx);
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

      {/* Delete Modal */}
      <ConfirmationModal
        isOpen={!!deleteModal}
        title={deleteModal?.isCompleted ? "Delete Historical Job" : "Delete Job"}
        message={
          deleteModal?.isCompleted
            ? "WARNING: This is a COMPLETED production record. Deleting it will permanently remove historical output data. Are you absolutely sure you want to proceed?"
            : "Are you sure you want to delete this job? This cannot be undone."
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        requireWord={deleteModal?.isCompleted ? "DELETE" : undefined}
        onConfirm={() => {
          if (!deleteModal) return;
          const { planDate, machineNo, startTime, isCompleted } = deleteModal;

          // Derive mIdx from machineNo (same convention used elsewhere)
          const mIdx = parseInt(machineNo.replace('MAC-', ''), 10) - 1;
          const rowIdx = dateRows.findIndex(r => r.isoDate === planDate);
          if (mIdx < 0 || mIdx > 3 || rowIdx === -1) {
            toast.error('Could not locate the job in the grid.');
            setDeleteModal(null);
            return;
          }

          if (isCompleted) {
            // Remove the completed entry from completedJobMap
            const key = `${mIdx}-${rowIdx}`;
            setCompletedJobMap(prev => {
              const list = prev[key] ?? [];
              const nextList = list.filter(e => e.startTime !== startTime);
              return { ...prev, [key]: nextList };
            });
          } else {
            // Remove the running job by blanking the row.
            // Upcoming jobs remain on their original dates – never shift.
            updateMachineLists(prev => {
              const next = [...prev] as MachineLists;
              const list = [...next[mIdx]];
              list[rowIdx] = makeNoneEntry(mIdx);
              next[mIdx] = list;
              return next;
            });
          }

          setIsDirty(true);
          toast.success('Job removed.');
          setDeleteModal(null);
        }}
        onCancel={() => setDeleteModal(null)}
      />

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
      {/* Fixed-position tooltip */}
      {tooltip && (() => {
        const entry = tooltip.entry;

        // Production calculation
        const metrics = calcProductionMetrics(
          entry.cut,
          entry.wt,
          tooltip.mIdx + 1
        );

        const goodLiters = metrics.goodLiters;
        const goodBottles = metrics.goodBottles;


        // REQUIRED BOTTLES

        const requiredBottles = Number(
          entry.requiredBottles ??
          0
        );


        // Packing allocation data preparation
        const packingAllocationsData = typeof entry?.packingAllocations === 'string'
          ? JSON.parse(entry.packingAllocations)
          : entry?.packingAllocations;

        const packing = packingAllocationsData && typeof packingAllocationsData === 'object'
          ? Object.entries(packingAllocationsData)
          : [];

        const packingNames: Record<string, string> = {
          ST: 'Shrink Tray',
          SN: 'Shrink Naked',
          SB: 'Shrink Box',
          BT: 'Bottom Tray'
        };
        return (
          <div
            className="pointer-events-none fixed z-9999"
            style={{
              left: tooltip.x + 14,
              top: tooltip.y - 8,
              transform: 'translateY(-100%)'
            }}
          >
            <div className="relative bg-[#1E293B] text-white rounded-xl shadow-2xl p-3.5 w-70 text-xs">

              {/* BOTTLE */}
              <div className="pb-2.5 border-b border-[#334155]">
                <p className="text-[#94A3B8] text-[9px] font-medium uppercase tracking-widest">
                  Bottle
                </p>

                <p className="font-bold text-white text-sm mt-1">
                  {entry.product || '—'}
                </p>
              </div>


              {/* DAILY GOOD BOTTLES */}
              <div className="py-2.5 border-b border-[#334155]">
                <p className="text-[#94A3B8] text-[9px] font-medium uppercase tracking-widest">
                  Daily Good Bottles (90%)
                </p>

                <p className="font-bold text-[#38BDF8] text-sm mt-1">
                  {goodLiters.toFixed(2)} L ({goodBottles.toLocaleString()} bottles)
                </p>
              </div>


              {/* TOTAL REQUIRED BOTTLES */}
              <div className="py-2.5 border-b border-[#334155]">
                <p className="text-[#94A3B8] text-[9px] font-medium uppercase tracking-widest">
                  Total Required Bottles
                </p>

                <p className="font-bold text-[#FCD34D] text-sm mt-1">
                  {requiredBottles > 0
                    ? requiredBottles.toLocaleString()
                    : '—'}
                </p>
              </div>


              {/* PACKING ALLOCATION */}
              <div className="py-2.5 border-b border-[#334155]">
                <p className="text-[#94A3B8] text-[9px] font-medium uppercase tracking-widest mb-2">
                  Packing Allocation
                </p>

                {packing.length > 0 ? (
                  <div className="space-y-1.5">
                    {packing.map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="bg-[#475569] text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                            {key}
                          </span>

                          <span className="text-white truncate">
                            {packingNames[key] || key}
                          </span>
                        </div>

                        <span className="text-[#38BDF8] font-semibold shrink-0">
                          {Number(value).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[#64748B]">
                    —
                  </span>
                )}
              </div>


              {/* PALLET PACKING QTY */}
              <div className="pt-2.5">
                <p className="text-[#94A3B8] text-[9px] font-medium uppercase tracking-widest">
                  Pallet Packing Qty
                </p>

                <p className="text-white font-semibold text-sm mt-1">
                  {entry.palletPackingQty
                    ? entry.palletPackingQty.toLocaleString()
                    : '—'}
                </p>
              </div>


              {/* Tooltip arrow */}
              <div
                className="
            absolute
            top-full
            left-4
            border-l-[5px]
            border-r-[5px]
            border-t-[5px]
            border-l-transparent
            border-r-transparent
            border-t-[#1E293B]
          "
              />

            </div>
          </div>
        );
      })()}
    </div>
  );
};

