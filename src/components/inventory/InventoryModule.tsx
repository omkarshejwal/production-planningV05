import React from 'react';
import { Boxes, AlertTriangle, ArrowUpRight, Package, Plus } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatNumber } from '../../utils/calculations';

export const InventoryModule: React.FC = () => {
  const { inventory } = useERP();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Batch House Raw Materials & Finished Goods Inventory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Silica Sand Silos, Soda Ash, Factory Cullet Yard & Palletized Finished Goods
          </p>
        </div>
        <button
          onClick={() => alert('Add Inventory Item Triggered')}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add Stock Entry
        </button>
      </div>

      {/* Raw Materials Inventory Cards & Stock Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {inventory.map((item) => (
          <div
            key={item.id}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 hover:border-blue-300 transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">{item.code}</span>
                <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
              </div>
              <StatusBadge status={item.status} />
            </div>

            <div className="flex items-baseline justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div>
                <p className="text-[10px] text-slate-400">Current Stock</p>
                <p className="text-lg font-bold text-slate-900 font-mono">
                  {formatNumber(item.stockQuantity)} <span className="text-xs text-slate-500">{item.unit}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Min Reorder Level</p>
                <p className="text-xs font-semibold text-slate-600 font-mono">{formatNumber(item.minReorderLevel)} {item.unit}</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Location: <b className="text-slate-800">{item.location}</b></span>
              <span className="text-blue-600 font-semibold">{item.category}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
