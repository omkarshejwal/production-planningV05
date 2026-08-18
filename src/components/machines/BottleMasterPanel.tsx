import React, { useState, useRef, useEffect } from 'react';
import { FlaskConical, Search, Check, ChevronDown } from 'lucide-react';
import { planningRepository } from '../../services/planningRepository';
import { MachineMasterRow, BottleMasterRow, BottleConfigurationRow } from '../../data/planningSchema';

interface BottleMasterPanelProps {
  machines: MachineMasterRow[];
  bottles: BottleMasterRow[];
  configs: BottleConfigurationRow[];
  onRefresh: () => void;
}

function getVisibleSections(maxSection: number): number[] {
  const count = Math.min(3, maxSection);
  return Array.from({ length: count }, (_, i) => maxSection - count + 1 + i);
}

interface SectionFormRow {
  section: number;
  weight: string;
  speeds: string;
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
  const [formRows, setFormRows] = useState<SectionFormRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState<BottleMasterRow | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const selectedMachine = machines.find((m) => m.machine_no === machineNo) ?? null;
  const visibleSections = selectedMachine ? getVisibleSections(selectedMachine.max_section) : [];

  useEffect(() => {
    if (!selectedMachine) {
      setFormRows([]);
      return;
    }
    const bottleId = tab === 'edit' ? selectedBase?.bottle_id ?? null : null;
    setFormRows(
      visibleSections.map((sec) => {
        const existing = bottleId
          ? configs.find(
              (c) => c.bottle_id === bottleId && c.machine_no === machineNo && c.section === sec
            )
          : undefined;
        return {
          section: sec,
          weight: existing ? String(existing.weight) : '',
          speeds: existing ? String(existing.speeds) : '',
        };
      })
    );
    setSaved(false);
  }, [machineNo, tab, selectedBase, configs, visibleSections]);

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
    setFormRows([]);
    setQuery('');
    setSelectedBase(null);
    setSaved(false);
  }

  function selectBottle(b: BottleMasterRow) {
    setSelectedBase(b);
    setQuery(b.bottle_name);
    setDropOpen(false);
    setSaved(false);
  }

  function updateRow(section: number, field: 'weight' | 'speeds', value: string) {
    setFormRows((prev) => prev.map((r) => (r.section === section ? { ...r, [field]: value } : r)));
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

    let allOk = true;
    for (const row of formRows) {
      const weight = parseFloat(row.weight);
      const speeds = parseFloat(row.speeds);
      if (isNaN(weight) || isNaN(speeds)) continue;

      const result = await planningRepository.upsertBottleConfiguration({
        machine_no: machineInt,
        bottle_id: bottleIdInt,
        section: row.section,
        weight,
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
      setMachineNo('');
      setFormRows([]);
    }
  }

  const canSave =
    selectedMachine !== null &&
    !saving &&
    (tab === 'new' ? formBottleName.trim() !== '' : selectedBase !== null);

  const filteredBases = bottles.filter(
    (b) =>
      b.bottle_name.toLowerCase().includes(query.toLowerCase()) ||
      b.bottle_id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100">
        <span className="text-blue-600"><FlaskConical className="w-4 h-4" /></span>
        <h2 className="text-sm font-semibold text-gray-800">Bottle Master</h2>
      </div>

      <div className="flex border-b border-gray-100 px-4">
        {(['new', 'edit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`py-2.5 px-0 mr-5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'new' ? 'Add New' : 'Edit Existing'}
          </button>
        ))}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Machine No.</label>
          <div className="relative">
            <select
              value={machineNo}
              onChange={(e) => {
                setMachineNo(e.target.value);
                setSaved(false);
              }}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer pr-7"
            >
              <option value="">Select machine...</option>
              {machines.map((m) => (
                <option key={m.machine_no} value={m.machine_no}>
                  Machine {m.machine_no.replace(/\D/g, '')} — {m.gob_type}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60">
              <ChevronDown className="w-4 h-4" />
            </span>
          </div>
          {selectedMachine && (
            <p className="text-[10px] text-gray-400">
              max_section: {selectedMachine.max_section} · visible: {visibleSections.join(', ')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Bottle Name</label>
          {tab === 'new' ? (
            <input
              type="text"
              placeholder="e.g. Amber 500ml"
              value={formBottleName}
              onChange={(e) => {
                setFormBottleName(e.target.value);
                setSaved(false);
              }}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          ) : (
            <div ref={dropRef} className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search bottle_name or bottle_id..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setDropOpen(true);
                  setSelectedBase(null);
                  setSaved(false);
                }}
                onFocus={() => setDropOpen(true)}
                className="w-full h-9 pl-7 pr-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              {dropOpen && filteredBases.length > 0 && (
                <div className="absolute z-20 top-9 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
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

        {selectedMachine && formRows.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Section Config</label>
              <span className="text-[10px] text-gray-400 font-mono">weight · speeds</span>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
              {formRows.map((r, i) => (
                <div
                  key={r.section}
                  className={`flex items-center gap-2 px-3 py-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <div className="w-5 h-5 rounded bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {r.section}
                  </div>
                  <input
                    type="number"
                    placeholder="weight"
                    value={r.weight}
                    onChange={(e) => updateRow(r.section, 'weight', e.target.value)}
                    className="w-16 h-7 px-2 text-sm border border-gray-200 rounded-md bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center"
                  />
                  <input
                    type="number"
                    placeholder="speeds"
                    value={r.speeds}
                    onChange={(e) => updateRow(r.section, 'speeds', e.target.value)}
                    className="flex-1 h-7 px-2 text-sm border border-gray-200 rounded-md bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`flex items-center gap-1.5 px-4 h-8 rounded-lg text-sm font-medium transition-all duration-200 ${
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
