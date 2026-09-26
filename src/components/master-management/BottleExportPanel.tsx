import React, { useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { planningRepository } from '../../services/planningRepository';

/**
 * Export Bottle — read-only view of the Bottle Master tab.
 *
 * Exports the bottle list to .xlsx for one machine or for every machine. The
 * data is read from the database on every export (never from the panel's
 * cached props), so the spreadsheet always reflects the latest committed rows:
 *   - production.bottle_master        → Bottle ID, Bottle Name
 *   - production.bottle_configuration → which machine(s) each bottle is set up
 *     on, plus its weight and speeds per section
 *
 * bottle_configuration holds one row per (machine, bottle, SECTION). Weight and
 * Cut/Speed are reported from the HIGHEST configured section of each
 * machine-bottle pair, because that is the section the Entered Cut/Min lives on
 * (see the Bottle Master form, where the top section is the base value and the
 * lower ones are derived from it). The highest section is resolved
 * independently for every machine, so a bottle set up on Machine 1 and
 * Machine 2 reports each machine's own values. No averaging, and never the
 * first row encountered.
 *
 * This panel only ever reads: no bottle master or configuration row is created
 * or modified, so exporting can never produce a duplicate bottle.
 */

/** Machine choices. 'all' spans every machine. */
const EXPORT_MACHINE_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Machine 1' },
  { value: '2', label: 'Machine 2' },
  { value: '3', label: 'Machine 3' },
  { value: '4', label: 'Machine 4' },
  { value: 'all', label: 'All Machine' },
];

/** machine_master.machine_no is an integer (1-4) but reaches the UI as "MAC-01". */
const machineNoToInt = (machineNo: string): number => parseInt(machineNo.replace(/\D/g, ''), 10);

/** Numeric-aware bottle id ordering (ids are integers in the DB). */
const compareBottleId = (a: string, b: string): number => {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
};

export const BottleExportPanel: React.FC = () => {
  const [exportMachine, setExportMachine] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  const isAll = exportMachine === 'all';

  async function handleExport() {
    if (exporting) return;
    if (!exportMachine) {
      alert('Select a machine to export.');
      return;
    }

    setExporting(true);
    try {
      const all = exportMachine === 'all';
      const selected = all ? undefined : parseInt(exportMachine, 10);
      const scopeLabel = all ? 'all machines' : `Machine ${exportMachine}`;

      // Always read the latest committed rows straight from the API.
      const data = await planningRepository.fetchBottleExportData(selected);
      if (!data.ok) {
        alert(data.error || `Failed to fetch bottle data for ${scopeLabel}.`);
        return;
      }

      const nameById = new Map(data.bottles.map((b) => [b.bottle_id, b.bottle_name]));

      // A bottle is configured per SECTION, so the same (machine, bottle) pair
      // appears once per section in bottle_configuration. Collapse those into a
      // single association row per machine and bottle, keeping the values from
      // the HIGHEST section of that pair (section is part of the composite
      // primary key, so a pair can never contain the same section twice).
      const associations = new Map<
        string,
        {
          bottleId: string;
          bottleName: string;
          machine: number;
          section: number;
          weight: number;
          speeds: number;
        }
      >();
      for (const c of data.configs) {
        const bottleName = nameById.get(c.bottle_id);
        // Skip a configuration with no matching bottle_master row: the export
        // needs a Bottle Name, so there would be nothing meaningful to show.
        if (bottleName === undefined) continue;
        const machine = machineNoToInt(c.machine_no);
        if (isNaN(machine)) continue;
        const key = `${c.machine_no}|${c.bottle_id}`;
        const existing = associations.get(key);
        if (existing && existing.section >= c.section) continue;
        associations.set(key, {
          bottleId: c.bottle_id,
          bottleName,
          machine,
          section: c.section,
          weight: c.weight,
          speeds: c.speeds,
        });
      }

      const rows = [...associations.values()].sort(
        (a, b) => compareBottleId(a.bottleId, b.bottleId) || a.machine - b.machine
      );

      if (rows.length === 0) {
        alert(
          all
            ? 'No bottles are configured on any machine. There is nothing to export.'
            : `No bottles are configured on Machine ${exportMachine}. There is nothing to export.`
        );
        return;
      }

      // Lazy-load ExcelJS so it stays out of the initial bundle, the same way
      // the Production Planning export does it.
      const exceljsModule: any = await import('exceljs');
      const ExcelJS = exceljsModule.Workbook ? exceljsModule : exceljsModule.default;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(all ? 'All Machines' : `Machine ${exportMachine}`);
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Single machine → Bottle ID + Bottle Name + Weight + Cut/Speed.
      // All machines   → the same, plus Machine No. (a bottle set up on several
      //                 machines is listed once per machine, each with its own
      //                 highest-section weight and speed).
      worksheet.addRow(
        all
          ? ['Bottle ID', 'Bottle Name', 'Machine No.', 'Weight', 'Cut/Speed']
          : ['Bottle ID', 'Bottle Name', 'Weight', 'Cut/Speed']
      );

      for (const r of rows) {
        const idNum = Number(r.bottleId);
        const idCell = isNaN(idNum) ? r.bottleId : idNum;
        worksheet.addRow(
          all
            ? [idCell, r.bottleName, `Machine ${r.machine}`, r.weight, r.speeds]
            : [idCell, r.bottleName, r.weight, r.speeds]
        );
      }

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.height = 22;

      const gridBorder = {
        top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
      };
      worksheet.eachRow((row: { eachCell: (arg0: (cell: any) => void) => void; }) => {
        row.eachCell((cell) => {
          cell.border = gridBorder;
        });
      });

      // Widths follow the column order above, so Machine No. only occupies a
      // slot in the all-machines layout.
      const widths = all ? [14, 42, 16, 12, 14] : [14, 42, 12, 14];
      widths.forEach((w, i) => {
        worksheet.getColumn(i + 1).width = w;
      });

      const filename = all
        ? 'Bottle_Master_All_Machines.xlsx'
        : `Bottle_Master_Machine_${exportMachine}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(
        all
          ? `Exported ${rows.length} machine-bottle association${rows.length === 1 ? '' : 's'} to ${filename}.`
          : `Exported ${rows.length} bottle${rows.length === 1 ? '' : 's'} for Machine ${exportMachine} to ${filename}.`
      );
    } catch (err) {
      console.error('Bottle export failed:', err);
      alert(
        `Export failed: ${err instanceof Error ? err.message : 'unexpected error while generating the Excel file.'}`
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-5">
        <div className="flex flex-col gap-1.5 w-full max-w-90">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine</label>
          <div className="relative">
            <select
              value={exportMachine}
              onChange={(e) => setExportMachine(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer pr-8"
            >
              <option value="">Select machine...</option>
              {EXPORT_MACHINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60">
              <ChevronDown className="w-4 h-4" />
            </span>
          </div>
          <p className="text-[10px] text-gray-400">
            {isAll
              ? 'One row per machine-bottle configuration, across all machines. Weight and Cut/Speed come from the highest section configured on each machine.'
              : exportMachine
                ? 'Only bottles configured on the selected machine are exported. Weight and Cut/Speed come from the highest section configured on it.'
                : 'Choose a machine to enable the export.'}
          </p>
        </div>
      </div>

      <div className="flex justify-end items-center gap-2 pt-4">
        <button
          type="button"
          onClick={handleExport}
          disabled={!exportMachine || exporting}
          className={`flex items-center gap-1.5 px-5 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${!exportMachine || exporting
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </div>
  );
};
