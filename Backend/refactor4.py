import re

file_path = "D:\\New folder\\Vitrum_Production_Planning\\src\\components\\planning\\ProductionPlanningPage.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add imports
if "import { useERP }" not in content:
    content = content.replace("import { DateRow, MachineEntry, MachineLists, CompletedJobMap, EditSavePayload } from '../../types/planning';",
                              "import { DateRow, MachineEntry, MachineLists, CompletedJobMap, EditSavePayload, ProductionJobRow } from '../../types/planning';\nimport { useERP } from '../../context/ERPContext';\nimport { planningRepository } from '../../services/planningRepository';")

# 2. Add useERP and mapping logic
if "const { jobs, bottles } = useERP();" not in content:
    start_str = "export const ProductionPlanningPage: React.FC = () => {"
    insert_str = """
  const { jobs, bottles, refreshPlanner } = useERP();

  // Date rows are fixed; each machine owns an independent flat array.
  const [dateRows] = useState<DateRow[]>(INITIAL_DATE_ROWS);
  const [machineLists, setMachineLists] = useState<MachineLists>(INITIAL_MACHINE_LISTS);
  const [completedJobMap, setCompletedJobMap] = useState<CompletedJobMap>({});

  // Fetch initial data from DB instead of localStorage
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

      const packagingRows = (job as any).packaging || [];
      const packAllocations: Record<string, number> = {};
      let packCat = '';
      let palletPacking = false;
      let palletQty = null;
      for (const p of packagingRows) {
         packAllocations[p.packaging_type] = p.quantity;
         packCat = p.packaging_type;
         if (p.pallet_packing) {
             palletPacking = true;
             palletQty = p.pallet_quantity;
         }
      }

      const entry: MachineEntry = {
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
        status: (job.lifecycleStatus === 'COMPLETED' || (job as any).status === 'Completed') ? 'completed' : 'running',
        packingAllocations: packAllocations,
        packingCategory: packCat as any,
        palletPacking,
        palletPackingQty: palletQty
      };

      if (entry.status === 'completed') {
        const key = mIdx + "-" + rowIdx;
        if (!newCompleted[key]) newCompleted[key] = [];
        newCompleted[key].push(entry);
      } else {
        newLists[mIdx][rowIdx] = entry;
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

# 3. Replace handleSaveToDb
new_handle_save = """
  const handleSaveToDb = async () => {
    setIsSaving(true);
    try {
      const payloadRows: ProductionJobRow[] = [];
      const _year = 2026;
      const _month = 7; // August

      const calculateChangeover = (mIdx: number, rowIdx: number, startTime: string) => {
         const key = ${mIdx}-;
         const completed = completedJobMap[key];
         if (!completed || completed.length === 0) return 0;
         const lastEnd = completed[completed.length - 1].endTime;
         if (!lastEnd) return 0;
         const startParts = startTime.split(':').map(Number);
         const endParts = lastEnd.split(':').map(Number);
         let diff = (startParts[0] * 60 + startParts[1]) - (endParts[0] * 60 + endParts[1]);
         if (diff < 0) diff += 24 * 60;
         return diff;
      };

      for (let mIdx = 0; mIdx < 4; mIdx++) {
         for (let rowIdx = 0; rowIdx < dateRows.length; rowIdx++) {
            const plan_date = ${String(_year).padStart(4, '0')}--;
            const machine_no = MAC-;
            
            const entriesToSave: MachineEntry[] = [];
            const key = ${mIdx}-;
            if (completedJobMap[key]) {
               entriesToSave.push(...completedJobMap[key]);
            }
            const currentEntry = machineLists[mIdx][rowIdx];
            if (currentEntry && currentEntry.product !== 'None') {
               entriesToSave.push(currentEntry);
            }

            for (const entry of entriesToSave) {
               if (entry.product === 'None') continue;
               const bottle = bottles.find(b => b.name === entry.product);
               if (!bottle) continue;

               const packagingRows: any[] = [];
               if (entry.packingAllocations) {
                  for (const [type, qty] of Object.entries(entry.packingAllocations)) {
                     packagingRows.push({
                        packaging_type: type,
                        quantity: qty,
                        pallet_packing: entry.palletPacking || false,
                        pallet_quantity: entry.palletPackingQty || null
                     });
                  }
               } else if (entry.packingCategory) {
                   packagingRows.push({
                        packaging_type: entry.packingCategory,
                        quantity: entry.qty,
                        pallet_packing: entry.palletPacking || false,
                        pallet_quantity: entry.palletPackingQty || null
                   });
               }

               const changeover = entry.status === 'running' ? calculateChangeover(mIdx, rowIdx, entry.startTime || '07:00') : 0;

               const metrics = calcProductionMetrics(entry.cut, entry.wt, mIdx + 1);
               const hourlyQty = metrics.totalQuantity / 24;
               const segmentHours = hourlyQty > 0 ? entry.qty / hourlyQty : 0;

               const startParts = (entry.startTime || '07:00').split(':').map(Number);
               const startMins = startParts[0] * 60 + startParts[1];
               const totalMins = startMins + (segmentHours * 60);
               
               let estCompletion = '';
               if (entry.endTime) {
                  estCompletion = entry.endTime;
               } else {
                  const ch = Math.floor(totalMins / 60) % 24;
                  const cm = Math.round(totalMins % 60);
                  estCompletion = ${String(ch).padStart(2, '0')}:;
               }

               payloadRows.push({
                  plan_date,
                  machine_no,
                  bottle_id: bottle.id,
                  section: entry.section || (mIdx === 0 || mIdx === 3 ? 8 : 10),
                  weight: entry.wt,
                  speeds: entry.cut,
                  draw: entry.draw,
                  quantity: entry.qty,
                  production_hours: Number(segmentHours.toFixed(2)),
                  start_time: entry.startTime || '07:00',
                  estimated_completion: estCompletion,
                  completion_time: entry.status === 'completed' ? (entry.endTime || estCompletion) : undefined,
                  changeover_minutes: changeover,
                  status: entry.status === 'completed' ? 'Completed' : 'Planned',
                  packaging: packagingRows
               } as any);
            }
         }
      }

      await planningRepository.createProductionJobsBatch(payloadRows as any);
      refreshPlanner();
      setIsDirty(false);
      toast.success('Production data saved successfully to AWS Database.', { duration: 3000 });
    } catch (e) {
      console.error(e);
      toast.error('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
"""
content = re.sub(
    r"const handleSaveToDb = async \(\) => \{[\s\S]*?\};",
    new_handle_save.strip(),
    content
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Refactor complete!")
