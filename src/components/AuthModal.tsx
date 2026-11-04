import React from 'react';
import { X, Lock, Mail, User, Shield, AlertCircle, ArrowRight, UserPlus, LogIn, Coffee } from 'lucide-react';
import { Community, DietaryPreference, SocialBattery, UserProfile } from '../types';

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

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedEmail = email.trim().toLowerCase();
    const existing = allUsers.find((u) => u.email.toLowerCase() === trimmedEmail);

    if (!existing) {
      setErrorMessage(`No account found with email "${email}". Please sign up or choose a preset user below.`);
      return;
    }

    onSuccess(existing);
    onClose();
  };

  const handleQuickLogin = (user: UserProfile) => {
    onSuccess(user);
    onClose();
  };

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!name.trim() || !email.trim()) {
      setErrorMessage('Please enter your name and corporate email.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = allUsers.find((u) => u.email.toLowerCase() === trimmedEmail);
    if (existing) {
      setErrorMessage('An account with this email already exists. Please sign in instead.');
      return;
    }

    const colors = ['bg-amber-600', 'bg-orange-600', 'bg-emerald-600', 'bg-indigo-600', 'bg-teal-600', 'bg-rose-600'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newUser: UserProfile = {
      id: `usr_${Date.now()}`,
      email: trimmedEmail,
      name: name.trim(),
      roleTitle: roleTitle.trim() || 'Software Engineer',
      campusId: selectedCampusId,
      avatarSeed: name.trim(),
      avatarBgColor: randomColor,
      bio: bio.trim() || 'Looking forward to meeting colleagues during midday breaks along the spine.',
      icebreaker: icebreaker.trim() || 'Ask me about my favorite campus food spots!',
      interests: interestsInput.split(',').map((s) => s.trim()).filter(Boolean),
      dietary,
      socialBattery,
      role: 'user',
      status: 'pending_approval', // Enforces manual admin review!
      registeredAt: new Date().toISOString(),
    };

    onRegisterNew(newUser);
    onSuccess(newUser);
    onClose();
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
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-700"
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
                Access your campus break companion network.
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
                    placeholder="name@tcs.com"
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
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
              >
                Sign In
              </button>
            </form>

            {/* Quick 1-Click Login Presets (Great for evaluating different roles!) */}
            <div className="border-t border-stone-100 dark:border-slate-800 pt-4">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                1-Click Account Sign-In (For Testing)
              </span>
              <div className="space-y-1.5">
                {allUsers.slice(0, 3).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleQuickLogin(u)}
                    className="flex w-full items-center justify-between rounded-xl border border-stone-200 p-2 text-left text-xs hover:border-amber-400 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md ${u.avatarBgColor} text-white font-bold text-[10px]`}>
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{u.name}</div>
                        <div className="text-[10px] text-slate-500">{u.roleTitle}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      u.role === 'community_admin' 
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : u.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {u.role === 'community_admin' ? 'Admin' : u.status === 'approved' ? 'Approved' : 'Pending'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Sign Up Form */
          <form onSubmit={handleSignUp} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Register for Campus Break Network
              </h2>
              <p className="text-xs text-slate-500">
                To keep our campus safe, accounts require campus admin verification.
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

            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
              🛡️ <strong>Safety Policy:</strong> Your account will be reviewed by the campus administrator to prevent impersonation and verify workplace membership.
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
            >
              Submit Registration for Admin Approval
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
