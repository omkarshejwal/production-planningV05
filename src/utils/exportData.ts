import { apiFetch } from './api';
import { ProductionJobRow, BottleMasterRow } from '../data/planningSchema';
import { MachineEntry, CompletedJobMap, MachineLists } from '../types/planning';
import { addCalendarDays } from './calculations';
import { calculateDailyDrawForEntries, calculateDrawForProductionDay, makeNoneEntry, calcProductionMetrics } from './planningCalculations';

export interface ExportMachineData {
  mIdx: number;
  isCompleted: boolean;
  product: string;
  sec: number | string;
  wt: number | string;
  cut: number | string;
  qty: number | string; 
  draw: number | string; 
}

export interface ExportRow {
  date: string; 
  slotIdx: number;
  maxSlots: number;
  machines: ExportMachineData[];
  totalDraw: number | string; 
}

export async function buildExportData(
  fromDateIso: string,
  toDateIso: string,
  bottles: any[],
  visibleDateIsos?: string[]
): Promise<ExportRow[]> {
  // 1. Fetch Option B: Get target range + most recent previous job per machine
  // Parse inputs as LOCAL midnight to avoid UTC timezone shifts
  const startD = new Date(fromDateIso + 'T00:00:00');
  const endD = new Date(toDateIso + 'T00:00:00');
  
  const beforeDate = addCalendarDays(startD, -1);
  const beforeIso = `${beforeDate.getFullYear()}-${String(beforeDate.getMonth() + 1).padStart(2, '0')}-${String(beforeDate.getDate()).padStart(2, '0')}`;

  const targetUrl = `/api/production/jobs/?from_date=${fromDateIso}&to_date=${toDateIso}`;
  
  const previousJobsPromises = [1, 2, 3, 4].map(mIdx => 
    apiFetch(`/api/production/jobs/?machine_no=${mIdx}&to_date=${beforeIso}&order_by=desc&limit=1`)
  );

  const [rawTargetJobs, ...rawPreviousJobsArrays] = await Promise.all([
    apiFetch(targetUrl),
    ...previousJobsPromises
  ]);

  const rawPreviousJobs = rawPreviousJobsArrays.flat();
  const allRawJobs = [...rawPreviousJobs, ...(rawTargetJobs as any[])];

  // Map rawJobs to ProductionJobRow format
  const mappedJobs = allRawJobs.map(raw => {
      const startRaw = String(raw.start_time ?? '');
      const startTime = startRaw.includes('T') ? startRaw.split('T')[1].substring(0, 5) : startRaw.substring(0, 5);
      const completionRaw = String(raw.completion_time ?? '');
      const completionTime = completionRaw.includes('T') ? completionRaw.substring(0, 16) : (completionRaw || undefined);
      
      const machineNo = String(raw.machine_no);
      const machineId = machineNo.startsWith('MAC-') ? machineNo : `MAC-${machineNo.padStart(2, '0')}`;
      
      return {
          ...raw,
          machine_no: machineId,
          start_time: startTime,
          completion_time: completionTime,
          status: raw.status || 'Planned'
      } as ProductionJobRow;
  });

  // Find earliest date so the timeline encompasses the previous jobs
  let earliestDate = new Date(startD);
  for (const pJob of rawPreviousJobs) {
      if (pJob.plan_date) {
          const pDate = new Date(pJob.plan_date + 'T00:00:00'); // Parse as LOCAL
          if (pDate < earliestDate) {
              earliestDate = pDate;
          }
      }
  }

  // 2. Generate dates from earliestDate to toDateIso using LOCAL time
  const allDateRows: { iso: string; label: string; dateObj: Date }[] = [];
  
  let curr = new Date(earliestDate);
  while (curr <= endD) {
      const iso = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
      const label = curr.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      allDateRows.push({ iso, label, dateObj: new Date(curr) });
      curr = addCalendarDays(curr, 1);
  }

  // 3. Build MachineLists and CompletedJobMap
  const machineLists: MachineLists = [
      Array.from({ length: allDateRows.length }, () => makeNoneEntry(0)),
      Array.from({ length: allDateRows.length }, () => makeNoneEntry(1)),
      Array.from({ length: allDateRows.length }, () => makeNoneEntry(2)),
      Array.from({ length: allDateRows.length }, () => makeNoneEntry(3)),
  ];
  const completedJobMap: CompletedJobMap = {};

  for (const job of mappedJobs) {
      if (!job.machine_no || !job.plan_date) continue;
      
      const mIdx = parseInt(job.machine_no.replace('MAC-', '')) - 1;
      if (mIdx < 0 || mIdx > 3) continue;

      const rowIdx = allDateRows.findIndex(d => d.iso === job.plan_date);
      if (rowIdx === -1) continue; 

      const bottle = bottles.find(b => String((b as any).id || b.bottle_id) === String(job.bottle_id));
      const product = bottle ? ((bottle as any).name || bottle.bottle_name) : `Bottle ${job.bottle_id}`;
      
      const isCompleted = job.status === 'Completed';
      const completionClock = job.completion_time
        ? (job.completion_time.includes('T') ? job.completion_time.split('T')[1].substring(0, 5) : job.completion_time.substring(0, 5))
        : '';
        
      const entry: MachineEntry = {
          eid: Math.random(),
          jobId: (job as any).job_id != null ? String((job as any).job_id) : undefined,
          product,
          wt: Number(job.weight) || 0,
          speeds: Number(job.speeds) || 0,
          cut: Number(job.speeds) || 0,
          draw: Number(job.draw) || 0,
          qty: Number(job.quantity) || 0,
          section: Number(job.section) || 0,
          startTime: job.start_time || '07:00',
          endTime: isCompleted ? completionClock : '',
          status: isCompleted ? 'completed' : 'running',
      };

      if (entry.status === 'completed') {
          const key = `${mIdx}-${rowIdx}`;
          if (!completedJobMap[key]) completedJobMap[key] = [];
          completedJobMap[key].push(entry);
      } else {
          machineLists[mIdx][rowIdx] = entry;
      }
  }

  // Helper for Draw
  const getDrawForDateRow = (rowIdx: number, entry: MachineEntry | null, mIdx: number) => {
      if (!entry || entry.isBlank || !entry.product || entry.product === 'None') return 0;
      const dayValue = allDateRows[rowIdx].dateObj;
      const requiredQty = (entry as any).requiredBottles && (entry as any).requiredBottles > 0 ? (entry as any).requiredBottles : entry.qty;
      return calculateDrawForProductionDay(dayValue, {
          ...entry,
          qty: requiredQty,
          requiredBottles: (entry as any).requiredBottles
      }, `MAC-${String(mIdx + 1).padStart(2, '0')}`);
  };

  const calcTotal = (rowIdx: number) => {
      const dayValue = allDateRows[rowIdx].dateObj;
      const perMachineEntries = machineLists.map((list, mIdx) => {
          const e = list[rowIdx];
          const completed = completedJobMap[`${mIdx}-${rowIdx}`] ?? [];
          const hasProduct = e && !e.isBlank && !!e.product && e.product !== 'None';
          
          const machineEntries = completed.map((job) => ({
              cut: job.cut,
              wt: job.wt,
              qty: (job as any).requiredBottles && (job as any).requiredBottles > 0 ? (job as any).requiredBottles : job.qty,
              requiredBottles: (job as any).requiredBottles,
              startTime: job.startTime || '07:00',
              endTime: job.endTime || undefined,
              machineNo: `MAC-${String(mIdx + 1).padStart(2, '0')}`,
          }));

          if (hasProduct) {
              machineEntries.push({
                  cut: e.cut,
                  wt: e.wt,
                  qty: (e as any).requiredBottles && (e as any).requiredBottles > 0 ? (e as any).requiredBottles : e.qty,
                  requiredBottles: (e as any).requiredBottles,
                  startTime: e.startTime || '07:00',
                  endTime: e.endTime || undefined,
                  machineNo: `MAC-${String(mIdx + 1).padStart(2, '0')}`,
              });
          }
          return machineEntries;
      }).flat();
      return calculateDailyDrawForEntries(dayValue, perMachineEntries);
  };

  // ── Logical-job continuation detection (mirrors the screen's logic) ───────
  // Rows belonging to the same logical job share the DB job_id (continuation
  // rows created by "+"/extend inherit the source job's job_id), so a row is a
  // continuation when the previous day on the same machine holds an entry with
  // the same group key. Rows without a job_id group by machine + bottle name —
  // the same identity "+"/extend propagates locally before a save.
  const entryGroupKey = (e: MachineEntry | null | undefined, mIdx: number): string | null => {
    if (!e || e.isBlank || !e.product || e.product === 'None') return null;
    const id = e.jobId && String(e.jobId).trim() !== '' ? String(e.jobId) : '';
    if (id) return `db:${id}`;
    const name = e.product.toLowerCase();
    return name ? `local:${mIdx}:${name}` : null;
  };

  const isContinuationEntry = (mIdx: number, rowIdx: number, e: MachineEntry | null | undefined): boolean => {
    if (!e || e.isBlank || !e.product || e.product === 'None' || rowIdx <= 0) return false;
    const key = entryGroupKey(e, mIdx);
    if (!key) return false;
    const prevCompleted = completedJobMap[`${mIdx}-${rowIdx - 1}`] ?? [];
    if (prevCompleted.some(c => entryGroupKey(c, mIdx) === key)) return true;
    const prevRunning = machineLists[mIdx]?.[rowIdx - 1];
    return !!prevRunning && entryGroupKey(prevRunning, mIdx) === key;
  };

  // 4. Transform into flattened array (filtered down to strictly fromDate -> toDate)
  const results: ExportRow[] = [];
  const visibleDateSet = new Set<string>(visibleDateIsos ?? []);

  for (let rowIdx = 0; rowIdx < allDateRows.length; rowIdx++) {
      const dateInfo = allDateRows[rowIdx];
      // Skip if date is strictly outside appliedFromDate / appliedToDate
      if (dateInfo.iso < fromDateIso || dateInfo.iso > toDateIso) continue;
      // Skip dates not currently visible in the Production Planning table
      if (visibleDateSet.size > 0 && !visibleDateSet.has(dateInfo.iso)) continue;

      const machineJobs = machineLists.map((list, mIdx) => ({
          completed: completedJobMap[`${mIdx}-${rowIdx}`] ?? [],
          running: list[rowIdx] ?? null
      }));

      const maxSlots = Math.max(...machineJobs.map(({ completed, running }) => completed.length + (running ? 1 : 0)), 1);

      for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
          const isFirstSlot = slotIdx === 0;
          const isLastSlot = slotIdx === maxSlots - 1;

          const rowData: ExportRow = {
              date: isFirstSlot ? dateInfo.label : '', 
              slotIdx,
              maxSlots,
              machines: [],
              totalDraw: isLastSlot ? (calcTotal(rowIdx) || '') : ''
          };

          for (let mIdx = 0; mIdx < 4; mIdx++) {
              const { completed, running } = machineJobs[mIdx];
              const numCompleted = completed.length;
              const hasRunning = running !== null;
              const isRunningSlot = hasRunning && slotIdx === maxSlots - 1;
              const completedOffset = maxSlots - 1 - numCompleted;
              const completedIdx = slotIdx - completedOffset;
              const completedJob = !isRunningSlot && completedIdx >= 0 && completedIdx < numCompleted ? completed[completedIdx] : null;
              const isEmpty = !isRunningSlot && completedJob === null;

              if (isEmpty) {
                  rowData.machines.push({ mIdx, isCompleted: false, product: '', sec: '', wt: '', cut: '', qty: '', draw: '' });
              } else if (completedJob) {
                  const completedMetrics = calcProductionMetrics(completedJob.cut, completedJob.wt, mIdx + 1);
                  const completedDraw = getDrawForDateRow(rowIdx, completedJob, mIdx);
                  rowData.machines.push({
                      mIdx,
                      isCompleted: true,
                      product: isContinuationEntry(mIdx, rowIdx, completedJob) ? '' : (completedJob.product && completedJob.product !== 'None' ? completedJob.product : ''),
                      sec: completedJob.section ?? '',
                      wt: completedJob.wt || '',
                      cut: completedJob.speeds || '',
                      qty: completedMetrics.goodBottles > 0 ? Number(completedMetrics.goodLiters.toFixed(2)) : '', 
                      draw: completedDraw > 0 ? Number(completedDraw.toFixed(1)) : ''
                  });
              } else {
                  // Running
                  const entry = running!;
                  const isBlank = !!entry.isBlank;
                  const hasProduct = !isBlank && !!entry.product && entry.product !== 'None';
                  
                  if (!hasProduct && completed.length === 0) {
                      rowData.machines.push({ mIdx, isCompleted: false, product: '', sec: '', wt: '', cut: '', qty: '', draw: '' });
                  } else {
                      const runningMetrics = calcProductionMetrics(entry.cut, entry.wt, mIdx + 1);
                      const runningDraw = getDrawForDateRow(rowIdx, entry, mIdx);
                      
                      let drawVal: string | number = '';
                      if (hasProduct) {
                          drawVal = runningDraw > 0 ? Number(runningDraw.toFixed(1)) : '';
                      } else if (completed.length > 0) {
                          const last = completed[completed.length - 1];
                          const lastDraw = getDrawForDateRow(rowIdx, last, mIdx);
                          drawVal = lastDraw > 0 ? Number(lastDraw.toFixed(1)) : '';
                      }

                      rowData.machines.push({
                          mIdx,
                          isCompleted: false,
                          product: hasProduct && !isContinuationEntry(mIdx, rowIdx, entry) ? entry.product : '',
                          sec: hasProduct ? (entry.section ?? '') : '',
                          wt: hasProduct ? (entry.wt || '') : '',
                          cut: hasProduct ? (entry.speeds || '') : '',
                          qty: hasProduct && runningMetrics.goodBottles > 0 ? Number(runningMetrics.goodLiters.toFixed(2)) : '',
                          draw: drawVal
                      });
                  }
              }
          }
          if (typeof rowData.totalDraw === 'number') {
              rowData.totalDraw = Number(rowData.totalDraw.toFixed(1));
          }
          results.push(rowData);
      }
  }

  return results;
}
