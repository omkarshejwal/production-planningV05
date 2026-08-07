import re

file_path = "D:\\New folder\\Vitrum_Production_Planning\\src\\components\\planning\\ProductionPlanningPage.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
if "import { useERP }" not in content:
    content = content.replace(
        "import { EditMachineModal } from './EditMachineModal';",
        "import { EditMachineModal } from './EditMachineModal';\nimport { useERP } from '../../context/ERPContext';"
    )
if "makeNoneEntry" in content and "makeEntry" not in content:
    content = content.replace("makeNoneEntry,", "makeNoneEntry, makeEntry,")

# 2. Replace handleSaveToDb
new_handle_save = """
  const handleSaveToDb = async () => {
    // With the new architecture, saving is handled in the PlanningDrawer!
    toast.success('Production data is automatically synced with the AWS Database.', { duration: 3000 });
  };
"""
content = re.sub(
    r"const handleSaveToDb = async \(\) => \{[\s\S]*?\};",
    new_handle_save.strip(),
    content
)

# 3. Add useERP and mapping logic
if "const { jobs, openDrawerForEdit, bottles } = useERP();" not in content:
    start_str = "export const ProductionPlanningPage: React.FC = () => {"
    insert_str = """
  const { jobs, openDrawerForEdit, bottles } = useERP();

  // Date rows are fixed; each machine owns an independent flat array.
  const [dateRows] = useState<DateRow[]>(INITIAL_DATE_ROWS);
  const [machineLists, setMachineLists] = useState<MachineLists>(INITIAL_MACHINE_LISTS);
  const [completedJobMap, setCompletedJobMap] = useState<CompletedJobMap>({});

  // Sync with AWS DB
  React.useEffect(() => {
    const newLists: typeof INITIAL_MACHINE_LISTS = [
      Array.from({ length: dateRows.length }, () => makeNoneEntry(0)),
      Array.from({ length: dateRows.length }, () => makeNoneEntry(1)),
      Array.from({ length: dateRows.length }, () => makeNoneEntry(2)),
      Array.from({ length: dateRows.length }, () => makeNoneEntry(3)),
    ];
    const newCompleted: Record<string, any[]> = {};

    for (const job of jobs) {
      if (!job.machineId || !(job.date || job.startDate)) continue;
      const mIdx = parseInt(job.machineId.replace('MAC-', '')) - 1;
      if (mIdx < 0 || mIdx > 3) continue;

      const planDateStr = job.date || job.startDate;
      const day = parseInt(planDateStr.split('-')[2]);
      const rowIdx = day - 1;
      if (rowIdx < 0 || rowIdx >= dateRows.length) continue;

      const bottle = bottles.find(b => b.id === job.bottleId || b.id === (job as any).bottle_id);
      const product = bottle ? bottle.name : (job.bottleId ? Bottle  : '');

      const entry = {
        eid: Math.random(),
        product,
        wt: job.weightGrams || 0,
        speeds: job.cutPerMin || 0,
        cut: job.cutPerMin || 0,
        draw: job.drawTonsPerDay || 0,
        qty: job.productionQuantity || job.grossQuantity || 0,
        section: job.sectionCount || 0,
        startTime: job.startTime || '07:00',
        endTime: job.expectedEndTime || '',
        isCompleted: job.lifecycleStatus === 'COMPLETED' || (job as any).status === 'Completed',
        packaging: (job as any).packaging || []
      };

      if (entry.isCompleted) {
        const key = mIdx + "-" + rowIdx;
        if (!newCompleted[key]) newCompleted[key] = [];
        newCompleted[key].push(entry);
      } else {
        newLists[mIdx][rowIdx] = entry as any;
      }
    }
    setMachineLists(newLists);
    setCompletedJobMap(newCompleted);
  }, [jobs, bottles, dateRows]);
"""
    # Remove existing useState for these
    content = re.sub(
        r"  const \[dateRows\] = useState<DateRow\[\]>\(INITIAL_DATE_ROWS\);\n  const \[machineLists, setMachineLists\] = useState<MachineLists>\(\(\) => \{[\s\S]*?\}\);\n  const \[completedJobMap, setCompletedJobMap\] = useState<CompletedJobMap>\(\(\) => \{[\s\S]*?\}\);",
        "",
        content
    )
    content = content.replace(start_str, start_str + insert_str)

# 4. Change Edit / Add Job to trigger ERPContext instead of EditMachineModal
new_open_edit = """
  const openEdit = (mIdx: number, rowIdx: number) => {
    const machineId = "MAC-" + String(mIdx + 1).padStart(2, '0');
    const planDate = String(_year).padStart(4, '0') + "-" + String(_month + 1).padStart(2, '0') + "-" + String(rowIdx + 1).padStart(2, '0');
    
    const existingJob = jobs.find(j => j.machineId === machineId && (j.date === planDate || j.startDate === planDate) && j.lifecycleStatus !== 'COMPLETED');
    
    if (existingJob) {
      openDrawerForEdit(existingJob);
    } else {
      openDrawerForEdit({
         machineId,
         date: planDate,
         startDate: planDate,
         startTime: '07:00',
         bottleId: '',
         sectionCount: 0
      } as any);
    }
  };
"""
content = re.sub(
    r"const openEdit = \(mIdx: number, rowIdx: number\) => setEditModal\(\{ mIdx, rowIdx \}\);",
    new_open_edit.strip(),
    content
)

new_handle_add = """
  const handleAddJob = (mIdx: number, rowIdx: number) => {
    openEdit(mIdx, rowIdx);
  };
"""
content = re.sub(
    r"const handleAddJob = \(mIdx: number, rowIdx: number\) => \{[\s\S]*?setEndJobModal\(\{ mIdx, rowIdx \}\);\n\s*\};",
    new_handle_add.strip(),
    content
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Refactor complete!")
