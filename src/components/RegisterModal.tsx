import React from 'react';
import { X, UserPlus, Shield, Sparkles } from 'lucide-react';
import { Community, DietaryPreference, SocialBattery, UserProfile } from '../types';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCommunity: Community;
  onRegister: (newUser: UserProfile) => void;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
  isOpen,
  onClose,
  activeCommunity,
  onRegister,
}) => {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [roleTitle, setRoleTitle] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [icebreaker, setIcebreaker] = React.useState('');
  const [dietary, setDietary] = React.useState<DietaryPreference>('Pure Veg');
  const [socialBattery, setSocialBattery] = React.useState<SocialBattery>('Balanced Banter');
  const [interestsInput, setInterestsInput] = React.useState('Filter Coffee, Badminton, Tech');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    const colors = ['bg-amber-600', 'bg-orange-600', 'bg-emerald-600', 'bg-indigo-600', 'bg-teal-600', 'bg-rose-600'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newUser: UserProfile = {
      id: `usr_${Date.now()}`,
      email: email.trim(),
      name: name.trim(),
      roleTitle: roleTitle.trim() || 'Software Engineer',
      campusId: activeCommunity.id,
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

    onRegister(newUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 p-6 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Join MidDay Buddy
              </h2>
              <p className="text-[11px] text-slate-500">
                Register for {activeCommunity.name} break community
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="rounded-2xl bg-amber-50/70 p-3.5 border border-amber-200/60 dark:bg-amber-950/30 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200">
            <strong>Campus Verification Note:</strong> Once submitted, your registration will be queued for manual review by the campus administrator before your profile unlocks.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Corporate Email *
              </label>
              <input
                type="email"
                required
                placeholder="e.g. rahul.v@tcs.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Designation / Team
            </label>
            <input
              type="text"
              placeholder="e.g. Systems Engineer · Cloud Infrastructure"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dietary Preference
              </label>
              <select
                value={dietary}
                onChange={(e) => setDietary(e.target.value as DietaryPreference)}
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              >
                <option value="Any">Any Cuisine</option>
                <option value="Pure Veg">Pure Vegetarian</option>
                <option value="Jain">Jain Food</option>
                <option value="Halal">Halal</option>
                <option value="Non-Veg">Non-Vegetarian</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Social Battery
              </label>
              <select
                value={socialBattery}
                onChange={(e) => setSocialBattery(e.target.value as SocialBattery)}
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              >
                <option value="Balanced Banter">Balanced Banter</option>
                <option value="Quiet & Chill">Quiet & Chill</option>
                <option value="Lively & Outgoing">Lively & Outgoing</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Interests & Passions (Comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. Badminton, Tech, Tamil Cinema, Trekking"
              value={interestsInput}
              onChange={(e) => setInterestsInput(e.target.value)}
              className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Conversation Icebreaker
            </label>
            <input
              type="text"
              placeholder="e.g. Ask me about my favorite filter coffee spots in Chennai!"
              value={icebreaker}
              onChange={(e) => setIcebreaker(e.target.value)}
              className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
            >
              Submit Registration for Admin Approval
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
