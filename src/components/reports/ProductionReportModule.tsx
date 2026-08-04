import React from 'react';
import { FileSpreadsheet, Download, Printer, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { formatNumber, printPage, exportToCSV } from '../../utils/calculations';

export const ProductionReportModule: React.FC = () => {
  const { shiftReports, machines } = useERP();

  const handleExport = () => {
    const headers = ['Date', 'Shift', 'Machine', 'Gross Pcs', 'Packed Pcs', 'Rejected Pcs', 'Pack Rate %', 'Top Defect', 'Operator'];
    const rows = shiftReports.map((r) => [
      r.date,
      r.shift,
      r.machineId,
      r.grossPcs,
      r.packedPcs,
      r.rejectedPcs,
      r.packRate,
      r.topDefect,
      r.operatorName,
    ]);
    exportToCSV('Vitrum_Glass_Shift_Production_Reports', headers, rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Shift Production Reports & Pack Rate Register</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Shift A, B, C Gross vs Net Glass Production, Pack Rates & Lehr Annealing Logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={printPage}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
            Active Shift Log Entries (August 2026)
          </h3>
          <span className="text-xs text-slate-500 font-medium">3 Shifts / Day</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Shift</th>
                <th className="p-3">Machine</th>
                <th className="p-3 text-right">Gross Pcs</th>
                <th className="p-3 text-right">Packed Pcs</th>
                <th className="p-3 text-right">Rejected Pcs</th>
                <th className="p-3 text-right">Pack Rate %</th>
                <th className="p-3">Top Rejected Defect</th>
                <th className="p-3 text-center">Gob Temp</th>
                <th className="p-3 text-center">Lehr Temp</th>
                <th className="p-3">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {shiftReports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-bold font-mono">{r.date}</td>
                  <td className="p-3 font-semibold text-blue-700">{r.shift}</td>
                  <td className="p-3 font-mono">{r.machineId}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatNumber(r.grossPcs)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">
                    {formatNumber(r.packedPcs)}
                  </td>
                  <td className="p-3 text-right font-mono text-red-600 font-bold">
                    {formatNumber(r.rejectedPcs)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        r.packRate >= 90
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {r.packRate}%
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 font-medium">{r.topDefect}</td>
                  <td className="p-3 text-center font-mono">{r.gobTempC}°C</td>
                  <td className="p-3 text-center font-mono">{r.lehrTempC}°C</td>
                  <td className="p-3">{r.operatorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
