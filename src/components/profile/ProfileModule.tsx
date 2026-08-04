import React from 'react';
import { User, Shield, MapPin, Mail, Calendar, Phone } from 'lucide-react';
import { useERP } from '../../context/ERPContext';

export const ProfileModule: React.FC = () => {
  const { user } = useERP();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center ring-4 ring-blue-100 shadow-sm">
            AS
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
            <p className="text-xs font-semibold text-blue-700 mt-0.5">{user.role}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user.plantLocation}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
            <Mail className="w-4 h-4 text-blue-600" />
            <div>
              <p className="text-[10px] text-slate-400">Email Address</p>
              <p className="font-semibold text-slate-800">{user.email}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
            <Shield className="w-4 h-4 text-emerald-600" />
            <div>
              <p className="text-[10px] text-slate-400">Security Role</p>
              <p className="font-semibold text-slate-800">Administrator (Level 5)</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
            <MapPin className="w-4 h-4 text-amber-600" />
            <div>
              <p className="text-[10px] text-slate-400">Assigned Facility</p>
              <p className="font-semibold text-slate-800">Furnace Line #2 - Vitrum Glass Ind.</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
            <Calendar className="w-4 h-4 text-purple-600" />
            <div>
              <p className="text-[10px] text-slate-400">Active Shift Duty</p>
              <p className="font-semibold text-slate-800">Shift A (06:00 - 14:00)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
