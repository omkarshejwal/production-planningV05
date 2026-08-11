import React, { FormEvent, useState } from 'react';
import { Shield, MapPin, Mail, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const ProfileModule: React.FC = () => {
  const { user, changePassword } = useAuth();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword'));
    if (newPassword !== String(form.get('confirmPassword'))) {
      setMessage('New password confirmation does not match.');
      return;
    }
    setMessage(''); setIsSubmitting(true);
    try {
      await changePassword(String(form.get('currentPassword')), newPassword);
      event.currentTarget.reset();
      setMessage('Password updated successfully.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update password.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center ring-4 ring-blue-100 shadow-sm">
            {user.employee_name.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user.employee_name}</h1>
            <p className="text-xs font-semibold text-blue-700 mt-0.5">{user.role}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user.department}</p>
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
              <p className="font-semibold text-slate-800">{user.role}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
            <MapPin className="w-4 h-4 text-amber-600" />
            <div>
              <p className="text-[10px] text-slate-400">Assigned Facility</p>
              <p className="font-semibold text-slate-800">{user.department}</p>
            </div>
          </div>

        </div>
      </div>

      <form onSubmit={handleChangePassword} className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-bold text-slate-900">Change Password</h2></div>
        {message && <p className={`rounded-lg px-3 py-2 text-xs ${message.includes('successfully') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input required name="currentPassword" type="password" placeholder="Current Password" className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 outline-none" />
          <input required minLength={8} name="newPassword" type="password" placeholder="New Password" className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 outline-none" />
          <input required minLength={8} name="confirmPassword" type="password" placeholder="Confirm New Password" className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-600 outline-none" />
        </div>
        <button disabled={isSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{isSubmitting ? 'Updating...' : 'Update Password'}</button>
      </form>
    </div>
  );
};
