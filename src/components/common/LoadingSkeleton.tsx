import React from 'react';

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full space-y-3 p-4 bg-white rounded-lg border border-slate-200 animate-pulse">
      <div className="h-6 bg-slate-200 rounded w-1/4 mb-4"></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-4 bg-slate-100 rounded w-1/6"></div>
          <div className="h-4 bg-slate-100 rounded w-2/6"></div>
          <div className="h-4 bg-slate-100 rounded w-1/6"></div>
          <div className="h-4 bg-slate-100 rounded w-2/6"></div>
        </div>
      ))}
    </div>
  );
};
