import React, { FormEvent, useState } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';
import officialLogo from '../../assets/logo';
import { useAuth } from '../../context/AuthContext';

const DEPARTMENTS = ['Production Planning', 'Production', 'Machines', 'Quality Control', 'Maintenance'];
const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

export const LoginPage: React.FC = () => {
  const { login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(''); setIsSubmitting(true);
    try { await login(String(form.get('userId')), String(form.get('password'))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in'); }
    finally { setIsSubmitting(false); }
  };

  const submitSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirmPassword'))) { setError('Password confirmation does not match.'); return; }
    setError(''); setIsSubmitting(true);
    try {
      await signup({ employee_id: String(form.get('employeeId')), employee_name: String(form.get('employeeName')), department: String(form.get('department')), email: String(form.get('email')), phone_number: String(form.get('phoneNumber')), password, role: String(form.get('role')) as 'Editor' | 'Viewer' });
      setIsSignup(false); setError('Account created. Sign in with your email or mobile number.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create account'); }
    finally { setIsSubmitting(false); }
  };

  return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-900">
    <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center gap-3"><img src={officialLogo} alt="Vitrum Glass" className="h-11 w-11 object-contain" /><div><h1 className="font-bold">Vitrum Glass</h1><p className="text-xs font-semibold tracking-wider text-slate-400">ERP SYSTEM</p></div></div>
      <h2 className="text-xl font-bold">{isSignup ? 'Create Account' : 'Sign in to ERP'}</h2>
      <p className="mt-1 text-sm text-slate-500">{isSignup ? 'Enter your employee details to create an account.' : 'Use your email address or mobile number.'}</p>
      {error && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${error.startsWith('Account created') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{error}</p>}
      {isSignup ? <form onSubmit={submitSignup} className="mt-5 space-y-3">
        <div className="grid grid-cols-2 gap-3"><input required name="employeeId" placeholder="Employee ID" className={inputClass} /><input required name="employeeName" placeholder="Employee Name" className={inputClass} /></div>
        <select required name="department" defaultValue="" className={inputClass}><option value="" disabled>Department</option>{DEPARTMENTS.map((department) => <option key={department}>{department}</option>)}</select>
        <input required type="email" name="email" placeholder="Email address" className={inputClass} />
        <input required name="phoneNumber" placeholder="Mobile number" className={inputClass} />
        <select required name="role" defaultValue="Viewer" className={inputClass}><option value="Editor">Editor</option><option value="Viewer">Viewer</option></select>
        <input required minLength={8} type="password" name="password" placeholder="Password (minimum 8 characters)" className={inputClass} />
        <input required minLength={8} type="password" name="confirmPassword" placeholder="Confirm password" className={inputClass} />
        <button disabled={isSubmitting} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{isSubmitting ? 'Creating account...' : 'Create Account'}</button>
      </form> : <form onSubmit={submitLogin} className="mt-5 space-y-4">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">User ID</span><div className="relative"><UserRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required name="userId" placeholder="Email or mobile number" className={`${inputClass} pl-9`} /></div></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required type="password" name="password" placeholder="Password" className={`${inputClass} pl-9`} /></div></label>
        <button disabled={isSubmitting} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{isSubmitting ? 'Signing in...' : 'Sign In'}</button>
      </form>}
      <button onClick={() => { setIsSignup(!isSignup); setError(''); }} className="mt-5 w-full text-sm font-semibold text-blue-700 hover:underline">{isSignup ? 'Back to sign in' : 'Create an account'}</button>
    </section>
  </main>;
};
