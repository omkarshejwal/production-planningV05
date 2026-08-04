import React, { useState } from 'react';
import { Sliders, Save, Factory, Flame, Clock, Layers } from 'lucide-react';

export const SettingsModule: React.FC = () => {
  const [furnaceTarget, setFurnaceTarget] = useState(450);
  const [shiftHours, setShiftHours] = useState(8);
  const [culletTarget, setCulletTarget] = useState(35);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Plant Master Settings & Configurations</h1>
          <p className="text-xs text-slate-500">Furnace Tonnage Budget, Shift Timings & Machine Defaults</p>
        </div>
        {saved && (
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg animate-in fade-in">
            Settings Saved Successfully!
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6 text-xs">
        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500" /> Glass Furnace Capacity & Melt Targets
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Daily Melt Budget Target (Tons/Day)</label>
              <input
                type="number"
                value={furnaceTarget}
                onChange={(e) => setFurnaceTarget(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2 font-bold text-blue-700 text-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Cullet Ratio Target (%)</label>
              <input
                type="number"
                value={culletTarget}
                onChange={(e) => setCulletTarget(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2 font-bold text-emerald-700 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> Shift Operations Timings
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="font-bold text-slate-800">Shift A</p>
              <p className="text-slate-500 mt-1">06:00 - 14:00 (8 Hours)</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="font-bold text-slate-800">Shift B</p>
              <p className="text-slate-500 mt-1">14:00 - 22:00 (8 Hours)</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="font-bold text-slate-800">Shift C</p>
              <p className="text-slate-500 mt-1">22:00 - 06:00 (8 Hours)</p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs flex items-center gap-2 text-xs"
          >
            <Save className="w-4 h-4" /> Save Plant Configuration
          </button>
        </div>
      </form>
    </div>
  );
};
