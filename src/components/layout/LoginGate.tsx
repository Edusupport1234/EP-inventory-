import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface LoginGateProps {
  onLoginSuccess: () => void;
}

export default function LoginGate({ onLoginSuccess }: LoginGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const trimmedUser = username.trim().toLowerCase();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setIsLoading(false);
      setError('Please provide both username and password.');
      return;
    }

    try {
      // 1. Check root credential fallback bootstrap
      if ((trimmedUser === 'epadmin' || trimmedUser === 'admin') && trimmedPass === '123456') {
        localStorage.setItem('epedu_auth', 'true');
        localStorage.setItem('epedu_username', 'EPADMIN');
        localStorage.setItem('epedu_role', 'super_admin');
        onLoginSuccess();
        return;
      }

      // 2. Query Firestore user accounts
      const userRef = doc(db, 'userAccounts', trimmedUser);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.password === trimmedPass) {
          localStorage.setItem('epedu_auth', 'true');
          localStorage.setItem('epedu_username', userData.username || trimmedUser);
          localStorage.setItem('epedu_role', userData.role || 'user');
          onLoginSuccess();
        } else {
          setIsLoading(false);
          setError('Invalid username or password. Please verify credentials.');
        }
      } else {
        setIsLoading(false);
        setError('User account not found. Please verify username or contact Super Admin.');
      }
    } catch (err: any) {
      console.error("Database authentication query failed:", err);
      setIsLoading(false);
      setError('System authentication error. Unable to connect to authorization database.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* Decorative subtle ambient background shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-100/40 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-[24px] shadow-xl overflow-hidden relative z-10 flex flex-col p-8 md:p-10"
      >
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 animate-bounce-short">
            <div className="w-5 h-5 border-[3px] border-white rotate-45" />
          </div>
          <h2 className="text-xl font-bold font-sans tracking-tight text-slate-800">
            EP <span className="text-blue-600">INVENTORY</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-widest">
            Cloud Warehouse Terminal
          </p>
        </div>

        {/* login error container */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3.5 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 font-medium text-sm transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter key passcode"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 font-medium text-sm transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-blue-400 disabled:to-indigo-400 text-white font-bold text-sm tracking-wide rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Authenticating System...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Authorized Login</span>
              </>
            )}
          </button>
        </form>

        {/* Footer info message */}
        <div className="mt-8 border-t border-slate-100 pt-5 text-center">
          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed uppercase tracking-wider">
            Enterprise Education Network Portal • EPEDU Auth
          </p>
        </div>
      </motion.div>
    </div>
  );
}
