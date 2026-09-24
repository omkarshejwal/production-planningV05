import React, { FormEvent, useState } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';
import officialLogo from '../../assets/logo';
import { useAuth } from '../../context/AuthContext';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

type FlowView = 'login' | 'forgot-email' | 'forgot-otp' | 'forgot-reset';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [view, setView] = useState<FlowView>('login');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [mockOtp, setMockOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetForgotState = () => {
    setForgotEmail(''); setMockOtp(''); setEnteredOtp('');
    setNewPassword(''); setConfirmPassword(''); setError('');
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(''); setIsSubmitting(true);
    try { await login(String(form.get('userId')), String(form.get('password'))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in'); }
    finally { setIsSubmitting(false); }
  };

  const handleSendOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!forgotEmail.trim()) { setError('Please enter your email or mobile number.'); return; }
    setError('');
    const generated = String(Math.floor(1000 + Math.random() * 9000));
    setMockOtp(generated);
    alert(`[Mock] Your OTP is: ${generated}`);
    setView('forgot-otp');
  };

  const handleVerifyOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (enteredOtp === mockOtp) { setError(''); setView('forgot-reset'); }
    else { setError('Invalid OTP. Please try again.'); }
  };

  const handleResetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setError('');
    alert('[Mock] Password has been reset successfully!');
    resetForgotState();
    setView('login');
  };

  const goToLogin = () => { resetForgotState(); setView('login'); };

  return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-900">
    <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center gap-3"><img src={officialLogo} alt="Vitrum Glass" className="h-11 w-11 object-contain" /><div><h1 className="font-bold">Vitrum Glass</h1><p className="text-xs font-semibold tracking-wider text-slate-400">ERP SYSTEM</p></div></div>

      {view === 'login' && <>
        <h2 className="text-xl font-bold">Sign in to ERP</h2>
        <p className="mt-1 text-sm text-slate-500">Use your Employee ID.</p>
        {error && <p className="mt-4 rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700">{error}</p>}
        <form onSubmit={submitLogin} className="mt-5 space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Employee ID</span><div className="relative"><UserRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required name="userId" placeholder="Employee ID" className={`${inputClass} pl-9`} /></div></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required type="password" name="password" placeholder="Password" className={`${inputClass} pl-9`} /></div></label>
          <button disabled={isSubmitting} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{isSubmitting ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p className="mt-3 text-center text-xs text-slate-400">Initial password: your registered mobile number.</p>
        <button onClick={() => { setError(''); setView('forgot-email'); }} className="mt-5 w-full text-sm font-semibold text-blue-700 hover:underline">Forgot Password?</button>
      </>}

      {view === 'forgot-email' && <>
        <h2 className="text-xl font-bold">Forgot Password</h2>
        <p className="mt-1 text-sm text-slate-500">Enter your email address or mobile number to receive an OTP.</p>
        {error && <p className="mt-4 rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700">{error}</p>}
        <form onSubmit={handleSendOtp} className="mt-5 space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Email or Mobile</span><div className="relative"><UserRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Email or mobile number" className={`${inputClass} pl-9`} /></div></label>
          <button className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Send OTP</button>
        </form>
        <button onClick={goToLogin} className="mt-5 w-full text-sm font-semibold text-blue-700 hover:underline">Back to Sign In</button>
      </>}

      {view === 'forgot-otp' && <>
        <h2 className="text-xl font-bold">Verify OTP</h2>
        <p className="mt-1 text-sm text-slate-500">Enter the 4-digit code sent to {forgotEmail}.</p>
        {error && <p className="mt-4 rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700">{error}</p>}
        <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">4-Digit OTP</span><input required maxLength={4} pattern="\d{4}" inputMode="numeric" value={enteredOtp} onChange={(e) => setEnteredOtp(e.target.value)} placeholder="Enter OTP" className={inputClass} /></label>
          <button className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Verify OTP</button>
        </form>
        <button onClick={goToLogin} className="mt-5 w-full text-sm font-semibold text-blue-700 hover:underline">Back to Sign In</button>
      </>}

      {view === 'forgot-reset' && <>
        <h2 className="text-xl font-bold">Reset Password</h2>
        <p className="mt-1 text-sm text-slate-500">Create a new password for your account.</p>
        {error && <p className="mt-4 rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700">{error}</p>}
        <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">New Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required minLength={8} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" className={`${inputClass} pl-9`} /></div></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Confirm Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input required minLength={8} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" className={`${inputClass} pl-9`} /></div></label>
          <button className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Reset Password</button>
        </form>
        <button onClick={goToLogin} className="mt-5 w-full text-sm font-semibold text-blue-700 hover:underline">Back to Sign In</button>
      </>}

    </section>
  </main>;
};