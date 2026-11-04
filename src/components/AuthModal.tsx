import React from 'react';
import { X, Lock, Mail, User, Shield, AlertCircle, ArrowRight, UserPlus, LogIn, Coffee, Eye, EyeOff, KeyRound, Check } from 'lucide-react';
import { Community, DietaryPreference, SocialBattery, UserProfile } from '../types';
import { ApiService } from '../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
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
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  // Sign up fields
  const [name, setName] = React.useState('');
  const [roleTitle, setRoleTitle] = React.useState('');
  const [selectedCampusId, setSelectedCampusId] = React.useState(activeCommunity.id);
  const [bio, setBio] = React.useState('');
  const [icebreaker, setIcebreaker] = React.useState('');
  const [dietary, setDietary] = React.useState<DietaryPreference>('Pure Veg');
  const [socialBattery, setSocialBattery] = React.useState<SocialBattery>('Balanced Banter');
  const [interestsInput, setInterestsInput] = React.useState('Filter Coffee, Badminton, Tech');

  if (!isOpen) return null;

  // Real Server-Side Password Login
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const res = await ApiService.login({
        email: trimmedEmail,
        password: password,
      });

      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid corporate email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to pre-fill test credentials for easy QA testing
  const handleFillTestCredentials = (testEmail: string, testPass: string) => {
    setEmail(testEmail);
    setPassword(testPass);
    setErrorMessage('');
  };

  // Real Server-Side Registration
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!name.trim() || !email.trim() || !password) {
      setErrorMessage('Please fill in your name, corporate email, and password.');
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
        campusId: selectedCampusId,
        roleTitle: roleTitle.trim() || 'Software Engineer',
        communityId: activeCommunity.id,
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

        {/* Error Notification */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-200 dark:border-rose-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        {mode === 'signin' ? (
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Sign in to MidDay Buddy
              </h2>
              <p className="text-xs text-slate-500">
                Enter your corporate credentials to connect with colleagues.
              </p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Corporate Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. kavitha.s@tcs.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
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
                {isLoading ? 'Authenticating...' : 'Sign In with Password'}
              </button>
            </form>

            {/* QA Testing Credentials Panel */}
            <div className="border-t border-stone-100 dark:border-slate-800 pt-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                <span>Test Credentials (Click to pre-fill)</span>
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => handleFillTestCredentials('kavitha.s@tcs.com', 'Admin@12345')}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 p-2 text-left text-xs hover:border-indigo-400 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>Kavitha Sundaram</span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.2 rounded font-bold">Admin</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">kavitha.s@tcs.com · Admin@12345</div>
                  </div>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">Fill</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFillTestCredentials('dinesh.k@tcs.com', 'Buddy@12345')}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 p-2 text-left text-xs hover:border-emerald-400 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>Dinesh Kumar</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">Approved</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">dinesh.k@tcs.com · Buddy@12345</div>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Fill</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFillTestCredentials('priya.raman@tcs.com', 'Priya@12345')}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 p-2 text-left text-xs hover:border-amber-400 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>Priya Raman</span>
                      <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.2 rounded font-bold">Pending Review</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">priya.raman@tcs.com · Priya@12345</div>
                  </div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Fill</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Sign Up Form with Password & Confirm Password */
          <form onSubmit={handleSignUp} className="p-6 space-y-3.5 max-h-[75vh] overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Register for Campus Break Network
              </h2>
              <p className="text-xs text-slate-500">
                Create a corporate account. New accounts are reviewed by campus admin.
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
                  Corporate Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@tcs.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Designation / Project Role
              </label>
              <input
                type="text"
                placeholder="e.g. Systems Engineer · Cloud Native"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>

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

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Icebreaker Topic
              </label>
              <input
                type="text"
                placeholder="e.g. Ask me about the best biryani spots in Chennai!"
                value={icebreaker}
                onChange={(e) => setIcebreaker(e.target.value)}
                className="w-full rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
              🛡️ <strong>Safety Policy:</strong> Your account will be reviewed by the campus administrator to prevent impersonation and verify workplace membership.
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isLoading ? 'Creating Account...' : 'Register for Admin Approval'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
