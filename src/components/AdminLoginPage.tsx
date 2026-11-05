import React from 'react';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { ApiService } from '../services/api';
import { UserProfile } from '../types';

interface AdminLoginPageProps {
  onLoginSuccess: (admin: UserProfile) => void;
  onGoBack: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onGoBack,
}) => {
  const [email, setEmail] = React.useState('admin@middaybuddy.com');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both Email ID and password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await ApiService.login({
        email: email.trim().toLowerCase(),
        password,
      });

      if (res.user.role !== 'community_admin' && res.user.role !== 'platform_admin') {
        throw new Error('Access denied. This account does not possess administrator privileges.');
      }

      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid administrator credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreFillMasterAdmin = () => {
    setEmail('admin@middaybuddy.com');
    setPassword('Admin@12345');
    setErrorMessage('');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <button
          onClick={onGoBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Public Break Directory
        </button>

        {/* Card */}
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 transition-colors">
          {/* Card Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-6 text-white text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md mb-3 shadow-inner">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white mb-1">
              Restricted Portal
            </span>
            <h1 className="text-xl font-bold">Campus Administrator Login</h1>
            <p className="mt-1 text-xs text-orange-100">
              Moderation console for approvals, password resets, and audit trail
            </p>
          </div>

          {/* Card Body */}
          <div className="p-6 sm:p-8 space-y-5">
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                ⚠️ {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Admin Email ID
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@middaybuddy.com"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Admin Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-10 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-xs font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in to Admin Portal...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Sign In to Admin Portal
                  </>
                )}
              </button>
            </form>

            {/* Quick Fill / Hint Box for testing */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  Master Admin Credentials
                </span>
                <button
                  type="button"
                  onClick={handlePreFillMasterAdmin}
                  className="rounded-lg bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-amber-700 transition-colors shadow-sm"
                >
                  Fill Credentials
                </button>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 font-mono">
                admin@middaybuddy.com · Admin@12345
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
