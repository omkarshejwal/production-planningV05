import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FlaskConical, Search, Check, ChevronDown, Pencil, X } from 'lucide-react';
import { planningRepository } from '../../services/planningRepository';
import { MachineMasterRow, BottleMasterRow, BottleConfigurationRow } from '../../data/planningSchema';
import { useAuth, MODULES } from '../../context/AuthContext';
import { BottleExportPanel } from './BottleExportPanel';

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

/** Tabs of the Bottle Master panel. 'export' is read-only, so it stays
 *  available to viewers; 'new' and 'edit' are only rendered with edit rights.
 *
 *  'new'  - Add New: a bottle is only a name + a shared weight, so no machine
 *           and no cut speeds are asked for here.
 *  'edit' - Edit Machine: per-machine section speeds for a chosen bottle. */
type BottleTab = 'new' | 'edit' | 'export';

/** Parses a free-text weight field into a number, or null when it is blank. */
function parseWeightInput(value: string): number | null {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

export const BottleMasterPanel: React.FC<BottleMasterPanelProps> = ({
  machines,
  bottles,
  configs,
  onRefresh,
}) => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(MODULES.BOTTLE_MASTER, 'edit');
  // Read-only employees (can_edit = FALSE) always start in view mode: the
  // Add/Edit forms, rename and save controls are only rendered with edit
  // permission, so nothing in this panel can modify data for a viewer.
  const [tab, setTab] = useState<BottleTab>(canEdit ? 'new' : 'edit');

  // Add New — the bottle's shared attributes only
  const [formBottleName, setFormBottleName] = useState('');
  const [newWeight, setNewWeight] = useState('');

  // Add New › Edit Bottle Name — renames an existing bottle_master row in place.
  // renameTargetId is the bottle being renamed (its bottle_id never changes),
  // renameValue is the editable name and renameSaved drives the confirmation
  // state of this section's own button so it cannot collide with the
  // Add New bottle save feedback.
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameSaved, setRenameSaved] = useState(false);
  const [renameDropOpen, setRenameDropOpen] = useState(false);
  const [renameQuery, setRenameQuery] = useState('');
  const renameDropRef = useRef<HTMLDivElement>(null);

  // Edit Machine — machine-specific configuration
  const [machineNo, setMachineNo] = useState<string>('');
  const [formRows, setFormRows] = useState<SectionFormRow[]>([]);
  const [formWeight, setFormWeight] = useState('');
  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState<BottleMasterRow | null>(null);
  const [overriddenSections, setOverriddenSections] = useState<Set<number>>(new Set());
  const dropRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rename mode for Edit Machine: editName holds the editable bottle name,
  // originalBaseName is the DB name for revert, origSnapshot captures the
  // section speeds at the moment edits begin so Cancel can restore them.
  const [renaming, setRenaming] = useState(false);
  const [editName, setEditName] = useState('');
  const [originalBaseName, setOriginalBaseName] = useState('');
  const [origSnapshot, setOrigSnapshot] = useState<{ weight: string; rows: SectionFormRow[] } | null>(null);

  const selectedMachine = machines.find((m) => m.machine_no === machineNo) ?? null;

  const renameTarget = useMemo(
    () => bottles.find((b) => b.bottle_id === renameTargetId) ?? null,
    [bottles, renameTargetId]
  );

  // Permissions can change while the app is open (the backend catalog is
  // re-read periodically): fall back to view mode the moment edit is lost.
  // 'export' is exempt - it only reads data, so it stays available to viewers.
  useEffect(() => {
    if (!canEdit && tab !== 'edit' && tab !== 'export') setTab('edit');
  }, [canEdit, tab]);

  // Load the current name of the chosen bottle into the rename box. It keys off
  // the stored name (a string) rather than the row object, so a background
  // refresh cannot wipe what the user is currently typing.
  useEffect(() => {
    setRenameValue(renameTarget ? renameTarget.bottle_name : '');
    setRenameSaved(false);
  }, [renameTargetId, renameTarget?.bottle_name]);

  // Machine-level sections from DB (unique sections across ALL bottles on this machine)
  const machineSections = useMemo(() => {
    if (!machineNo) return [];
    return planningRepository.getMachineSections(machineNo).sort((a, b) => b - a); // descending
  }, [machineNo, machines]);

  const baseSections = useMemo(() => {
    if (!machineNo) return [];
    return planningRepository.getBaseSections(machineNo);
  }, [machineNo]);

  // Pre-index the full configs list once so render-time/effect lookups are O(1)
  // instead of repeatedly scanning the whole list with .find()/.some().
  const configIndex = useMemo(() => {
    const byKey = new Map<string, BottleConfigurationRow>();
    const byMachineBottle = new Map<string, BottleConfigurationRow[]>();
    for (const c of configs) {
      byKey.set(`${c.machine_no}|${c.bottle_id}|${c.section}`, c);
      const mbKey = `${c.machine_no}|${c.bottle_id}`;
      const list = byMachineBottle.get(mbKey);
      if (list) list.push(c);
      else byMachineBottle.set(mbKey, [c]);
    }
    return { byKey, byMachineBottle };
  }, [configs]);

  /**
   * The weight that applies to the selected bottle on the selected machine.
   * bottle_master.weight is the shared source of truth; bottles saved before
   * that column existed fall back to the weight already stored in this
   * machine's bottle_configuration rows.
   */
  const selectedWeight = useMemo<number | null>(() => {
    if (!selectedBase) return null;
    const masterWeight = selectedBase.weight;
    if (typeof masterWeight === 'number' && !isNaN(masterWeight) && masterWeight > 0) {
      return masterWeight;
    }
    const existing = configIndex.byMachineBottle.get(`${machineNo}|${selectedBase.bottle_id}`) ?? [];
    const withWeight = existing.find((c) => c.weight > 0) ?? existing[0];
    return withWeight ? withWeight.weight : null;
  }, [selectedBase, machineNo, configIndex]);

  // bottle_ids that have at least one bottle_configuration row on the selected
  // machine. bottle_configuration is keyed on (machine_no, bottle_id, section),
  // so a Set collapses a bottle configured on several sections of the same
  // machine into a single entry, while a bottle that exists in bottle_master but
  // has no row for this machine is simply absent.
  const machineBottleIds = useMemo(() => {
    const ids = new Set<string>();
    if (!machineNo) return ids;
    for (const c of configs) {
      if (c.machine_no === machineNo) ids.add(c.bottle_id);
    }
    return ids;
  }, [machineNo, configs]);

  // Bottles offered in the Edit Machine picker: joined through
  // bottle_configuration.bottle_id -> bottle_master.bottle_id, so only bottles
  // configured on the currently selected machine appear. The search by name or
  // ID still applies on top of that.
  const filteredBases = useMemo(
    () =>
      bottles
        .filter((b) => machineBottleIds.has(b.bottle_id))
        .filter(
          (b) =>
            b.bottle_name.toLowerCase().includes(query.toLowerCase()) ||
            b.bottle_id.toLowerCase().includes(query.toLowerCase())
        ),
    [bottles, machineBottleIds, query]
  );

  const sortedMachines = useMemo(
    () =>
      [...machines].sort((a, b) => {
        const numA = parseInt(a.machine_no.replace(/\D/g, ''), 10);
        const numB = parseInt(b.machine_no.replace(/\D/g, ''), 10);
        return numA - numB;
      }),
    [machines]
  );

  // The rename dropdown lists every bottle in bottle_master by name.
  const sortedBottles = useMemo(
    () =>
      [...bottles].sort((a, b) =>
        a.bottle_name.localeCompare(b.bottle_name, undefined, { sensitivity: 'base' })
      ),
    [bottles]
  );

  // Search inside the rename dropdown: matches on name or ID, like the
  // Edit Machine bottle picker.
  const renameMatches = useMemo(() => {
    const q = renameQuery.trim().toLowerCase();
    if (!q) return sortedBottles;
    return sortedBottles.filter(
      (b) => b.bottle_name.toLowerCase().includes(q) || b.bottle_id.toLowerCase().includes(q)
    );
  }, [sortedBottles, renameQuery]);

  // Rebuild the section rows once a machine AND a bottle are both chosen, so
  // each machine shows - and saves - only its own configuration for that bottle.
  useEffect(() => {
    if (tab !== 'edit' || !selectedMachine || !selectedBase) {
      setFormRows([]);
      setOrigSnapshot(null);
      setRenaming(false);
      setEditName('');
      setOriginalBaseName('');
      return;
    }

    const bottleId = selectedBase.bottle_id;

    const rows: SectionFormRow[] = machineSections.map((sec) => {
      const existing = configIndex.byKey.get(`${machineNo}|${bottleId}|${sec}`);
      const isBase = baseSections.includes(sec);
      return {
        section: sec,
        weight: '',
        speeds: existing ? String(existing.speeds) : '',
        isBase,
      };
    });

    setFormRows(rows);
    setFormWeight(selectedWeight !== null ? String(selectedWeight) : '');
    setOverriddenSections(new Set());

    // Snapshot the DB values so Cancel can restore them.
    setOrigSnapshot({ weight: selectedWeight !== null ? String(selectedWeight) : '', rows });

    setRenaming(false);
    setEditName('');
    setOriginalBaseName('');

    setSaved(false);
  }, [tab, machineNo, selectedBase, configs, configIndex, machineSections, baseSections, selectedMachine, selectedWeight]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (dropRef.current && !dropRef.current.contains(target)) setDropOpen(false);
      if (renameDropRef.current && !renameDropRef.current.contains(target)) setRenameDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function switchTab(next: BottleTab) {
    setTab(next);
    setMachineNo('');
    setFormBottleName('');
    setNewWeight('');
    setRenameTargetId('');
    setRenameValue('');
    setRenameSaved(false);
    setRenameDropOpen(false);
    setRenameQuery('');
    setFormRows([]);
    setFormWeight('');
    setQuery('');
    setDropOpen(false);
    setSelectedBase(null);
    setOverriddenSections(new Set());
    setSaved(false);
    setRenaming(false);
    setEditName('');
    setOriginalBaseName('');
    setOrigSnapshot(null);
  }

  function selectRenameTarget(bottleId: string) {
    setRenameTargetId(bottleId);
    const next = bottles.find((b) => b.bottle_id === bottleId) ?? null;
    setRenameValue(next ? next.bottle_name : '');
    setRenameSaved(false);
    setRenameDropOpen(false);
    setRenameQuery('');
  }

  /**
   * Renames the selected bottle_master row. The PUT sends the name only, so the
   * backend leaves bottle_id, weight and every bottle_configuration row alone:
   * no new bottle is created and no machine/section/speed data is touched.
   */
  async function handleRenameSave() {
    if (!canEdit || renameSaving || !renameTarget) return;

    const newName = renameValue.trim();
    if (!newName) {
      alert('Bottle name cannot be empty.');
      return;
    }
    if (newName === renameTarget.bottle_name) return;

    const duplicate = bottles.some(
      (b) => b.bottle_name.trim().toLowerCase() === newName.toLowerCase() && b.bottle_id !== renameTarget.bottle_id
    );
    if (duplicate) {
      alert('A bottle with this name already exists.');
      return;
    }

    setRenameSaving(true);
    const result = await planningRepository.updateBottle(parseInt(renameTarget.bottle_id, 10), newName);
    setRenameSaving(false);

    if (!result.ok) {
      alert(result.error || 'Failed to update bottle name.');
      return;
    }

    setRenameValue(newName);
    setRenameSaved(true);
    setTimeout(() => setRenameSaved(false), 2500);
    onRefresh();
  }

  function changeMachine(next: string) {
    setMachineNo(next);
    setQuery('');
    setDropOpen(false);
    setSelectedBase(null);
    setFormRows([]);
    setFormWeight('');
    setSaved(false);
    setRenaming(false);
    setEditName('');
    setOriginalBaseName('');
    setOrigSnapshot(null);
  }

  function selectBottle(b: BottleMasterRow) {
    setSelectedBase(b);
    setQuery('');
    setDropOpen(false);
    setFormWeight('');
    setOverriddenSections(new Set());
    setSaved(false);
    setRenaming(false);
    setEditName('');
    setOriginalBaseName('');
    setOrigSnapshot(null);
  }

  // Enter rename mode. Original values are tracked via origSnapshot.
  function beginRename() {
    if (!selectedBase) return;
    setOriginalBaseName(selectedBase.bottle_name);
    setEditName(selectedBase.bottle_name);
    setRenaming(true);
    setSaved(false);
  }

  function handleCancel() {
    if (!selectedBase || !origSnapshot) return;
    setRenaming(false);
    setEditName('');
    setOriginalBaseName('');
    setFormWeight(origSnapshot.weight);
    setFormRows(origSnapshot.rows.map((r) => ({ ...r })));
    setOverriddenSections(new Set());
    setSaved(false);
  }

  // BPM auto-calculation:
  // User enters BPM for the highest section.
  // Base speed = highest BPM / highest section.
  // Lower sections = base speed × section number.
  // Preserves manually overridden section values.
  function updateHighestBpm(value: string) {
    const numValue = parseFloat(value);

    setFormRows((prev) => {
      if (prev.length === 0) return prev;

      const highestSection = prev[0].section;

      return prev.map((r) => {
        // Highest section keeps the value entered by the user
        if (r.section === highestSection) {
          return { ...r, speeds: value };
        }

        // Preserve manually overridden sections
        if (overriddenSections.has(r.section)) {
          return r;
        }

        if (!isNaN(numValue) && numValue > 0 && highestSection > 0) {
          const speedPerSection = numValue / highestSection;
          const calculated = speedPerSection * r.section;
          const rounded = Math.round(calculated * 100) / 100;

          return {
            ...r,
            speeds: String(rounded),
          };
        }

        return {
          ...r,
          speeds: '',
        };
      });
    });

    setSaved(false);
  }

  // Update a specific section's speed manually — marks it as overridden
  function updateSectionSpeed(section: number, value: string) {
    setFormRows((prev) => {
      if (prev.length === 0) return prev;

      const highestSection = prev[0].section;

      return prev.map((r) => {
        // User is manually editing this section
        if (r.section === section) {
          return { ...r, speeds: value };
        }

        // If highest section is edited, recalculate
        // all non-overridden sections.
        if (section === highestSection) {
          const numValue = parseFloat(value);

          // Preserve manually overridden sections
          if (overriddenSections.has(r.section)) {
            return r;
          }

          if (!isNaN(numValue) && numValue > 0 && highestSection > 0) {
            const speedPerSection = numValue / highestSection;
            const calculated = speedPerSection * r.section;
            const rounded = Math.round(calculated * 100) / 100;

            return {
              ...r,
              speeds: String(rounded),
            };
          }

          return {
            ...r,
            speeds: '',
          };
        }

        return r;
      });
    });

    // Track manual overrides
    const highestSection =
      formRows.length > 0 ? formRows[0].section : null;

    if (section !== highestSection) {
      setOverriddenSections((prev) => {
        const next = new Set(prev);
        const numVal = parseFloat(value);

        if (!isNaN(numVal) && numVal > 0) {
          next.add(section);
        } else {
          next.delete(section);
        }

        return next;
      });
    } else {
      // Highest section is the base value, not an override
      setOverriddenSections((prev) => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
    }

    setSaved(false);
  }

  async function handleSave() {
    if (!canEdit || saving) return;

    // ── Add New: name + shared weight only ───────────────────────────────────
    if (tab === 'new') {
      if (!formBottleName.trim()) return;
      setSaving(true);
      const result = await planningRepository.createBottle(
        formBottleName.trim(),
        parseWeightInput(newWeight)
      );
      setSaving(false);
      if (!result.ok) {
        alert(result.error || 'Failed to create bottle.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setFormBottleName('');
      setNewWeight('');
      onRefresh();
      return;
    }

    // ── Edit Machine: this machine's section speeds for the selected bottle ──
    if (!selectedMachine || !selectedBase) return;
    setSaving(true);

    const machineInt = parseInt(selectedMachine.machine_no.replace(/\D/g, ''), 10);
    const bottleIdInt = parseInt(selectedBase.bottle_id, 10);

    // The weight is a shared bottle attribute: only a positive value is treated
    // as a real change, so clearing the box keeps whatever is already stored
    // instead of overwriting it with 0.
    const weightNum = parseWeightInput(formWeight);
    const hasWeight = weightNum !== null && weightNum > 0;
    const weight = hasWeight ? (weightNum as number) : 0;

    const newName = editName.trim();
    const nameChanged = renaming && newName !== selectedBase.bottle_name;
    const weightChanged = hasWeight && weightNum !== selectedWeight;

    if (renaming && !newName) {
      alert('Bottle name cannot be empty.');
      setSaving(false);
      return;
    }
    if (nameChanged) {
      const duplicate = bottles.some(
        (b) => b.bottle_name.trim().toLowerCase() === newName.toLowerCase() && b.bottle_id !== selectedBase.bottle_id
      );
      if (duplicate) {
        alert('A bottle with this name already exists.');
        setSaving(false);
        return;
      }
    }

    if (nameChanged || weightChanged) {
      // One PUT covers both: bottle_master holds the name and the shared weight.
      const result = await planningRepository.updateBottle(
        bottleIdInt,
        nameChanged ? newName : selectedBase.bottle_name,
        hasWeight ? weightNum : undefined
      );
      if (!result.ok) {
        alert(result.error || (nameChanged ? 'Failed to update bottle name.' : 'Failed to update bottle weight.'));
        setSaving(false);
        return;
      }
      setSelectedBase((prev) =>
        prev
          ? { ...prev, bottle_name: nameChanged ? newName : prev.bottle_name, weight: hasWeight ? (weightNum as number) : prev.weight }
          : prev
      );
    }

    if (renaming) {
      setRenaming(false);
      setEditName('');
      setOriginalBaseName('');
    }

    const rowsToSave = formRows
      .filter((row) => {
        const speeds = parseFloat(row.speeds);
        return !isNaN(speeds) && speeds > 0;
      })
      .map((row) => ({
        machine_no: machineInt,
        bottle_id: bottleIdInt,
        section: row.section,
        weight: isNaN(weight) ? 0 : weight,
        speeds: parseFloat(row.speeds),
      }));

    let allOk = true;
    if (rowsToSave.length > 0) {
      const result = await planningRepository.bulkUpsertBottleConfigurations(rowsToSave);
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
  }

  const isDirty =
    tab === 'edit' &&
    selectedBase !== null &&
    origSnapshot !== null &&
    (renaming ||
      formWeight !== origSnapshot.weight ||
      formRows.some((r, i) => r.speeds !== origSnapshot.rows[i]?.speeds));

  const canSave = !saving && (
    tab === 'new'
      ? formBottleName.trim() !== ''
      : selectedMachine !== null && selectedBase !== null && formRows.length > 0
  );

  const showForm = tab === 'edit' && selectedMachine !== null && selectedBase !== null && formRows.length > 0;

  const saveButton = (
    <button
      onClick={handleSave}
      disabled={!canSave}
      className={`flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${saved
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
  );

  const machineSelect = (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine No.</label>
      <div className="relative">
        <select
          value={machineNo}
          onChange={(e) => changeMachine(e.target.value)}
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer pr-8"
        >
          <option value="">Select machine...</option>
          {sortedMachines.map((m) => (
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
  );

  const bottlePicker = (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bottle Name</label>
      {renaming && selectedBase ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              setSaved(false);
            }}
            autoFocus
            className="w-full h-10 px-3 text-sm border border-blue-400 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          <button
            type="button"
            onClick={handleCancel}
            title="Cancel rename"
            className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div ref={dropRef} className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 z-10">
              <Search className="w-3.5 h-3.5" />
            </span>
            <button
              type="button"
              disabled={!machineNo}
              onClick={() => {
                // Re-opening always lists every bottle configured on this
                // machine; the search box inside the dropdown narrows it down.
                setQuery('');
                setDropOpen((open) => !open);
              }}
              className={`w-full h-10 pl-7 pr-3 text-left text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${selectedBase
                ? 'font-medium text-gray-800 bg-white border-gray-200'
                : 'text-gray-400 bg-white border-gray-200'
                } ${!machineNo ? 'bg-gray-50 cursor-not-allowed' : ''}`}
            >
              {selectedBase
                ? selectedBase.bottle_name
                : machineNo
                  ? 'Select or search bottle...'
                  : 'Select machine first...'}
            </button>
            {dropOpen && (
              <div className="absolute z-20 top-11 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSaved(false);
                    }}
                    placeholder="Search bottle name or ID..."
                    className="w-full h-8 px-2.5 text-sm border border-gray-200 rounded-md bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredBases.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-gray-400">
                      {machineBottleIds.size === 0
                        ? 'No bottles configured for this machine.'
                        : 'No bottles found.'}
                    </p>
                  ) : (
                    filteredBases.map((b) => (
                      <div
                        key={b.bottle_id}
                        className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition ${b.bottle_id === selectedBase?.bottle_id ? 'bg-blue-50' : 'hover:bg-blue-50'
                          }`}
                        onMouseDown={() => selectBottle(b)}
                      >
                        <span className="text-xs font-medium text-gray-800">{b.bottle_name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{b.bottle_id}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {/* {canEdit && selectedBase && (
            <button
              type="button"
              onClick={beginRename}
              title="Rename bottle"
              className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )} */}
        </div>
      )}
    </div>
  );

  const sectionSpeeds = (
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
                className={`flex-1 h-9 px-3 text-sm border rounded-md transition ${isOverridden
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
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm w-full">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
        <span className="text-blue-600"><FlaskConical className="w-5 h-5" /></span>
        <h2 className="text-base font-semibold text-gray-800">Bottle Master</h2>
      </div>

      <div className="flex border-b border-gray-100 px-6">
        {canEdit &&
          (['new', 'edit'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`py-3 px-0 mr-6 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
            >
              {t === 'new' ? 'Add New' : 'Edit Machine'}
            </button>
          ))}
        <button
          onClick={() => switchTab('export')}
          className={`py-3 px-0 mr-6 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'export' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
        >
          Export Bottle
        </button>
      </div>

      {tab === 'export' ? (
        <BottleExportPanel />
      ) : tab === 'new' ? (
        // Add New: a bottle is a name plus the weight every machine shares.
        // Section cut speeds are machine specific and live in Edit Machine.
        <div className="p-6 flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bottle Name</label>
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
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Weight (grams)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 450"
                  value={newWeight}
                  onChange={(e) => {
                    setNewWeight(e.target.value);
                    setSaved(false);
                  }}
                  className="w-full h-10 px-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">g</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            Name and weight are shared by every machine. Set this machine&apos;s section cut speeds in the Edit Machine tab.
          </p>

          {canEdit && (
            <div className="flex justify-end items-center gap-2 pt-2">
              {saveButton}
            </div>
          )}

          {/* Edit Bottle Name: renames an existing bottle in place. Nothing
              below is sent to the server except bottle_name. */}
          <div className="border-t border-gray-100 pt-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="text-blue-600"><Pencil className="w-3.5 h-3.5" /></span>
              <h3 className="text-sm font-semibold text-gray-800">Edit Bottle Name</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Select Existing Bottle
                </label>
                <div ref={renameDropRef} className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 z-10">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      // Re-opening always lists every bottle; the search box
                      // inside the dropdown is what narrows the list down.
                      setRenameQuery('');
                      setRenameDropOpen((open) => !open);
                    }}
                    className={`w-full h-10 pl-7 pr-3 text-left text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${renameTarget
                      ? 'font-medium text-gray-800 bg-white border-gray-200'
                      : 'text-gray-400 bg-white border-gray-200'
                      }`}
                  >
                    {renameTarget ? renameTarget.bottle_name : 'Select or search bottle...'}
                  </button>
                  {renameDropOpen && (
                    <div className="absolute z-20 top-11 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          type="text"
                          autoFocus
                          value={renameQuery}
                          onChange={(e) => setRenameQuery(e.target.value)}
                          placeholder="Search bottle name or ID..."
                          className="w-full h-8 px-2.5 text-sm border border-gray-200 rounded-md bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {renameMatches.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-gray-400">No bottles found.</p>
                        ) : (
                          renameMatches.map((b) => (
                            <div
                              key={b.bottle_id}
                              className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition ${b.bottle_id === renameTargetId ? 'bg-blue-50' : 'hover:bg-blue-50'
                                }`}
                              onMouseDown={() => selectRenameTarget(b.bottle_id)}
                            >
                              <span className="text-xs font-medium text-gray-800">{b.bottle_name}</span>
                              <span className="text-[10px] text-gray-400 font-mono">{b.bottle_id}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Bottle Name
                </label>
                <input
                  type="text"
                  placeholder={renameTarget ? renameTarget.bottle_name : 'Select a bottle to rename'}
                  value={renameValue}
                  disabled={!renameTarget}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameSaved(false);
                  }}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
                <p className="text-[10px] text-gray-400">
                  {renameTarget
                    ? `Only the name is updated. Bottle ID ${renameTarget.bottle_id}, weight and machine configurations stay the same.`
                    : 'Pick an existing bottle to load its current name.'}
                </p>
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end items-center gap-2">
                <button
                  onClick={handleRenameSave}
                  disabled={!renameTarget || renameSaving || renameValue.trim() === '' || renameValue.trim() === renameTarget?.bottle_name}
                  className={`flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${renameSaved
                    ? 'bg-green-50 text-green-600 border border-green-200'
                    : !renameTarget || renameSaving || renameValue.trim() === '' || renameValue.trim() === renameTarget?.bottle_name
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                  {renameSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Saved
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Edit Machine: one machine, one bottle, that machine's own speeds.
        <div className="p-6 flex flex-col gap-5">
          <div className={`grid grid-cols-1 gap-5 ${selectedMachine ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {machineSelect}
            {selectedMachine && bottlePicker}
            {selectedMachine && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Weight (grams, shared by all machines)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 450"
                    value={formWeight}
                    onChange={(e) => {
                      setFormWeight(e.target.value);
                      setSaved(false);
                    }}
                    className="w-full h-10 px-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">g</span>
                </div>
                <p className="text-[10px] text-gray-400">
                  Applied to every machine that runs this bottle.
                </p>
              </div>
            )}
          </div>

          {!selectedMachine && (
            <p className="text-[11px] text-gray-400">
              Select a machine to search for a bottle and set its section cut speeds.
            </p>
          )}

          {showForm && canEdit && sectionSpeeds}

          {canEdit && (
            <div className="flex justify-end items-center gap-2 pt-2">
              {tab === 'edit' && isDirty && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-all duration-200"
                >
                  Cancel
                </button>
              )}
              {saveButton}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
