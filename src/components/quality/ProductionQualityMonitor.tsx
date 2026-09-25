import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Download, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useERP } from '../../context/ERPContext';
import { useAuth, MODULES } from '../../context/AuthContext';
import { BottleMaster } from '../../types';
import { qualityRepository, QualityHourlyEntry, QualityShiftMap, hasMeaningfulData } from '../../services/qualityRepository';

// ═══════════════════════════════════════════════════════════════════════════
// Shift master — mirrors the production.shift_master table
// ═══════════════════════════════════════════════════════════════════════════
const DB_SHIFT_MASTER = [
  { shift_id: 1, shift_name: 'Shift 1', start_time: '09:00', end_time: '17:00', display_time: '9:00 AM – 5:00 PM' },
  { shift_id: 2, shift_name: 'Shift 2', start_time: '17:00', end_time: '01:00', display_time: '5:00 PM – 1:00 AM' },
  { shift_id: 3, shift_name: 'Shift 3', start_time: '01:00', end_time: '09:00', display_time: '1:00 AM – 9:00 AM' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Machine master — gob_type determines F/M/R vs F/R weight columns
// (ERPContext machines provide live gob counts; these are the defaults)
// ═══════════════════════════════════════════════════════════════════════════
const DB_MACHINE_MASTER = [
  { machine_no: 1, gob_type: '3-gob' },
  { machine_no: 2, gob_type: '2-gob' },
  { machine_no: 3, gob_type: '2-gob' },
  { machine_no: 4, gob_type: '3-gob' },
];



const GROUP_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Critical: { color: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
  Major: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Minor: { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
};

// ═══════════════════════════════════════════════════════════════════════════
// Packing options + 24 hourly slots keyed to shift_id
// ═══════════════════════════════════════════════════════════════════════════
const PACKING_OPTIONS = [
  'ST - Shrink Tray',
  'SN - Shrink Naked',
  'SB - Shrink Box',
  'BT - Bottom Tray',
  'Pallet Packing',
];

const PRODUCTION_TIMES: { time: string; shift_id: number }[] = [
  { time: '9:00 AM', shift_id: 1 }, { time: '10:00 AM', shift_id: 1 },
  { time: '11:00 AM', shift_id: 1 }, { time: '12:00 PM', shift_id: 1 },
  { time: '1:00 PM', shift_id: 1 }, { time: '2:00 PM', shift_id: 1 },
  { time: '3:00 PM', shift_id: 1 }, { time: '4:00 PM', shift_id: 1 },
  { time: '5:00 PM', shift_id: 2 }, { time: '6:00 PM', shift_id: 2 },
  { time: '7:00 PM', shift_id: 2 }, { time: '8:00 PM', shift_id: 2 },
  { time: '9:00 PM', shift_id: 2 }, { time: '10:00 PM', shift_id: 2 },
  { time: '11:00 PM', shift_id: 2 }, { time: '12:00 AM', shift_id: 2 },
  { time: '1:00 AM', shift_id: 3 }, { time: '2:00 AM', shift_id: 3 },
  { time: '3:00 AM', shift_id: 3 }, { time: '4:00 AM', shift_id: 3 },
  { time: '5:00 AM', shift_id: 3 }, { time: '6:00 AM', shift_id: 3 },
  { time: '7:00 AM', shift_id: 3 }, { time: '8:00 AM', shift_id: 3 },
];

const SHIFT_LABELS = ['Shift 1', 'Shift 2', 'Shift 3'];
const SHIFT_ROW_BG = ['#f4f8ff', '#f3fdf6', '#fffdf2'];
const SHIFT_CELL_BG = ['#eaf2ff', '#e8faf0', '#fffce8'];
const SHIFT_CELL_COLOR = ['#3b72cc', '#2d8a58', '#b07c1a'];
const SHIFT_BORDERS = ['#c7daff', '#b6efd1', '#f0dfa0'];

const C = {
  border: '#e2e8f0',
  headerBg: '#f8fafc',
  headerText: '#1e293b',
  textMain: '#1e293b',
  textMuted: '#64748b',
  white: '#ffffff',
};

// ─── NumInput ──────────────────────────────────────────────────────────────
const NumInput: React.FC<{ value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ value, onChange, disabled = false }) => {
  return (
    <input
      type="number"
      min="0"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '3px 4px',
        fontSize: '12px',
        color: value ? C.textMain : '#94a3b8',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        borderRadius: '4px',
        outline: 'none',
        textAlign: 'center',
        transition: 'border-color 0.15s',
        MozAppearance: 'textfield',
        cursor: disabled ? 'not-allowed' : undefined,
        opacity: disabled ? 0.6 : 1,
      } as React.CSSProperties}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
    />
  );
};

// ─── EffBadge ──────────────────────────────────────────────────────────────
const EffBadge: React.FC<{ val: string }> = ({ val }) => {
  if (!val) return null;
  const n = parseFloat(val);
  const color = n >= 90 ? '#15803d' : n >= 80 ? '#b45309' : '#dc2626';
  const bg = n >= 90 ? '#f0fdf4' : n >= 80 ? '#fffbeb' : '#fff1f2';
  const border = n >= 90 ? '#bbf7d0' : n >= 80 ? '#fde68a' : '#fecaca';
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: '4px',
        padding: '1px 6px',
        fontSize: '11.5px',
        fontWeight: 600,
      }}
    >
      {val}%
    </span>
  );
};

// ─── DefectDropdown ────────────────────────────────────────────────────────
const DefectDropdown: React.FC<{
  selected: string[];
  onChange: (v: string[]) => void;
  defectGroups: { group: 'Critical' | 'Major' | 'Minor'; items: string[] }[];
  isLoading?: boolean;
  disabled?: boolean;
}> = ({ selected, onChange, defectGroups, isLoading = false, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (item: string) => {
    if (disabled) return;
    onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);
  };

  const q = search.toLowerCase();
  const filtered = defectGroups.map((g) => ({
    ...g,
    items: g.items.filter((d) => d.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);

  const MAX_TAGS = 2;
  const visible = selected.slice(0, MAX_TAGS);
  const extra = selected.length - MAX_TAGS;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: '180px' }}>
      <div
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '3px',
          minHeight: '30px',
          padding: '3px 6px',
          border: `1px solid ${open ? '#2563eb' : '#e2e8f0'}`,
          borderRadius: '5px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          backgroundColor: '#ffffff',
          boxShadow: open ? '0 0 0 2px #dbeafe' : 'none',
          transition: 'border-color 0.15s',
        }}
      >
        {selected.length === 0 ? (
          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            {isLoading ? 'Loading defects...' : 'Select defects'}
          </span>
        ) : (
          <>
            {visible.map((d) => {
              const grp = defectGroups.find((g) => g.items.includes(d))?.group ?? 'Minor';
              const s = GROUP_STYLE[grp] ?? GROUP_STYLE.Minor;
              return (
                <span
                  key={d}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    backgroundColor: s.bg,
                    color: s.color,
                    border: `1px solid ${s.border}`,
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '10.5px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d}
                  <span
                    onMouseDown={(e) => { e.stopPropagation(); toggle(d); }}
                    style={{ cursor: 'pointer', lineHeight: 1, opacity: 0.7, fontSize: '11px' }}
                  >
                    ×
                  </span>
                </span>
              );
            })}
            {extra > 0 && (
              <span
                style={{
                  fontSize: '10.5px',
                  color: '#2563eb',
                  fontWeight: 600,
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  whiteSpace: 'nowrap',
                }}
              >
                +{extra} more
              </span>
            )}
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '10px', paddingLeft: '4px' }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 999,
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '7px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            width: '300px',
            maxHeight: '360px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search defects..."
              style={{
                width: '100%',
                padding: '5px 8px',
                fontSize: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '5px',
                outline: 'none',
                color: '#1e293b',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                {isLoading ? 'Loading defects...' : 'No defects found'}
              </div>
            )}
            {filtered.map((g) => {
              const s = GROUP_STYLE[g.group];
              return (
                <div key={g.group}>
                  <div
                    style={{
                      padding: '5px 10px 3px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: s.color,
                      backgroundColor: s.bg,
                      borderTop: `1px solid ${s.border}`,
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                    {g.group} · {g.items.length}
                  </div>
                  {g.items.map((item) => {
                    const checked = selected.includes(item);
                    return (
                      <label
                        key={item}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '5px 12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#1e293b',
                          backgroundColor: checked ? '#f8faff' : 'transparent',
                          transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={(e) => { if (!checked) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = checked ? '#f8faff' : 'transparent'; }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item)}
                          style={{ accentColor: '#2563eb', width: '13px', height: '13px', flexShrink: 0 }}
                        />
                        {item}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div
              style={{
                padding: '6px 10px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>{selected.length} selected</span>
              <button
                onMouseDown={(e) => { e.preventDefault(); onChange([]); }}
                style={{ fontSize: '11.5px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── PackingMultiSelect ────────────────────────────────────────────────────
const PackingMultiSelect: React.FC<{ selected: string[]; onChange: (v: string[]) => void; disabled?: boolean }> = ({ selected: rawSelected, onChange, disabled = false }) => {
  const selected = Array.isArray(rawSelected) ? rawSelected : [];
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = (item: string) => {
    if (disabled) return;
    onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);
  };

  const label = selected.length === 0 ? '—' : selected.length === 1 ? selected[0] : `${selected[0]} +${selected.length - 1}`;
  const hasVal = selected.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        style={{
          padding: '3px 5px',
          fontSize: '11px',
          fontWeight: hasVal ? 600 : 400,
          color: hasVal ? '#2563eb' : '#94a3b8',
          backgroundColor: hasVal ? '#dbeafe' : 'transparent',
          border: `1px solid ${open ? '#2563eb' : hasVal ? '#bfdbfe' : '#e2e8f0'}`,
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: '80px',
          userSelect: 'none',
        }}
      >
        {label}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 3px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
            minWidth: '180px',
            overflow: 'hidden',
          }}
        >
          {PACKING_OPTIONS.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label
                key={opt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: '#1e293b',
                  cursor: 'pointer',
                  backgroundColor: checked ? '#f0f5ff' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  style={{ accentColor: '#2563eb', width: '13px', height: '13px', flexShrink: 0 }}
                />
                {opt}
              </label>
            );
          })}
          {selected.length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '5px 10px', textAlign: 'right' }}>
              <button
                onMouseDown={(e) => { e.preventDefault(); onChange([]); }}
                style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDisplay = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;

type DefectGroup = { group: 'Critical' | 'Major' | 'Minor'; items: string[] };

const calcBottlesInNos = (e?: QualityHourlyEntry): string => {
  const ps = parseInt(e?.packing_size ?? '');
  const ct = parseInt(e?.cartons ?? '');
  return ps > 0 && ct > 0 ? String(ps * ct) : '';
};

const calcEffForEntry = (e?: QualityHourlyEntry): string => {
  if (!e?.bottle_id || !e.packing_size || !e.cartons) return '';
  const bottlesN = parseInt(e.packing_size) * parseInt(e.cartons);
  const speed = parseFloat(e.speed_per_min);
  if (!bottlesN || !speed) return '';
  return ((bottlesN / (speed * 60)) * 100).toFixed(1);
};

const calcRowAverage = (e: QualityHourlyEntry | undefined, gobCount: number): string => {
  if (!e) return '';
  const f = parseFloat(e.weight_front);
  const r = parseFloat(e.weight_rear);
  if (gobCount === 3) {
    const m = parseFloat(e.weight_middle);
    const vals = [f, m, r].filter((v) => !isNaN(v));
    if (!vals.length) return '';
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  }
  const vals = [f, r].filter((v) => !isNaN(v));
  if (!vals.length) return '';
  return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
};

// Memoized per-hourly-row <tr>. Props are referentially stable across parent
// renders (handlers are useCallback'd, availableSections/allDefectNames are
// cached), so typing in one row only re-renders that row instead of all 24.
const QualityTimeRow = React.memo<{
  time: string;
  shiftIdx: number;
  isFirstInShift: boolean;
  entry?: QualityHourlyEntry;
  gobCount: number;
  hasM: boolean;
  bottles: BottleMaster[];
  availableSections: string[];
  allDefectNames: string[];
  defectGroups: DefectGroup[];
  loadingDefects: boolean;
  selectBottle: (time: string, bottleId: string) => void;
  selectSection: (time: string, section: string) => void;
  patchEntry: (time: string, patch: Partial<QualityHourlyEntry>) => void;
  copyRowDown: (time: string) => void;
  removeBottle: (time: string) => void;
  canEdit: boolean;
}>(({
  time,
  shiftIdx,
  isFirstInShift,
  entry,
  gobCount,
  hasM,
  bottles,
  availableSections,
  allDefectNames,
  defectGroups,
  loadingDefects,
  selectBottle,
  selectSection,
  patchEntry,
  copyRowDown,
  removeBottle,
  canEdit,
}) => {
  const hasHold = Number(entry?.qc_hold ?? 0) > 0;
  const rowBg = hasHold ? '#fff5f5' : SHIFT_ROW_BG[shiftIdx];
  const rowAvg = calcRowAverage(entry, gobCount);

  const selectedDefectNames = defectGroups.length > 0
    ? allDefectNames.filter((d) => (entry?.defect_ids ?? []).includes(d))
    : (entry?.defect_ids ?? []);

  const td: React.CSSProperties = {
    padding: '6px 10px',
    borderBottom: `1px solid ${C.border}`,
    borderRight: `1px solid ${C.border}`,
    fontSize: '12.5px',
    color: C.textMain,
    verticalAlign: 'middle',
  };
  const tdLast: React.CSSProperties = { ...td, borderRight: 'none' };
  const tdCenter: React.CSSProperties = { ...td, textAlign: 'center' };
  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '3px 4px',
    fontSize: '12px',
    fontWeight: 400,
    color: C.textMain,
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '4px',
    cursor: canEdit ? 'pointer' : 'not-allowed',
    outline: 'none',
    textAlign: 'center',
  };
  const selectFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#2563eb';
  };
  const selectBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'transparent';
  };

  return (
    <tr
      key={time}
      style={{ backgroundColor: rowBg }}
      onMouseEnter={(e) => { if (!hasHold) e.currentTarget.style.backgroundColor = '#ecf1ff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = rowBg; }}
    >
      {isFirstInShift && (
        <td rowSpan={8} style={{ textAlign: 'center', verticalAlign: 'middle', borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, width: '38px', backgroundColor: SHIFT_CELL_BG[shiftIdx], padding: '0' }}>
          <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontSize: '10.5px', fontWeight: 700, color: SHIFT_CELL_COLOR[shiftIdx], letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none' }}>
            {SHIFT_LABELS[shiftIdx]}
          </div>
        </td>
      )}

      <td style={{ ...tdCenter, fontWeight: 500, fontSize: '12px', color: C.textMuted, whiteSpace: 'nowrap' }}>
        {time}
      </td>

      <td style={{ ...td, padding: '4px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <select
            value={entry?.bottle_id ?? ''}
            disabled={!canEdit}
            onChange={(e) => {
              selectBottle(time, e.target.value);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '3px 5px',
              fontSize: '12px',
              fontWeight: entry?.bottle_id ? 500 : 400,
              color: entry?.bottle_id ? C.textMain : '#94a3b8',
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              borderRadius: '4px',
              cursor: canEdit ? 'pointer' : 'not-allowed',
              outline: 'none',
              textAlign: 'left',
              opacity: canEdit ? 1 : 0.6,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
          >
            <option value="">— Select bottle</option>
            {bottles.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {entry?.bottle_id && canEdit && (
            <button
              onClick={() => copyRowDown(time)}
              title="Copy this row to the next empty slot"
              style={{
                width: '24px', height: '24px', borderRadius: '5px',
                border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#2563eb',
                fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0, transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
            >
              +
            </button>
          )}
          {entry?.bottle_id && canEdit ? (
            <button
              onClick={() => removeBottle(time)}
              title="Remove one bottle from this row"
              style={{
                width: '24px', height: '24px', borderRadius: '5px',
                border: '1px solid #fecdd3', backgroundColor: '#fff1f2', color: '#be123c',
                fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0, transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ffe4e6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff1f2'; }}
            >
              −
            </button>
          ) : (
            <button
              disabled
              title={entry?.bottle_id ? 'No edit permission for Quality Control' : 'No bottle to remove'}
              style={{
                width: '24px', height: '24px', borderRadius: '5px',
                border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#cbd5e1',
                fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}
            >
              −
            </button>
          )}
        </div>
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <select
          value={entry?.section ?? ''}
          disabled={!canEdit}
          onChange={(e) => selectSection(time, e.target.value)}
          style={selectStyle}
          onFocus={selectFocus}
          onBlur={selectBlur}
        >
          <option value="">—</option>
          {availableSections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>

      <td style={{ ...tdCenter, padding: '4px 2px', width: '50px' }}>
        <NumInput value={entry?.weight_front ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { weight_front: v })} />
      </td>
      {hasM && (
        <td style={{ ...tdCenter, padding: '4px 2px', width: '50px' }}>
          <NumInput value={entry?.weight_middle ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { weight_middle: v })} />
        </td>
      )}
      <td style={{ ...tdCenter, padding: '4px 2px', width: '50px' }}>
        <NumInput value={entry?.weight_rear ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { weight_rear: v })} />
      </td>

      <td style={{ ...tdCenter, fontSize: '12px', fontWeight: rowAvg ? 600 : 400, color: rowAvg ? '#1e293b' : '#94a3b8' }}>
        {rowAvg || ''}
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <NumInput value={entry?.speed_per_min ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { speed_per_min: v })} />
      </td>

      <td style={{ ...tdCenter, padding: '4px 6px' }}>
        <PackingMultiSelect
          selected={entry?.packing_category ?? []}
          disabled={!canEdit}
          onChange={(v) => patchEntry(time, { packing_category: v })}
        />
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <NumInput value={entry?.packing_size ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { packing_size: v })} />
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <NumInput value={entry?.cartons ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { cartons: v })} />
      </td>

      <td style={{ ...tdCenter, fontWeight: 500 }}>
        {calcBottlesInNos(entry)}
      </td>

      <td style={tdCenter}>
        <EffBadge val={calcEffForEntry(entry)} />
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <NumInput value={entry?.sqc ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { sqc: v })} />
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <NumInput value={entry?.qc_hold != null ? String(entry.qc_hold) : '0'} disabled={!canEdit} onChange={(v) => patchEntry(time, { qc_hold: v === '' ? 0 : Number(v) })} />
      </td>

      <td style={{ ...tdCenter, padding: '4px 4px' }}>
        <NumInput value={entry?.num ?? ''} disabled={!canEdit} onChange={(v) => patchEntry(time, { num: v })} />
      </td>

      <td style={{ ...td, minWidth: '200px', padding: '4px 8px' }}>
        <DefectDropdown
          selected={selectedDefectNames}
          disabled={!canEdit}
          onChange={(names) => patchEntry(time, { defect_ids: names })}
          defectGroups={defectGroups}
          isLoading={loadingDefects}
        />
      </td>

      <td style={{ ...tdLast, padding: '4px 8px', minWidth: '120px', width: '120px' }}>
        <input
          type="text"
          value={entry?.remarks ?? ''}
          disabled={!canEdit}
          onChange={(e) => patchEntry(time, { remarks: e.target.value })}
          placeholder={canEdit ? 'Enter remarks...' : ''}
          style={{
            width: '100%', border: '1px solid transparent', borderRadius: '4px',
            padding: '4px 6px', fontSize: '12px', color: '#475569',
            backgroundColor: 'transparent', outline: 'none',
            transition: 'border-color 0.15s, background-color 0.15s',
            cursor: canEdit ? 'text' : 'not-allowed',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#2563eb';
            e.currentTarget.style.backgroundColor = '#ffffff';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        />
      </td>
    </tr>
  );
});

// ─── Module ────────────────────────────────────────────────────────────────
export const QualityControlModule: React.FC = () => {
  const { machines, bottles, bottleMasterRecords } = useERP();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(MODULES.QUALITY_CONTROL, 'edit');

  const [activeMachine, setActiveMachine] = useState(1);
  const [navDate, setNavDate] = useState<Date>(() => new Date());

  const isToday = toIso(navDate) === toIso(new Date());
  const dateKey = toIso(navDate);
  const dateLabel = toDisplay(navDate);

  // Gob type drives the Weight F/M/R columns (3-gob ⇒ middle column).
  const gobCount =
    machines.find((m) => m.code === `MAC-${String(activeMachine).padStart(2, '0')}`)?.gobCount ??
    (DB_MACHINE_MASTER.find((m) => m.machine_no === activeMachine)?.gob_type === '3-gob' ? 3 : 2);
  const hasM = gobCount === 3;

  // ── Store: unsaved edits are kept per date + machine in memory ───────────
  const [productionStore, setProductionStore] = useState<Record<string, Record<string, Record<string, QualityHourlyEntry>>>>({});
  const [shiftStore, setShiftStore] = useState<Record<string, QualityShiftMap>>({});
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>({});
  const [loadedDates, setLoadedDates] = useState<Record<string, boolean>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
  const [defectGroups, setDefectGroups] = useState<DefectGroup[]>([]);
  const [loadingDefects, setLoadingDefects] = useState<boolean>(true);

  // Dates that received a cross-midnight continuation row via "+". The row
  // lives under its OWN date key, so these dates are persisted together with
  // the current date's save (otherwise the continuation never reaches storage).
  const continuationDates = useRef<Record<string, boolean>>({});

  // Rows edited (or created) in this session, per date + machine + time. Only
  // these rows — plus rows that carry meaningful data — are sent on Save, so a
  // save never sends the whole pre-loaded 96-slot grid and never drops a row.
  const touchedTimes = useRef<Record<string, Record<string, Record<string, boolean>>>>({});

  const productionStoreRef = useRef(productionStore);
  useEffect(() => {
    productionStoreRef.current = productionStore;
  }, [productionStore]);

  // Guards Save against concurrent/duplicate submissions.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  // In-flight promises used to deduplicate concurrent loads for the same date
  // (StrictMode double-effects, rapid date navigation share one request).
  const inFlightRef = useRef<Record<string, Promise<{ hourly: Record<string, Record<string, QualityHourlyEntry>>; shifts: QualityShiftMap; ok?: boolean }> | undefined>>({});

  useEffect(() => {
    let active = true;
    qualityRepository.getDefects(true).then((defects) => {
      if (!active) return;
      const groups: { group: 'Critical' | 'Major' | 'Minor'; items: string[] }[] = (['Critical', 'Major', 'Minor'] as const).map((grp) => ({
        group: grp,
        items: defects
          .filter((d) => d.defect_type === grp)
          .sort((a, b) => a.defect_sr - b.defect_sr)
          .map((d) => d.defect_name),
      }));
      setDefectGroups(groups);
      setLoadingDefects(false);
    }).catch(() => {
      if (active) setLoadingDefects(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // Load the latest database state whenever the selected date changes (and on
  // mount). Every date change issues a fresh fetch — never reuse previously
  // loaded rows for a date, since records may have changed or been deleted in
  // the database. The store for the date is REPLACED with the API result (never
  // merged with in-memory data), so a day with no DB records shows an empty
  // grid instead of resurrecting stale rows. In-flight requests are shared
  // between concurrent effect runs to avoid duplicate API calls.
  useEffect(() => {
    let cancelled = false;
    const existing = inFlightRef.current[dateKey];
    const pending = existing ?? qualityRepository.load(dateKey);
    inFlightRef.current[dateKey] = pending;
    pending.then(({ hourly, shifts, ok }) => {
      inFlightRef.current[dateKey] = undefined;
      if (cancelled) return;
      setProductionStore((prev) => ({
        ...prev,
        [dateKey]: hourly ?? {},
      }));
      setShiftStore((prev) => ({
        ...prev,
        [dateKey]: shifts ?? {},
      }));
      setLoadedDates((prev) => ({ ...prev, [dateKey]: true }));
      setLoadErrors((prev) => ({ ...prev, [dateKey]: ok === false }));
    }).catch(() => {
      inFlightRef.current[dateKey] = undefined;
      if (!cancelled) {
        setLoadedDates((prev) => ({ ...prev, [dateKey]: true }));
        setLoadErrors((prev) => ({ ...prev, [dateKey]: true }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  const blankEntry = (time: string, shiftId: number): QualityHourlyEntry => ({
    entry_id: '',
    report_id: dateKey,
    machine_no: activeMachine,
    shift_id: shiftId,
    production_time: time,
    bottle_id: '',
    section: '',
    weight_front: '',
    weight_middle: '',
    weight_rear: '',
    weight_avg: '',
    speed_per_min: '',
    packing_category: [],
    packing_size: '',
    cartons: '',
    bottles_in_nos: '',
    efficiency_percentage: '',
    sqc: '',
    qc_hold: 0,
    num: '',
    remarks: '',
    defect_ids: [],
    job_id: '',
  });

  // Memoized view of the active machine's hourly rows for the selected date.
  // The table body and summary read from this stable map, so editing one row
  // changes only that row's entry reference and the memoized summaries below.
  const activeRows = useMemo(
    () => productionStore[dateKey]?.[String(activeMachine)] ?? {},
    [productionStore, dateKey, activeMachine]
  );

  const patchEntry = useCallback((time: string, patch: Partial<QualityHourlyEntry>) => {
    if (!canEdit) return;
    const slot = PRODUCTION_TIMES.find((pt) => pt.time === time);
    const mStr = String(activeMachine);
    const byDate = touchedTimes.current[dateKey] ?? (touchedTimes.current[dateKey] = {});
    const byMachine = byDate[mStr] ?? (byDate[mStr] = {});
    byMachine[time] = true;
    setProductionStore((prev) => {
      const existing = prev[dateKey]?.[mStr]?.[time] ?? blankEntry(time, slot?.shift_id ?? 1);
      return {
        ...prev,
        [dateKey]: {
          ...(prev[dateKey] ?? {}),
          [mStr]: {
            ...(prev[dateKey]?.[mStr] ?? {}),
            [time]: { ...existing, ...patch },
          },
        },
      };
    });
  }, [dateKey, activeMachine, canEdit]);

  // ── Shift assignments ────────────────────────────────────────────────────
  const getShiftAssignment = (shiftId: number) =>
    shiftStore[dateKey]?.[shiftId] ?? { supervisor: '', executive: '' };

  const patchShiftAssignment = (shiftId: number, patch: { supervisor?: string; executive?: string }) => {
    if (!canEdit) return;
    setShiftStore((prev) => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] ?? {}),
        [shiftId]: { ...getShiftAssignment(shiftId), ...patch },
      },
    }));
  };

  // ── Master-data lookups ──────────────────────────────────────────────────
  const sectionKey = `${String(activeMachine).padStart(2, '0')}`;

  // Available sections are derived from bottleMasterRecords/machines, which
  // only change when master data reloads, so the per-key result can be cached
  // and shared across rows renders (previously filtered the full record list
  // for every one of the 24 rows on every keypress).
  const sectionsCache = useRef(new Map<string, string[]>());
  useEffect(() => {
    sectionsCache.current.clear();
  }, [bottleMasterRecords, machines]);

  const getAvailableSections = useCallback((bottleId: string, machineNo?: number): string[] => {
    const key = `${machineNo ?? activeMachine}|${bottleId || ''}`;
    const cached = sectionsCache.current.get(key);
    if (cached) return cached;

    const num = machineNo ?? activeMachine;
    const mch = `MAC-${String(num).padStart(2, '0')}`;
    const sections = bottleMasterRecords
      .filter((r) => r.mch === mch && (!bottleId || r.drawingNumber === bottleId))
      .map((r) => String(r.section));
    const unique = [...new Set(sections)];

    let result: string[];
    if (unique.length > 0) {
      result = unique.sort((a, b) => parseInt(a) - parseInt(b));
    } else {
      const machine = machines.find((m) => m.code === mch);
      if (machine && machine.availableSections.length > 0) {
        result = machine.availableSections.map(String);
      } else {
        result = ['5', '6', '7', '8'];
      }
    }
    sectionsCache.current.set(key, result);
    return result;
  }, [activeMachine, bottleMasterRecords, machines]);

  const allDefectNames = useMemo(() => defectGroups.flatMap((g) => g.items), [defectGroups]);

  // Select a bottle: auto-fill F/M/R weights + speed from bottle_configuration.
  // job_id is owned by the database — the frontend never generates one. A
  // DB-assigned id is preserved only when re-selecting the same bottle on the
  // same row; any other selection leaves job_id empty so the backend creates
  // a fresh job id on save.
  const selectBottle = useCallback((time: string, bottleId: string) => {
    if (!canEdit) return;
    if (!bottleId) {
      patchEntry(time, {
        bottle_id: '',
        weight_front: '',
        weight_middle: '',
        weight_rear: '',
        speed_per_min: '',
        job_id: '',
      });
      return;
    }
    const slot = PRODUCTION_TIMES.find((pt) => pt.time === time);
    const machineKey = String(activeMachine);
    const existingEntry = productionStoreRef.current?.[dateKey]?.[machineKey]?.[time];
    const currentSection = existingEntry?.section ?? '';
    const prevBottle = existingEntry?.bottle_id || '';
    const newJobId =
      prevBottle === bottleId ? existingEntry?.job_id || '' : '';

    const configs = bottleMasterRecords.filter(
      (r) => r.mch === `MAC-${sectionKey}` && r.drawingNumber === bottleId
    );
    const config =
      (currentSection && configs.find((r) => String(r.section) === currentSection)) ||
      configs[0];

    const tByDate = touchedTimes.current[dateKey] ?? (touchedTimes.current[dateKey] = {});
    (tByDate[machineKey] ?? (tByDate[machineKey] = {}))[time] = true;

    setProductionStore((prev) => {
      const base = prev[dateKey]?.[machineKey]?.[time] ?? blankEntry(time, slot?.shift_id ?? 1);
      return {
        ...prev,
        [dateKey]: {
          ...(prev[dateKey] ?? {}),
          [machineKey]: {
            ...(prev[dateKey]?.[machineKey] ?? {}),
            [time]: {
              ...base,
              job_id: newJobId,
              bottle_id: bottleId,
              weight_front: (config && config.weightGrams ? String(config.weightGrams) : ''),
              weight_middle: hasM && config && config.weightGrams ? String(config.weightGrams) : '',
              weight_rear: (config && config.weightGrams ? String(config.weightGrams) : ''),
              speed_per_min: (config && config.speed ? String(config.speed) : ''),
            },
          },
        },
      };
    });
  }, [dateKey, activeMachine, bottleMasterRecords, sectionKey, hasM, patchEntry, canEdit]);

  const selectSection = useCallback((time: string, section: string) => patchEntry(time, { section }), [patchEntry]);

  // Copy a filled row down to the next empty slot. The row's job_id is
  // preserved (a copied row CONTINUES the same job). If all 24 slots of the
  // day are full, the final 8 AM row extends the same job into the next day's
  // first row — crossing the day boundary never starts a new job.
  const copyRowDown = useCallback((time: string) => {
    if (!canEdit) return;
    const idx = PRODUCTION_TIMES.findIndex((pt) => pt.time === time);
    setProductionStore((prev) => {
      const machineKey = String(activeMachine);
      const source = prev[dateKey]?.[machineKey]?.[time];
      if (!source?.bottle_id) return prev;
      const markTouched = (date: string, mKey: string, tKey: string) => {
        const byDate = touchedTimes.current[date] ?? (touchedTimes.current[date] = {});
        (byDate[mKey] ?? (byDate[mKey] = {}))[tKey] = true;
      };
      for (let i = idx + 1; i < PRODUCTION_TIMES.length; i++) {
        const nextTime = PRODUCTION_TIMES[i].time;
        if (!prev[dateKey]?.[machineKey]?.[nextTime]?.bottle_id) {
          markTouched(dateKey, machineKey, nextTime);
          return {
            ...prev,
            [dateKey]: {
              ...(prev[dateKey] ?? {}),
              [machineKey]: {
                ...(prev[dateKey]?.[machineKey] ?? {}),
                [nextTime]: {
                  ...source,
                  production_time: nextTime,
                  entry_id: '',
                  shift_id: PRODUCTION_TIMES[i].shift_id,
                },
              },
            },
          };
        }
      }
      if (idx === PRODUCTION_TIMES.length - 1) {
        const nextDate = new Date(`${dateKey}T00:00:00`);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateKey = toIso(nextDate);
        const firstTime = PRODUCTION_TIMES[0].time;
        const firstShiftId = PRODUCTION_TIMES[0].shift_id;
        // Never overwrite an existing job in the next day's first slot.
        if (prev[nextDateKey]?.[machineKey]?.[firstTime]?.bottle_id) return prev;
        continuationDates.current[nextDateKey] = true;
        markTouched(nextDateKey, machineKey, firstTime);
        return {
          ...prev,
          [nextDateKey]: {
            ...(prev[nextDateKey] ?? {}),
            [machineKey]: {
              ...(prev[nextDateKey]?.[machineKey] ?? {}),
              [firstTime]: {
                ...source,
                production_time: firstTime,
                report_id: nextDateKey,
                entry_id: '',
                shift_id: firstShiftId,
              },
            },
          },
        };
      }
      return prev;
    });
  }, [dateKey, activeMachine, canEdit]);

  const removeBottle = useCallback((time: string) => {
    patchEntry(time, {
      bottle_id: '',
      section: '',
      weight_front: '',
      weight_middle: '',
      weight_rear: '',
      weight_avg: '',
      speed_per_min: '',
      packing_category: [],
      packing_size: '',
      cartons: '',
      bottles_in_nos: '',
      efficiency_percentage: '',
      sqc: '',
      qc_hold: 0,
      num: '',
      defect_ids: [],
      remarks: '',
      job_id: '',
    });
  }, [patchEntry]);

  // ── Derived calculation helpers (shared by display, export, and save payload) ─
  const gobCountFor = useCallback((machineNo: number): number =>
    machines.find((m) => m.code === `MAC-${String(machineNo).padStart(2, '0')}`)?.gobCount ??
    (DB_MACHINE_MASTER.find((m) => m.machine_no === machineNo)?.gob_type === '3-gob' ? 3 : 2),
  [machines]);

  const calcBottlesInNosFor = useCallback((e?: QualityHourlyEntry): string => calcBottlesInNos(e), []);

  const calcEffFor = useCallback((e?: QualityHourlyEntry, _machineNo?: number): string => calcEffForEntry(e), []);

  const calcRowAvgFor = useCallback((e: QualityHourlyEntry | undefined, machineNo: number): string =>
    calcRowAverage(e, gobCountFor(machineNo)),
  [gobCountFor]);

  // Memoized day summary stats. Recompute only when the active machine's rows
  // actually change, instead of re-scanning all 24 slots on every render and
  // each keypress.
  const dayAvgs = useMemo(() => {
    const collect = (field: 'weight_front' | 'weight_middle' | 'weight_rear'): string => {
      const vals: number[] = [];
      for (const pt of PRODUCTION_TIMES) {
        const v = parseFloat(activeRows[pt.time]?.[field] ?? '');
        if (!isNaN(v)) vals.push(v);
      }
      return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : '';
    };
    const avgVals: number[] = [];
    for (const pt of PRODUCTION_TIMES) {
      const v = parseFloat(calcRowAvgFor(activeRows[pt.time], activeMachine));
      if (!isNaN(v)) avgVals.push(v);
    }
    return {
      front: collect('weight_front'),
      middle: collect('weight_middle'),
      rear: collect('weight_rear'),
      avg: avgVals.length ? (avgVals.reduce((s, v) => s + v, 0) / avgVals.length).toFixed(1) : '',
    };
  }, [activeRows, activeMachine, calcRowAvgFor]);

  const stats = useMemo(() => {
    let totalCartons = 0;
    let totalBottles = 0;
    const effVals: number[] = [];
    for (const pt of PRODUCTION_TIMES) {
      const e = activeRows[pt.time];
      const ct = parseInt(e?.cartons ?? '');
      if (!isNaN(ct)) totalCartons += ct;
      const ps = parseInt(e?.packing_size ?? '');
      if (!isNaN(ct) && ps > 0) totalBottles += ps * ct;
      const eff = parseFloat(calcEffFor(e, activeMachine));
      if (!isNaN(eff)) effVals.push(eff);
    }
    return {
      totalCartons,
      totalBottles,
      avgEff: effVals.length ? (effVals.reduce((s, v) => s + v, 0) / effVals.length).toFixed(1) : '—',
    };
  }, [activeRows, activeMachine, calcEffFor]);

  // ── Save / Export / Print ────────────────────────────────────────────────
  // Builds the smallest correct payload: only rows edited in this session and
  // rows that carry real data are included — never the pre-loaded empty 24-slot
  // grid. Touched-but-cleared rows are still sent so the backend clears values
  // that were previously saved.
  const buildSavePayload = (
    date: string,
    store: Record<string, Record<string, Record<string, QualityHourlyEntry>>>,
    touched: Record<string, Record<string, boolean>> | undefined
  ): Record<string, Record<string, QualityHourlyEntry>> => {
    const out: Record<string, Record<string, QualityHourlyEntry>> = {};
    const byMachine = store[date] ?? {};
    for (const [mStr, timeMap] of Object.entries(byMachine)) {
      const mNum = parseInt(mStr, 10) || activeMachine;
      for (const [time, entry] of Object.entries(timeMap)) {
        if (!entry) continue;
        if (!touched?.[mStr]?.[time] && !hasMeaningfulData(entry)) continue;
        (out[mStr] ??= {})[time] = {
          ...entry,
          report_id: date,
          weight_avg: calcRowAvgFor(entry, mNum),
          bottles_in_nos: calcBottlesInNosFor(entry),
          efficiency_percentage: calcEffFor(entry, mNum),
        };
      }
    }
    return out;
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit quality data.');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // The selected date plus every date that received a continuation row via
      // "+". Continuations live under their OWN date keys and are saved with
      // those dates, so saving today never drops tomorrow's 9 AM row.
      const datesToSave = new Set<string>([dateKey]);
      for (const auxKey of Object.keys(continuationDates.current)) datesToSave.add(auxKey);

      let attempted = false;
      let savedAny = false;
      for (const date of datesToSave) {
        if (Object.keys(productionStore[date] ?? {}).length === 0) continue;
        const payload = buildSavePayload(date, productionStore, touchedTimes.current[date]);
        const shifts = shiftStore[date] ?? {};
        if (Object.keys(payload).length === 0 && Object.keys(shifts).length === 0) continue;
        const result = await qualityRepository.save(date, payload, shifts);
        attempted = true;
        if (!result.ok) continue;
        savedAny = true;
        // The database owns entry_id and job_id: write the DB-generated ids
        // returned by the save back into the live store so display and
        // subsequent saves reuse the same ids instead of creating new ones.
        if (result.hourly && Object.keys(result.hourly).length > 0) {
          const saved = result.hourly;
          setProductionStore((prev) => {
            const prevDate = prev[date] ?? {};
            const machineKeys = new Set<string>([...Object.keys(saved), ...Object.keys(prevDate)]);
            const mergedDate: Record<string, Record<string, QualityHourlyEntry>> = {};
            for (const mKey of machineKeys) {
              const savedMachine = saved[mKey] ?? {};
              const prevMachine = prevDate[mKey] ?? {};
              const byTime: Record<string, QualityHourlyEntry> = {};
              for (const tKey of new Set<string>([...Object.keys(savedMachine), ...Object.keys(prevMachine)])) {
                const savedEntry = savedMachine[tKey];
                const prevEntry = prevMachine[tKey];
                if (!savedEntry) {
                  byTime[tKey] = prevEntry;
                } else if (!prevEntry) {
                  byTime[tKey] = savedEntry;
                } else {
                  // Keep the operator's current values; only the id fields
                  // (entry_id, report_id, job_id) come from the authoritative
                  // database response.
                  byTime[tKey] = {
                    ...prevEntry,
                    entry_id: savedEntry.entry_id || prevEntry.entry_id || '',
                    report_id: savedEntry.report_id || prevEntry.report_id || '',
                    job_id: savedEntry.job_id || prevEntry.job_id || '',
                  };
                }
              }
              mergedDate[mKey] = byTime;
            }
            return { ...prev, [date]: mergedDate };
          });
        }
        // These rows are now persisted; keep the rest of the store untouched so
        // unedited rows and other machines' rows stay exactly as they are.
        touchedTimes.current[date] = {};
        setSavedFlags((prev) => ({ ...prev, [date]: true }));
      }
      if (savedAny) {
        toast.success(`Saved production quality data for ${dateLabel}`);
      } else if (attempted) {
        toast.error('Save failed — changes were not persisted. Check your connection and try again.');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleExport = () => {
    const rows: string[] = [];
    const header = [
      'Shift', 'Time', 'Machine', 'Bottle Name', 'Section', 'Weight F', 'Weight M', 'Weight R',
      'AVG', 'Speed/Min', 'Packing Category', 'Packing Size', 'Cartons', 'Bottles in Nos.',
      'Efficiency %', 'SQC', 'QC Hold', 'NUM', 'Defects', 'Remarks',
    ];
    rows.push(header.join(','));
    for (const pt of PRODUCTION_TIMES) {
      const e = productionStore[dateKey]?.[String(activeMachine)]?.[pt.time];
      if (!e) {
        rows.push([SHIFT_LABELS[pt.shift_id - 1], pt.time, `Machine ${activeMachine}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].join(','));
        continue;
      }
      const bottleName = bottles.find((b) => b.id === e.bottle_id)?.name ?? e.bottle_id;
      const defectNames = defectGroups.length > 0
        ? defectGroups.flatMap((g) => g.items).filter((d) => e.defect_ids.includes(d))
        : (e.defect_ids ?? []);
      const eff = calcEffFor(e, activeMachine);
      rows.push(
        [
          SHIFT_LABELS[e.shift_id - 1] ?? SHIFT_LABELS[pt.shift_id - 1],
          e.production_time,
          `Machine ${activeMachine}`,
          bottleName,
          e.section,
          e.weight_front,
          e.weight_middle,
          e.weight_rear,
          calcRowAvgFor(e, activeMachine),
          e.speed_per_min,
          (e.packing_category ?? []).join(' / '),
          e.packing_size,
          e.cartons,
          calcBottlesInNosFor(e) || e.bottles_in_nos,
          eff,
          e.sqc,
          e.qc_hold,
          e.num,
          defectNames.join(' / '),
          e.remarks,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-quality-monitor-machine-${activeMachine}-${dateKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported Machine ${activeMachine} — ${dateLabel} to CSV`);
  };

  const [isPrinting, setIsPrinting] = useState(false);

  // Generates a landscape PDF of the currently loaded Quality Monitor data and
  // downloads it directly — mirrors the Production Planning module's print
  // behavior (jspdf + jspdf-autotable, no window.print() / browser dialog).
  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      // jspdf + autoTable are only needed for printing — load them lazily so
      // the initial bundle stays small. CJS interop fallback via .default.
      const jspdfModule: any = await import('jspdf');
      const jsPDF = jspdfModule.jsPDF ?? jspdfModule.default?.jsPDF;
      const autoTableModule: any = await import('jspdf-autotable');
      const autoTable = autoTableModule.autoTable ?? autoTableModule.default;

      // Collect ALL currently available monitor data — the same in-memory store
      // the table renders from, so no extra API/database calls are needed.
      const byTime = productionStore[dateKey]?.[String(activeMachine)] ?? {};

      const bottleNameFor = (id: string) =>
        bottles.find((b) => b.id === id)?.name ?? id;

      const defectNamesFor = (entry?: QualityHourlyEntry): string[] => {
        if (defectGroups.length === 0) return entry?.defect_ids ?? [];
        return allDefectNames.filter((d) => (entry?.defect_ids ?? []).includes(d));
      };

      const doc = new jsPDF('landscape');

      // ── Header: title, date, machine + shift assignments ────────────────
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('Hourly Production Monitor', 10, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.text(`Date: ${dateLabel}    Machine: No. ${activeMachine}`, 10, 19);

      let y = 25;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Shift Assignments (Supervisor / Executive):', 10, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      for (const sh of DB_SHIFT_MASTER) {
        const a = getShiftAssignment(sh.shift_id);
        doc.setFontSize(8);
        doc.text(
          `${sh.shift_name} (${sh.display_time}):  Supervisor — ${a.supervisor || '—'}    Executive — ${a.executive || '—'}`,
          10,
          y
        );
        y += 3.8;
      }
      const startY = y + 3;

      // ── Table header (two rows; Weight F/M/R depends on machine gob type) ─
      const headRowBase: any[] = [
        { content: 'Time', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Shift', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Bottle Name', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Section', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Weight (gms)', colSpan: hasM ? 3 : 2, styles: { halign: 'center' } },
        { content: 'Average', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Speed/Min', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Packing Category', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Packing Size', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Cartons', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Bottles', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Eff%', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'SQC', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'QC HOLD', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'NUM', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Defects', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Remarks', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      ];
      const head = [headRowBase, ['F', ...(hasM ? ['M'] : []), 'R']];

      // ── Body: all 24 hourly rows (calculations identical to on-screen) ───
      const body: any[][] = [];
      for (const pt of PRODUCTION_TIMES) {
        const e = byTime[pt.time];
        const defectNames = defectNamesFor(e);
        body.push([
          pt.time,
          SHIFT_LABELS[pt.shift_id - 1] ?? '',
          e?.bottle_id ? bottleNameFor(e.bottle_id) : '',
          e?.section ?? '',
          e?.weight_front ?? '',
          ...(hasM ? [e?.weight_middle ?? ''] : []),
          e?.weight_rear ?? '',
          calcRowAvgFor(e, activeMachine),
          e?.speed_per_min ?? '',
          (e?.packing_category ?? []).join(' / '),
          e?.packing_size ?? '',
          e?.cartons ?? '',
          calcBottlesInNosFor(e) || e?.bottles_in_nos || '',
          calcEffFor(e, activeMachine),
          e?.sqc ?? '',
          e?.qc_hold != null ? String(e.qc_hold) : '0',
          e?.num ?? '',
          defectNames.join(' / '),
          e?.remarks ?? '',
        ]);
      }

      // Day Avg / Summary row — mirrors the on-screen totals.
      const colCount = hasM ? 19 : 18;
      const summary: any[] = new Array(colCount).fill('');
      summary[0] = {
        content: 'Day Avg / Summary',
        colSpan: 4,
        styles: { halign: 'right', fontStyle: 'bold' },
      };
      let wIdx = 4;
      summary[wIdx++] = dayAvgs.front;
      if (hasM) summary[wIdx++] = dayAvgs.middle;
      summary[wIdx++] = dayAvgs.rear;
      summary[wIdx++] = dayAvgs.avg;
      wIdx++; // Speed
      wIdx++; // Packing Category
      wIdx++; // Packing Size
      summary[wIdx++] = stats.totalCartons.toLocaleString();
      summary[wIdx++] = stats.totalBottles.toLocaleString();
      summary[wIdx++] = `${stats.avgEff}%`;
      body.push(summary);

      // ── Column widths + alignment (landscape A4 with 10mm page margins) ──
      const colWidths = hasM
        ? [13, 11, 34, 11, 11, 11, 11, 13, 13, 16, 11, 11, 13, 11, 11, 11, 11, 24, 24]
        : [13, 11, 34, 11, 11, 11, 13, 13, 16, 11, 11, 13, 11, 11, 11, 11, 24, 24];

      const columnStyles: Record<number, any> = {};
      colWidths.forEach((w, i) => {
        const leftAligned = i === 2 || i === colWidths.length - 1 || i === colWidths.length - 2;
        columnStyles[i] = { cellWidth: w, halign: leftAligned ? 'left' : 'center' };
      });

      // Rows flow onto additional pages automatically when the 24-hour table
      // and summary exceed a single physical page — nothing is truncated.
      autoTable(doc, {
        head,
        body,
        startY,
        margin: { top: startY, left: 10, right: 10, bottom: 12 },
        theme: 'grid',
        includeEmptyRows: true,
        columnStyles,
        styles: {
          fontSize: 6,
          cellPadding: 1.4,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.1,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 6.5,
          halign: 'center',
        },
        alternateRowStyles: false,
        didParseCell: (data: any) => {
          if (data.section !== 'body') return;
          const idx = data.row.index;
          if (idx < PRODUCTION_TIMES.length) {
            const shiftIdx = Math.floor(idx / 8);
            data.cell.styles.fillColor = SHIFT_ROW_BG[shiftIdx];
          } else {
            data.cell.styles.fillColor = [240, 244, 250];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      // ── Footer with page numbers on every page ──────────────────────────
      const pageCount = doc.getNumberOfPages();
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Hourly Production Monitor — Machine ${activeMachine} — ${dateLabel}`, 10, pageH - 5);
        doc.text(`Page ${i} of ${pageCount}`, pageW - 10, pageH - 5, { align: 'right' });
      }

      doc.save(`Production_Quality_Monitor_${dateKey}.pdf`);
      toast.success('Generated PDF successfully.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  const shiftDate = (delta: number) => {
    const d = new Date(navDate);
    d.setDate(d.getDate() + delta);
    setNavDate(d);
  };

  const thStyle = (last = false): React.CSSProperties => ({
    padding: '8px 6px',
    color: C.headerText,
    fontWeight: 600,
    fontSize: '11px',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    borderRight: last ? 'none' : `1px solid ${C.border}`,
    whiteSpace: 'pre-line',
    lineHeight: 1.3,
    verticalAlign: 'middle',
    textAlign: 'center',
    backgroundColor: C.headerBg,
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: '12px',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    border: `1px solid ${C.border}`,
    borderRadius: '5px',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  return (
    <div className="print-container p-4 md:p-5 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <style>{`
        @media print {
          @page { size: landscape; margin: 0.15in; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-container { padding: 0 !important; max-width: none !important; animation: none !important; }
          .no-print { display: none !important; }
          .print-header { display: block !important; }
          .print-header { margin-bottom: 3px !important; padding-bottom: 3px !important; }
          .print-header h2 { font-size: 11px !important; margin: 0 !important; }
          .print-header p { font-size: 9px !important; margin: 0 !important; }
          table { font-size: 7px !important; width: 100% !important; min-width: 0 !important; table-layout: fixed !important; border-collapse: collapse !important; }
          th, td { padding: 1px 2px !important; font-size: 7px !important; line-height: 1.1 !important; }
          thead tr th { font-size: 6.5px !important; }
          input, select, textarea { border: none !important; background: transparent !important; padding: 0 !important; font-size: 7px !important; color: #1e293b !important; -webkit-appearance: none !important; appearance: none !important; }
          tbody button { display: none !important; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>

      {/* Print-only header */}
      <div className="print-header" style={{ display: 'none', marginBottom: '6px', textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
          Machine {activeMachine} — Production Quality Report
        </h2>
        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
          Date: {dateLabel}
        </p>
      </div>
      {/* Page title row */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em' }}>
            Hourly Production Monitor
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.textMuted }}>
            Hourly quality log — {dateLabel}{loadedDates[dateKey] ? '' : ' (loading…)'}
          </p>
          {loadErrors[dateKey] && (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px 10px', display: 'inline-block' }}>
              Could not reach the server — showing an empty grid. Edits made now cannot be saved until the connection is restored.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handlePrint}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
              fontSize: '12.5px', fontWeight: 500, color: '#1e293b', backgroundColor: '#ffffff',
              border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
              fontSize: '12.5px', fontWeight: 500, color: '#ffffff', backgroundColor: '#2563eb',
              border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Shift Assignment cards */}
      <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        {DB_SHIFT_MASTER.map((sh, i) => {
          const assignment = getShiftAssignment(sh.shift_id);
          return (
            <div
              key={sh.shift_id}
              style={{
                flex: 1,
                backgroundColor: SHIFT_ROW_BG[i],
                border: `1px solid ${SHIFT_BORDERS[i]}`,
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  backgroundColor: SHIFT_CELL_BG[i],
                  borderBottom: `1px solid ${SHIFT_BORDERS[i]}`,
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: SHIFT_CELL_COLOR[i], letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {sh.shift_name}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>{sh.display_time}</span>
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '3px' }}>
                    Supervisor
                  </div>
                  <input
                    type="text"
                    value={assignment.supervisor}
                    disabled={!canEdit}
                    onChange={(e) => patchShiftAssignment(sh.shift_id, { supervisor: e.target.value })}
                    placeholder={canEdit ? 'Enter supervisor name...' : ''}
                    style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '3px' }}>
                    Executive
                  </div>
                  <input
                    type="text"
                    value={assignment.executive}
                    disabled={!canEdit}
                    onChange={(e) => patchShiftAssignment(sh.shift_id, { executive: e.target.value })}
                    placeholder={canEdit ? 'Enter executive name...' : ''}
                    style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* White card */}
      <div style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {/* Machine tabs + date navigation */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`, padding: '0 8px', backgroundColor: '#f8fafc', gap: '2px' }}>
          {DB_MACHINE_MASTER.map((m) => {
            const active = activeMachine === m.machine_no;
            return (
              <button
                key={m.machine_no}
                onClick={() => setActiveMachine(m.machine_no)}
                style={{
                  padding: '7px 18px',
                  margin: '8px 4px',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#ffffff' : C.textMuted,
                  backgroundColor: active ? '#2563eb' : 'transparent',
                  border: `1px solid ${active ? '#2563eb' : C.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                Machine {m.machine_no}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />

          {/* Date navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px' }}>
            <button
              onClick={() => shiftDate(-1)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 11px',
                fontSize: '12px', fontWeight: 500, color: C.textMuted, backgroundColor: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: '6px', cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span style={{ fontSize: '14px', lineHeight: 1 }}>‹</span> Previous Day
            </button>

            <button
              onClick={() => setNavDate(new Date())}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px',
                fontSize: '12px', fontWeight: isToday ? 700 : 500,
                color: isToday ? '#2563eb' : C.textMuted,
                backgroundColor: isToday ? '#eff6ff' : 'transparent',
                border: `1px solid ${isToday ? '#bfdbfe' : C.border}`,
                borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
              onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Today
            </button>

            <button
              onClick={() => shiftDate(1)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 11px',
                fontSize: '12px', fontWeight: 500, color: C.textMuted, backgroundColor: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: '6px', cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              Next Day <span style={{ fontSize: '14px', lineHeight: 1 }}>›</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: hasM ? '1400px' : '1340px' }}>
            <thead>
              <tr style={{ backgroundColor: C.headerBg }}>
                <th rowSpan={2} style={{ ...thStyle(), width: '38px', borderBottom: `2px solid ${C.border}`, padding: '9px 4px' }}>Shift</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '76px', borderBottom: `2px solid ${C.border}`, padding: '9px 6px' }}>Time</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '200px', borderBottom: `2px solid ${C.border}`, padding: '9px 10px', textAlign: 'left' }}>Bottle Name</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '46px', borderBottom: `2px solid ${C.border}` }}>Section</th>
                <th colSpan={hasM ? 3 : 2} style={{ ...thStyle(), borderBottom: `1px solid ${C.border}` }}>Weight (gms)</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}`, color: '#475569' }}>Avg</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>{'Speed\n/Min'}</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>{'Packing\nCategory'}</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>{'Packing\nSize'}</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>Cartons</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>{'Bottles\nin Nos.'}</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>Eff%</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>SQC</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>{'QC\nHOLD'}</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '68px', borderBottom: `2px solid ${C.border}` }}>NUM</th>
                <th rowSpan={2} style={{ ...thStyle(), width: '120px', textAlign: 'left', borderBottom: `2px solid ${C.border}` }}>DEFECTS</th>
                <th rowSpan={2} style={{ ...thStyle(true), width: '120px', textAlign: 'left', borderBottom: `2px solid ${C.border}` }}>Remarks</th>
              </tr>
              <tr style={{ backgroundColor: C.headerBg }}>
                <th style={{ ...thStyle(), width: '50px', fontSize: '10px', borderBottom: `2px solid ${C.border}`, color: '#475569' }}>F</th>
                {hasM && <th style={{ ...thStyle(), width: '50px', fontSize: '10px', borderBottom: `2px solid ${C.border}`, color: '#475569' }}>M</th>}
                <th style={{ ...thStyle(), width: '50px', fontSize: '10px', borderBottom: `2px solid ${C.border}`, color: '#475569' }}>R</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTION_TIMES.map((slot, idx) => {
                const { time } = slot;
                const shiftIdx = Math.floor(idx / 8);
                const isFirstInShift = idx % 8 === 0;
                const entry = activeRows[time];

                const availSections = entry?.bottle_id
                  ? getAvailableSections(entry.bottle_id)
                  : getAvailableSections('', activeMachine);

                return (
                  <QualityTimeRow
                    key={time}
                    time={time}
                    shiftIdx={shiftIdx}
                    isFirstInShift={isFirstInShift}
                    entry={entry}
                    gobCount={gobCount}
                    hasM={hasM}
                    bottles={bottles}
                    availableSections={availSections}
                    allDefectNames={allDefectNames}
                    defectGroups={defectGroups}
                    loadingDefects={loadingDefects}
                    selectBottle={selectBottle}
                    selectSection={selectSection}
                    patchEntry={patchEntry}
                    copyRowDown={copyRowDown}
                    removeBottle={removeBottle}
                    canEdit={canEdit}
                  />
                );
              })}

              {/* Day Avg / Summary row */}
              <tr style={{ backgroundColor: '#f0f4fa', borderTop: `2px solid ${C.border}` }}>
                <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', color: '#334155', letterSpacing: '0.06em', textTransform: 'uppercase', borderRight: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                  Day Avg / Summary
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#1e293b', borderRight: `1px solid ${C.border}` }}>
                  {dayAvgs.front}
                </td>
                {hasM && (
                  <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#1e293b', borderRight: `1px solid ${C.border}` }}>
                    {dayAvgs.middle}
                  </td>
                )}
                <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#1e293b', borderRight: `1px solid ${C.border}` }}>
                  {dayAvgs.rear}
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center', borderRight: `1px solid ${C.border}` }}>
                  {dayAvgs.avg ? (
                    <span style={{ display: 'inline-block', backgroundColor: '#334155', color: '#ffffff', borderRadius: '4px', padding: '2px 7px', fontWeight: 700, fontSize: '12px' }}>
                      {dayAvgs.avg}
                    </span>
                  ) : ''}
                </td>
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1e293b', fontSize: '13px', borderRight: `1px solid ${C.border}` }}>
                  {stats.totalCartons.toLocaleString()}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1e293b', fontSize: '13px', borderRight: `1px solid ${C.border}` }}>
                  {stats.totalBottles.toLocaleString()}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center', borderRight: `1px solid ${C.border}` }}>
                  <span style={{ display: 'inline-block', backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '4px', padding: '2px 8px', fontWeight: 700, fontSize: '12px' }}>
                    {stats.avgEff}%
                  </span>
                </td>
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td colSpan={2} style={{ padding: '8px 10px' }} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Save button */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', padding: '10px 14px', borderTop: `1px solid ${C.border}`, backgroundColor: '#fafafa' }}>
          {savedFlags[dateKey] && (
            <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 600 }}>
              Saved for {dateLabel}
            </span>
          )}
          {canEdit && (
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px',
                padding: '7px 22px', fontSize: '13px', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                letterSpacing: '0.01em', transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};