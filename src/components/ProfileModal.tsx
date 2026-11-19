import React from 'react';
import { X, Sparkles, Plus, Lock, Check, AlertCircle, KeyRound } from 'lucide-react';
import { DietaryPreference, SocialBattery, UserProfile } from '../types';
import { ApiService } from '../services/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onSaveProfile: (updated: UserProfile) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSaveProfile,
}) => {
  const [name, setName] = React.useState(currentUser.name);
  const [roleTitle, setRoleTitle] = React.useState(currentUser.roleTitle);
  const [bio, setBio] = React.useState(currentUser.bio);
  const [icebreaker, setIcebreaker] = React.useState(currentUser.icebreaker);
  const [dietary, setDietary] = React.useState<DietaryPreference>(currentUser.dietary);
  const [socialBattery, setSocialBattery] = React.useState<SocialBattery>(currentUser.socialBattery);
  const [interests, setInterests] = React.useState<string[]>(currentUser.interests || []);
  const [newTagInput, setNewTagInput] = React.useState('');

  // Self-service password change state
  const [showPasswordPanel, setShowPasswordPanel] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [pwdLoading, setPwdLoading] = React.useState(false);
  const [pwdError, setPwdError] = React.useState('');
  const [pwdSuccess, setPwdSuccess] = React.useState('');

  React.useEffect(() => {
    if (isOpen && currentUser) {
      setName(currentUser.name);
      setRoleTitle(currentUser.roleTitle);
      setBio(currentUser.bio);
      setIcebreaker(currentUser.icebreaker);
      setDietary(currentUser.dietary);
      setSocialBattery(currentUser.socialBattery);
      setInterests(currentUser.interests || []);
      setPwdError('');
      setPwdSuccess('');
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleChangePassword = async () => {
    setPwdError('');
    setPwdSuccess('');
    if (!currentPassword || !newPassword) {
      setPwdError('Enter your current password and new password.');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }
    setPwdLoading(true);
    try {
      const res = await ApiService.changePassword(currentPassword, newPassword);
      setPwdSuccess(res.message || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password.');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleAddTag = () => {
    const val = newTagInput.trim();
    if (!val || interests.includes(val)) return;
    setInterests([...interests, val]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setInterests(interests.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...currentUser,
      name: name.trim(),
      roleTitle: roleTitle.trim(),
      bio: bio.trim(),
      icebreaker: icebreaker.trim(),
      dietary,
      socialBattery,
      interests,
    };
    onSaveProfile(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 p-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${currentUser.avatarBgColor} text-white font-bold text-lg shadow-xs`}>
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Campus Profile
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>{currentUser.email}</span>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {currentUser.status === 'approved' ? 'Verified Member' : 'Pending Review'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="max-h-[75vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Job Title / Team
                </label>
                <input
                  type="text"
                  required
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Short Bio / Break Mood
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell colleagues what you enjoy discussing over tea or lunch..."
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Balanced Banter">Balanced Banter</option>
                  <option value="Quiet & Chill">Quiet & Chill</option>
                  <option value="Lively & Outgoing">Lively & Outgoing</option>
                </select>
              </div>
            </div>

            {/* Icebreaker Prompt */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                <span>Conversation Icebreaker Topic</span>
              </label>
              <input
                type="text"
                value={icebreaker}
                onChange={(e) => setIcebreaker(e.target.value)}
                placeholder="e.g. Ask me about my favorite weekend cycling routes along ECR!"
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Tag Adder */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Passions & Interests
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {interests.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add a new interest (e.g. Badminton, AI, Chess)"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 rounded-xl border border-stone-200 p-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-stone-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
              >
                Save Profile Changes
              </button>
            </div>
          </form>

          {/* Self-Service Password Change */}
          <div className="border-t border-stone-100 dark:border-slate-800 px-6 pb-6 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowPasswordPanel(!showPasswordPanel);
                setPwdError('');
                setPwdSuccess('');
              }}
              className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-orange-500" />
                <span>Account Security & Password</span>
              </span>
              <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                {showPasswordPanel ? 'Hide' : 'Change Password'}
              </span>
            </button>

            {showPasswordPanel && (
              <div className="mt-3 space-y-3 rounded-2xl border border-stone-200 p-4 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-800/30">
                {pwdError && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-200 dark:border-rose-900">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{pwdError}</span>
                  </div>
                )}
                {pwdSuccess && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>{pwdSuccess}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Current Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      New Password (6+ chars)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full rounded-xl border border-stone-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full rounded-xl border border-stone-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={pwdLoading}
                  onClick={handleChangePassword}
                  className="w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-stone-100 disabled:opacity-50 transition-colors"
                >
                  {pwdLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
