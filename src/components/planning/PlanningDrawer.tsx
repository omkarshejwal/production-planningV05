import React, { useEffect, useState } from 'react';
import { X, Save, Trash2, Calculator, AlertTriangle, ShieldCheck, Lock, Clock } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { BottleColor, JobPriority, JobStatus, PackingCategory, PalletType, ProductionJob } from '../../types';
import {
  calculateBottlesPerHour,
  calculateBottlesPerMin,
  calculateDailyProductionPcs,
  calculateDailyProductionTons,
  calculateDrawTonsPerDay,
  calculateEstimatedCompletionDate,
  calculateGrossDayQuantity,
  calculateProductionDuration,
  calculateRemainingQuantity,
  formatDecimal,
  formatNumber,
} from '../../utils/calculations';

export const PlanningDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    editingJob,
    drawerDefaultMachineId,
    drawerDefaultDate,
    saveJob,
    deleteJob,
    bottles,
    machines,
    bottleMasterRecords,
  } = useERP();

  const [machineId, setMachineId] = useState('MAC-01');
  const [selectedBottleName, setSelectedBottleName] = useState('');
  const [sectionCount, setSectionCount] = useState<number>(8);
  const [grossQuantity, setGrossQuantity] = useState<number>(300000);
  const [producedQuantity, setProducedQuantity] = useState<number>(0);
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-15');
  const [status, setStatus] = useState<JobStatus>('Pending');
  const [priority, setPriority] = useState<JobPriority>('Medium');
  const [packingCategory, setPackingCategory] = useState<PackingCategory>('Palletized');
  const [palletType, setPalletType] = useState<PalletType>('Wooden Standard (1200x1000)');
  const [customerName, setCustomerName] = useState('');
  const [changeoverHours, setChangeoverHours] = useState<number>(4.0);
  const [remarks, setRemarks] = useState('');

  // Currently selected machine object and name
  const currentMachine = machines.find((m) => m.id === machineId) || machines[0];
  const machineName = currentMachine?.name || 'Machine No 1';

  // Get all bottle master records matching the selected machine
  const machineMasterRecords = bottleMasterRecords.filter(
    (r) => r.mch === machineName || r.mch === machineId
  );

  // Get list of unique bottle names for this machine from Bottle Master
  const availableBottleNames = Array.from(
    new Set(machineMasterRecords.map((r) => r.bottleName))
  );

  // If no bottle names for this machine in Bottle Master, fallback to all records
  const bottleNameList = availableBottleNames.length > 0
    ? availableBottleNames
    : Array.from(new Set(bottleMasterRecords.map((r) => r.bottleName)));

  // Available section options for the currently selected machine & bottle name
  const bottleSectionRecords = machineMasterRecords.filter(
    (r) => r.bottleName === selectedBottleName
  );
  const availableSectionsForBottle = Array.from(
    new Set(bottleSectionRecords.map((r) => r.section))
  ).sort((a, b) => Number(a) - Number(b));

  // Active Bottle Master Record matching machine, bottle name, and selected section
  const activeMasterRecord = bottleMasterRecords.find(
    (r) =>
      (r.mch === machineName || r.mch === machineId) &&
      r.bottleName === selectedBottleName &&
      r.section === sectionCount
  );

  // Derived values from Bottle Master
  const weightGrams = activeMasterRecord?.weightGrams || 400;
  const cutPerMin = activeMasterRecord?.speed || 28;
  const isRecordValid = Boolean(activeMasterRecord);

  // Fallback match bottle in global list for color/drawing number
  const matchingBottleObj = bottles.find((b) => b.name === selectedBottleName) || bottles[0];

  useEffect(() => {
    if (editingJob) {
      setMachineId(editingJob.machineId);
      const targetMch = machines.find((m) => m.id === editingJob.machineId);
      const mchName = targetMch?.name || 'Machine No 1';

      const jobBottleObj = bottles.find((b) => b.id === editingJob.bottleId);
      const bName = jobBottleObj?.name || '750ml Bordeaux Wine Heavy';

      setSelectedBottleName(bName);
      setSectionCount(editingJob.sectionCount);
      setGrossQuantity(editingJob.grossQuantity);
      setProducedQuantity(editingJob.producedQuantity);
      setStartDate(editingJob.startDate);
      setEndDate(editingJob.endDate);
      setStatus(editingJob.status);
      setPriority(editingJob.priority);
      setPackingCategory(editingJob.packingCategory);
      setPalletType(editingJob.palletType);
      setCustomerName(editingJob.customerName);
      setChangeoverHours(editingJob.changeoverHours || 4.0);
      setRemarks(editingJob.remarks || '');
    } else {
      // Default creation state based on selected machine
      const defaultMchId = drawerDefaultMachineId || machines[0]?.id || 'MAC-01';
      setMachineId(defaultMchId);

      const targetMch = machines.find((m) => m.id === defaultMchId);
      const mchName = targetMch?.name || 'Machine No 1';

      const mchRecords = bottleMasterRecords.filter(
        (r) => r.mch === mchName || r.mch === defaultMchId
      );
      const defaultBottle = mchRecords[0]?.bottleName || bottleMasterRecords[0]?.bottleName || '750ml Bordeaux Wine Heavy';

      setSelectedBottleName(defaultBottle);

      const bottleSecs = mchRecords.filter((r) => r.bottleName === defaultBottle);
      const defaultSec = bottleSecs[0]?.section || targetMch?.sectionsCount || 8;
      setSectionCount(defaultSec);

      const botObj = bottles.find((b) => b.name === defaultBottle);
      setCustomerName(botObj?.customerName || mchRecords[0]?.customerName || 'Standard Customer');

      setGrossQuantity(300000);
      setProducedQuantity(0);
      setStartDate(drawerDefaultDate || '2026-08-01');
      setEndDate('2026-08-15');
      setStatus('Pending');
      setPriority('Medium');
      setPackingCategory('Palletized');
      setPalletType('Wooden Standard (1200x1000)');
      setChangeoverHours(4.0);
      setRemarks('');
    }
  }, [editingJob, isDrawerOpen, drawerDefaultMachineId, drawerDefaultDate]);

  // When Machine changes, auto-select a valid bottle & section from Bottle Master
  const handleMachineChange = (newMachineId: string) => {
    setMachineId(newMachineId);
    const mch = machines.find((m) => m.id === newMachineId);
    const mchName = mch?.name || 'Machine No 1';

    const mchRecords = bottleMasterRecords.filter(
      (r) => r.mch === mchName || r.mch === newMachineId
    );
    if (mchRecords.length > 0) {
      const firstBot = mchRecords[0].bottleName;
      setSelectedBottleName(firstBot);
      setSectionCount(mchRecords[0].section);
      setCustomerName(mchRecords[0].customerName || 'Standard Customer');
    }
  };

  // When Bottle Name changes, update available section options
  const handleBottleNameChange = (newBottleName: string) => {
    setSelectedBottleName(newBottleName);
    const bottleSecs = machineMasterRecords.filter((r) => r.bottleName === newBottleName);
    if (bottleSecs.length > 0) {
      setSectionCount(bottleSecs[0].section);
      if (bottleSecs[0].customerName) {
        setCustomerName(bottleSecs[0].customerName);
      }
    }
  };

  // Calculated Metrics
  const bottlesPerMin = calculateBottlesPerMin(cutPerMin, sectionCount);
  const bottlesPerHour = calculateBottlesPerHour(cutPerMin, sectionCount);
  const dailyPcs = calculateDailyProductionPcs(cutPerMin, sectionCount);
  const dailyTons = calculateDailyProductionTons(cutPerMin, sectionCount, weightGrams);
  const remainingPcs = calculateRemainingQuantity(grossQuantity, producedQuantity);
  const durationInfo = calculateProductionDuration(remainingPcs, cutPerMin, sectionCount);
  const estEndDate = calculateEstimatedCompletionDate(startDate, grossQuantity, cutPerMin, sectionCount);

  if (!isDrawerOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRecordValid) return;

    saveJob({
      id: editingJob?.id,
      jobNumber: editingJob?.jobNumber,
      machineId,
      bottleId: matchingBottleObj?.id || bottles[0].id,
      customerName: customerName || matchingBottleObj?.customerName || 'Standard Customer',
      sectionCount,
      weightGrams,
      cutPerMin,
      grossQuantity,
      producedQuantity,
      remainingQuantity: remainingPcs,
      drawTonsPerDay: dailyTons,
      startDate,
      endDate: estEndDate || endDate,
      status,
      priority,
      packingCategory,
      palletType,
      changeoverHours: status === 'Changeover' ? changeoverHours : 0,
      remarks,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {editingJob ? `Edit Job: ${editingJob.jobNumber}` : 'Create Glass Production Job'}
            </h3>
            <p className="text-xs text-slate-500">Bottle Master Integrated Production Register & Speed Matrix</p>
          </div>
          <button
            onClick={closeDrawer}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body Form */}
        <form id="jobForm" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Machine & Status Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target Machine</label>
              <select
                value={machineId}
                onChange={(e) => handleMachineChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.sectionsCount} Sec - {m.sectionType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Job Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Running">Blue - Running</option>
                <option value="Completed">Green - Completed</option>
                <option value="Pending">Gray - Pending</option>
                <option value="Changeover">Orange - Changeover</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Job Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as JobPriority)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Validation Alert Message */}
          {!isRecordValid && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-red-900">Bottle Master Speed Entry Missing</h5>
                <p className="text-[11px] text-red-700 mt-0.5 leading-tight">
                  No speed matrix record found for bottle <b>"{selectedBottleName}"</b> on <b>{machineName}</b> with <b>{sectionCount} Sections</b>. Please select a valid section or bottle from the master data.
                </p>
              </div>
            </div>
          )}

          {/* Bottle Master Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                1. BOTTLE MASTER SELECTION ({machineName})
              </h4>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                <ShieldCheck className="w-3 h-3" /> Master Verified
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Bottle Name <span className="text-slate-400 font-normal">(Loaded from Bottle Master)</span>
                </label>
                <select
                  value={selectedBottleName}
                  onChange={(e) => handleBottleNameChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 shadow-2xs"
                >
                  {bottleNameList.map((bName) => (
                    <option key={bName} value={bName}>
                      {bName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Available Sections ({machineName})</label>
                <select
                  value={sectionCount}
                  onChange={(e) => setSectionCount(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                >
                  {availableSectionsForBottle.length > 0 ? (
                    availableSectionsForBottle.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} Sections
                      </option>
                    ))
                  ) : (
                    currentMachine?.availableSections?.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} Sections
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 flex items-center justify-between">
                  <span>Weight (Wt - Grams)</span>
                  <span className="text-[10px] text-slate-400 font-normal flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Read-only
                  </span>
                </label>
                <input
                  type="number"
                  value={weightGrams}
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 text-slate-700 rounded-lg p-2 font-mono font-bold cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Bottle Color</label>
                <div className="p-2 border border-slate-200 bg-slate-50 rounded-lg font-semibold text-slate-800 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600"></span>
                  {activeMasterRecord?.color || matchingBottleObj?.color || 'Flint'}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 flex items-center justify-between">
                  <span>Production Speed (Cuts / Min)</span>
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Bottle Master
                  </span>
                </label>
                <input
                  type="number"
                  value={cutPerMin}
                  disabled
                  className="w-full bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-2 font-mono font-bold text-sm cursor-not-allowed"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Production Quantity & Dates */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1 uppercase tracking-wider">
              2. PRODUCTION TARGET QUANTITY & TIMELINE
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Gross Target Quantity (Pcs)</label>
                <input
                  type="number"
                  value={grossQuantity}
                  onChange={(e) => setGrossQuantity(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Produced Quantity So Far (Pcs)</label>
                <input
                  type="number"
                  value={producedQuantity}
                  onChange={(e) => setProducedQuantity(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 flex items-center justify-between">
                  <span>Est. Completion Date</span>
                  <span className="text-[10px] text-blue-600 font-semibold">Auto-calculated</span>
                </label>
                <input
                  type="date"
                  value={estEndDate || endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Changeover Time if applicable */}
          {status === 'Changeover' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Changeover Configuration
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-amber-900 font-medium mb-1">Manual Changeover Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={changeoverHours}
                    onChange={(e) => setChangeoverHours(Number(e.target.value))}
                    className="w-full bg-white border border-amber-300 rounded-lg p-2 font-bold text-amber-900"
                  />
                </div>
                <div className="flex items-center text-[11px] text-amber-700 leading-tight">
                  Mold changeover automatically reduces daily quantity & draw for the selected date.
                </div>
              </div>
            </div>
          )}

          {/* Packing & Pallet */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1 uppercase tracking-wider">
              3. PACKING CATEGORY & LOGISTICS
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Packing Category</label>
                <select
                  value={packingCategory}
                  onChange={(e) => setPackingCategory(e.target.value as PackingCategory)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                >
                  <option value="Palletized">Palletized</option>
                  <option value="Carton Pack">Carton Pack</option>
                  <option value="Shrink Wrapped">Shrink Wrapped</option>
                  <option value="Bulk Tray">Bulk Tray</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Pallet Type</label>
                <select
                  value={palletType}
                  onChange={(e) => setPalletType(e.target.value as PalletType)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                >
                  <option value="Wooden Standard (1200x1000)">Wooden Standard (1200x1000)</option>
                  <option value="Euro Pallet (1200x800)">Euro Pallet (1200x800)</option>
                  <option value="Plastic Heavy Duty">Plastic Heavy Duty</option>
                  <option value="Heat Treated Export">Heat Treated Export</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 mb-1">Job Remarks / Technical Notes</label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Feeder temperature 1185°C required. Cold end spray coating active."
              className="w-full border border-slate-300 rounded-lg p-2"
            />
          </div>

          {/* Auto Calculated Manufacturing Metrics Preview Box */}
          <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
              <div className="flex items-center gap-2 font-semibold text-blue-300 text-xs">
                <Calculator className="w-4 h-4 text-blue-400" /> MANUFACTURING CALCULATIONS PREVIEW
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Formula: Speed ({cutPerMin}) × Sections ({sectionCount})</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-400">Bottles / Min</p>
                <p className="text-sm font-bold text-blue-300 mt-0.5">{formatNumber(bottlesPerMin)} bpm</p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-400">Bottles / Hour</p>
                <p className="text-sm font-bold text-blue-300 mt-0.5">{formatNumber(bottlesPerHour)} bph</p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-400">Daily Production (Pcs)</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">{formatNumber(dailyPcs)} pcs</p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-400">Daily Draw (Tons)</p>
                <p className="text-sm font-bold text-amber-400 mt-0.5">{dailyTons} Tons/day</p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-400">Remaining Quantity</p>
                <p className="text-sm font-bold text-blue-400 mt-0.5">{formatNumber(remainingPcs)} pcs</p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-400">Production Duration</p>
                <p className="text-xs font-bold text-amber-300 mt-1 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" /> {durationInfo.durationText}
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          {editingJob ? (
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this job from production plan?')) {
                  deleteJob(editingJob.id);
                  closeDrawer();
                }
              }}
              className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 rounded-lg flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Delete Job
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeDrawer}
              className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="jobForm"
              disabled={!isRecordValid}
              className={`px-5 py-2 text-xs font-bold text-white rounded-lg shadow-xs flex items-center gap-2 ${
                isRecordValid
                  ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" /> Save Job to Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
