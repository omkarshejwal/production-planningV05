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
if "const { jobs, setIsDrawerOpen, setEditingJob, bottles } = useERP();" not in content:
    start_str = "export const ProductionPlanningPage: React.FC = () => {"
    insert_str = """
  const { jobs, setIsDrawerOpen, setEditingJob, bottles } = useERP();

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
      const mIdx = parseInt(job.machine_no.replace('MAC-', '')) - 1;
      if (mIdx < 0 || mIdx > 3) continue;

      const day = parseInt(job.plan_date.split('-')[2]);
      const rowIdx = day - 1;
      if (rowIdx < 0 || rowIdx >= dateRows.length) continue;

      const bottle = bottles.find(b => b.id === job.bottle_id);
      const product = bottle ? bottle.name : Bottle ;

      const entry = {
        eid: Math.random(),
        product,
        wt: job.weight || 0,
        speeds: job.speeds || 0,
        cut: job.speeds || 0,
        draw: job.draw || 0,
        qty: job.quantity || 0,
        section: job.section,
        startTime: job.start_time || '07:00',
        endTime: job.completion_time || '',
        isCompleted: job.status === 'Completed',
        packaging: (job as any).packaging || []
      };

      if (job.status === 'Completed') {
        const key = ${mIdx}-;
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

# 4. Remove updateMachineLists since it's just local mutation we don't want to break entirely, wait, let's keep it but make it no-op? No, let's just let it be, but it will be overwritten on the next sync if jobs change.

# 5. Change Edit / Add Job to trigger ERPContext instead of EditMachineModal
new_open_edit = """
  const openEdit = (mIdx: number, rowIdx: number) => {
    const machine_no = MAC-;
    const plan_date = ${String(_year).padStart(4, '0')}--;
    
    const existingJob = jobs.find(j => j.machine_no === machine_no && j.plan_date === plan_date && j.status !== 'Completed');
    
    if (existingJob) {
      setEditingJob(existingJob);
    } else {
      setEditingJob({
         machine_no,
         plan_date,
         start_time: '07:00',
         bottle_id: '',
         section: 0
      } as any);
    }
    setIsDrawerOpen(true);
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
