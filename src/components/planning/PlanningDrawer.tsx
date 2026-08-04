import React, { useEffect, useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { JobPackagingRow } from '../../data/planningSchema';
import { planningRepository } from '../../services/planningRepository';
import { calculateDrawTonsPerDay } from '../../utils/calculations';

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
    bottleMasterRecords,
  } = useERP();

  const [machineId, setMachineId] = useState('MAC-01');
  const [date, setDate] = useState('2026-08-01');
  const [bottleId, setBottleId] = useState('');
  const [sectionCount, setSectionCount] = useState(8);
  const [quantity, setQuantity] = useState(0);
  const [weightGrams, setWeightGrams] = useState(400);
  const [cutPerMin, setCutPerMin] = useState(28);
  const [drawTons, setDrawTons] = useState(0);
  const [startTime, setStartTime] = useState('07:00');
  const [expectedEndTime, setExpectedEndTime] = useState('23:00');
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

  const availableBottles = useMemo(() => {
    const currentMachine = machines.find((m) => m.id === machineId);
    const names = new Set(
      bottleMasterRecords
        .filter((record) => record.mch === currentMachine?.name || record.mch === machineId)
        .map((record) => record.bottleName)
    );

    const matchedBottles = bottles.filter((b) => names.has(b.name));
    return matchedBottles.length > 0 ? matchedBottles : bottles;
  }, [bottleMasterRecords, bottles, machineId, machines]);

  const dailyCapacity = Math.max(1, cutPerMin * sectionCount * 60 * 24);
  const estimatedDays = quantity > 0 ? quantity / dailyCapacity : 0;

  const allocatedQty = selectedPackaging.reduce(
    (sum, code) => sum + (packagingQuantities[code] || 0),
    0
  );
  const isBalanced = quantity > 0 && allocatedQty === quantity;
  const requiresPalletQuantity = palletPacking === 'YES' && selectedPackaging.includes('SN');

  useEffect(() => {
    const derivedDraw = calculateDrawTonsPerDay(cutPerMin, sectionCount, weightGrams);
    setDrawTons(derivedDraw);
  }, [cutPerMin, sectionCount, weightGrams]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const resetPackaging = () => {
      setSelectedPackaging([]);
      setPackagingQuantities({ ST: 0, SN: 0, SB: 0, BT: 0 });
      setPalletPacking('NO');
      setPalletQuantity(0);
    };

    if (editingJob) {
      setMachineId(editingJob.machineId);
      setDate(editingJob.date || editingJob.startDate);
      setBottleId(editingJob.bottleId);
      setSectionCount(editingJob.sectionCount);
      setQuantity(editingJob.productionQuantity || editingJob.grossQuantity);
      setWeightGrams(editingJob.weightGrams);
      setCutPerMin(editingJob.cutPerMin);
      setDrawTons(editingJob.drawTonsPerDay);
      setStartTime(editingJob.startTime || '07:00');
      setExpectedEndTime(editingJob.expectedEndTime || '23:00');
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
    const fallbackBottleId = bottles[0]?.id || '';
    const matchedMachine = machines.find((m) => m.id === defaultMachineId);
    const machineBottleNames = new Set(
      bottleMasterRecords
        .filter((record) => record.mch === matchedMachine?.name || record.mch === defaultMachineId)
        .map((record) => record.bottleName)
    );
    const firstBottle = bottles.find((b) => machineBottleNames.has(b.name)) || bottles[0];

    setMachineId(defaultMachineId);
    setDate(drawerDefaultDate || '2026-08-01');
    setBottleId(firstBottle?.id || fallbackBottleId);
    setSectionCount(matchedMachine?.sectionsCount || matchedMachine?.defaultSectionsCount || 8);
    setQuantity(0);
    setWeightGrams(firstBottle?.weightGrams || 400);
    setCutPerMin(firstBottle?.standardCutPerMin || 28);
    setStartTime(drawerSuggestedStartTime || '07:00');
    setExpectedEndTime('23:00');
    setCustomerName(firstBottle?.customerName || '');
    resetPackaging();
  }, [
    isDrawerOpen,
    editingJob,
    drawerDefaultMachineId,
    drawerDefaultDate,
    drawerSuggestedStartTime,
    machines,
    bottles,
    bottleMasterRecords,
  ]);

  useEffect(() => {
    const selectedBottle = bottles.find((b) => b.id === bottleId);
    if (!selectedBottle) return;

    const matchedMaster = bottleMasterRecords.find((record) => {
      const currentMachine = machines.find((m) => m.id === machineId);
      return (
        (record.mch === currentMachine?.name || record.mch === machineId) &&
        record.bottleName === selectedBottle.name &&
        record.section === sectionCount
      );
    });

    if (matchedMaster) {
      setWeightGrams(matchedMaster.weightGrams);
      setCutPerMin(matchedMaster.speed);
      setCustomerName(matchedMaster.customerName || selectedBottle.customerName || '');
      return;
    }

    setWeightGrams(selectedBottle.weightGrams);
    setCutPerMin(selectedBottle.standardCutPerMin);
    setCustomerName(selectedBottle.customerName || '');
  }, [bottleId, sectionCount, machineId, bottles, bottleMasterRecords, machines]);

  if (!isDrawerOpen) return null;

  const togglePackaging = (code: PackagingCode) => {
    setSelectedPackaging((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (selectedPackaging.length > 0 && !isBalanced) {
      alert('Packaging allocation is not balanced with required bottles.');
      return;
    }

    if (requiresPalletQuantity && palletQuantity <= 0) {
      alert('Pallet quantity is required for Shrink Naked when pallet packing is YES.');
      return;
    }

    const saved = saveJob({
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
      weightGrams,
      cutPerMin,
      drawTonsPerDay: drawTons,
      expectedEndTime,
      startTime,
      linkedJobGroupId: editingJob?.linkedJobGroupId,
      sequenceNumber: editingJob?.sequenceNumber,
      lifecycleStatus: editingJob?.lifecycleStatus || 'ACTIVE',
    });

    if (!saved) return;

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

    const syncResult = planningRepository.replaceJobPackagingForJob(
      toJobKey(date, machineId, bottleId, sectionCount, startTime),
      rows
    );

    if (!syncResult.ok) {
      alert(syncResult.error || 'Job saved, but packaging could not be updated.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Edit Bottle - {machine?.name || 'Machine'}
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
            <label className="text-slate-600 font-semibold">Machine Number</label>
            <div className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-slate-700 font-semibold">
              {machine?.name || machineId}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-600 font-semibold">Bottle Name</label>
            <select
              value={bottleId}
              onChange={(event) => setBottleId(event.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              required
            >
              {availableBottles.map((bottle) => (
                <option key={bottle.id} value={bottle.id}>
                  {bottle.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-600 font-semibold">Required Bottles</label>
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              placeholder="Enter required bottle quantity"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-600 font-semibold">Estimated Completion</label>
            {quantity > 0 ? (
              <p className="text-slate-600">
                Estimated Completion
                <span className="ml-1 font-semibold text-slate-800">~ {estimatedDays.toFixed(2)} Days</span>
              </p>
            ) : (
              <p className="text-slate-500">Enter bottle quantity to calculate completion time.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-slate-600 font-semibold">Packaging Category</label>
            <div className="grid grid-cols-4 gap-2">
              {PACKAGING_OPTIONS.map((option) => {
                const selected = selectedPackaging.includes(option.code);
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => togglePackaging(option.code)}
                    className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                      selected
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
              Allocated: <span className="font-semibold text-slate-800">{allocatedQty.toLocaleString()} / {quantity.toLocaleString()}</span>
            </span>
            <span className={`font-semibold ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isBalanced ? 'Balanced' : 'Not Balanced'}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-slate-600 font-semibold">Pallet Packing</label>
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
              {(['YES', 'NO'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPalletPacking(value)}
                  className={`px-4 py-1.5 text-[11px] font-semibold ${
                    palletPacking === value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
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
