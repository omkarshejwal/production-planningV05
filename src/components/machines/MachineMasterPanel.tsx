import React, { useState } from 'react';
import { Cpu, Plus, Check } from 'lucide-react';
import { planningRepository } from '../../services/planningRepository';
import { apiFetch } from '../../utils/api';

interface MachineMasterRow {
  machine_no: string;
  gob_type: string;
  gob_count: number;
  max_section: number;
}

interface MachineMasterPanelProps {
  machines: MachineMasterRow[];
  onRefresh: () => void;
}

const GOB_TYPES = ['Single Gob', 'Double Gob', 'Triple Gob', 'Quad Gob'];

const GOB_TYPE_TO_INT: Record<string, number> = {
  'Single Gob': 1,
  'Double Gob': 2,
  'Triple Gob': 3,
  'Quad Gob': 4,
};

export const MachineMasterPanel: React.FC<MachineMasterPanelProps> = ({ machines, onRefresh }) => {
  const [saved, setSaved] = useState(false);
  const [localMachines, setLocalMachines] = useState<MachineMasterRow[]>(machines);

  React.useEffect(() => {
    setLocalMachines(machines);
  }, [machines]);

  const update = (machineNo: string, patch: Partial<MachineMasterRow>) => {
    setLocalMachines((prev) => prev.map((m) => (m.machine_no === machineNo ? { ...m, ...patch } : m)));
    setSaved(false);
  };

  const handleSave = async () => {
    for (const m of localMachines) {
      const machineInt = parseInt(m.machine_no.replace(/\D/g, ''), 10);
      const gobInt = GOB_TYPE_TO_INT[m.gob_type] || m.gob_count;
      try {
        await apiFetch(`/api/production/machines/${machineInt}`, {
          method: 'PUT',
          body: JSON.stringify({
            machine_no: machineInt,
            gob_type: gobInt,
            max_section: m.max_section,
          }),
        });
      } catch (err) {
        console.error('Failed to update machine:', err);
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  const validMachines = localMachines.filter((m) => m.machine_no && m.max_section > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm min-h-0">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <span className="text-blue-600"><Cpu className="w-4 h-4" /></span>
        <h2 className="text-sm font-semibold text-gray-800">Machine Master</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {validMachines.map((m) => (
            <div key={m.machine_no} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Machine {m.machine_no.replace(/\D/g, '')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">
                  {m.max_section} sec
                </span>
              </div>
              <div className="mb-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Gob Type
                </label>
                <select
                  value={m.gob_type}
                  onChange={(e) => update(m.machine_no, { gob_type: e.target.value })}
                  className="w-full h-7 px-2 text-sm border border-gray-200 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer"
                >
                  {GOB_TYPES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Max Section
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => update(m.machine_no, { max_section: Math.max(1, m.max_section - 1) })}
                    className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 transition font-bold text-base leading-none"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={m.max_section}
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      if (!isNaN(n) && n > 0) update(m.machine_no, { max_section: n });
                    }}
                    className="w-12 h-7 text-center text-sm font-semibold border border-gray-200 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => update(m.machine_no, { max_section: m.max_section + 1 })}
                    className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
              saved
                ? 'bg-green-50 text-green-600 border border-green-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
