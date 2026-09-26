import React, { useState, useEffect } from 'react';
import { CalendarDays, Pencil, Trash2, Check } from 'lucide-react';
import { planningRepository } from '../../services/planningRepository';
import { useAuth, MODULES } from '../../context/AuthContext';

interface HolidayRow {
  holiday_date: string;
  holiday_name: string;
}

export const HolidayMasterPanel: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(MODULES.HOLIDAY_MASTER, 'edit');
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHolidays();
  }, []);

  async function loadHolidays() {
    setLoading(true);
    const data = await planningRepository.getHolidays();
    setHolidays(data);
    setLoading(false);
  }

  async function handleSave() {
    if (!canEdit) return;
    if (!holidayDate || !holidayName) return;

    if (editingDate) {
      const result = await planningRepository.updateHoliday(editingDate, holidayDate, holidayName);
      if (!result.ok) {
        alert(result.error || 'Failed to update holiday.');
        return;
      }
    } else {
      if (holidays.some((h) => h.holiday_date === holidayDate)) {
        alert('A holiday already exists for this date.');
        return;
      }
      const result = await planningRepository.createHoliday(holidayDate, holidayName);
      if (!result.ok) {
        alert(result.error || 'Failed to create holiday.');
        return;
      }
    }

    setHolidayDate('');
    setHolidayName('');
    setEditingDate(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    loadHolidays();
  }

  function startEdit(h: HolidayRow) {
    setHolidayDate(h.holiday_date);
    setHolidayName(h.holiday_name);
    setEditingDate(h.holiday_date);
    setSaved(false);
  }

  async function deleteHoliday(date: string) {
    if (!canEdit) return;
    const result = await planningRepository.deleteHoliday(date);
    if (!result.ok) {
      alert(result.error || 'Failed to delete holiday.');
      return;
    }
    if (editingDate === date) {
      setHolidayDate('');
      setHolidayName('');
      setEditingDate(null);
    }
    loadHolidays();
  }

  function cancelEdit() {
    setHolidayDate('');
    setHolidayName('');
    setEditingDate(null);
  }

  function fmt(iso: string) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${mo[parseInt(m) - 1]} ${y}`;
  }

  const sorted = [...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));

  return (
    <div className="w-[min(92vw,500px)] min-w-0 max-w-none bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm min-h-0">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 shrink-0">
        <span className="text-blue-600"><CalendarDays className="w-4 h-4" /></span>
        <h2 className="text-sm font-semibold text-gray-800">Holiday Master</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        {canEdit && (
          <>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {editingDate ? 'Edit Holiday' : 'Add Holiday'}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Holiday Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => {
                  setHolidayDate(e.target.value);
                  setSaved(false);
                }}
                className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Holiday Name</label>
              <input
                type="text"
                placeholder="e.g. Republic Day"
                value={holidayName}
                onChange={(e) => {
                  setHolidayName(e.target.value);
                  setSaved(false);
                }}
                className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              {editingDate && (
                <button
                  onClick={cancelEdit}
                  className="px-3 h-8 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!holidayDate || !holidayName}
                className={`flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${saved
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : !holidayDate || !holidayName
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
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

            <div className="border-t border-gray-100" />
          </>
        )}

        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Saved Holidays ({holidays.length})
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No holidays added yet.</p>
            )}
            {sorted.map((h) => (
              <div
                key={h.holiday_date}
                className={`flex items-center justify-between px-2.5 py-2 rounded-lg border transition ${editingDate === h.holiday_date
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{h.holiday_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{fmt(h.holiday_date)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <>
                      <button
                        onClick={() => startEdit(h)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteHoliday(h.holiday_date)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
