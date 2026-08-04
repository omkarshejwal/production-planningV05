import React from 'react';
import { Truck, FileText, CheckCircle2, Plus, Clock } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { StatusBadge, ColorBadge } from '../common/StatusBadge';
import { formatNumber } from '../../utils/calculations';

export const DispatchModule: React.FC = () => {
  const { dispatchOrders } = useERP();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dispatch Logistics & Gate Pass Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pallet Scans, Truck Loading Verification & Gate Pass Generation
          </p>
        </div>
        <button
          onClick={() => alert('New Dispatch Schedule Created')}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Schedule Dispatch Order
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
            Outbound Dispatch Schedule (August 2026)
          </h3>
          <span className="text-xs text-slate-500">Warehouse Dock #4 Active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
              <tr>
                <th className="p-3">Dispatch #</th>
                <th className="p-3">Customer Name</th>
                <th className="p-3">Bottle Product</th>
                <th className="p-3">Color</th>
                <th className="p-3 text-right">Pallets Count</th>
                <th className="p-3 text-right">Total Pcs</th>
                <th className="p-3">Truck Number</th>
                <th className="p-3">Driver Name</th>
                <th className="p-3 font-mono">Gate Pass No</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {dispatchOrders.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-bold font-mono text-blue-700">{d.dispatchNo}</td>
                  <td className="p-3 font-semibold">{d.customerName}</td>
                  <td className="p-3">{d.bottleName}</td>
                  <td className="p-3">
                    <ColorBadge color={d.bottleColor} />
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">{d.palletsCount} Pallets</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">
                    {formatNumber(d.totalQuantityPcs)} pcs
                  </td>
                  <td className="p-3 font-mono font-bold text-slate-800">{d.truckNumber}</td>
                  <td className="p-3">{d.driverName}</td>
                  <td className="p-3 font-mono text-slate-600">{d.gatePassNo}</td>
                  <td className="p-3">{d.dispatchDate}</td>
                  <td className="p-3">
                    <StatusBadge status={d.status} />
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
