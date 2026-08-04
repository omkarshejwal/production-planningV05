import React, { useState } from 'react';
import {
  Printer,
  FileSpreadsheet,
  RotateCw,
  Plus,
  Filter,
  X,
  Search,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { exportToCSV, printPage } from '../../utils/calculations';

interface PlanningFiltersProps {
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  machineFilter: string;
  setMachineFilter: (m: string) => void;
  colorFilter: string;
  setColorFilter: (c: string) => void;
  customerFilter: string;
  setCustomerFilter: (cust: string) => void;
  onRefresh: () => void;
}

export const PlanningFilters: React.FC<PlanningFiltersProps> = ({
  statusFilter,
  setStatusFilter,
  machineFilter,
  setMachineFilter,
  colorFilter,
  setColorFilter,
  customerFilter,
  setCustomerFilter,
  onRefresh,
}) => {
  const {
    selectedMonth,
    setSelectedMonth,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    machines,
    bottles,
    openDrawerForEdit,
    planningEntries,
  } = useERP();

  const [showFilters, setShowFilters] = useState(true);

  // Handle Export Excel / CSV
  const handleExportExcel = () => {
    const headers = [
      'Date',
      'Machine',
      'Bottle Name',
      'Color',
      'Drawing #',
      'Section',
      'Weight (g)',
      'Cut/min',
      'Day Quantity (pcs)',
      'Draw (Tons/day)',
      'Status',
    ];

    const rows = planningEntries.map((e) => [
      e.date,
      e.machineId,
      e.bottleName,
      e.bottleColor,
      e.drawingNumber,
      e.section,
      e.weightGrams,
      e.cutPerMin,
      e.dayQuantity,
      e.drawTons,
      e.status,
    ]);

    exportToCSV(`Vitrum_Glass_Production_Plan_${selectedMonth}`, headers, rows);
  };

  const handleApplyDate = () => {
    // Dates are bound to state, table reacts automatically
  };

  const handleResetDate = () => {
    setFromDate('2026-08-01');
    setToDate('2026-08-31');
    setStatusFilter('');
    setMachineFilter('');
    setColorFilter('');
    setCustomerFilter('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-2xs mb-4">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Production Planning</h1>
            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-semibold border border-blue-200">
              August 2026 — Current Month
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            IS Machine Glass Furnace Draw & Daily Production Matrix
          </p>
        </div>

        {/* Right Top Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={printPage}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>

          <button
            onClick={onRefresh}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" /> Refresh
          </button>

          <button
            onClick={() => openDrawerForEdit(null)}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Production Job
          </button>
        </div>
      </div>

      {/* Date Filter & Month Selector Row */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-blue-600" /> Filters
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 font-semibold text-slate-800"
            >
              <option value="2026-08">August 2026 (Current)</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-10">October 2026</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">From Date:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 font-medium text-slate-800"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">To Date:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 font-medium text-slate-800"
            />
          </div>

          <button
            onClick={handleApplyDate}
            className="px-3 py-1 bg-blue-600 text-white rounded-md font-bold hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>

          <button
            onClick={handleResetDate}
            className="px-2.5 py-1 text-slate-600 border border-slate-300 bg-white rounded-md font-medium hover:bg-slate-100 transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Machine & Status multi-filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-700 font-medium"
          >
            <option value="">All Machines ({machines.length})</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-700 font-medium"
          >
            <option value="">All Statuses</option>
            <option value="Running">Running (Blue)</option>
            <option value="Completed">Completed (Green)</option>
            <option value="Pending">Pending (Gray)</option>
            <option value="Changeover">Changeover (Orange)</option>
          </select>

          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-700 font-medium"
          >
            <option value="">All Bottle Colors</option>
            <option value="Flint">Flint (Clear)</option>
            <option value="Amber">Amber</option>
            <option value="Emerald Green">Emerald Green</option>
            <option value="Cobalt Blue">Cobalt Blue</option>
            <option value="Olive Green">Olive Green</option>
          </select>
        </div>
      </div>
    </div>
  );
};
