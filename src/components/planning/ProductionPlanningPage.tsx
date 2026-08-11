import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useERP } from '../../context/ERPContext';
import { planningRepository } from '../../services/planningRepository';
import { ProductionJobRow } from '../../data/planningSchema';
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
  INITIAL_MACHINE_LISTS,
  VALID_SECTIONS,
  _month,
  _year,
  addMinutesToTime,
  calcGoodBottles,
  calcProductionMetrics,
  calcDraw,
  calcQty,
  calculateDailyDrawForEntries,
  calculateDrawForProductionDay,
  lookupSpeed,
  makeNoneEntry,
} from '../../utils/planningCalculations';
import { addCalendarDays } from '../../utils/calculations';
import { buildExportData } from '../../utils/exportData';
import { EditSavePayload, DateRow } from '../../types/planning';
import { EditMachineModal } from './EditMachineModal';
import { EndJobModal } from './EndJobModal';
import { ConfirmationModal } from '../common/ConfirmationModal';

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
  const { jobs, bottles, refreshPlanner, selectedMonth, setSelectedMonth, fromDate, setFromDate, toDate, setToDate } = useERP();

  // Filters
  const [draftFromDate, setDraftFromDate] = useState(fromDate);
  const [draftToDate, setDraftToDate] = useState(toDate);
  const [appliedFromDate, setAppliedFromDate] = useState(fromDate);
  const [appliedToDate, setAppliedToDate] = useState(toDate);

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
    const totalDays = diffDays > 0 ? diffDays : 1;

    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(startYear, startMonth - 1, startDay + i);
      return {
        id: i + 1,
        date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        isoDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      };
    });
  }, [selectedMonth, appliedFromDate, appliedToDate]);

  const [machineLists, setMachineLists] = useState<MachineLists>(INITIAL_MACHINE_LISTS);
  const [completedJobMap, setCompletedJobMap] = useState<CompletedJobMap>({});

  // Fetch initial data from DB instead of localStorage
  React.useEffect(() => {
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

      const bottle = bottles.find(b => b.id === job.bottleId || b.id === (job as any).bottle_id);
      const product = bottle ? bottle.name : (job.bottleId ? `Bottle ${job.bottleId}` : '');

      const packagingRows = (job as any).packaging || [];
      const packAllocations: Record<string, number> = {};
      let packCat = '';
      let palletPacking = false;
      let palletQty = null;
      for (const p of packagingRows) {
         packAllocations[p.packaging_type] = p.quantity;
         packCat = p.packaging_type;
         if (p.pallet_packing) {
             palletPacking = true;
             palletQty = p.pallet_quantity;
         }
      }

      const isCompleted = job.lifecycleStatus === 'COMPLETED' || (job as any).status === 'Completed';
      // Completed jobs use their actual completion time (HH:MM) — same as the End Job flow.
      // Running jobs have no end time yet (same as local mode), so the existing draw
      // calculation covers the production-day window instead of a zero-length interval.
      const completionClock = job.completionTime
        ? (job.completionTime.includes('T')
            ? job.completionTime.split('T')[1].substring(0, 5)
            : job.completionTime.substring(0, 5))
        : '';

      const entry: MachineEntry = {
        eid: Math.random(),
        product,
        wt: job.weightGrams || 0,
        speeds: job.cutPerMin || 0,
        cut: job.cutPerMin || 0,
        draw: job.drawTonsPerDay || 0,
        qty: job.productionQuantity || job.grossQuantity || 0,
        section: job.sectionCount || 0,
        startTime: job.startTime || '07:00',
        endTime: isCompleted ? completionClock : '',
        status: isCompleted ? 'completed' : 'running',
        packingAllocations: packAllocations,
        packingCategory: packCat as any,
        palletPacking,
        palletPackingQty: palletQty
      };

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

  // Date rows are fixed; each machine owns an independent flat array.

  const [editModal, setEditModal] = useState<{ mIdx: number; rowIdx: number; newJobStartTime?: string } | null>(null);
  const [endJobModal, setEndJobModal] = useState<{ mIdx: number; rowIdx: number } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ planDate: string; machineNo: string; startTime: string; isCompleted?: boolean } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tooltip, setTooltip] = useState<{ entry: MachineEntry; mIdx: number; rowIdx: number; x: number; y: number } | null>(null);
  const [showSection, setShowSection] = useState(true);
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

               const packagingRows: any[] = [];
               if (entry.packingAllocations) {
                  for (const [type, qty] of Object.entries(entry.packingAllocations)) {
                     packagingRows.push({
                        packaging_type: type,
                        quantity: qty,
                        pallet_packing: entry.palletPacking || false,
                        pallet_quantity: entry.palletPackingQty || null
                     });
                  }
               } else if (entry.packingCategory) {
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
                  const ch = Math.floor(totalMins / 60) % 24;
                  const cm = Math.round(totalMins % 60);
                  estCompletion = `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`;
               }

               payloadRows.push({
                  plan_date,
                  machine_no,
                  bottle_id: bottle.id,
                  section: entry.section || (mIdx === 0 || mIdx === 3 ? 8 : 10),
                  weight: entry.wt,
                  speeds: entry.cut,
                  draw: entry.draw,
                  quantity: entry.qty,
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

      console.log("[SAVE] Full payloadRows being sent:", JSON.stringify(payloadRows.map(r => ({ plan_date: (r as any).plan_date, machine_no: (r as any).machine_no, start_time: (r as any).start_time })), null, 2));

      const batchResult = await planningRepository.createProductionJobsBatch(payloadRows as any);
      console.log("[SAVE] createProductionJobsBatch result:", batchResult);
      await planningRepository.init();
      refreshPlanner();
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
    const { year, month, monthStart, monthEnd } = getMonthRange(selectedMonth);

    return allRowIndices.filter((rowIdx) => {
      const rowIso = dateRowToIso(dateRows[rowIdx]?.date || '');
      if (!rowIso) return false;
      if (rowIso < monthStart) return false;
      if (rowIso > monthEnd) return false;
      if (appliedFromDate && rowIso < appliedFromDate) return false;
      if (appliedToDate && rowIso > appliedToDate) return false;
      return true;
    });
  }, [allRowIndices, appliedFromDate, appliedToDate, dateRows, selectedMonth]);

  const handleApply = () => {
    console.log('CLICKED APPLY');
    if (draftFromDate && draftToDate && draftFromDate > draftToDate) {
      toast.error('From Date cannot be greater than To Date.');
      return;
    }
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
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
    const normalized = normalizeMonthKey(targetMonth);
    const { monthStart, monthEnd } = getMonthRange(normalized);
    setSelectedMonth(normalized);
    setDraftFromDate(monthStart);
    setDraftToDate(monthEnd);
    setFromDate(monthStart);
    setToDate(monthEnd);
    setAppliedFromDate(monthStart);
    setAppliedToDate(monthEnd);
  };

  const handleExport = async () => {
    if (isExporting) return;

    setIsExporting(true);

    try {
      const { monthStart, monthEnd } = getMonthRange(selectedMonth);
      const startIso = appliedFromDate || monthStart;
      const endIso = appliedToDate || monthEnd;

      const exportRows = await buildExportData(startIso, endIso, bottles);

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

      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
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

      worksheet.columns = worksheet.columns.map((column) => {
        let max = 10;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const value = cell.value;
          const text = value instanceof Date
            ? value.toLocaleDateString('en-GB')
            : value === null || value === undefined
              ? ''
              : String(value);
          max = Math.max(max, text.length + 2);
        });
        return { ...column, width: Math.min(48, max) };
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
      const { monthStart, monthEnd } = getMonthRange(selectedMonth);
      const startIso = appliedFromDate || monthStart;
      const endIso = appliedToDate || monthEnd;

      const exportRows = await buildExportData(startIso, endIso, bottles);

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

  const editingEntry = editModal ? machineLists[editModal.mIdx]?.[editModal.rowIdx] : null;

  const showTooltip = (e: React.MouseEvent, entry: MachineEntry, mIdx: number, rowIdx: number) => {
    setTooltip({ entry, mIdx, rowIdx, x: e.clientX, y: e.clientY });
  };
  const moveTooltip = (e: React.MouseEvent) => {
    if (tooltip) setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  };
  const hideTooltip = () => setTooltip(null);

  const dateRangeLabel = useMemo(() => {
    if (dateRows.length === 0) return '';
    const firstDate = new Date(dateRows[0].isoDate);
    const lastDate = new Date(dateRows[dateRows.length - 1].isoDate);
    
    const isSameMonth = firstDate.getMonth() === lastDate.getMonth() && firstDate.getFullYear() === lastDate.getFullYear();
    const daysInMonth = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0).getDate();
    
    if (isSameMonth && dateRows.length === daysInMonth) {
      return firstDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    
    const formatOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    return `${firstDate.toLocaleDateString('en-GB', formatOpts)} — ${lastDate.toLocaleDateString('en-GB', formatOpts)}`;
  }, [dateRows]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Production Planning</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            {dateRangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const [currentYear, currentMonth] = normalizeMonthKey(selectedMonth).split('-').map(Number);
              const previousDate = new Date(currentYear, currentMonth - 2, 1);
              const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
              switchToMonth(previousMonth);
            }}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <ChevronLeft size={14} /> Previous Month
          </button>
          <button
            onClick={() => {
              const today = new Date();
              const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
              switchToMonth(currentMonth);
            }}
            className="h-9 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            Current Month
          </button>
          <button
            onClick={() => {
              const [currentYear, currentMonth] = normalizeMonthKey(selectedMonth).split('-').map(Number);
              const nextDate = new Date(currentYear, currentMonth, 1);
              const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
              switchToMonth(nextMonth);
            }}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            Next Month <ChevronRight size={14} />
          </button>
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            <Printer size={14} /> {isPrinting ? 'Printing...' : 'Print'}
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            <Download size={14} /> {isExporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            type="button"
            onClick={() => { console.log('CLICKED REFRESH'); refreshPlanner(); }}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
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
            <input type="date" value={draftFromDate} onChange={e => setDraftFromDate(e.target.value)}
              className="h-9 px-2.5 text-sm border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">To Date</label>
            <input type="date" value={draftToDate} onChange={e => setDraftToDate(e.target.value)}
              className="h-9 px-2.5 text-sm border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]" />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={handleApply}
              className="h-9 px-4 text-sm font-semibold bg-[#2563EB] text-white rounded hover:bg-[#1D4ED8] transition-colors">
              Apply
            </button>
            <button type="button" onClick={handleReset}
              className="h-9 px-4 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
              Clear Filter
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
            <table id="production-planning-table" className="w-full min-w-375 border-collapse text-sm">
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
                {filteredRowIndices.flatMap((rowIdx, displayIdx) => {
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
                            const completedDraw = getDrawForDateRow(rowIdx, completedJob, mIdx);
                            const cellBg = 'bg-[#F3F4F6]';
                            const txt    = 'text-[10px] text-[#6B7280]';
                            return (
                              <React.Fragment key={mIdx}>
                                {/* BN */}
                                <td className={`px-2 py-1.5 border-l-2 border-r border-[#E5E7EB] ${cellBg}`}
                                  style={{ borderLeftColor: '#9CA3AF' }}>
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <div className="flex items-center gap-1">
                                      <Lock size={7} className="text-[#9CA3AF] shrink-0" />
                                      <span className="text-[9px] font-bold text-[#9CA3AF]">JOB {completedIdx + 1}</span>
                                    </div>
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
                                      className="w-4 h-4 shrink-0 flex items-center justify-center rounded text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] transition-colors"
                                    >
                                      <Minus size={7} />
                                    </button>
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
                          const runningDraw = getDrawForDateRow(rowIdx, entry, mIdx);
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
        onConfirm={async () => {
          if (!deleteModal) return;
          const { planDate, machineNo, startTime } = deleteModal;
          const res = await planningRepository.deleteProductionJob(planDate, machineNo, startTime);
          if (res.ok) {
            await planningRepository.init();
            refreshPlanner();
            toast.success("Job deleted successfully.");
          } else {
            toast.error(res.error || "Failed to delete job");
          }
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
