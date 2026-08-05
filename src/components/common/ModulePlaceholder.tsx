import React from 'react';
import { Construction } from 'lucide-react';

interface ModulePlaceholderProps {
  moduleName?: string;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({ moduleName }) => {
  return (
    <div className="p-4 md:p-6 max-w-[1920px] mx-auto min-h-[calc(100vh-9rem)] flex items-center justify-center animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xs p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
          <Construction className="w-7 h-7" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Not Developed Yet</h1>

        <p className="mt-3 text-sm text-slate-600">
          This module is currently under development and will be available in a future update.
        </p>

        <p className="mt-2 text-xs text-slate-400">Please check back later.</p>

        {moduleName ? (
          <p className="mt-5 text-[11px] uppercase tracking-widest font-semibold text-slate-400">
            {moduleName}
          </p>
        ) : null}
      </div>
    </div>
  );
};
