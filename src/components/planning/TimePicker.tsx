import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

// ─── Time Picker ─────────────────────────────────────────────────────────────

export function TimePicker({ value, onChange, placeholder = 'Select time' }: {
  value: string;          // internal: "HH:MM" 24-h, or ""
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const minColRef = useRef<HTMLDivElement>(null);

  // Parse 24-h "HH:MM" → { h12, m, meridiem }
  const parse = (v: string) => {
    if (!v) return { h: 12, m: 0, mer: 'AM' as 'AM' | 'PM' };
    const [hStr, mStr] = v.split(':');
    const h24 = parseInt(hStr, 10) || 0;
    return { h: h24 % 12 || 12, m: parseInt(mStr, 10) || 0, mer: (h24 < 12 ? 'AM' : 'PM') as 'AM' | 'PM' };
  };
  const to24 = (h12: number, m: number, mer: 'AM' | 'PM') => {
    const h24 = (h12 % 12) + (mer === 'PM' ? 12 : 0);
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const { h, m, mer } = parse(value);

  const display = value
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mer}`
    : '';

  // Scroll minute column to selected minute when opened
  useEffect(() => {
    if (open && minColRef.current) {
      const btn = minColRef.current.children[m] as HTMLButtonElement | undefined;
      btn?.scrollIntoView({ block: 'center' });
    }
  }, [open, m]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (newH: number, newM: number, newMer: 'AM' | 'PM') => onChange(to24(newH, newM, newMer));

  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg bg-white text-left focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] flex items-center justify-between gap-2 transition-colors hover:border-[#2563EB]">
        <span className={display ? 'text-[#111827]' : 'text-[#9CA3AF]'}>{display || placeholder}</span>
        <Clock size={13} className="text-[#6B7280] shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-200 bg-white border border-[#E5E7EB] rounded-lg shadow-xl flex overflow-hidden">
          {/* Hours 01–12 */}
          <div className="flex flex-col overflow-y-auto max-h-49 py-1 w-11">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(hr => (
              <button key={hr} type="button"
                onClick={() => pick(hr, m, mer)}
                className={`py-1 text-xs font-medium text-center mx-1 rounded transition-colors ${h === hr ? 'bg-[#2563EB] text-white' : 'hover:bg-[#EFF6FF] text-[#374151]'}`}>
                {String(hr).padStart(2, '0')}
              </button>
            ))}
          </div>
          <div className="w-px bg-[#E5E7EB]" />
          {/* Minutes 00–59 */}
          <div ref={minColRef} className="flex flex-col overflow-y-auto max-h-49 py-1 w-11">
            {Array.from({ length: 60 }, (_, i) => i).map(min => (
              <button key={min} type="button"
                onClick={() => pick(h, min, mer)}
                className={`py-1 text-xs font-medium text-center mx-1 rounded transition-colors ${m === min ? 'bg-[#2563EB] text-white' : 'hover:bg-[#EFF6FF] text-[#374151]'}`}>
                {String(min).padStart(2, '0')}
              </button>
            ))}
          </div>
          <div className="w-px bg-[#E5E7EB]" />
          {/* AM / PM */}
          <div className="flex flex-col justify-center gap-1 px-1.5 py-2">
            {(['AM', 'PM'] as const).map(period => (
              <button key={period} type="button"
                onClick={() => pick(h, m, period)}
                className={`px-2 py-1.5 text-xs font-bold rounded transition-colors ${mer === period ? 'bg-[#2563EB] text-white' : 'hover:bg-[#EFF6FF] text-[#374151]'}`}>
                {period}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
