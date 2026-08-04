import React, { useState } from 'react';
import { Cpu, Thermometer, Zap, AlertTriangle, ShieldCheck, Wrench } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { StatusBadge } from '../common/StatusBadge';
import { ISMachine } from '../../types';

export const MachinesModule: React.FC = () => {
  const { machines, updateMachineStatus } = useERP();
  const [selectedMachine, setSelectedMachine] = useState<ISMachine | null>(machines[0]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">IS Glass Forming Machines & Feeder Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual Section (IS) Machine Gob Feeder, Invert Timing & Servo Push-Out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 font-semibold rounded-lg border border-blue-200">
            6 IS Lines Online
          </span>
        </div>
      </div>

      {/* Grid of IS Machines Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((m) => (
          <div
            key={m.id}
            onClick={() => setSelectedMachine(m)}
            className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-2xs relative ${
              selectedMachine?.id === m.id
                ? 'border-blue-600 ring-2 ring-blue-100'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900">{m.name}</h3>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {m.code} • {m.sectionsCount} Sections ({m.sectionType})
                </p>
              </div>
              <StatusBadge status={m.status} size="md" />
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg text-xs my-3 border border-slate-100">
              <div>
                <p className="text-[10px] text-slate-400">Feeder Temperature</p>
                <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                  {m.feederTemperatureC}°C
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Gob Cut Speed</p>
                <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Zap className="w-3.5 h-3.5 text-blue-500" />
                  {m.gobCutSpeed} Cuts/Min
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Pack Rate</p>
                <p className="font-bold text-emerald-600 mt-0.5">{m.packRatePercent}%</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">OEE Score</p>
                <p className="font-bold text-blue-600 mt-0.5">{m.oeePercent}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
              <span className="text-slate-500">Daily Target: <b>{m.dailyTargetTons} Tons</b></span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMachineStatus(m.id, 'Running');
                  }}
                  className="px-2 py-1 text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded"
                >
                  Start
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMachineStatus(m.id, 'Changeover');
                  }}
                  className="px-2 py-1 text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold rounded"
                >
                  Changeover
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMachineStatus(m.id, 'Maintenance');
                  }}
                  className="px-2 py-1 text-[10px] bg-red-50 text-red-700 hover:bg-red-100 font-bold rounded"
                >
                  Maint
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Machine Telemetry Details Box */}
      {selectedMachine && (
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{selectedMachine.name} Telemetry & Control Panel</h2>
                <p className="text-xs text-slate-400">IS Section Mold Cooling Air, Servo Timing & Gob Feeder</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-mono font-bold">
                PLC ONLINE • 100ms Ping
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400">Feeder Orifice Ring</p>
              <p className="text-base font-bold text-amber-400 mt-1">1185.4 °C</p>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400">Plunger Mechanism</p>
              <p className="text-base font-bold text-blue-400 mt-1">2.4 Bar Servo</p>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400">Shear Cut Mechanism</p>
              <p className="text-base font-bold text-emerald-400 mt-1">{selectedMachine.gobCutSpeed} Cuts/Min</p>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400">Mold Cooling Pressure</p>
              <p className="text-base font-bold text-slate-200 mt-1">45 kPa High Volume</p>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400">Invert / Push-out Servo</p>
              <p className="text-base font-bold text-emerald-400 mt-1">Synchronized</p>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-400">Cold End Spray Coating</p>
              <p className="text-base font-bold text-blue-400 mt-1">Active (MBTC)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
