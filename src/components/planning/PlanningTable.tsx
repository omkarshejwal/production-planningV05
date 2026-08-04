import React, { useMemo, useState } from 'react';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { ProductionJob } from '../../types';
import { formatDateDisplay, formatDecimal, generateMonthDates } from '../../utils/calculations';

type DraftFields = {
  sectionCount?: string;
  weightGrams?: string;
  cutPerMin?: string;
  quantity?: string;
  drawTonsPerDay?: string;
};

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

export const PlanningTable: React.FC = () => {
  const {
    machines,
    jobs,
    bottles,
    fromDate,
    toDate,
    selectedMonth,
    openDrawerForEdit,
    deleteJob,
    updateJobInline,
    searchQuery,
  } = useERP();

  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});

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

  const bottleById = useMemo(() => {
    const map = new Map<string, (typeof bottles)[number]>();
    bottles.forEach((b) => map.set(b.id, b));
    return map;
  }, [bottles]);

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

  const getLatestActiveJobId = (cellJobs: ProductionJob[]): string | undefined => {
    const activeJobs = cellJobs.filter((job) => !isCompletedJob(job));
    if (activeJobs.length === 0) return undefined;
    return activeJobs[activeJobs.length - 1].id;
  };

  const calculateDailyRunningSections = (date: string): number => {
    return displayedMachines.reduce((sum, machine) => {
      const sectionTotal = jobs
        .filter((job) => job.machineId === machine.id && getJobDate(job) === date)
        .filter((job) => job.lifecycleStatus !== 'COMPLETED')
        .reduce((acc, job) => acc + (job.sectionCount || 0), 0);

      return sum + sectionTotal;
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
      return { ...prev, [jobId]: current };
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
    key: 'weightGrams' | 'cutPerMin' | 'productionQuantity' | 'drawTonsPerDay',
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

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto max-h-[72vh] overflow-y-auto">
        <table className="w-full min-w-355 border-collapse text-xs">
          <thead className="sticky top-0 z-30 bg-slate-100 text-slate-700">
            <tr>
              <th className="sticky left-0 z-40 bg-slate-200 p-2.5 border border-slate-300 text-left w-36">
                Date
              </th>

              {displayedMachines.map((machine) => (
                <th key={machine.id} className="p-2 border border-slate-300 bg-blue-50 min-w-[320px]">
                  <div className="font-bold text-slate-900 text-[13px]">{machine.name}</div>
                </th>
              ))}

              <th className="p-2 border border-slate-300 bg-slate-200 text-slate-900 w-24 text-center">
                Total
              </th>
            </tr>

            <tr className="text-[10px] uppercase bg-slate-50">
              <th className="sticky left-0 z-40 bg-slate-200 p-2 border border-slate-300 text-left text-slate-600">
                Planner
              </th>

              {displayedMachines.map((machine) => (
                <th key={`sub-${machine.id}`} className="p-0 border border-slate-300">
                  <div className="grid grid-cols-[minmax(140px,1fr)_56px_52px_52px_56px_52px] text-slate-600 bg-slate-50">
                    <div className="p-1.5 border-r border-slate-200 font-bold text-blue-700">Bottle Name</div>
                    <div className="p-1.5 border-r border-slate-200 text-center font-semibold text-purple-700">Sec</div>
                    <div className="p-1.5 border-r border-slate-200 text-center font-semibold">Wt</div>
                    <div className="p-1.5 border-r border-slate-200 text-center font-semibold">Cut</div>
                    <div className="p-1.5 border-r border-slate-200 text-center font-semibold">Qty</div>
                    <div className="p-1.5 text-center font-semibold">Draw</div>
                  </div>
                </th>
              ))}

              <th className="p-1.5 border border-slate-300 bg-slate-200 text-center text-slate-700 font-bold">
                Sections
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredDates.map((date) => (
              <tr key={date} className="align-top">
                <td className="sticky left-0 z-20 bg-slate-100 border border-slate-300 p-2 font-bold whitespace-nowrap">
                  {formatDateDisplay(date)}
                </td>

                {displayedMachines.map((machine) => {
                  const cellJobs = getCellJobs(date, machine.id);
                  const latestActiveJobId = getLatestActiveJobId(cellJobs);

                  return (
                    <td key={`${date}-${machine.id}`} className="border border-slate-300 p-0 bg-white align-top">
                      {cellJobs.length === 0 ? (
                        <button
                          onClick={() => openDrawerForEdit(null, machine.id, date)}
                          className="w-full min-h-16 text-slate-500 hover:text-blue-700 hover:bg-blue-50/70 transition-all flex flex-col items-center justify-center border-0"
                        >
                          <Plus className="w-4 h-4 mb-0.5" />
                          <span className="font-semibold">Add Job</span>
                        </button>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {cellJobs.map((job) => {
                            const bottle = bottleById.get(job.bottleId);
                            const isCompleted = isCompletedJob(job);
                            const isLatestActive = !isCompleted && job.id === latestActiveJobId;
                            const isLocked = isCompleted || !isLatestActive;

                            return (
                              <div
                                key={job.id}
                                className={`grid grid-cols-[minmax(140px,1fr)_56px_52px_52px_56px_52px] border-l-2 ${
                                  isLocked ? 'border-slate-300 bg-[#ECECEC]' : 'border-emerald-500 bg-white'
                                }`}
                              >
                                <div className="p-1.5 border-r border-slate-200">
                                  <div className="font-bold text-slate-900 truncate text-[12px]">{bottle?.name || 'Bottle'}</div>
                                  <div className="text-[10px] text-slate-600">
                                    {formatTimeDisplay(job.startTime)} - {formatTimeDisplay(job.expectedEndTime)}
                                  </div>

                                  <div className="flex items-center gap-1 mt-1">
                                    <button
                                      onClick={() => openDrawerForEdit(job, machine.id, date)}
                                      disabled={isLocked}
                                      title="Edit Job"
                                      className="w-5 h-5 inline-flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>

                                    <button
                                      onClick={() =>
                                        openDrawerForEdit(
                                          null,
                                          machine.id,
                                          date,
                                          job.id,
                                          job.expectedEndTime || '07:00'
                                        )
                                      }
                                      disabled={isLocked}
                                      title="Add Next Job"
                                      className="w-5 h-5 inline-flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>

                                    <button
                                      onClick={() => {
                                        const ok = window.confirm('Delete Job?');
                                        if (!ok) return;
                                        deleteJob(job.id);
                                      }}
                                      disabled={isLocked}
                                      title="Delete Job"
                                      className="w-5 h-5 inline-flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                <div className="p-1 border-r border-slate-200 flex items-center justify-center">
                                  <select
                                    value={String(job.sectionCount)}
                                    onChange={(event) => {
                                      const nextSection = Number(event.target.value);
                                      updateJobInline(job.id, { sectionCount: nextSection });
                                    }}
                                    disabled={isLocked}
                                    className="w-full h-6 border border-slate-300 rounded px-1 text-[11px] text-purple-700 font-bold bg-white disabled:bg-slate-200 disabled:cursor-not-allowed"
                                  >
                                    {(machine.availableSections || []).map((section) => (
                                      <option key={section} value={section}>
                                        {section}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="p-1 border-r border-slate-200 flex items-center justify-center">
                                  <input
                                    type="number"
                                    step="1"
                                    min={0}
                                    value={getDraftValue(job, 'weightGrams', String(job.weightGrams))}
                                    onChange={(event) => setDraft(job.id, 'weightGrams', event.target.value)}
                                    onBlur={() => commitNumeric(job, 'weightGrams', 'weightGrams', 0)}
                                    disabled={isLocked}
                                    className="w-full h-6 border border-slate-300 rounded px-1 text-[11px] text-center bg-white disabled:bg-slate-200 disabled:cursor-not-allowed"
                                  />
                                </div>

                                <div className="p-1 border-r border-slate-200 flex items-center justify-center">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={getDraftValue(job, 'cutPerMin', formatDecimal(job.cutPerMin, 2))}
                                    onChange={(event) => setDraft(job.id, 'cutPerMin', event.target.value)}
                                    onBlur={() => commitNumeric(job, 'cutPerMin', 'cutPerMin', 2)}
                                    disabled={isLocked}
                                    className="w-full h-6 border border-slate-300 rounded px-1 text-[11px] text-center bg-white disabled:bg-slate-200 disabled:cursor-not-allowed"
                                  />
                                </div>

                                <div className="p-1 border-r border-slate-200 flex items-center justify-center">
                                  <input
                                    type="number"
                                    step="1"
                                    min={0}
                                    value={getDraftValue(job, 'quantity', String(job.productionQuantity || job.grossQuantity))}
                                    onChange={(event) => setDraft(job.id, 'quantity', event.target.value)}
                                    onBlur={() => commitNumeric(job, 'quantity', 'productionQuantity', 0)}
                                    disabled={isLocked}
                                    className="w-full h-6 border border-slate-300 rounded px-1 text-[11px] text-center bg-white disabled:bg-slate-200 disabled:cursor-not-allowed"
                                  />
                                </div>

                                <div className="p-1 flex items-center justify-center">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    value={getDraftValue(job, 'drawTonsPerDay', formatDecimal(job.drawTonsPerDay, 1))}
                                    onChange={(event) => setDraft(job.id, 'drawTonsPerDay', event.target.value)}
                                    onBlur={() => commitNumeric(job, 'drawTonsPerDay', 'drawTonsPerDay', 1)}
                                    disabled={isLocked}
                                    className="w-full h-6 border border-slate-300 rounded px-1 text-[11px] text-center bg-white disabled:bg-slate-200 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}

                <td className="border border-slate-300 p-2 text-center font-bold text-slate-800 bg-slate-50">
                  {calculateDailyRunningSections(date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
