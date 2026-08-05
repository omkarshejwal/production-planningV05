import React, { useState } from 'react';
import { Download, Filter, Printer, RefreshCw } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { exportToCSV, printPage } from '../../utils/calculations';

interface PlanningFiltersProps {
  onRefresh?: () => void;
}

export const PlanningFilters: React.FC<PlanningFiltersProps> = ({ onRefresh }) => {
  const { selectedMonth, jobs, setFromDate, setToDate } = useERP();

  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const [fromDate, setFrom] = useState(`${selectedMonth}-01`);
  const [toDate, setTo] = useState(`${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`);

  const handleApply = () => {
    setFromDate(fromDate);
    setToDate(toDate);
  };

  const handleReset = () => {
    setFrom(`${selectedMonth}-01`);
    setTo(`${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`);
    setFromDate('');
    setToDate('');
  };

  const handleExport = () => {
    exportToCSV(
      'production_register',
      ['Date', 'Machine', 'Bottle ID', 'Section', 'Weight (g)', 'Cut', 'Qty', 'Draw (T)'],
      jobs.map((j) => [
        j.date || j.startDate,
        j.machineId,
        j.bottleId,
        j.sectionCount,
        j.weightGrams,
        j.cutPerMin,
        j.productionQuantity || j.grossQuantity,
        j.drawTonsPerDay,
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Production Planning</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            {monthLabel} &mdash; Current Month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={printPage}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <Printer size={14} /> Print
          </button>
          <button
            onClick={handleExport}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <Download size={14} /> Export
          </button>
          <button
            onClick={onRefresh}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[#6B7280]" />
          <span className="text-sm font-semibold text-[#374151]">Filters</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 px-2.5 text-sm border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 px-2.5 text-sm border border-[#E5E7EB] rounded bg-white text-[#111827] focus:outline-none focus:border-[#2563EB]"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleApply}
              className="h-9 px-4 text-sm font-semibold bg-[#2563EB] text-white rounded hover:bg-[#1D4ED8] transition-colors">
              Apply
            </button>
            <button
              onClick={handleReset}
              className="h-9 px-4 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
