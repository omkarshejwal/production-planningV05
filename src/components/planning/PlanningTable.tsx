import React from 'react';
import { Edit2, AlertCircle } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { DailyPlanningEntry, ISMachine } from '../../types';
import { formatDateDisplay, formatDecimal, formatNumber, generateMonthDates } from '../../utils/calculations';
import { ColorBadge } from '../common/StatusBadge';

interface PlanningTableProps {
  statusFilter: string;
  machineFilter: string;
  colorFilter: string;
  customerFilter: string;
}

export const PlanningTable: React.FC<PlanningTableProps> = ({
  statusFilter,
  machineFilter,
  colorFilter,
  customerFilter,
}) => {
  const {
    machines,
    planningEntries,
    fromDate,
    toDate,
    openDrawerForEdit,
    jobs,
    searchQuery,
    updateMachineSectionsCount,
  } = useERP();

  // Filter active machines if machineFilter set
  const displayedMachines = machineFilter
    ? machines.filter((m) => m.id === machineFilter)
    : machines;

  // Generate date list from august 2026
  const allAugustDates = generateMonthDates(2026, 7);

  // Filter dates by fromDate & toDate
  const filteredDates = allAugustDates.filter((date) => {
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });

  // Helper to get entry for a date & machine
  const getEntry = (date: string, machineId: string): DailyPlanningEntry | undefined => {
    return planningEntries.find((e) => e.date === date && e.machineId === machineId);
  };

  // Check if entry passes active filters
  const passesFilters = (entry?: DailyPlanningEntry): boolean => {
    if (!entry) return true;
    if (statusFilter && entry.status !== statusFilter) return false;
    if (colorFilter && entry.bottleColor !== colorFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = entry.bottleName.toLowerCase().includes(q);
      const matchDwg = entry.drawingNumber.toLowerCase().includes(q);
      const matchDate = entry.date.toLowerCase().includes(q);
      if (!matchName && !matchDwg && !matchDate) return false;
    }
    return true;
  };

  // Column totals calculation per machine
  const calculateMachineTotals = (machineId: string) => {
    let totalQty = 0;
    let totalDraw = 0;

    filteredDates.forEach((date) => {
      const entry = getEntry(date, machineId);
      if (entry && passesFilters(entry)) {
        totalQty += entry.dayQuantity || 0;
        totalDraw += entry.drawTons || 0;
      }
    });

    return { totalQty, totalDraw };
  };

  // Grand Total calculation across all displayed machines
  let grandTotalQty = 0;
  let grandTotalDraw = 0;

  displayedMachines.forEach((m) => {
    const { totalQty, totalDraw } = calculateMachineTotals(m.id);
    grandTotalQty += totalQty;
    grandTotalDraw += totalDraw;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
      {/* Table Header Bar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Glass Manufacturing Production Register
          </h3>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-blue-700">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span> Running
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Completed
          </span>
          <span className="flex items-center gap-1.5 text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Changeover
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span> Pending
          </span>
        </div>
      </div>

      {/* Main Horizontally Scrollable Table Container */}
      <div className="overflow-x-auto max-h-[680px] overflow-y-auto relative scrollbar-thin">
        <table className="w-full text-left border-collapse font-sans text-xs min-w-[1600px]">
          {/* Grouped Table Header */}
          <thead className="sticky top-0 z-30 bg-slate-100 shadow-xs text-slate-700">
            {/* Row 1: Machine Names */}
            <tr>
              <th className="sticky left-0 z-40 bg-slate-200 p-2.5 border-b-2 border-r-2 border-slate-300 w-28 text-slate-900 font-bold uppercase tracking-wider text-[11px] shadow-xs">
                Date
              </th>

              {displayedMachines.map((m) => (
                <th
                  key={m.id}
                  colSpan={6}
                  className="p-2 border-b-2 border-r-2 border-slate-300 text-center font-bold text-blue-900 bg-blue-50/90 text-xs"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-bold text-slate-900">{m.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">({m.code})</span>
                    <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-blue-200 text-slate-700 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-semibold">Sec:</span>
                      <select
                        value={m.sectionsCount}
                        onChange={(e) => updateMachineSectionsCount(m.id, parseInt(e.target.value, 10))}
                        className="text-xs font-bold text-blue-700 bg-transparent outline-none cursor-pointer"
                        title={`Select Section Count for ${m.name}`}
                      >
                        {(m.availableSections || (m.id === 'MAC-01' || m.id === 'MAC-04' ? [6, 7, 8] : [8, 9, 10])).map((s) => (
                          <option key={s} value={s}>
                            {s} Sections {s === m.defaultSectionsCount ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </th>
              ))}

              <th
                colSpan={2}
                className="p-2 border-b-2 border-slate-300 text-center font-bold text-slate-900 bg-slate-200 text-xs w-36"
              >
                Daily Total
              </th>
            </tr>

            {/* Row 2: Sub-columns per Machine */}
            <tr className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase border-b border-slate-300">
              <th className="sticky left-0 z-40 bg-slate-200 p-2 border-r-2 border-slate-300 font-bold text-slate-700 text-[10px]">
                01 - 31 AUG
              </th>

              {displayedMachines.map((m) => (
                <React.Fragment key={`sub-${m.id}`}>
                  <th className="p-2 border-r border-slate-200 font-bold text-blue-700 min-w-[170px]">
                    Bottle Name
                  </th>
                  <th className="p-2 border-r border-slate-200 text-center w-12 text-slate-600">Sec</th>
                  <th className="p-2 border-r border-slate-200 text-center w-14 text-slate-600">Wt (g)</th>
                  <th className="p-2 border-r border-slate-200 text-center w-12 text-slate-600">Cut</th>
                  <th className="p-2 border-r border-slate-200 text-right w-20 text-slate-600">Qty (pcs)</th>
                  <th className="p-2 border-r-2 border-slate-300 text-right w-16 text-slate-600">Draw (T)</th>
                </React.Fragment>
              ))}

              <th className="p-2 border-r border-slate-200 text-right font-bold text-slate-800">Total Qty</th>
              <th className="p-2 text-right font-bold text-slate-800">Total Draw</th>
            </tr>
          </thead>

          {/* Table Body: Daily Rows */}
          <tbody className="divide-y divide-slate-200 text-[11px] font-medium text-slate-800 bg-white">
            {filteredDates.map((dateStr) => {
              let dailyRowQty = 0;
              let dailyRowDraw = 0;

              return (
                <tr
                  key={dateStr}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Sticky Date Column */}
                  <td className="sticky left-0 z-20 bg-slate-100 group-hover:bg-slate-200/90 p-2 font-bold text-slate-900 border-r-2 border-slate-300 whitespace-nowrap shadow-2xs font-mono text-[11px]">
                    {formatDateDisplay(dateStr)}
                  </td>

                  {/* Machine Columns */}
                  {displayedMachines.map((m) => {
                    const entry = getEntry(dateStr, m.id);
                    const passes = passesFilters(entry);

                    if (entry && passes) {
                      dailyRowQty += entry.dayQuantity || 0;
                      dailyRowDraw += entry.drawTons || 0;
                    }

                    // Card status style
                    let cellBg = 'hover:bg-slate-100';
                    let borderLeftStyle = 'border-l-2 border-l-transparent';

                    if (entry && passes) {
                      if (entry.status === 'Running') {
                        cellBg = 'bg-blue-50/30 hover:bg-blue-50/70';
                        borderLeftStyle = 'border-l-3 border-l-blue-600';
                      } else if (entry.status === 'Completed') {
                        cellBg = 'bg-emerald-50/30 hover:bg-emerald-50/70';
                        borderLeftStyle = 'border-l-3 border-l-emerald-600';
                      } else if (entry.status === 'Changeover') {
                        cellBg = 'bg-amber-50/50 hover:bg-amber-100/70';
                        borderLeftStyle = 'border-l-3 border-l-amber-500';
                      } else if (entry.status === 'Pending') {
                        cellBg = 'bg-slate-50/50 hover:bg-slate-100';
                        borderLeftStyle = 'border-l-3 border-l-slate-400';
                      }
                    }

                    const matchingJob = jobs.find((j) => j.id === entry?.jobId);

                    return (
                      <React.Fragment key={`${m.id}-${dateStr}`}>
                        {/* Bottle Name & Edit Button */}
                        <td
                          className={`p-1.5 border-r border-slate-200 font-semibold ${cellBg} ${borderLeftStyle}`}
                        >
                          {entry && passes ? (
                            <div className="flex items-center justify-between gap-1 group/cell">
                              <div className="truncate max-w-[145px]">
                                <div className="truncate font-semibold text-slate-900 text-[11px]">
                                  {entry.bottleName}
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <ColorBadge color={entry.bottleColor} />
                                  {entry.status === 'Changeover' && (
                                    <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1 rounded">
                                      {entry.changeoverHours || 4}h CHG
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => openDrawerForEdit(matchingJob, m.id, dateStr)}
                                className="opacity-0 group-hover/cell:opacity-100 text-blue-600 hover:text-blue-800 p-1 hover:bg-white rounded transition-all shrink-0"
                                title="Edit Job Planning"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openDrawerForEdit(null, m.id, dateStr)}
                              className="w-full text-left text-slate-300 hover:text-blue-600 font-normal italic text-[10px]"
                            >
                              + Assign Job
                            </button>
                          )}
                        </td>

                        {/* Section */}
                        <td className={`p-1.5 border-r border-slate-200 text-center font-mono ${cellBg}`}>
                          {entry && passes ? entry.section : '-'}
                        </td>

                        {/* Weight (g) */}
                        <td className={`p-1.5 border-r border-slate-200 text-center font-mono ${cellBg}`}>
                          {entry && passes && entry.weightGrams ? `${entry.weightGrams}g` : '-'}
                        </td>

                        {/* Cut/min */}
                        <td className={`p-1.5 border-r border-slate-200 text-center font-mono ${cellBg}`}>
                          {entry && passes && entry.cutPerMin ? entry.cutPerMin : '-'}
                        </td>

                        {/* Qty (pcs) */}
                        <td className={`p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900 ${cellBg}`}>
                          {entry && passes && entry.dayQuantity
                            ? formatNumber(entry.dayQuantity)
                            : '-'}
                        </td>

                        {/* Draw (Tons) */}
                        <td className={`p-1.5 border-r-2 border-slate-300 text-right font-mono font-bold text-blue-800 ${cellBg}`}>
                          {entry && passes && entry.drawTons ? formatDecimal(entry.drawTons, 1) : '-'}
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Daily Row Summary Total Columns */}
                  <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-slate-900 bg-slate-100">
                    {formatNumber(dailyRowQty)}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-blue-800 bg-slate-100">
                    {formatDecimal(dailyRowDraw, 1)} T
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Table Footer: Column Totals & Grand Total */}
          <tfoot className="sticky bottom-0 z-30 bg-slate-900 text-white font-mono text-xs border-t-2 border-slate-900">
            <tr>
              <td className="sticky left-0 z-40 bg-slate-950 p-3 font-bold uppercase border-r-2 border-slate-700 text-amber-400">
                Total Production
              </td>

              {displayedMachines.map((m) => {
                const { totalQty, totalDraw } = calculateMachineTotals(m.id);
                return (
                  <React.Fragment key={`tot-${m.id}`}>
                    <td colSpan={4} className="p-3 border-r border-slate-800 font-sans font-bold text-slate-300 text-[11px]">
                      {m.name} Total
                    </td>
                    <td className="p-3 border-r border-slate-800 text-right font-bold text-emerald-400">
                      {formatNumber(totalQty)}
                    </td>
                    <td className="p-3 border-r-2 border-slate-700 text-right font-bold text-amber-400">
                      {formatDecimal(totalDraw, 1)} T
                    </td>
                  </React.Fragment>
                );
              })}

              {/* Grand Total Summary Columns */}
              <td className="p-3 border-r border-slate-800 text-right font-bold text-emerald-300 bg-slate-950">
                {formatNumber(grandTotalQty)}
              </td>
              <td className="p-3 text-right font-bold text-amber-300 bg-slate-950 text-sm">
                {formatDecimal(grandTotalDraw, 1)} Tons
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer Instructions Note */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
          <span>
            Click on any job cell or <b>+ Assign Job</b> to open the Job Planning Drawer. Double click to modify bottle mold speeds or changeover duration.
          </span>
        </div>
        <span className="font-mono text-slate-400">Vitrum Glass ERP • Full August 2026 Shift Matrix</span>
      </div>
    </div>
  );
};
