import React from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { StatusBadge } from '../common/StatusBadge';

export const QualityControlModule: React.FC = () => {
  const { qualityInspections } = useERP();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quality Control & Automated Inspection (MCAL)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cold End Dimensional Audit, Hydrostatic Pressure & Thermal Shock Compliance Logs
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 rounded-lg text-xs">
          Pass Rate: 98.4%
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
            Cold End Quality Audit Log
          </h3>
          <span className="text-xs text-slate-400">100% Automated Optical Check</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
              <tr>
                <th className="p-3">Inspection Time</th>
                <th className="p-3">Machine</th>
                <th className="p-3">Bottle Name</th>
                <th className="p-3 text-center">Checks (Finish Crack)</th>
                <th className="p-3 text-center">Blisters</th>
                <th className="p-3 text-center">Stones</th>
                <th className="p-3 text-center">Mold Marks</th>
                <th className="p-3 text-right">Dimension Pass %</th>
                <th className="p-3 text-center">Thermal Shock</th>
                <th className="p-3 text-center">Pressure Test</th>
                <th className="p-3">Inspector</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {qualityInspections.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-900">{q.inspectionTime}</td>
                  <td className="p-3 font-mono">{q.machineId}</td>
                  <td className="p-3 font-semibold text-blue-700">{q.bottleName}</td>
                  <td className="p-3 text-center font-mono text-amber-700">{q.checkDefectCount}</td>
                  <td className="p-3 text-center font-mono">{q.blisterCount}</td>
                  <td className="p-3 text-center font-mono text-red-600 font-bold">{q.stoneCount}</td>
                  <td className="p-3 text-center font-mono">{q.moldMarkCount}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">{q.dimensionPassRate}%</td>
                  <td className="p-3 text-center">
                    {q.thermalShockPassed ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                        PASSED 42°C ΔT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-[10px] font-bold">
                        FAILED
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono font-bold">{q.pressureTestBar} Bar</td>
                  <td className="p-3">{q.inspectorName}</td>
                  <td className="p-3">
                    <StatusBadge status={q.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
