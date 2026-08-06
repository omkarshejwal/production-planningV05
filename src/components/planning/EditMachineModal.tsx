import React, { useState } from 'react';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { BottleEntry, EditSavePayload, MachineEntry, PackCatKey } from '../../types/planning';
import { MACHINE_BOTTLES, NONE_ENTRY } from '../../data/bottleReference';
import { MAX_SECTIONS, calcQty, lookupSpeed } from '../../utils/planningCalculations';
import { TimePicker } from './TimePicker';

// ─── Edit Machine Modal ───────────────────────────────────────────────────────

export const PACKING_OPTIONS: { key: 'ST' | 'SN' | 'SB' | 'BT'; label: string; desc: string }[] = [
  { key: 'ST', label: 'ST', desc: 'Shrink Tray' },
  { key: 'SN', label: 'SN', desc: 'Shrink Naked' },
  { key: 'SB', label: 'SB', desc: 'Shrink Box' },
  { key: 'BT', label: 'BT', desc: 'Bottom Tray' },
];

export function EditMachineModal({
  machineNo, currentEntry, onSave, onClose, newJobStartTime,
}: {
  machineNo: number;
  currentEntry: MachineEntry;
  onSave: (payload: EditSavePayload) => void;
  onClose: () => void;
  newJobStartTime?: string;
}) {
  const mIdx = machineNo - 1;
  const bottles = MACHINE_BOTTLES[machineNo] ?? [];
  const [selected, setSelected] = useState(currentEntry.product);
  const [salesExec, setSalesExec] = useState(currentEntry.salesExec ?? '');
  // Multi-packing allocations: key = enabled category, value = qty string for the input
  const [packingAllocations, setPackingAllocations] = useState<Partial<Record<PackCatKey, string>>>(() => {
    if (currentEntry.packingAllocations && Object.keys(currentEntry.packingAllocations).length > 0) {
      return Object.fromEntries(
        Object.entries(currentEntry.packingAllocations).map(([k, v]) => [k, v != null ? String(v) : ''])
      ) as Partial<Record<PackCatKey, string>>;
    }
    if (currentEntry.packingCategory) {
      return { [currentEntry.packingCategory]: '' } as Partial<Record<PackCatKey, string>>;
    }
    return {};
  });
  const toggleCategory = (key: PackCatKey) => {
    setPackingAllocations(prev => {
      const next = { ...prev };
      if (key in next) {
        delete next[key];
        if (key === 'SN') { setPalletPacking(null); setPalletPackingQty(''); }
      } else {
        next[key] = '';
      }
      return next;
    });
  };
  const setAllocQty = (key: PackCatKey, val: string) =>
    setPackingAllocations(prev => ({ ...prev, [key]: val }));

  const [palletPacking, setPalletPacking] = useState<boolean | null>(currentEntry.palletPacking ?? null);
  const [palletPackingQty, setPalletPackingQty] = useState<string>(
    currentEntry.palletPackingQty != null ? String(currentEntry.palletPackingQty) : ''
  );
  const [jobStartTime, setJobStartTime] = useState(newJobStartTime ?? currentEntry.startTime ?? '');
  const [requiredBottles, setRequiredBottles] = useState('');

  const section = currentEntry.section ?? MAX_SECTIONS(mIdx);
  const bottleRef = selected === 'None' ? NONE_ENTRY : bottles.find(b => b.name === selected) ?? NONE_ENTRY;
  const cutSpeed = selected !== 'None' ? (lookupSpeed(machineNo, selected, section) || bottleRef.speeds) : 0;
  const bottle: BottleEntry = { name: bottleRef.name, wt: bottleRef.wt, speeds: cutSpeed };

  const prodQty = cutSpeed > 0 ? calcQty(cutSpeed, machineNo) : 0;

  const reqNum = parseFloat(requiredBottles);
  const estDays = prodQty > 0 && !isNaN(reqNum) && reqNum > 0 ? reqNum / prodQty : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-sm font-semibold text-[#111827]">Edit Bottle — Machine No {machineNo}</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827] transition-colors"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Start Time */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Start Time</label>
            <TimePicker value={jobStartTime} onChange={setJobStartTime} placeholder="Select start time" />
          </div>
          {/* Machine Number */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Machine Number</label>
            <input readOnly value={`Machine No ${machineNo}`}
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-[#F8FAFC] text-[#6B7280] cursor-not-allowed" />
          </div>

          {/* Bottle Name */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Bottle Name</label>
            <div className="relative">
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="w-full h-9 pl-3 pr-8 text-sm border border-[#E5E7EB] rounded-lg bg-white text-[#111827] appearance-none focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]">
                <option value="None">None</option>
                {bottles.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
            </div>
          </div>

          {/* Wt + Cut Speed reference */}
          {selected !== 'None' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide mb-0.5">Weight (g)</p>
                <p className="text-sm font-bold text-[#111827]">{bottleRef.wt}</p>
              </div>
              <div className="bg-[#EDE9FE] border border-[#DDD6FE] rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-medium text-[#7C3AED] uppercase tracking-wide mb-0.5">Cut Speed ({section} sec)</p>
                <p className="text-sm font-bold text-[#7C3AED]">{cutSpeed > 0 ? cutSpeed : '—'}</p>
              </div>
            </div>
          )}

          {/* Divider */}
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

          {/* Packing Category — multi-allocation */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Packing Category</label>
            <div className="space-y-2">
              {PACKING_OPTIONS.map(opt => {
                const isSelected = opt.key in packingAllocations;
                const qtyVal = packingAllocations[opt.key] ?? '';
                return (
                  <div key={opt.key}
                    className={`rounded-lg border transition-colors ${isSelected ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <button type="button" onClick={() => toggleCategory(opt.key)}
                        className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors
                          ${isSelected ? 'bg-[#2563EB] border-[#2563EB]' : 'border-[#D1D5DB] bg-white'}`}>
                        {isSelected && (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
            {/* Allocation summary + validation */}
            {(() => {
              const keys = Object.keys(packingAllocations) as PackCatKey[];
              if (keys.length === 0) return null;
              const totalAlloc = keys.reduce((s, k) => s + (parseFloat(packingAllocations[k] || '0') || 0), 0);
              const reqN = parseFloat(requiredBottles);
              const isValid = isNaN(reqN) || reqN <= 0 || Math.round(totalAlloc) === Math.round(reqN);
              return (
                <div className={`mt-2 flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${isValid ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#FEF2F2] border-[#FECACA]'}`}>
                  <span className={isValid ? 'text-[#15803D]' : 'text-[#DC2626]'}>
                    Allocated: <strong>{totalAlloc.toLocaleString()}</strong>
                    {reqN > 0 ? ` / ${reqN.toLocaleString()}` : ''}
                  </span>
                  {isValid && reqN > 0 && <span className="text-[#16A34A] font-semibold">✓ Balanced</span>}
                  {!isValid && <span className="text-[#DC2626] font-semibold">Must equal required</span>}
                </div>
              );
            })()}
          </div>

          {/* Pallet Packing — only shown when Shrink Naked (SN) is selected */}
          {'SN' in packingAllocations && <div>
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
                    ${palletPacking === val
                      ? val ? 'bg-[#16A34A] text-white' : 'bg-[#DC2626] text-white'
                      : 'bg-white text-[#374151] hover:bg-[#F8FAFC]'
                    }`}
                >
                  {val ? 'YES' : 'NO'}
                </button>
              ))}
            </div>
            {/* Pallet Packing Quantity — shown only when YES */}
            <div
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{ maxHeight: palletPacking === true ? '80px' : '0px', opacity: palletPacking === true ? 1 : 0, marginTop: palletPacking === true ? '12px' : '0px' }}
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
          </div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E5E7EB]">
          <button onClick={onClose}
            className="h-9 px-4 text-sm font-medium border border-[#E5E7EB] rounded-lg text-[#374151] bg-white hover:bg-[#F8FAFC] transition-colors">
            Cancel
          </button>
          {/* Derive numeric allocations and validate sum before saving */}
          {(() => {
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
            const reqN = !isNaN(reqNum) && reqNum > 0 ? reqNum : null;
            const allocValid = allocKeys.length === 0 || !reqN || Math.round(totalAlloc) === Math.round(reqN);
            return (
              <button
                disabled={!allocValid}
                onClick={() => onSave({
                  bottle, salesExec,
                  packingCategory: primaryCat,
                  packingAllocations: numericAllocs,
                  palletPacking: hasSN ? palletPacking : null,
                  palletPackingQty: hasSN && palletPacking === true && palletPackingQty !== '' ? Number(palletPackingQty) : null,
                  requiredBottles: reqN,
                  section,
                  startTime: jobStartTime,
                })}
                className="h-9 px-4 text-sm font-semibold rounded-lg text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Save Changes
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
