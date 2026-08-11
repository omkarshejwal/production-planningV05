import React, { useState } from 'react';
import { ClipboardPlus, Clock, X } from 'lucide-react';
import { addMinutesToTime, isOvernightShift } from '../../utils/planningCalculations';
import { TimePicker } from './TimePicker';

// ─── End Job Modal ────────────────────────────────────────────────────────────

export function EndJobModal({
  jobNumber, startTime, onConfirm, onClose,
}: {
  jobNumber: number;
  startTime?: string;
  onConfirm: (endTime: string, delayMinutes: number) => void;
  onClose: () => void;
}) {
  const nowStr = (() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  })();
  const [endTime, setEndTime] = useState(nowStr);
  const [delayMinutes, setDelayMinutes] = useState<string>('');

  const fmt = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hr = parseInt(h, 10);
    return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
  };

  const delayMins = parseInt(delayMinutes, 10);
  const validDelay = !isNaN(delayMins) && delayMins >= 0;
  // Block submit if end time equals start time — would produce 0-duration draw
  const sameAsStart = !!startTime && !!endTime && endTime === startTime;
  // Preview: what time will the new job start after changeover
  const newJobStart = endTime && validDelay && !sameAsStart ? addMinutesToTime(endTime, delayMins) : null;
  const newJobStartOvernight = newJobStart ? isOvernightShift(newJobStart) : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-sm font-semibold text-[#111827]">Complete Job {jobNumber}</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827]"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Job start time (read-only) */}
          {startTime && (
            <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-3 py-2.5">
              <Clock size={13} className="text-[#6B7280]" />
              <div>
                <p className="text-[9px] font-medium text-[#9CA3AF] uppercase tracking-wide">Job {jobNumber} Start Time</p>
                <p className="text-sm font-semibold text-[#111827]">{fmt(startTime)}</p>
              </div>
            </div>
          )}

          {/* Completion time */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Completion Time for Job {jobNumber}</label>
            <TimePicker value={endTime} onChange={setEndTime} placeholder="Select completion time" />
            {sameAsStart && (
              <p className="mt-1.5 text-xs font-medium text-[#DC2626] flex items-center gap-1">
                ⚠ Completion time cannot be the same as start time ({startTime}). Please select a different time.
              </p>
            )}
          </div>

          {/* Machine changeover — manual minutes input */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Machine Changeover Time (minutes)</label>
            <input
              type="number"
              min="0"
              value={delayMinutes}
              onChange={e => setDelayMinutes(e.target.value)}
              placeholder="Enter changeover time (min)"
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-white text-[#111827] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] placeholder:text-[#9CA3AF]"
            />
            <p className="text-[10px] text-[#9CA3AF] mt-1">Mould change, machine setup &amp; cleaning time before next job begins.</p>
          </div>

          {/* New job start time preview */}
          {newJobStart && (
            <div className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 border ${newJobStartOvernight ? 'bg-[#FFF7ED] border-[#FED7AA]' : 'bg-[#F0FDF4] border-[#BBF7D0]'}`}>
              <Clock size={13} className={newJobStartOvernight ? 'text-[#EA580C]' : 'text-[#16A34A]'} />
              <div>
                <p className="text-[9px] font-medium text-[#9CA3AF] uppercase tracking-wide">New Job Start Time</p>
                <p className={`text-sm font-bold ${newJobStartOvernight ? 'text-[#C2410C]' : 'text-[#15803D]'}`}>
                  {fmt(newJobStart)}
                  {newJobStartOvernight && <span className="ml-1.5 text-[9px] font-semibold text-[#EA580C] bg-[#FED7AA] px-1.5 py-0.5 rounded-full">overnight</span>}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E5E7EB]">
          <button onClick={onClose}
            className="h-9 px-4 text-sm font-medium border border-[#E5E7EB] rounded-lg text-[#374151] bg-white hover:bg-[#F8FAFC] transition-colors">
            Cancel
          </button>
          <button onClick={() => onConfirm(endTime, validDelay ? delayMins : 0)} disabled={!endTime || sameAsStart}
            className="h-9 px-4 text-sm font-semibold rounded-lg text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            <ClipboardPlus size={14} /> Start New Job
          </button>
        </div>
      </div>
    </div>
  );
}
