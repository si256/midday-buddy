import React from 'react';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, ArrowLeft, Loader2, UserCheck, KeyRound, Building2 } from 'lucide-react';
import { ApiService } from '../services/api';
import { UserProfile, Community } from '../types';

interface AdminLoginPageProps {
  communities?: Community[];
  onLoginSuccess: (admin: UserProfile) => void;
  onGoBack: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  communities = [],
  onLoginSuccess,
  onGoBack,
}) => {
  const [hasAdmin, setHasAdmin] = React.useState<boolean | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(true);

  // Standard login states
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);

  // First admin setup states
  const [adminName, setAdminName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminEmployeeId, setAdminEmployeeId] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [adminCampusId, setAdminCampusId] = React.useState(communities[0]?.id || 'comm_siruseri');

  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [successMessage, setSuccessMessage] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    ApiService.getAdminStatus()
      .then((res) => {
        if (mounted) {
          setHasAdmin(res.hasAdmin);
          setIsCheckingStatus(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setHasAdmin(true); // default to login mode on error
          setIsCheckingStatus(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
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

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!adminName.trim() || !adminEmail.trim() || !adminEmployeeId.trim() || !adminPassword) {
      setErrorMessage('All fields are required to initialize the first administrator.');
      return;
    }

    if (adminPassword.length < 8) {
      setErrorMessage('Administrator password must be at least 8 characters long.');
      return;
    }

    if (adminPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await ApiService.setupFirstAdmin({
        name: adminName.trim(),
        email: adminEmail.trim().toLowerCase(),
        employeeId: adminEmployeeId.trim().toUpperCase(),
        password: adminPassword,
        campusId: adminCampusId,
      });

      setSuccessMessage('Administrator provisioned successfully! Initial setup is now permanently locked.');
      setTimeout(() => {
        onLoginSuccess(res.user);
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Administrator initialization failed.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          <span>Verifying security status...</span>
        </div>
      </div>
    );
  }

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
              {hasAdmin ? 'Restricted Portal' : 'First-Boot Initialization'}
            </span>
            <h1 className="text-xl font-bold">
              {hasAdmin ? 'Campus Administrator Login' : 'Provision Platform Administrator'}
            </h1>
            <p className="mt-1 text-xs text-orange-100">
              {hasAdmin
                ? 'Moderation console for approvals, password resets, and audit trail'
                : 'No administrator provisioned yet. Create the initial root platform administrator.'}
            </p>
          </div>

          {/* Card Body */}
          <div className="p-6 sm:p-8 space-y-5">
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                ⚠️ {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✅ {successMessage}
              </div>
            )}

            {hasAdmin ? (
              /* STANDARD LOGIN FORM */
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Admin Corporate Email ID
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. admin@core-reacher.com"
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-xs font-bold text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <span>Sign In to Admin Portal</span>
                  )}
                </button>
              </form>
            ) : (
              /* FIRST-ADMIN INITIAL SETUP FORM */
              <form onSubmit={handleSetupSubmit} className="space-y-4">
                <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                  🔐 <strong>First Administrator Provisioning:</strong> This step initializes the root platform administrator. Once completed, this setup route is permanently locked.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Administrator Name
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. System Administrator"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 px-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Corporate Email ID
                  </label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="e.g. admin@company.com"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 px-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Corporate Employee ID
                  </label>
                  <input
                    type="text"
                    required
                    value={adminEmployeeId}
                    onChange={(e) => setAdminEmployeeId(e.target.value)}
                    placeholder="e.g. ADM-001"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 px-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Designated Primary Campus
                  </label>
                  <select
                    value={adminCampusId}
                    onChange={(e) => setAdminCampusId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 px-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  >
                    {communities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Secure Password (minimum 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 px-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 px-3 text-xs text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-xs font-bold text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Provisioning Root Administrator...</span>
                    </>
                  ) : (
                    <span>Provision Platform Administrator & Lock Setup</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
