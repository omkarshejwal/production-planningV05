import React from 'react';
import { BottleColor, JobPriority, JobStatus } from '../../types';

interface StatusBadgeProps {
  status?: JobStatus | 'Running' | 'Stopped' | 'Maintenance' | 'Changeover' | 'PASSED' | 'WARNING' | 'REJECTED' | 'Loading' | 'Scheduled' | 'Dispatched' | 'Delivered' | 'In Stock' | 'Low Stock' | 'Critical';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm', className = '' }) => {
  if (!status) return null;

  let bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  switch (status) {
    case 'Running':
    case 'In Stock':
    case 'PASSED':
    case 'Dispatched':
      bgClass = 'bg-blue-50 text-blue-700 border-blue-200';
      dotColor = 'bg-blue-600';
      break;

    case 'Completed':
      bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      dotColor = 'bg-emerald-600';
      break;

    case 'Pending':
    case 'Loading':
    case 'Scheduled':
      bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
      dotColor = 'bg-slate-500';
      break;

    case 'Delivered':
      bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      dotColor = 'bg-emerald-600';
      break;

    case 'Changeover':
    case 'WARNING':
    case 'Low Stock':
      bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
      dotColor = 'bg-amber-500';
      break;

    case 'Stopped':
    case 'Maintenance':
    case 'REJECTED':
    case 'Critical':
      bgClass = 'bg-red-50 text-red-700 border-red-200';
      dotColor = 'bg-red-500';
      break;
  }

  const sizeClass =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs'
      : size === 'md'
      ? 'px-2.5 py-1 text-xs font-medium'
      : 'px-3 py-1.5 text-sm font-semibold';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${bgClass} ${sizeClass} font-medium ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

export const ColorBadge: React.FC<{ color: BottleColor; className?: string }> = ({ color, className = '' }) => {
  let colorStyle = 'bg-slate-100 text-slate-800 border-slate-300';

  switch (color) {
    case 'Flint':
      colorStyle = 'bg-slate-50 text-slate-800 border-slate-300 font-semibold';
      break;
    case 'Amber':
      colorStyle = 'bg-amber-100 text-amber-900 border-amber-300';
      break;
    case 'Emerald Green':
      colorStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300';
      break;
    case 'Cobalt Blue':
      colorStyle = 'bg-indigo-100 text-indigo-900 border-indigo-300';
      break;
    case 'Olive Green':
      colorStyle = 'bg-lime-100 text-lime-900 border-lime-400';
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${colorStyle} ${className}`}
    >
      {color}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: JobPriority }> = ({ priority }) => {
  let style = 'bg-slate-100 text-slate-600 border-slate-200';
  if (priority === 'High') style = 'bg-amber-50 text-amber-700 border-amber-200';
  if (priority === 'Urgent') style = 'bg-red-50 text-red-700 border-red-200 font-bold';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${style}`}>
      {priority}
    </span>
  );
};
