import React, { useEffect, useMemo, useState } from 'react';
import { Save, Search, X } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { JobPackagingRow } from '../../data/planningSchema';
import { planningRepository } from '../../services/planningRepository';
import {
  addCalendarDays,
  calculateProductionMetrics,
  calculateEstimatedCompletionDays,
  formatDecimal,
  formatNumber,
  formatDateTime,
} from '../../utils/calculations';

type PackagingCode = 'ST' | 'SN' | 'SB' | 'BT';

const PACKAGING_OPTIONS: Array<{
  code: PackagingCode;
  title: string;
  subtitle: string;
}> = [
    { code: 'ST', title: 'Shrink', subtitle: 'Tray' },
    { code: 'SN', title: 'Shrink', subtitle: 'Naked' },
    { code: 'SB', title: 'Shrink', subtitle: 'Box' },
    { code: 'BT', title: 'Bottom', subtitle: 'Tray' },
  ];

const toJobKey = (
  plan_date: string,
  machine_no: string,
  bottle_id: string,
  section: number,
  start_time: string
) => ({ plan_date, machine_no, bottle_id, section, start_time });

export const PlanningDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    editingJob,
    drawerDefaultMachineId,
    drawerDefaultDate,
    drawerSuggestedStartTime,
    saveJob,
    bottles,
    machines,
    getBottleConfiguration,
  } = useERP();

  const [machineId, setMachineId] = useState('MAC-01');
  const [date, setDate] = useState('2026-08-01');
  const [bottleId, setBottleId] = useState('');
  const [bottleQuery, setBottleQuery] = useState('');
  const [sectionCount, setSectionCount] = useState(8);
  const [quantity, setQuantity] = useState(0);
  const [startTime, setStartTime] = useState('07:00');
  const [changeoverHours, setChangeoverHours] = useState(0);
  const [customerName, setCustomerName] = useState('');

  const [selectedPackaging, setSelectedPackaging] = useState<PackagingCode[]>([]);
  const [packagingQuantities, setPackagingQuantities] = useState<Record<PackagingCode, number>>({
    ST: 0,
    SN: 0,
    SB: 0,
    BT: 0,
  });
  const [palletPacking, setPalletPacking] = useState<'YES' | 'NO'>('NO');
  const [palletQuantity, setPalletQuantity] = useState(0);

  const machine = machines.find((m) => m.id === machineId);
  const bottleOptions = useMemo(() => {
    const query = bottleQuery.trim().toLowerCase();
    if (!query) return bottles;
    return bottles.filter((bottle) => bottle.name.toLowerCase().includes(query));
  }, [bottleQuery, bottles]);

  const availableSections = useMemo(() => {
    return planningRepository
      .getBottleConfigurations(machineId, bottleId)
      .map((row) => row.section);
  }, [machineId, bottleId]);

  const selectedConfiguration = useMemo(() => {
    return getBottleConfiguration(machineId, bottleId, sectionCount);
  }, [getBottleConfiguration, machineId, bottleId, sectionCount]);

  const metrics = selectedConfiguration
    ? calculateProductionMetrics(
      selectedConfiguration.speeds,
      selectedConfiguration.weight,
      machine || machineId,
      quantity
    )
    : null;
  const dailyProduction = metrics?.totalQuantity ?? 0;
  const hourlyProduction = metrics?.hourlyQuantity ?? 0;
  const plannedProduction = metrics?.goodBottles ?? 0;
  const goodBottlesPerDay = metrics?.goodBottles ?? 0;
  const estimatedDays = quantity > 0 ? calculateEstimatedCompletionDays(quantity, dailyProduction) : 0;
  const drawTons = metrics?.drawTons ?? 0;
  const completionDateTime = useMemo(() => {
    if (!quantity || !selectedConfiguration) return null;
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = startTime.split(':').map(Number);
    const start = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return addCalendarDays(start, estimatedDays);
  }, [date, startTime, estimatedDays, quantity, selectedConfiguration]);
  const goodBottleLabel = metrics && metrics.goodBottles > 0 ? `${formatDecimal(metrics.goodLiters, 2)}L` : '--';

  const allocatedQty = selectedPackaging.reduce(
    (sum, code) => sum + (packagingQuantities[code] || 0),
    0
  );
  const isBalanced = quantity > 0 && allocatedQty === quantity;
  const requiresPalletQuantity = palletPacking === 'YES' && selectedPackaging.includes('SN');

  useEffect(() => {
    if (!isDrawerOpen) return;

    const resetPackaging = () => {
      setSelectedPackaging([]);
      setPackagingQuantities({ ST: 0, SN: 0, SB: 0, BT: 0 });
      setPalletPacking('NO');
      setPalletQuantity(0);
    };

    console.log('saveJob: is editingJob?', !!editingJob);

    if (editingJob) {
      setMachineId(editingJob.machineId);
      setDate(editingJob.date || editingJob.startDate);
      setBottleId(editingJob.bottleId);
      setBottleQuery(bottles.find((bottle) => bottle.id === editingJob.bottleId)?.name || '');
      setSectionCount(editingJob.sectionCount);
      setQuantity(editingJob.productionQuantity || editingJob.grossQuantity);
      setStartTime(editingJob.startTime || '07:00');
      setChangeoverHours(editingJob.changeoverHours || 0);
      setCustomerName(editingJob.customerName || '');

      const records = planningRepository
        .getJobPackaging()
        .filter(
          (pkg) =>
            pkg.plan_date === (editingJob.date || editingJob.startDate) &&
            pkg.machine_no === editingJob.machineId &&
            pkg.bottle_id === editingJob.bottleId &&
            pkg.section === editingJob.sectionCount &&
            pkg.start_time === (editingJob.startTime || '07:00')
        );

      if (records.length === 0) {
        resetPackaging();
      } else {
        const selected = records
          .map((pkg) => pkg.packaging_type as PackagingCode)
          .filter((code): code is PackagingCode => ['ST', 'SN', 'SB', 'BT'].includes(code));

        const nextQty: Record<PackagingCode, number> = { ST: 0, SN: 0, SB: 0, BT: 0 };
        records.forEach((pkg) => {
          const code = pkg.packaging_type as PackagingCode;
          if (code in nextQty) nextQty[code] = pkg.quantity;
        });

        setSelectedPackaging(selected);
        setPackagingQuantities(nextQty);
        setPalletPacking(records.some((pkg) => pkg.pallet_packing === 'YES') ? 'YES' : 'NO');
        setPalletQuantity(records.find((pkg) => pkg.packaging_type === 'SN')?.pallet_quantity || 0);
      }
      return;
    }

    const defaultMachineId = drawerDefaultMachineId || machines[0]?.id || 'MAC-01';
    const defaultBottle = bottles.find(
      (bottle) => planningRepository.getBottleConfigurations(defaultMachineId, bottle.id).length > 0
    ) || bottles[0];

    setMachineId(defaultMachineId);
    setDate(drawerDefaultDate || '2026-08-01');
    setBottleId(defaultBottle?.id || '');
    setBottleQuery(defaultBottle?.name || '');
    setSectionCount(
      planningRepository.getBottleConfigurations(defaultMachineId, defaultBottle?.id || '')[0]?.section ||
      machines.find((m) => m.id === defaultMachineId)?.defaultSectionsCount ||
      8
    );
    setQuantity(0);
    setStartTime(drawerSuggestedStartTime || '07:00');
    setChangeoverHours(0);
    setCustomerName('');
    resetPackaging();
  }, [
    isDrawerOpen,
    editingJob,
    drawerDefaultMachineId,
    drawerDefaultDate,
    drawerSuggestedStartTime,
    machines,
    bottles,
  ]);

  useEffect(() => {
    if (!bottleId) return;
    const bottle = bottles.find((item) => item.id === bottleId);
    if (bottle) setBottleQuery(bottle.name);
  }, [bottleId, bottles]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    if (availableSections.length > 0 && !availableSections.includes(sectionCount)) {
      setSectionCount(availableSections[0]);
    }
  }, [availableSections, sectionCount, isDrawerOpen]);

  if (!isDrawerOpen) return null;

  const selectedBottle = bottles.find((b) => b.id === bottleId);
  const completionLabel = completionDateTime
    ? formatDateTime(
      completionDateTime.toISOString().split('T')[0],
      completionDateTime.toTimeString().slice(0, 5)
    )
    : '--';

  const togglePackaging = (code: PackagingCode) => {
    setSelectedPackaging((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    console.log('handleSubmit: Initiating save process');

    if (!selectedConfiguration) {
      alert('No bottle_configuration row exists for the selected bottle and section.');
      return;
    }

    if (selectedPackaging.length > 0 && !isBalanced) {
      alert('Packaging allocation is not balanced with required bottles.');
      return;
    }

    if (requiresPalletQuantity && palletQuantity <= 0) {
      alert('Pallet quantity is required for Shrink Naked when pallet packing is YES.');
      return;
    }

    const rows: JobPackagingRow[] = selectedPackaging.map((code) => ({
      plan_date: date,
      machine_no: machineId,
      bottle_id: bottleId,
      section: sectionCount,
      start_time: startTime,
      packaging_type: code,
      quantity: packagingQuantities[code] || 0,
      pallet_packing: palletPacking,
      pallet_quantity: palletPacking === 'YES' && code === 'SN' ? palletQuantity : 0,
    }));

    try {
      console.log('handleSubmit: Calling saveJob with', { machineId, date, bottleId, quantity, rows });
      const saved = await saveJob({
        id: editingJob?.id,
      jobNumber: editingJob?.jobNumber,
      machineId,
      date,
      startDate: date,
      endDate: date,
      bottleId,
      customerName,
      sectionCount,
      grossQuantity: quantity,
      productionQuantity: quantity,
      producedQuantity: 0,
      startTime,
      changeoverHours,
      linkedJobGroupId: editingJob?.linkedJobGroupId,
      sequenceNumber: editingJob?.sequenceNumber,
      lifecycleStatus: editingJob?.lifecycleStatus || 'ACTIVE',
    }, rows);

      if (saved) {
        console.log('handleSubmit: saveJob returned true, closing drawer');
        closeDrawer();
      } else {
        console.warn('handleSubmit: saveJob returned false!');
      }
    } catch (err) {
      console.error('handleSubmit CAUGHT EXCEPTION:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {editingJob ? 'Edit Production Job' : 'Add Production Job'} - {machine?.name || 'Machine'}
          </h3>
          <button
            onClick={closeDrawer}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Changeover (Hours)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={changeoverHours}
                onChange={(event) => setChangeoverHours(Number(event.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Machine Number</label>
              <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-slate-700 font-semibold">
                {machine?.name || machineId}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Bottle Name</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={bottleQuery}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setBottleQuery(nextQuery);
                    const exactMatch = bottles.find(
                      (bottle) => bottle.name.toLowerCase() === nextQuery.trim().toLowerCase()
                    );
                    setBottleId(exactMatch?.id || '');
                  }}
                  placeholder="Search bottle master..."
                  list="bottle-master-options"
                  className="w-full border border-slate-300 rounded-lg px-9 py-2"
                  required
                />
                <datalist id="bottle-master-options">
                  {bottles.map((bottle) => (
                    <option key={bottle.id} value={bottle.name} />
                  ))}
                </datalist>

                {bottleQuery.trim() && bottleOptions.length > 0 && bottleOptions.length < bottles.length && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {bottleOptions.slice(0, 8).map((bottle) => (
                      <button
                        key={bottle.id}
                        type="button"
                        onClick={() => {
                          setBottleId(bottle.id);
                          setBottleQuery(bottle.name);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                      >
                        <div className="font-semibold text-slate-800">{bottle.name}</div>
                        <div className="text-[10px] text-slate-400">Bottle Master</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Section</label>
              <select
                value={sectionCount}
                onChange={(event) => setSectionCount(Number(event.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                required
              >
                {(availableSections.length > 0 ? availableSections : machine?.availableSections || []).map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
              {bottleId && availableSections.length === 0 && (
                <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This bottle is not available for the selected machine and section.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Required Bottles</label>
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                onWheel={(e) => {
                  e.currentTarget.blur();
                }}
                placeholder="Enter required bottle quantity"
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">Estimated Completion</label>
              <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-slate-700 font-semibold">
                {quantity > 0 ? `≈ ${estimatedDays.toFixed(2)} Days` : 'Enter bottles to calculate'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Weight</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {selectedConfiguration ? `${selectedConfiguration.weight} g` : '--'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cut Speed</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {selectedConfiguration ? formatDecimal(selectedConfiguration.speeds, 2) : '--'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gob</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {metrics ? metrics.machineGob : '--'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Hourly Production</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {hourlyProduction > 0 ? `${formatNumber(hourlyProduction)} bottles` : '--'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">24 Hour Production</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {dailyProduction > 0 ? `${formatNumber(dailyProduction)} bottles` : '--'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Planned Production</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {plannedProduction > 0 ? `${formatNumber(plannedProduction)} bottles` : '--'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Draw</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {drawTons > 0 ? `${formatDecimal(drawTons, 2)} T` : '--'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Good Bottles / Day</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {goodBottlesPerDay > 0 ? `${goodBottleLabel} (${formatNumber(goodBottlesPerDay)} bottles)` : '--'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Estimated Completion</div>
              <div className="mt-1 text-sm font-bold text-emerald-700">
                {completionDateTime ? `≈ ${completionLabel}` : '--'}
              </div>
            </div>
          </div>

          {!selectedConfiguration && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 font-semibold">
              No bottle_configuration row exists for the selected bottle and section.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-slate-600 font-semibold">Packaging Category</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PACKAGING_OPTIONS.map((option) => {
                const selected = selectedPackaging.includes(option.code);
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => togglePackaging(option.code)}
                    className={`rounded-lg border px-2 py-2 text-center transition-colors ${selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <div className="font-bold text-[11px]">{option.code}</div>
                    <div className="text-[10px] leading-tight">{option.title}</div>
                    <div className="text-[10px] leading-tight">{option.subtitle}</div>
                  </button>
                );
              })}
            </div>

            {selectedPackaging.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {selectedPackaging.map((code) => {
                  const option = PACKAGING_OPTIONS.find((o) => o.code === code);
                  return (
                    <div key={code} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1">
                        {option?.code} Quantity
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={packagingQuantities[code] || 0}
                        onChange={(event) =>
                          setPackagingQuantities((prev) => ({
                            ...prev,
                            [code]: Number(event.target.value),
                          }))
                        }
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-slate-600">
              Allocated: <span className="font-semibold text-slate-800">{formatNumber(allocatedQty)} / {formatNumber(quantity)}</span>
            </span>
            <span className={`font-semibold ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isBalanced ? 'Balanced' : `Remaining Allocation ${formatNumber(Math.max(quantity - allocatedQty, 0))}`}
            </span>
          </div>

          {selectedPackaging.includes('SN') && (
            <div className="space-y-2">
              <label className="text-slate-600 font-semibold">Pallet Packing</label>
              <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
                {(['YES', 'NO'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPalletPacking(value)}
                    className={`px-4 py-1.5 text-[11px] font-semibold ${palletPacking === value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              {requiresPalletQuantity && (
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-semibold">Pallet Quantity</label>
                  <input
                    type="number"
                    min={0}
                    value={palletQuantity}
                    onChange={(event) => setPalletQuantity(Number(event.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                    required
                  />
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={closeDrawer}
              className="px-3.5 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
