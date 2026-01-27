
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Eye, EyeOff, Lock, User, ShieldCheck } from 'lucide-react';

const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{msg: string, type: 'error' | 'success' | 'warning'} | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    
    setLoading(true);
    setError(null);

    const emailLower = email.toLowerCase().trim();
    const allowed = ['shoe@gmail.com', 'socks@gmail.com'];

    if (!allowed.includes(emailLower)) {
      setError({ msg: 'Access Denied: Restricted accounts only.', type: 'error' });
      setLoading(false);
      return;
    }

    if (password !== '091005') {
      setError({ msg: 'Incorrect password. Hint: 091005', type: 'error' });
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password: password,
    });

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials') || signInError.message.includes('Email not confirmed')) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: emailLower,
          password: password,
          options: {
            data: {
              email_confirmed: true
            }
          }
        });

        if (signUpError) {
          if (signUpError.status === 429 || signUpError.message.toLowerCase().includes('rate limit')) {
            setError({ 
              msg: 'Rate Limit! Please wait a few moments or check Supabase Auth settings.', 
              type: 'warning' 
            });
            setCooldown(30);
          } else {
            setError({ msg: signUpError.message, type: 'error' });
          }
        } else {
          setError({ 
            msg: 'Account created! Please try to "Connect Now" again.', 
            type: 'success' 
          });
        }
      } else {
        setError({ msg: signInError.message, type: 'error' });
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full items-center justify-center p-4 bg-emerald-600 dark:bg-[#003d32] overflow-hidden transition-colors duration-500">
      <div className="w-full max-w-md bg-white dark:bg-[#111B21] rounded-[2.5rem] shadow-2xl p-8 space-y-8 animate-in fade-in zoom-in duration-500 border border-black/5 dark:border-white/5">
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 rounded-full text-4xl flex items-center justify-center shadow-inner transform transition-all hover:scale-105 border border-emerald-100 dark:border-emerald-900/50">
              {email.toLowerCase().includes('shoe') ? '👟' : email.toLowerCase().includes('socks') ? '🧦' : <ShieldCheck className="text-emerald-600 dark:text-emerald-400" size={40} />}
            </div>
          </div>
          
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">commx</h1>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-[0.2em]">Secure Node Entrance</p>
          </div>
        </div>

        <form onSubmit={handleConnect} className="space-y-6">
          <div className="space-y-2">
            <label className="flex items-center text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest ml-1">
              <User size={12} className="mr-1" /> Identification
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter Identification Email"
              required
              className="w-full px-5 py-4 rounded-2xl border-2 border-emerald-500/10 bg-[#1a2321] text-white placeholder-emerald-200/30 focus:border-emerald-500 transition-all outline-none text-base font-bold"
            />
          </div>
          
          <div className="space-y-2">
            <label className="flex items-center text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest ml-1">
              <Lock size={12} className="mr-1" /> Access Code
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
                className="w-full px-5 py-4 rounded-2xl border-2 border-emerald-500/10 bg-[#1a2321] text-white placeholder-emerald-200/30 focus:border-emerald-500 transition-all outline-none text-base font-bold tracking-widest"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-emerald-500/50 hover:text-emerald-400 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className={`p-4 rounded-2xl text-[11px] font-bold border-2 animate-in slide-in-from-top-2 duration-200 ${
              error.type === 'success' ? 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900/50 dark:text-blue-300' :
              error.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900/50 dark:text-amber-300' :
              'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-300'
            }`}>
              {error.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="w-full py-4 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-3 uppercase tracking-widest text-base"
          >
            {loading ? (
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>{cooldown > 0 ? `Retry in ${cooldown}s` : 'Connect Now'}</span>
            )}
          </button>
        </form>

        <div className="pt-2 text-center">
          <p className="text-[9px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-[0.25em]">
            End-to-End Encrypted Communication
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
