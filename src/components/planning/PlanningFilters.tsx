import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Filter, Printer, RefreshCw } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { exportToCSV, printPage } from '../../utils/calculations';

interface PlanningFiltersProps {
  onRefresh?: () => void;
}

export const PlanningFilters: React.FC<PlanningFiltersProps> = ({ onRefresh }) => {
  const { selectedMonth, jobs, setSelectedMonth, setFromDate, setToDate } = useERP();

  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLabel = useMemo(() => new Date(year, month - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  }), [month, year]);

  const [fromDate, setFrom] = useState(`${selectedMonth}-01`);
  const [toDate, setTo] = useState(`${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`);

  const updateMonthSelection = (nextMonth: string) => {
    setSelectedMonth(nextMonth);
    const [nextYear, nextMonthNumber] = nextMonth.split('-').map(Number);
    const nextDaysInMonth = new Date(nextYear, nextMonthNumber, 0).getDate();
    const nextStart = `${nextMonth}-01`;
    const nextEnd = `${nextMonth}-${String(nextDaysInMonth).padStart(2, '0')}`;
    setFrom(nextStart);
    setTo(nextEnd);
    setFromDate(nextStart);
    setToDate(nextEnd);
  };

  const handleApply = () => {
    setFromDate(fromDate);
    setToDate(toDate);
  };

  const handleReset = () => {
    const resetStart = `${selectedMonth}-01`;
    const resetEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    setFrom(resetStart);
    setTo(resetEnd);
    setFromDate('');
    setToDate('');
  };

  const goToPreviousMonth = () => {
    const [currentYear, currentMonth] = selectedMonth.split('-').map(Number);
    const previousDate = new Date(currentYear, currentMonth - 2, 1);
    const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
    updateMonthSelection(previousMonth);
  };

  const goToNextMonth = () => {
    const [currentYear, currentMonth] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(currentYear, currentMonth, 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    updateMonthSelection(nextMonth);
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
            {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <ChevronLeft size={14} /> Previous Month
          </button>
          <button
            onClick={() => updateMonthSelection(selectedMonth)}
            className="h-9 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            Current Month
          </button>
          <button
            onClick={goToNextMonth}
            className="h-9 flex items-center gap-1.5 px-3 text-sm font-medium border border-[#E5E7EB] rounded bg-white text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            Next Month <ChevronRight size={14} />
          </button>
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
