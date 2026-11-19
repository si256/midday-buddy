import React from 'react';
import { X, Lock, Mail, User, Shield, AlertCircle, ArrowRight, UserPlus, LogIn, Coffee, Eye, EyeOff, KeyRound, Check, HelpCircle } from 'lucide-react';
import { Community, DietaryPreference, SocialBattery, UserProfile } from '../types';
import { ApiService } from '../services/api';
import { extractEmailDomain } from '../utils/onboarding';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile, mustChangePassword?: boolean) => void;
  allUsers: UserProfile[];
  communities: Community[];
  activeCommunity: Community;
  onRegisterNew: (newUser: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  allUsers,
  communities,
  activeCommunity,
  onRegisterNew,
}) => {
  const [mode, setMode] = React.useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [successMessage, setSuccessMessage] = React.useState('');

  // Sign up fields
  const [name, setName] = React.useState('');
  const [employeeId, setEmployeeId] = React.useState('');
  const [roleTitle, setRoleTitle] = React.useState('Software Engineer');
  const [selectedCampusId, setSelectedCampusId] = React.useState(activeCommunity?.id || communities[0]?.id || 'comm_siruseri');

  React.useEffect(() => {
    if (activeCommunity?.id) {
      setSelectedCampusId(activeCommunity.id);
    }
  }, [activeCommunity?.id]);
  const [bio, setBio] = React.useState('');
  const [icebreaker, setIcebreaker] = React.useState('');
  const [dietary, setDietary] = React.useState<DietaryPreference>('Pure Veg');
  const [socialBattery, setSocialBattery] = React.useState<SocialBattery>('Balanced Banter');
  const [interestsInput, setInterestsInput] = React.useState('Filter Coffee, Badminton, Tech');
  const [inviteCode, setInviteCode] = React.useState('');

  const selectedCampus = React.useMemo(
    () => communities.find((c) => c.id === selectedCampusId) || activeCommunity || communities[0],
    [communities, selectedCampusId, activeCommunity]
  );

  const emailDomain = extractEmailDomain(email);
  const isDomainAutoVerified = Boolean(
    emailDomain &&
    selectedCampus?.verifiedDomains?.some((d) => d.toLowerCase() === emailDomain)
  );

  if (!isOpen) return null;

  // Real Server-Side Password Login
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const res = await ApiService.login({
        email: trimmedEmail,
        password: password,
      });

      onSuccess(res.user, res.mustChangePassword);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid Email ID or password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Real Server-Side Registration
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!name.trim() || !email.trim() || !password || !employeeId.trim()) {
      setErrorMessage('Please fill in your name, Email ID, Employee ID, and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password.');
      return;
    }

    setIsLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const res = await ApiService.register({
        name: name.trim(),
        email: trimmedEmail,
        password: password,
        employeeId: employeeId.trim().toUpperCase(),
        campusId: selectedCampusId,
        roleTitle: roleTitle.trim() || 'Software Engineer',
        communityId: selectedCampusId,
        inviteCode: inviteCode.trim() || undefined,
        interests: interestsInput.split(',').map((s) => s.trim()).filter(Boolean),
        dietary,
        icebreaker: icebreaker.trim() || 'Ask me about my favorite campus food spots!',
      });

      onRegisterNew(res.user);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // User submits Forgot Password request (Waiting approval by admin)
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email.trim() || !employeeId.trim()) {
      setErrorMessage('Please provide your registered Email ID and Employee ID.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await ApiService.forgotPassword(email.trim().toLowerCase(), employeeId.trim().toUpperCase());
      setSuccessMessage(res.message || 'Password reset request submitted. Waiting approval by admin.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit password reset request.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div 
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Tabs */}
        <div className="border-b border-stone-100 bg-stone-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => {
                setMode('signin');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Messages */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-200 dark:border-rose-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* MODE 1: Sign In */}
        {mode === 'signin' && (
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Sign in to MidDay Buddy
              </h2>
              <p className="text-xs text-slate-500">
                Enter your credentials to connect with colleagues during breaks.
              </p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email ID
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="•••••••• (leave empty if reset approved)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-10 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            <div className="text-center text-xs text-slate-500 pt-2">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                className="font-bold text-orange-600 hover:underline"
              >
                Create one now
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: Sign Up (Create Account) */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="p-6 space-y-3.5 max-h-[75vh] overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Register on MidDay Buddy
              </h2>
              <p className="text-xs text-slate-500">
                Use a verified company email or campus invite code for instant access, or submit for admin review.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Varma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email ID *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Employee ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1928472"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Designation / Role
                </label>
                <input
                  type="text"
                  placeholder="e.g. Software Engineer"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Password * (Min 6 chars)
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Campus Hub
                </label>
                <select
                  value={selectedCampusId}
                  onChange={(e) => setSelectedCampusId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
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
                  Campus Invite Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Instant approval code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs font-mono uppercase text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Dietary Preference
                </label>
                <select
                  value={dietary}
                  onChange={(e) => setDietary(e.target.value as DietaryPreference)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Any">Any Cuisine</option>
                  <option value="Pure Veg">Pure Veg</option>
                  <option value="Jain">Jain Food</option>
                  <option value="Halal">Halal</option>
                  <option value="Non-Veg">Non-Veg</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Social Battery
                </label>
                <select
                  value={socialBattery}
                  onChange={(e) => setSocialBattery(e.target.value as SocialBattery)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Balanced Banter">Balanced Banter</option>
                  <option value="Quiet & Chill">Quiet & Chill</option>
                  <option value="Lively & Outgoing">Lively & Outgoing</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Passions & Interests (Comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Badminton, Tech, Cricket, Indie Cinema"
                value={interestsInput}
                onChange={(e) => setInterestsInput(e.target.value)}
                className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {isDomainAutoVerified ? (
              <div className="rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900 flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span><strong>Instant Verification:</strong> @{emailDomain} is a verified domain for {selectedCampus?.name}. You&apos;ll get immediate access!</span>
              </div>
            ) : inviteCode.trim() ? (
              <div className="rounded-xl bg-indigo-50 p-2.5 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-900 flex items-center gap-2">
                <KeyRound className="h-4 w-4 shrink-0 text-indigo-600" />
                <span><strong>Invite Code Entered:</strong> Valid campus codes unlock immediate directory access upon registration.</span>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200 dark:border-amber-900 flex items-center gap-2">
                <Shield className="h-4 w-4 shrink-0 text-amber-600" />
                <span><strong>Note:</strong> Unverified email domains are queued for <strong>admin approval</strong> unless a valid campus invite code is provided.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isLoading ? 'Creating Account...' : 'Register Account'}
            </button>
          </form>
        )}

        {/* MODE 3: Forgot Password Request */}
        {mode === 'forgot' && (
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Forgot Password Request
              </h2>
              <p className="text-xs text-slate-500">
                Raise a password reset request. Once approved by admin, you can log in without password to set your new password.
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Registered Email ID *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Employee ID *
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1928472"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white uppercase font-mono"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-stone-50 p-3 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 border border-stone-200 dark:border-slate-800">
                ℹ️ <strong>Admin Approval Workflow:</strong> Your request will be queued for administrator verification. Once the admin approves, you can sign in with your Email ID to set a fresh password immediately.
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isLoading ? 'Submitting Request...' : 'Raise Password Reset Request'}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                className="text-xs font-bold text-orange-600 hover:underline"
              >
                ← Back to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
