import React, { useEffect, useState } from 'react';
import { Printer, Download, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useERP } from '../../context/ERPContext';
import { qualityRepository, QualityHourlyEntry, QualityShiftMap } from '../../services/qualityRepository';

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

// ═══════════════════════════════════════════════════════════════════════════
// Defect master — grouped active defects (Critical / Major / Minor)
// ═══════════════════════════════════════════════════════════════════════════
const DB_DEFECT_MASTER: { group: 'Critical' | 'Major' | 'Minor'; items: string[] }[] = [
  {
    group: 'Critical',
    items: [
      'Glass Protrusion inside the mouth', 'Top Seam (Sealing Integrity)', 'Choked Bore',
      'Bird Swing', 'Embedded Glass Pieces Inside', 'Poor Annealing',
      'Thermal Shock Test Fail', 'Light Transmission Test Fail', 'Glass Spikes',
      'Mould Fin', 'Soft Blister > 1mm scaling area', 'Swabbing Carbon non removable',
      'Extraneous Matter (Inside)',
    ],
  },
  {
    group: 'Major',
    items: [
      'Over / Under Weight', 'Over / Under Height', 'Over / Under Capacity',
      'Over / Under L/T/F', 'De-Shape Bottle', 'Bubble/Blister above 2mm',
      'Stone above 1.5 mm', 'N/R Damage', 'Pipe Mark',
      'Neck Bend (More than Total Height x Tan 1d)', 'Sagging', 'Thin Body < 1mm',
      'Thin Bottom', 'Crushed Baffle', 'Body Bend (More than Total Height x Tan 1d)',
      'Neck Crack', 'Shoulder Crack', 'Body Crack', 'Bottom Crack', 'Unfilled Neck',
      'Sunk Top', 'Neck Chip', 'Baffle Out', 'Rocker Bottom', 'Prominent Seam',
      'Undersize Bore', 'Sunken Panel', 'Bulged Panel', 'Over / Under Body Dia',
      'Over Press Finish/Plug Seam',
    ],
  },
  {
    group: 'Minor',
    items: [
      'Knots', 'Unstable Bottle', 'Oil Spots', 'Bubble/Blister below 2mm',
      'Stone below 1.5 mm', 'Impact Marks', 'Seeds', 'Poor Polish', 'Pitting Marks',
      'Wrinkle Surface', 'Rust / Carbon Mark', 'Rubbing Mark', 'Stiking Mark',
      'Body / Bottom Tear', 'Black Specs', 'Hot Checks', 'Damage Blank/Mould',
      'Lap Mark', 'Loading Mark', 'Unblown Shoulder', 'Brush Mark', 'Cold Mould',
      'Shear Mark', 'Neck Finish Rough', 'Offset Mould', 'Oval Body (75% Tolerance)',
      'Uneven Glass Distribution', 'Glass Fold', 'Heel Tap', 'Cold Checks',
    ],
  },
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
const NumInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  return (
    <input
      type="number"
      min="0"
      value={value}
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
const DefectDropdown: React.FC<{ selected: string[]; onChange: (v: string[]) => void }> = ({ selected, onChange }) => {
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

  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);

  const q = search.toLowerCase();
  const filtered = DB_DEFECT_MASTER.map((g) => ({
    ...g,
    items: g.items.filter((d) => d.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);

  const MAX_TAGS = 2;
  const visible = selected.slice(0, MAX_TAGS);
  const extra = selected.length - MAX_TAGS;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: '180px' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '3px',
          minHeight: '30px',
          padding: '3px 6px',
          border: `1px solid ${open ? '#2563eb' : '#e2e8f0'}`,
          borderRadius: '5px',
          cursor: 'pointer',
          backgroundColor: '#ffffff',
          boxShadow: open ? '0 0 0 2px #dbeafe' : 'none',
          transition: 'border-color 0.15s',
        }}
      >
        {selected.length === 0 ? (
          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Select defects</span>
        ) : (
          <>
            {visible.map((d) => {
              const grp = DB_DEFECT_MASTER.find((g) => g.items.includes(d))?.group ?? 'Minor';
              const s = GROUP_STYLE[grp];
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
                No defects found
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
const PackingMultiSelect: React.FC<{ selected: string[]; onChange: (v: string[]) => void }> = ({ selected: rawSelected, onChange }) => {
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

  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);

  const label = selected.length === 0 ? '—' : selected.length === 1 ? selected[0] : `${selected[0]} +${selected.length - 1}`;
  const hasVal = selected.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '3px 5px',
          fontSize: '11px',
          fontWeight: hasVal ? 600 : 400,
          color: hasVal ? '#2563eb' : '#94a3b8',
          backgroundColor: hasVal ? '#dbeafe' : 'transparent',
          border: `1px solid ${open ? '#2563eb' : hasVal ? '#bfdbfe' : '#e2e8f0'}`,
          borderRadius: '4px',
          cursor: 'pointer',
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

// ─── Module ────────────────────────────────────────────────────────────────
export const QualityControlModule: React.FC = () => {
  const { machines, bottles, bottleMasterRecords } = useERP();

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

  // Load saved data from the repository whenever the selected date changes.
  useEffect(() => {
    let active = true;
    qualityRepository.load(dateKey).then(({ hourly, shifts }) => {
      if (!active) return;
      setProductionStore((prev) => ({ ...prev, [dateKey]: hourly ?? {} }));
      setShiftStore((prev) => ({ ...prev, [dateKey]: shifts ?? {} }));
      setLoadedDates((prev) => ({ ...prev, [dateKey]: true }));
    });
    return () => {
      active = false;
    };
  }, [dateKey]);

  const blankEntry = (time: string, shiftId: number): QualityHourlyEntry => ({
    entry_id: `${dateKey}:${activeMachine}:${time}`,
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
    efficiency_percent: '',
    sqc: '',
    qc_hold: '',
    num: '',
    remarks: '',
    defect_ids: [],
  });

  const getEntry = (machineNo: number, time: string): QualityHourlyEntry | undefined =>
    productionStore[dateKey]?.[String(machineNo)]?.[time];

  const patchEntry = (time: string, patch: Partial<QualityHourlyEntry>) => {
    const slot = PRODUCTION_TIMES.find((pt) => pt.time === time);
    setProductionStore((prev) => {
      const existing = prev[dateKey]?.[String(activeMachine)]?.[time] ?? blankEntry(time, slot?.shift_id ?? 1);
      return {
        ...prev,
        [dateKey]: {
          ...(prev[dateKey] ?? {}),
          [String(activeMachine)]: {
            ...(prev[dateKey]?.[String(activeMachine)] ?? {}),
            [time]: { ...existing, ...patch },
          },
        },
      };
    });
  };

  // ── Shift assignments ────────────────────────────────────────────────────
  const getShiftAssignment = (shiftId: number) =>
    shiftStore[dateKey]?.[shiftId] ?? { supervisor: '', executive: '' };

  const patchShiftAssignment = (shiftId: number, patch: { supervisor?: string; executive?: string }) =>
    setShiftStore((prev) => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] ?? {}),
        [shiftId]: { ...getShiftAssignment(shiftId), ...patch },
      },
    }));

  // ── Master-data lookups ──────────────────────────────────────────────────
  const sectionKey = `${String(activeMachine).padStart(2, '0')}`;

  const getAvailableSections = (bottleId: string, machineNo?: number): string[] => {
    const num = machineNo ?? activeMachine;
    const mch = `MAC-${String(num).padStart(2, '0')}`;
    const sections = bottleMasterRecords
      .filter((r) => r.mch === mch && (!bottleId || r.drawingNumber === bottleId))
      .map((r) => String(r.section));
    const unique = [...new Set(sections)];
    if (unique.length > 0) return unique.sort((a, b) => parseInt(a) - parseInt(b));
    const machine = machines.find((m) => m.code === mch);
    if (machine && machine.availableSections.length > 0) {
      return machine.availableSections.map(String);
    }
    return ['5', '6', '7', '8'];
  };

  // Select a bottle: auto-fill F/M/R weights + speed from bottle_configuration.
  const selectBottle = (time: string, bottleId: string) => {
    if (!bottleId) {
      patchEntry(time, {
        bottle_id: '',
        weight_front: '',
        weight_middle: '',
        weight_rear: '',
        speed_per_min: '',
      });
      return;
    }
    const entry = getEntry(activeMachine, time);
    const currentSection = entry?.section ?? '';
    const configs = bottleMasterRecords.filter(
      (r) => r.mch === `MAC-${sectionKey}` && r.drawingNumber === bottleId
    );
    const config =
      (currentSection && configs.find((r) => String(r.section) === currentSection)) ||
      configs[0];
    patchEntry(time, {
      bottle_id: bottleId,
      weight_front: (config && config.weightGrams ? String(config.weightGrams) : ''),
      weight_middle: hasM && config && config.weightGrams ? String(config.weightGrams) : '',
      weight_rear: (config && config.weightGrams ? String(config.weightGrams) : ''),
      speed_per_min: (config && config.speed ? String(config.speed) : ''),
    });
  };

  const selectSection = (time: string, section: string) => patchEntry(time, { section });

  // Copy a filled row down to the next empty slot.
  const copyRowDown = (time: string) => {
    const idx = PRODUCTION_TIMES.findIndex((pt) => pt.time === time);
    const source = getEntry(activeMachine, time);
    if (!source?.bottle_id) return;
    for (let i = idx + 1; i < PRODUCTION_TIMES.length; i++) {
      const nextTime = PRODUCTION_TIMES[i].time;
      if (!getEntry(activeMachine, nextTime)?.bottle_id) {
        patchEntry(nextTime, {
          ...source,
          production_time: nextTime,
          entry_id: `${dateKey}:${source.machine_no}:${nextTime}`,
          shift_id: PRODUCTION_TIMES[i].shift_id,
        });
        return;
      }
    }
  };

  // ── Derived calculations ────────────────────────────────────────────────
  const calcEff = (time: string): string => {
    const e = getEntry(activeMachine, time);
    if (!e?.bottle_id || !e.packing_size || !e.cartons) return '';
    const bottles = parseInt(e.packing_size) * parseInt(e.cartons);
    const speed = parseFloat(e.speed_per_min);
    if (!bottles || !speed) return '';
    return ((bottles / (speed * 60)) * 100).toFixed(1);
  };

  const calcRowAvg = (time: string): string => {
    const e = getEntry(activeMachine, time);
    if (!e) return '';
    const f = parseFloat(e.weight_front);
    const r = parseFloat(e.weight_rear);
    if (hasM) {
      const m = parseFloat(e.weight_middle);
      const vals = [f, m, r].filter((v) => !isNaN(v));
      if (!vals.length) return '';
      return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
    }
    const vals = [f, r].filter((v) => !isNaN(v));
    if (!vals.length) return '';
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  };

  const dayAvg = (field: 'weight_front' | 'weight_middle' | 'weight_rear' | 'avg'): string => {
    const vals: number[] = [];
    for (const pt of PRODUCTION_TIMES) {
      const v = field === 'avg'
        ? parseFloat(calcRowAvg(pt.time))
        : parseFloat(getEntry(activeMachine, pt.time)?.[field] ?? '');
      if (!isNaN(v)) vals.push(v);
    }
    if (!vals.length) return '';
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  };

  const effValues = PRODUCTION_TIMES.map((pt) => parseFloat(calcEff(pt.time))).filter((v) => !isNaN(v));
  const avgEff = effValues.length
    ? (effValues.reduce((s, v) => s + v, 0) / effValues.length).toFixed(1)
    : '—';

  const totalCartons = PRODUCTION_TIMES.reduce(
    (s, pt) => s + (parseInt(getEntry(activeMachine, pt.time)?.cartons ?? '') || 0),
    0
  );

  const totalBottles = PRODUCTION_TIMES.reduce((s, pt) => {
    const e = getEntry(activeMachine, pt.time);
    const ps = parseInt(e?.packing_size ?? '');
    const ct = parseInt(e?.cartons ?? '');
    return s + (ps > 0 && ct > 0 ? ps * ct : 0);
  }, 0);

  // ── Save / Export / Print ────────────────────────────────────────────────
  const handleSave = async () => {
    const hourly = productionStore[dateKey] ?? {};
    const shifts = shiftStore[dateKey] ?? {};
    const result = await qualityRepository.save(dateKey, hourly, shifts);
    if (result.ok) {
      setSavedFlags((prev) => ({ ...prev, [dateKey]: true }));
      toast.success(`Saved production quality data for ${dateLabel}`);
    } else {
      toast.error('Failed to save production quality data.');
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
    for (const machineNo of DB_MACHINE_MASTER) {
      for (const pt of PRODUCTION_TIMES) {
        const e = productionStore[dateKey]?.[String(machineNo.machine_no)]?.[pt.time];
        if (!e) {
          rows.push([SHIFT_LABELS[pt.shift_id - 1], pt.time, `Machine ${machineNo.machine_no}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].join(','));
          continue;
        }
        const bottleName = bottles.find((b) => b.id === e.bottle_id)?.name ?? e.bottle_id;
        const defectNames = DB_DEFECT_MASTER.flatMap((g) => g.items)
          .filter((d) => e.defect_ids.includes(d));
        const eff = calcEffFor(e, machineNo.machine_no);
        rows.push(
          [
            SHIFT_LABELS[e.shift_id - 1] ?? SHIFT_LABELS[pt.shift_id - 1],
            e.production_time,
            `Machine ${machineNo.machine_no}`,
            bottleName,
            e.section,
            e.weight_front,
            e.weight_middle,
            e.weight_rear,
            calcRowAvgFor(e, machineNo.machine_no),
            e.speed_per_min,
            (e.packing_category ?? []).join(' / '),
            e.packing_size,
            e.cartons,
            e.bottles_in_nos,
            eff,
            e.sqc,
            e.qc_hold,
            e.num,
            defectNames.join(' / '),
            e.remarks,
          ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
        );
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-quality-monitor-${dateKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${dateLabel} to CSV`);
  };

  const calcEffFor = (e: QualityHourlyEntry, _machineNo: number): string => {
    if (!e?.bottle_id || !e.packing_size || !e.cartons) return '';
    const bottlesN = parseInt(e.packing_size) * parseInt(e.cartons);
    const speed = parseFloat(e.speed_per_min);
    if (!bottlesN || !speed) return '';
    return ((bottlesN / (speed * 60)) * 100).toFixed(1);
  };

  const calcRowAvgFor = (e: QualityHourlyEntry, machineNo: number): string => {
    const f = parseFloat(e.weight_front);
    const r = parseFloat(e.weight_rear);
    const gob = gobCountFor(machineNo);
    if (gob === 3) {
      const m = parseFloat(e.weight_middle);
      const vals = [f, m, r].filter((v) => !isNaN(v));
      if (!vals.length) return '';
      return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
    }
    const vals = [f, r].filter((v) => !isNaN(v));
    if (!vals.length) return '';
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  };

  const gobCountFor = (machineNo: number): number =>
    machines.find((m) => m.code === `MAC-${String(machineNo).padStart(2, '0')}`)?.gobCount ??
    (DB_MACHINE_MASTER.find((m) => m.machine_no === machineNo)?.gob_type === '3-gob' ? 3 : 2);

  const handlePrint = () => window.print();

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
    <div className="p-4 md:p-5 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      {/* Page title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em' }}>
            Production Quality Monitor
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.textMuted }}>
            Hourly quality log — {dateLabel}{loadedDates[dateKey] ? '' : ' (loading…)'}
          </p>
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
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
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
                    onChange={(e) => patchShiftAssignment(sh.shift_id, { supervisor: e.target.value })}
                    placeholder="Enter supervisor name..."
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
                    onChange={(e) => patchShiftAssignment(sh.shift_id, { executive: e.target.value })}
                    placeholder="Enter executive name..."
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
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`, padding: '0 8px', backgroundColor: '#f8fafc', gap: '2px' }}>
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
                const entry = getEntry(activeMachine, time);
                const hasHold = entry?.qc_hold === 'HOLD';
                const rowBg = hasHold ? '#fff5f5' : SHIFT_ROW_BG[shiftIdx];
                const rowAvg = calcRowAvg(time);

                const availSections = entry?.bottle_id
                  ? getAvailableSections(entry.bottle_id)
                  : getAvailableSections('', activeMachine);

                const selectedDefectNames = DB_DEFECT_MASTER
                  .flatMap((g) => g.items)
                  .filter((d) => (entry?.defect_ids ?? []).includes(d));

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
                  cursor: 'pointer',
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
                          onChange={(e) => selectBottle(time, e.target.value)}
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
                            cursor: 'pointer',
                            outline: 'none',
                            textAlign: 'left',
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                        >
                          <option value="">— Select bottle</option>
                          {bottles.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        {entry?.bottle_id && (
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
                      </div>
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <select
                        value={entry?.section ?? ''}
                        onChange={(e) => selectSection(time, e.target.value)}
                        style={selectStyle}
                        onFocus={selectFocus}
                        onBlur={selectBlur}
                      >
                        <option value="">—</option>
                        {availSections.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 2px', width: '50px' }}>
                      <NumInput value={entry?.weight_front ?? ''} onChange={(v) => patchEntry(time, { weight_front: v })} />
                    </td>
                    {hasM && (
                      <td style={{ ...tdCenter, padding: '4px 2px', width: '50px' }}>
                        <NumInput value={entry?.weight_middle ?? ''} onChange={(v) => patchEntry(time, { weight_middle: v })} />
                      </td>
                    )}
                    <td style={{ ...tdCenter, padding: '4px 2px', width: '50px' }}>
                      <NumInput value={entry?.weight_rear ?? ''} onChange={(v) => patchEntry(time, { weight_rear: v })} />
                    </td>

                    <td style={{ ...tdCenter, fontSize: '12px', fontWeight: rowAvg ? 600 : 400, color: rowAvg ? '#1e293b' : '#94a3b8' }}>
                      {rowAvg || ''}
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <NumInput value={entry?.speed_per_min ?? ''} onChange={(v) => patchEntry(time, { speed_per_min: v })} />
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 6px' }}>
                      <PackingMultiSelect
                        selected={entry?.packing_category ?? []}
                        onChange={(v) => patchEntry(time, { packing_category: v })}
                      />
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <NumInput value={entry?.packing_size ?? ''} onChange={(v) => patchEntry(time, { packing_size: v })} />
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <NumInput value={entry?.cartons ?? ''} onChange={(v) => patchEntry(time, { cartons: v })} />
                    </td>

                    <td style={{ ...tdCenter, fontWeight: 500 }}>
                      {(() => {
                        const ps = parseInt(entry?.packing_size ?? '');
                        const ct = parseInt(entry?.cartons ?? '');
                        return ps > 0 && ct > 0 ? ps * ct : '';
                      })()}
                    </td>

                    <td style={tdCenter}>
                      <EffBadge val={calcEff(time)} />
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <NumInput value={entry?.sqc ?? ''} onChange={(v) => patchEntry(time, { sqc: v })} />
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <NumInput value={entry?.qc_hold ?? ''} onChange={(v) => patchEntry(time, { qc_hold: v })} />
                    </td>

                    <td style={{ ...tdCenter, padding: '4px 4px' }}>
                      <NumInput value={entry?.num ?? ''} onChange={(v) => patchEntry(time, { num: v })} />
                    </td>

                    <td style={{ ...td, minWidth: '200px', padding: '4px 8px' }}>
                      <DefectDropdown
                        selected={selectedDefectNames}
                        onChange={(names) => patchEntry(time, { defect_ids: names })}
                      />
                    </td>

                    <td style={{ ...tdLast, padding: '4px 8px', minWidth: '120px', width: '120px' }}>
                      <input
                        type="text"
                        value={entry?.remarks ?? ''}
                        onChange={(e) => patchEntry(time, { remarks: e.target.value })}
                        placeholder="Enter remarks..."
                        style={{
                          width: '100%', border: '1px solid transparent', borderRadius: '4px',
                          padding: '4px 6px', fontSize: '12px', color: '#475569',
                          backgroundColor: 'transparent', outline: 'none',
                          transition: 'border-color 0.15s, background-color 0.15s',
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
              })}

              {/* Day Avg / Summary row */}
              <tr style={{ backgroundColor: '#f0f4fa', borderTop: `2px solid ${C.border}` }}>
                <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', color: '#334155', letterSpacing: '0.06em', textTransform: 'uppercase', borderRight: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                  Day Avg / Summary
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#1e293b', borderRight: `1px solid ${C.border}` }}>
                  {dayAvg('weight_front')}
                </td>
                {hasM && (
                  <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#1e293b', borderRight: `1px solid ${C.border}` }}>
                    {dayAvg('weight_middle')}
                  </td>
                )}
                <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#1e293b', borderRight: `1px solid ${C.border}` }}>
                  {dayAvg('weight_rear')}
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center', borderRight: `1px solid ${C.border}` }}>
                  {dayAvg('avg') ? (
                    <span style={{ display: 'inline-block', backgroundColor: '#334155', color: '#ffffff', borderRadius: '4px', padding: '2px 7px', fontWeight: 700, fontSize: '12px' }}>
                      {dayAvg('avg')}
                    </span>
                  ) : ''}
                </td>
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${C.border}` }} />
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1e293b', fontSize: '13px', borderRight: `1px solid ${C.border}` }}>
                  {totalCartons.toLocaleString()}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1e293b', fontSize: '13px', borderRight: `1px solid ${C.border}` }}>
                  {totalBottles.toLocaleString()}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center', borderRight: `1px solid ${C.border}` }}>
                  <span style={{ display: 'inline-block', backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '4px', padding: '2px 8px', fontWeight: 700, fontSize: '12px' }}>
                    {avgEff}%
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', padding: '10px 14px', borderTop: `1px solid ${C.border}`, backgroundColor: '#fafafa' }}>
          {savedFlags[dateKey] && (
            <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 600 }}>
              Saved for {dateLabel}
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            style={{
              backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px',
              padding: '7px 22px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.01em', transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};