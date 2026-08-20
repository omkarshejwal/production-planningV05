import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FlaskConical, Search, Check, ChevronDown } from 'lucide-react';
import { planningRepository } from '../../services/planningRepository';
import { MachineMasterRow, BottleMasterRow, BottleConfigurationRow } from '../../data/planningSchema';

interface BottleMasterPanelProps {
  machines: MachineMasterRow[];
  bottles: BottleMasterRow[];
  configs: BottleConfigurationRow[];
  onRefresh: () => void;
}

interface SectionFormRow {
  section: number;
  weight: string;
  speeds: string;
  isBase: boolean;
}

export const BottleMasterPanel: React.FC<BottleMasterPanelProps> = ({
  machines,
  bottles,
  configs,
  onRefresh,
}) => {
  const [tab, setTab] = useState<'new' | 'edit'>('new');
  const [machineNo, setMachineNo] = useState<string>('');
  const [formBottleName, setFormBottleName] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formRows, setFormRows] = useState<SectionFormRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState<BottleMasterRow | null>(null);
  const [overriddenSections, setOverriddenSections] = useState<Set<number>>(new Set());
  const dropRef = useRef<HTMLDivElement>(null);

  const selectedMachine = machines.find((m) => m.machine_no === machineNo) ?? null;

  // Machine-level sections from DB (unique sections across ALL bottles on this machine)
  const machineSections = useMemo(() => {
    if (!machineNo) return [];
    return planningRepository.getMachineSections(machineNo).sort((a, b) => b - a); // descending
  }, [machineNo, machines]);

  const baseSections = useMemo(() => {
    if (!machineNo) return [];
    return planningRepository.getBaseSections(machineNo);
  }, [machineNo]);



  // In edit mode, only show bottles that have configurations for the selected machine
  const filteredBases = tab === 'edit' && machineNo
    ? bottles.filter((b) => {
        const hasConfig = configs.some(
          (c) => c.bottle_id === b.bottle_id && c.machine_no === machineNo
        );
        if (!hasConfig) return false;
        return (
          b.bottle_name.toLowerCase().includes(query.toLowerCase()) ||
          b.bottle_id.toLowerCase().includes(query.toLowerCase())
        );
      })
    : bottles.filter(
        (b) =>
          b.bottle_name.toLowerCase().includes(query.toLowerCase()) ||
          b.bottle_id.toLowerCase().includes(query.toLowerCase())
      );

  // Rebuild form rows when machine, tab, or selected bottle changes
  useEffect(() => {
    if (!selectedMachine) {
      setFormRows([]);
      setFormWeight('');
      return;
    }

    const bottleId = tab === 'edit' ? selectedBase?.bottle_id ?? null : null;

    const rows: SectionFormRow[] = machineSections.map((sec) => {
      const existing = bottleId
        ? configs.find(
            (c) => c.bottle_id === bottleId && c.machine_no === machineNo && c.section === sec
          )
        : undefined;
      const isBase = baseSections.includes(sec);
      return {
        section: sec,
        weight: '',
        speeds: existing ? String(existing.speeds) : '',
        isBase,
      };
    });

    setFormRows(rows);
    setOverriddenSections(new Set());

    // Pre-populate the shared weight from the first existing config (edit mode)
    if (bottleId) {
      const firstExisting = rows.find((r) => r.speeds !== '');
      if (firstExisting) {
        const existingConfig = configs.find(
          (c) =>
            c.bottle_id === bottleId &&
            c.machine_no === machineNo &&
            c.section === firstExisting.section
        );
        setFormWeight(existingConfig ? String(existingConfig.weight) : '');
      } else {
        setFormWeight('');
      }
    } else {
      setFormWeight('');
    }

    setSaved(false);
  }, [machineNo, tab, selectedBase, configs, machineSections, selectedMachine, baseSections]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function switchTab(next: 'new' | 'edit') {
    setTab(next);
    setMachineNo('');
    setFormBottleName('');
    setFormWeight('');
    setFormRows([]);
    setQuery('');
    setSelectedBase(null);
    setOverriddenSections(new Set());
    setSaved(false);
  }

  function selectBottle(b: BottleMasterRow) {
    setSelectedBase(b);
    setQuery(b.bottle_name);
    setDropOpen(false);
    setOverriddenSections(new Set());
    setSaved(false);
  }

  function updateWeight(value: string) {
    setFormWeight(value);
    setSaved(false);
  }

  // BPM auto-calculation: user enters BPM for the highest section.
  // Lower sections: BPM = highest_BPM - ((highest_section - current_section) × 10)
  // Preserves overridden section values — only recalculates non-overridden sections.
  function updateHighestBpm(value: string) {
    const numValue = parseFloat(value);
    setFormRows((prev) => {
      if (prev.length === 0) return prev;
      const highestSection = prev[0].section; // rows are descending
      return prev.map((r) => {
        if (r.section === highestSection) {
          return { ...r, speeds: value };
        }
        if (overriddenSections.has(r.section)) {
          return r; // preserve user override
        }
        if (!isNaN(numValue) && numValue > 0) {
          const calculated = Math.max(0, numValue - (highestSection - r.section) * 10);
          const rounded = Math.round(calculated * 100) / 100;
          return { ...r, speeds: String(rounded) };
        }
        return { ...r, speeds: '' };
      });
    });
    setSaved(false);
  }

  // Update a specific section's speed manually — marks it as overridden
  function updateSectionSpeed(section: number, value: string) {
    setFormRows((prev) => {
      if (prev.length === 0) return prev;
      const highestSection = prev[0].section;
      const highestSpeed = parseFloat(prev[0].speeds) || 0;

      return prev.map((r) => {
        if (r.section === section) {
          return { ...r, speeds: value };
        }
        // If highest changed, recalc non-overridden sections
        if (section === highestSection) {
          const numValue = parseFloat(value);
          if (overriddenSections.has(r.section)) {
            return r; // preserve override
          }
          if (!isNaN(numValue) && numValue > 0) {
            const calculated = Math.max(0, numValue - (highestSection - r.section) * 10);
            const rounded = Math.round(calculated * 100) / 100;
            return { ...r, speeds: String(rounded) };
          }
          return { ...r, speeds: '' };
        }
        return r;
      });
    });

    // Track override: only mark as overridden if it's NOT the highest section being edited
    // (editing highest is the normal recalc path)
    const highestSection = formRows.length > 0 ? formRows[0].section : null;
    if (section !== highestSection) {
      setOverriddenSections((prev) => {
        const next = new Set(prev);
        const numVal = parseFloat(value);
        if (!isNaN(numVal) && numVal > 0) {
          next.add(section); // manual entry → mark as overridden
        } else {
          next.delete(section); // cleared → no longer overridden, will recalc on next highest change
        }
        return next;
      });
    } else {
      // Highest section changed — recalc non-overridden, but override tracking for highest
      // is not needed since it's the input itself
      setOverriddenSections((prev) => {
        const next = new Set(prev);
        // Remove override for highest — it's always the user-set value
        next.delete(section);
        return next;
      });
    }
    setSaved(false);
  }



  async function handleSave() {
    if (!selectedMachine || saving) return;
    setSaving(true);

    const machineInt = parseInt(selectedMachine.machine_no.replace(/\D/g, ''), 10);
    let bottleIdInt = selectedBase ? parseInt(selectedBase.bottle_id, 10) : 0;

    if (tab === 'new') {
      if (!formBottleName.trim()) {
        setSaving(false);
        return;
      }
      const result = await planningRepository.createBottle(formBottleName.trim());
      if (!result.ok || !result.id) {
        alert(result.error || 'Failed to create bottle.');
        setSaving(false);
        return;
      }
      bottleIdInt = result.id;
    } else {
      if (!selectedBase) {
        setSaving(false);
        return;
      }
      bottleIdInt = parseInt(selectedBase.bottle_id, 10);
    }

    const weight = parseFloat(formWeight);

    let allOk = true;
    for (const row of formRows) {
      const speeds = parseFloat(row.speeds);
      if (isNaN(speeds) || speeds <= 0) continue;

      const result = await planningRepository.upsertBottleConfiguration({
        machine_no: machineInt,
        bottle_id: bottleIdInt,
        section: row.section,
        weight: isNaN(weight) ? 0 : weight,
        speeds,
      });
      if (!result.ok) {
        allOk = false;
        console.error(result.error);
      }
    }

    setSaving(false);
    if (allOk) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    onRefresh();

    if (tab === 'new') {
      setFormBottleName('');
      setFormWeight('');
      setMachineNo('');
      setFormRows([]);
    }
  }

  const canSave =
    selectedMachine !== null &&
    formRows.length > 0 &&
    !saving &&
    (tab === 'new' ? formBottleName.trim() !== '' : selectedBase !== null);

  const showForm = selectedMachine && formRows.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm w-full">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
        <span className="text-blue-600"><FlaskConical className="w-5 h-5" /></span>
        <h2 className="text-base font-semibold text-gray-800">Bottle Master</h2>
      </div>

      <div className="flex border-b border-gray-100 px-6">
        {(['new', 'edit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`py-3 px-0 mr-6 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'new' ? 'Add New' : 'Edit Existing'}
          </button>
        ))}
      </div>

      <div className="p-6 flex flex-col gap-5">
        {showForm ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine No.</label>
              <div className="relative">
                <select
                  value={machineNo}
                  onChange={(e) => {
                    setMachineNo(e.target.value);
                    setFormWeight('');
                    setSelectedBase(null);
                    setQuery('');
                    setSaved(false);
                  }}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer pr-8"
                >
                  <option value="">Select machine...</option>
                  {[...machines].sort((a, b) => {
                    const numA = parseInt(a.machine_no.replace(/\D/g, ''), 10);
                    const numB = parseInt(b.machine_no.replace(/\D/g, ''), 10);
                    return numA - numB;
                  }).map((m) => (
                    <option key={m.machine_no} value={m.machine_no}>
                      Machine {m.machine_no.replace(/\D/g, '')} — {m.gob_type}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60">
                  <ChevronDown className="w-4 h-4" />
                </span>
              </div>
              {selectedMachine && machineSections.length > 0 && (
                <p className="text-[10px] text-gray-400">
                  {machineSections.length} sections ({machineSections[machineSections.length - 1]}–{machineSections[0]})
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bottle Name</label>
              {tab === 'new' ? (
                <input
                  type="text"
                  placeholder="e.g. Amber 500ml"
                  value={formBottleName}
                  onChange={(e) => {
                    setFormBottleName(e.target.value);
                    setSaved(false);
                  }}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              ) : (
                <div ref={dropRef} className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder={machineNo ? "Search bottle_name or bottle_id..." : "Select machine first..."}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setDropOpen(true);
                      setSelectedBase(null);
                      setSaved(false);
                    }}
                    onFocus={() => machineNo && setDropOpen(true)}
                    disabled={!machineNo}
                    className="w-full h-10 pl-7 pr-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {dropOpen && filteredBases.length > 0 && (
                    <div className="absolute z-20 top-11 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {filteredBases.map((b) => (
                        <div
                          key={b.bottle_id}
                          className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 transition"
                          onMouseDown={() => selectBottle(b)}
                        >
                          <span className="text-xs font-medium text-gray-800">{b.bottle_name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{b.bottle_id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedBase && (
                    <p className="text-[10px] text-blue-600 mt-0.5">{selectedBase.bottle_id} selected</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Weight (applies to all sections)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 450"
                  value={formWeight}
                  onChange={(e) => updateWeight(e.target.value)}
                  className="w-full h-10 px-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">g</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine No.</label>
              <div className="relative">
                <select
                  value={machineNo}
                  onChange={(e) => {
                    setMachineNo(e.target.value);
                    setFormWeight('');
                    setSelectedBase(null);
                    setQuery('');
                    setSaved(false);
                  }}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer pr-8"
                >
                  <option value="">Select machine...</option>
                  {[...machines].sort((a, b) => {
                    const numA = parseInt(a.machine_no.replace(/\D/g, ''), 10);
                    const numB = parseInt(b.machine_no.replace(/\D/g, ''), 10);
                    return numA - numB;
                  }).map((m) => (
                    <option key={m.machine_no} value={m.machine_no}>
                      Machine {m.machine_no.replace(/\D/g, '')} — {m.gob_type}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60">
                  <ChevronDown className="w-4 h-4" />
                </span>
              </div>
              {selectedMachine && machineSections.length > 0 && (
                <p className="text-[10px] text-gray-400">
                  {machineSections.length} sections ({machineSections[machineSections.length - 1]}–{machineSections[0]})
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bottle Name</label>
              {tab === 'new' ? (
                <input
                  type="text"
                  placeholder="e.g. Amber 500ml"
                  value={formBottleName}
                  onChange={(e) => {
                    setFormBottleName(e.target.value);
                    setSaved(false);
                  }}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              ) : (
                <div ref={dropRef} className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder={machineNo ? "Search bottle_name or bottle_id..." : "Select machine first..."}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setDropOpen(true);
                      setSelectedBase(null);
                      setSaved(false);
                    }}
                    onFocus={() => machineNo && setDropOpen(true)}
                    disabled={!machineNo}
                    className="w-full h-10 pl-7 pr-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {dropOpen && filteredBases.length > 0 && (
                    <div className="absolute z-20 top-11 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {filteredBases.map((b) => (
                        <div
                          key={b.bottle_id}
                          className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 transition"
                          onMouseDown={() => selectBottle(b)}
                        >
                          <span className="text-xs font-medium text-gray-800">{b.bottle_name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{b.bottle_id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedBase && (
                    <p className="text-[10px] text-blue-600 mt-0.5">{selectedBase.bottle_id} selected</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showForm && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Section Speeds (CUT/MIN)
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                {machineSections[machineSections.length - 1]}–{machineSections[0]} (descending)
              </span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
              {formRows.map((r, i) => {
                const isHighest = i === 0;
                const isOverridden = overriddenSections.has(r.section);
                return (
                  <div
                    key={r.section}
                    className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <div className="w-7 h-7 rounded bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {r.section}
                    </div>
                    <span className="text-sm text-gray-600 font-medium min-w-17.5">
                      Section {r.section}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={isHighest ? "Enter highest CUT/MIN" : "Auto-calculated"}
                      value={r.speeds}
                      onChange={(e) => updateSectionSpeed(r.section, e.target.value)}
                      className={`flex-1 h-9 px-3 text-sm border rounded-md transition ${
                        isOverridden
                          ? 'bg-amber-50 text-amber-800 border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent'
                          : isHighest
                          ? 'bg-white text-gray-800 placeholder-gray-400 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                          : 'bg-gray-50 text-gray-700 placeholder-gray-400 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    />
                    <span className="text-xs text-gray-400 font-medium shrink-0">CUT/MIN</span>
                    <div className="w-6 h-6 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
              saved
                ? 'bg-green-50 text-green-600 border border-green-200'
                : !canSave
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : tab === 'new' ? (
              'Save Bottle'
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
