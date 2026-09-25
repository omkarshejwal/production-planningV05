import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { BottleEntry, EditSavePayload, MachineEntry, PackCatKey } from '../../types/planning';
import { MAX_SECTIONS, VALID_SECTIONS, calcQty, getMachineBottles, lookupConfig, lookupSpeedForBottle, resolveBottleIdForMachine, NONE_ENTRY } from '../../utils/planningCalculations';
import { TimePicker } from './TimePicker';

export const PACKING_OPTIONS: { key: 'ST' | 'SN' | 'SB' | 'BT'; label: string; desc: string }[] = [
  { key: 'ST', label: 'ST', desc: 'Shrink Tray' },
  { key: 'SN', label: 'SN', desc: 'Shrink Naked' },
  { key: 'SB', label: 'SB', desc: 'Shrink Box' },
  { key: 'BT', label: 'BT', desc: 'Bottom Tray' },
];

export function EditMachineModal({
  machineNo,
  currentEntry,
  onSave,
  onClose,
  newJobStartTime,
  isContinuation,
}: {
  machineNo: number;
  currentEntry: MachineEntry;
  onSave: (payload: EditSavePayload) => void;
  onClose: () => void;
  newJobStartTime?: string;
  isContinuation?: boolean;
}) {
  const mIdx = machineNo - 1;
  const bottles = useMemo(() => getMachineBottles(machineNo), [machineNo]);

  // The selection is a bottle_master id. The name shown in the list can be
  // shared by several ids, so it can never be the selection itself.
  const [selectedBottleId, setSelectedBottleId] = useState<string | undefined>(() => {
    if (currentEntry.bottleId) return currentEntry.bottleId;
    if (!currentEntry.product || currentEntry.product === 'None') return undefined;
    return resolveBottleIdForMachine(machineNo, currentEntry.product, currentEntry.section);
  });
  const [bottleSearch, setBottleSearch] = useState('');
  const [bottleDropdownOpen, setBottleDropdownOpen] = useState(false);
  const [jobStartTime, setJobStartTime] = useState(newJobStartTime ?? currentEntry.startTime ?? '');

  const [requiredBottles, setRequiredBottles] = useState<string>(
    currentEntry.requiredBottles != null ? String(currentEntry.requiredBottles) : ''
  );

  const [packingAllocations, setPackingAllocations] = useState<Partial<Record<PackCatKey, string>>>(() => {
    if (currentEntry.packingAllocations && Object.keys(currentEntry.packingAllocations).length > 0) {
      return Object.fromEntries(
        Object.entries(currentEntry.packingAllocations).map(([k, v]) => [k, v != null ? String(v) : ''])
      ) as Partial<Record<PackCatKey, string>>;
    }
    if (currentEntry.packingCategory) {
      const initialQty = currentEntry.requiredBottles != null ? String(currentEntry.requiredBottles) : '';
      return { [currentEntry.packingCategory]: initialQty } as Partial<Record<PackCatKey, string>>;
    }
    return {};
  });

  const [palletPacking, setPalletPacking] = useState<boolean | null>(currentEntry.palletPacking ?? null);
  const [palletPackingQty, setPalletPackingQty] = useState<string>(
    currentEntry.palletPackingQty != null ? String(currentEntry.palletPackingQty) : ''
  );

  const [productionHoursOverride, setProductionHoursOverride] = useState<string>(
    currentEntry.productionHours != null ? String(currentEntry.productionHours) : ''
  );

  const toggleCategory = (key: PackCatKey) => {
    setPackingAllocations(prev => {
      const next = { ...prev };
      if (key in next) {
        delete next[key];
        if (key === 'SN') {
          setPalletPacking(null);
          setPalletPackingQty('');
        }
      } else {
        next[key] = '';
      }
      return next;
    });
  };

  const setAllocQty = (key: PackCatKey, val: string) =>
    setPackingAllocations(prev => ({ ...prev, [key]: val }));

  const filteredBottles = useMemo(() => {
  const query = bottleSearch.trim().toLowerCase();

  const filtered = query
    ? bottles.filter((b) => b.name.toLowerCase().includes(query))
    : bottles;

  return [...filtered].sort((a, b) => Number(a.wt) - Number(b.wt));
}, [bottles, bottleSearch]);

  // The selected bottle is identified by its id (names are not unique).
  const selectedBottle = selectedBottleId
    ? bottles.find(b => b.bottleId === selectedBottleId) ?? null
    : null;
  const isSelected = selectedBottle !== null;

  // Resolve the section from the bottle's saved bottle_configuration rows.
  // Weight and cut speed always come from the exact
  // (machine, bottle id, section) row — one section's speed is never copied
  // onto another, and another machine's configuration is never used.
  const configuredSections = selectedBottle?.bottleId
    ? VALID_SECTIONS(mIdx).filter(s => lookupSpeedForBottle(machineNo, selectedBottle.bottleId!, s) > 0)
    : [];
  const currentSection = currentEntry.section ?? MAX_SECTIONS(mIdx);
  const section = configuredSections.includes(currentSection)
    ? currentSection
    : (configuredSections[configuredSections.length - 1] ?? MAX_SECTIONS(mIdx));
  const exactConfig = selectedBottle?.bottleId
    ? lookupConfig(machineNo, selectedBottle.bottleId, section)
    : undefined;
  const cutSpeed = exactConfig?.speeds ?? 0;
  const wt = exactConfig?.weight ?? selectedBottle?.wt ?? 0;
  const bottle: BottleEntry = {
    name: selectedBottle?.name ?? NONE_ENTRY.name,
    wt,
    speeds: cutSpeed,
    bottleId: selectedBottle?.bottleId,
  };
  const prodQty = cutSpeed > 0 ? calcQty(cutSpeed, machineNo) : 0;
  const reqNum = parseFloat(requiredBottles);
  const estDays = prodQty > 0 && !isNaN(reqNum) && reqNum > 0 ? reqNum / prodQty : null;
  const hourlyQty = prodQty > 0 ? prodQty / 24 : 0;
  const defaultProdHours = hourlyQty > 0 && !isNaN(reqNum) && reqNum > 0 ? Number((reqNum / hourlyQty).toFixed(2)) : null;
  const parsedProdHours = productionHoursOverride !== '' ? parseFloat(productionHoursOverride) : null;

  const allocKeys = Object.keys(packingAllocations) as PackCatKey[];
  const numericAllocs: Partial<Record<PackCatKey, number>> = {};
  let totalAlloc = 0;

  for (const k of allocKeys) {
    const v = parseFloat(packingAllocations[k] || '0') || 0;
    numericAllocs[k] = v;
    totalAlloc += v;
  }

  const hasSN = 'SN' in packingAllocations;
  const primaryCat = (allocKeys[0] ?? '') as PackCatKey | '';
  const parsedReqN = !isNaN(reqNum) && reqNum > 0 ? reqNum : null;
  const isAllocationValid = allocKeys.length === 0 || !parsedReqN || Math.round(totalAlloc) === Math.round(parsedReqN);
  const isExactMatch = parsedReqN !== null && Math.round(totalAlloc) === Math.round(parsedReqN);

  const handleSave = () => {
    onSave({
      bottle,
      packingCategory: primaryCat,
      packingAllocations: numericAllocs,
      palletPacking: hasSN ? palletPacking : null,
      palletPackingQty: hasSN && palletPacking === true && palletPackingQty !== '' ? Number(palletPackingQty) : null,
      requiredBottles: parsedReqN,
      section,
      startTime: jobStartTime,
      productionHours: parsedProdHours,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xl w-full max-w-md flex flex-col max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
          <h3 className="text-sm font-semibold text-[#111827]">Edit Bottle — Machine No {machineNo}</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Start Time */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Start Time</label>
            <TimePicker value={jobStartTime} onChange={setJobStartTime} placeholder="Select start time" />
          </div>

          {/* Machine Number */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Machine Number</label>
            <input
              readOnly
              value={`Machine No ${machineNo}`}
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-[#F8FAFC] text-[#6B7280] cursor-not-allowed"
            />
          </div>

          {/* Bottle Name Dropdown */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              Bottle Name
              {isContinuation && (
                <span className="ml-1.5 text-[10px] font-normal text-[#6B7280]">
                  (continuation — inherited, not editable)
                </span>
              )}
            </label>
            <div className="relative">
              <button
                type="button"
                disabled={isContinuation}
                onClick={() => setBottleDropdownOpen(prev => !prev)}
                className={`w-full h-9 px-3 pr-8 text-sm text-left border border-[#E5E7EB] rounded-lg bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] relative ${isContinuation ? 'bg-[#F8FAFC] text-[#6B7280] cursor-not-allowed' : ''}`}
              >
                <span className={isSelected ? 'text-[#111827]' : 'text-[#9CA3AF]'}>
                  {isSelected ? selectedBottle!.name : 'Select bottle'}
                </span>
                <ChevronDown
                  size={14}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] transition-transform ${bottleDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {bottleDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-[#E5E7EB] bg-white">
                    <input
                      type="text"
                      autoFocus
                      value={bottleSearch}
                      onChange={e => setBottleSearch(e.target.value)}
                      placeholder="Search bottle name..."
                      className="w-full h-8 px-3 text-sm border border-[#E5E7EB] rounded-md bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] placeholder:text-[#9CA3AF]"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBottleId(undefined);
                        setBottleSearch('');
                        setBottleDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-[#F8FAFC] ${!selectedBottleId ? 'bg-[#EFF6FF] text-[#2563EB] font-medium' : 'text-[#374151]'}`}
                    >
                      None
                    </button>
                    {filteredBottles.map(b => (
  <button
    key={b.bottleId ?? b.name}
    type="button"
    onClick={() => {
      setSelectedBottleId(b.bottleId);
      setBottleSearch('');
      setBottleDropdownOpen(false);
    }}
    className={`w-full px-3 py-2 text-sm text-left hover:bg-[#F8FAFC] ${selectedBottleId && b.bottleId === selectedBottleId ? 'bg-[#EFF6FF] text-[#2563EB] font-medium' : 'text-[#374151]'}`}
  >
    <div className="flex items-center justify-between w-full">
      <span>{b.name}</span>
      <span className="text-[#6B7280] font-medium">{b.wt}g</span>
    </div>
  </button>
))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Wt + Cut Speed reference */}
          {isSelected && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide mb-0.5">Weight (g)</p>
                <p className="text-sm font-bold text-[#111827]">{wt}</p>
              </div>
              <div className="bg-[#EDE9FE] border border-[#DDD6FE] rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-medium text-[#7C3AED] uppercase tracking-wide mb-0.5">Cut Speed ({section} sec)</p>
                <p className="text-sm font-bold text-[#7C3AED]">{cutSpeed > 0 ? cutSpeed : '—'}</p>
              </div>
            </div>
          )}

          <div className="border-t border-[#E5E7EB]" />

          {/* Required Bottles */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Required Bottles</label>
            <input
              type="number"
              min="1"
              value={requiredBottles}
              onChange={e => setRequiredBottles(e.target.value)}
              placeholder="Enter required bottle quantity"
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] placeholder:text-[#9CA3AF]"
            />
          </div>

          {/* Estimated Completion */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Estimated Completion</label>
            {estDays !== null ? (
              <div className="flex items-center gap-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-3 py-2.5">
                <CalendarDays size={15} className="text-[#16A34A] shrink-0" />
                <p className="text-sm font-bold text-[#15803D]">≈ {estDays.toFixed(2)} Days</p>
              </div>
            ) : (
              <p className="text-xs text-[#9CA3AF] px-1">Enter bottle quantity to calculate completion time.</p>
            )}
          </div>

          {/* Production Duration (hours)
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Production Duration (hours)</label>
            <input
              type="number"
              min="0.5"
              step="0.25"
              value={productionHoursOverride}
              onChange={e => setProductionHoursOverride(e.target.value)}
              placeholder={defaultProdHours != null ? String(defaultProdHours) : 'Auto-calculated'}
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] placeholder:text-[#9CA3AF]"
            />
            <p className="text-[10px] text-[#9CA3AF] mt-1 px-1">
              {defaultProdHours != null
                ? `Default: ${defaultProdHours}h (leave empty to auto-calculate)`
                : 'Enter required bottles to see default duration'}
            </p>
          </div> */}

          {/* Packing Category */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Packing Category</label>
            <div className="space-y-2">
              {PACKING_OPTIONS.map(opt => {
                const isSelected = opt.key in packingAllocations;
                const qtyVal = packingAllocations[opt.key] ?? '';

                return (
                  <div key={opt.key} className={`rounded-lg border transition-colors ${isSelected ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleCategory(opt.key)}
                        className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#2563EB] border-[#2563EB]' : 'border-[#D1D5DB] bg-white'}`}
                      >
                        {isSelected && (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className={`text-xs font-bold ${isSelected ? 'text-[#2563EB]' : 'text-[#374151]'}`}>{opt.label}</span>
                        <span className="text-[10px] text-[#9CA3AF]">–</span>
                        <span className="text-[10px] text-[#6B7280]">{opt.desc}</span>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="px-3 pb-2.5">
                        <input
                          type="number" min="0"
                          value={qtyVal}
                          onChange={e => setAllocQty(opt.key, e.target.value)}
                          placeholder="Required bottles"
                          className="w-full h-8 px-3 text-sm border border-[#BFDBFE] rounded-lg bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] placeholder:text-[#9CA3AF]"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Allocation summary validation */}
            {allocKeys.length > 0 && (
              <div className={`mt-2 flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${isAllocationValid ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#FEF2F2] border-[#FECACA]'}`}>
                <span className={isAllocationValid ? 'text-[#15803D]' : 'text-[#DC2626]'}>
                  Allocated: <strong>{totalAlloc.toLocaleString()}</strong>
                  {parsedReqN !== null ? ` / ${parsedReqN.toLocaleString()}` : ''}
                </span>
                {isExactMatch && <span className="text-[#16A34A] font-semibold">✓ Balanced</span>}
                {!isAllocationValid && <span className="text-[#DC2626] font-semibold">Must equal required</span>}
              </div>
            )}
          </div>

          {/* Pallet Packing */}
          {hasSN && (
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">Pallet Packing</label>
              <div className="flex rounded-lg border border-[#E5E7EB] overflow-hidden">
                {([true, false] as const).map((val, i) => (
                  <button
                    key={String(val)}
                    onClick={() => {
                      const next = palletPacking === val ? null : val;
                      setPalletPacking(next);
                      if (!next) setPalletPackingQty('');
                    }}
                    className={`flex-1 py-2 text-sm font-semibold transition-colors
                      ${i > 0 ? 'border-l border-[#E5E7EB]' : ''}
                      ${palletPacking === val ? (val ? 'bg-[#16A34A] text-white' : 'bg-[#DC2626] text-white') : 'bg-white text-[#374151] hover:bg-[#F8FAFC]'}`}
                  >
                    {val ? 'YES' : 'NO'}
                  </button>
                ))}
              </div>
              <div
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{
                  maxHeight: palletPacking === true ? '80px' : '0px',
                  opacity: palletPacking === true ? 1 : 0,
                  marginTop: palletPacking === true ? '12px' : '0px'
                }}
              >
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Pallet Packing Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={palletPackingQty}
                  onChange={e => setPalletPackingQty(e.target.value)}
                  placeholder="Enter total bottles to be packed on pallets"
                  className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] placeholder:text-[#9CA3AF]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#E5E7EB] shrink-0">
          <button
            disabled={!isAllocationValid}
            onClick={handleSave}
            className="h-9 px-4 text-sm font-semibold rounded-lg text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>

          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium border border-[#E5E7EB] rounded-lg text-[#374151] bg-white hover:bg-[#F8FAFC] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}