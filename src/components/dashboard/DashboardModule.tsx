import React from 'react';
import {
  Factory,
  Target,
  TrendingUp,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Activity,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useERP } from '../../context/ERPContext';
import { formatNumber, formatDecimal } from '../../utils/calculations';
import { StatusBadge, PriorityBadge } from '../common/StatusBadge';

const PRODUCTION_TREND_DATA = [
  { day: '01 Aug', actualTons: 410, targetTons: 450, efficiency: 91.1 },
  { day: '02 Aug', actualTons: 435, targetTons: 450, efficiency: 96.6 },
  { day: '03 Aug', actualTons: 442, targetTons: 450, efficiency: 98.2 },
  { day: '04 Aug', actualTons: 428, targetTons: 450, efficiency: 95.1 },
  { day: '05 Aug', actualTons: 448, targetTons: 450, efficiency: 99.5 },
  { day: '06 Aug', actualTons: 430, targetTons: 450, efficiency: 95.5 },
  { day: '07 Aug', actualTons: 452, targetTons: 450, efficiency: 100.4 },
];

const MACHINE_UTILIZATION_DATA = [
  { name: 'Mac 1 (IS-8)', utilization: 91.4, oee: 89.5 },
  { name: 'Mac 2 (IS-10)', utilization: 96.2, oee: 92.1 },
  { name: 'Mac 3 (IS-8)', utilization: 88.0, oee: 86.8 },
  { name: 'Mac 4 (IS-12)', utilization: 94.8, oee: 90.4 },
  { name: 'Mac 5 (IS-8)', utilization: 0.0, oee: 0.0 },
  { name: 'Mac 6 (IS-10)', utilization: 72.5, oee: 68.0 },
];

const BOTTLE_TYPE_DATA = [
  { name: 'Wine (750ml)', value: 35, color: '#2563EB' },
  { name: 'Beer (330ml)', value: 28, color: '#D97706' },
  { name: 'Water & Bev', value: 18, color: '#059669' },
  { name: 'Spirits (700ml)', value: 12, color: '#4F46E5' },
  { name: 'Pharma & Food', value: 7, color: '#0891B2' },
];

const DOWNTIME_ANALYSIS_DATA = [
  { reason: 'Mold Change', hours: 14.5 },
  { reason: 'Feeder Temp Drop', hours: 6.2 },
  { reason: 'Shear Blade Fault', hours: 4.8 },
  { reason: 'Cold End Jam', hours: 3.5 },
  { reason: 'Annealing Lehr', hours: 2.1 },
];

export const DashboardModule: React.FC = () => {
  const { machines, jobs, setActiveModule, openDrawerForEdit } = useERP();

  const runningCount = machines.filter((m) => m.status === 'Running').length;
  const stoppedCount = machines.filter((m) => m.status === 'Stopped' || m.status === 'Maintenance').length;
  const pendingJobsCount = jobs.filter((j) => j.status === 'Pending').length;
  const completedJobsCount = jobs.filter((j) => j.status === 'Completed').length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1920px] mx-auto animate-in fade-in duration-200">
      {/* Top Welcome & Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Vitrum Glass Furnace & IS Line Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Plant Line Status • Active Furnace Tonnage: 450 Tons/Day Target
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Furnace #2 Active (1185°C)
          </span>
          <button
            onClick={() => setActiveModule('Production Planning')}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            Open Production Planning Sheet →
          </button>
        </div>
      </div>

      {/* Top Row: KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* KPI 1 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Today's Prod</span>
            <Factory className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg font-bold text-slate-900 leading-tight">442.5 T</p>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-1">
            <ArrowUpRight className="w-3 h-3" /> +3.2% vs yesterday
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Target Prod</span>
            <Target className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-lg font-bold text-slate-900 leading-tight">450.0 T</p>
          <p className="text-[10px] text-slate-400 mt-1">Daily Melt Budget</p>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Efficiency</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-emerald-600 leading-tight">98.3%</p>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-1">
            <ArrowUpRight className="w-3 h-3" /> Above 95% SLA
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Running Mac</span>
            <Cpu className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg font-bold text-blue-600 leading-tight">{runningCount}</p>
          <p className="text-[10px] text-slate-400 mt-1">Out of {machines.length} Lines</p>
        </div>

        {/* KPI 5 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Stopped Mac</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-lg font-bold text-amber-600 leading-tight">{stoppedCount}</p>
          <p className="text-[10px] text-slate-400 mt-1">1 Maint / 1 Standby</p>
        </div>

        {/* KPI 6 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Pending Jobs</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-lg font-bold text-slate-800 leading-tight">{pendingJobsCount}</p>
          <p className="text-[10px] text-slate-400 mt-1">Queued in Plan</p>
        </div>

        {/* KPI 7 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-emerald-600 leading-tight">{completedJobsCount}</p>
          <p className="text-[10px] text-slate-400 mt-1">Jobs Finished</p>
        </div>

        {/* KPI 8 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500">Glass Waste</span>
            <Flame className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-lg font-bold text-slate-900 leading-tight">3.8%</p>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-1">
            <ArrowDownRight className="w-3 h-3" /> -0.4% Cullet recycled
          </div>
        </div>
      </div>

      {/* Second Row: Analytical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Chart 1: Production Trend */}
        <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Production Trend (Tons / Day)</h3>
              <p className="text-[11px] text-slate-500">Daily Actual Melt Tonnage vs Target Budget</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
              Aug 2026
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PRODUCTION_TREND_DATA}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#64748B" />
                <YAxis domain={[380, 480]} tick={{ fontSize: 11 }} stroke="#64748B" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    color: '#FFF',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area
                  type="monotone"
                  dataKey="actualTons"
                  name="Actual Tonnage (T)"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorActual)"
                />
                <Area
                  type="monotone"
                  dataKey="targetTons"
                  name="Target Budget (450T)"
                  stroke="#94A3B8"
                  strokeDasharray="4 4"
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Machine Utilization */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Machine Utilization %</h3>
            <span className="text-[10px] text-slate-400">IS Line OEE</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MACHINE_UTILIZATION_DATA} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#64748B" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} stroke="#64748B" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    color: '#FFF',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="utilization" name="Utilization %" fill="#2563EB" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Bottle Type Distribution */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Bottle Category %</h3>
            <span className="text-[10px] text-slate-400">Share</span>
          </div>
          <div className="h-64 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={BOTTLE_TYPE_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {BOTTLE_TYPE_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-600 mt-1">
              {BOTTLE_TYPE_DATA.map((item) => (
                <span key={item.name} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Third Row: Production Orders & Machine Live Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1 & 2: Recent Production Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">Active Production Orders</h3>
            </div>
            <button
              onClick={() => setActiveModule('Production Planning')}
              className="text-xs text-blue-600 font-semibold hover:underline"
            >
              View Full Plan →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-2.5">Job #</th>
                  <th className="p-2.5">Customer</th>
                  <th className="p-2.5">Machine</th>
                  <th className="p-2.5">Gross Target</th>
                  <th className="p-2.5">Draw (T/d)</th>
                  <th className="p-2.5">Priority</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => openDrawerForEdit(j)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="p-2.5 font-bold text-blue-700">{j.jobNumber}</td>
                    <td className="p-2.5">{j.customerName}</td>
                    <td className="p-2.5 font-mono">{j.machineId}</td>
                    <td className="p-2.5 font-mono font-bold">{formatNumber(j.grossQuantity)}</td>
                    <td className="p-2.5 font-mono">{j.drawTonsPerDay} T</td>
                    <td className="p-2.5">
                      <PriorityBadge priority={j.priority} />
                    </td>
                    <td className="p-2.5">
                      <StatusBadge status={j.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Column 3: Live IS Machine Quick Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">IS Machines Status</h3>
            </div>
            <button
              onClick={() => setActiveModule('Machines')}
              className="text-xs text-blue-600 font-semibold hover:underline"
            >
              All Machines
            </button>
          </div>

          <div className="space-y-2.5">
            {machines.map((m) => (
              <div
                key={m.id}
                className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{m.name}</p>
                    <span className="text-[10px] text-slate-400 font-mono">({m.code})</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Gob Speed: <span className="font-semibold text-slate-800">{m.gobCutSpeed} cut/m</span> • Feeder:{' '}
                    <span className="font-semibold text-slate-800">{m.feederTemperatureC}°C</span>
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={m.status} />
                  <p className="text-[10px] text-slate-400 font-mono mt-1">OEE: {m.oeePercent}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
