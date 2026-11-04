import React from 'react';
import { Clock, ShieldCheck, UserCheck, AlertCircle, ArrowRight, Building } from 'lucide-react';
import { UserProfile, Community } from '../types';

interface PendingApprovalViewProps {
  user: UserProfile;
  community: Community;
  onSwitchToAdmin: () => void;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  user,
  community,
  onSwitchToAdmin,
}) => {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none transition-colors">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-8 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md mb-4">
            <Clock className="h-6 w-6 stroke-[2.5]" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Account Awaiting Campus Admin Approval</h2>
          <p className="mt-2 text-sm text-amber-100">
            Welcome to MidDay Buddy at {community.name}! To keep our workplace safe, trusted, and respectful, every registration is manually reviewed by a campus administrator.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-8 space-y-6">
          {/* Status Tracker */}
          <div className="rounded-2xl bg-stone-50 p-5 dark:bg-slate-800/60 border border-stone-200/80 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
              Verification Progress
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">Registration Details Submitted</div>
                  <div className="text-[11px] text-slate-500">Corporate email ({user.email}) registered</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white animate-pulse">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Campus Administrator Review (In Progress)</div>
                  <div className="text-[11px] text-slate-500">Assigned to {community.name} community moderators</div>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-50">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-stone-500 dark:bg-slate-700">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Live Break Board Unlocked</div>
                  <div className="text-[11px] text-slate-500">Post availability, explore interests, and connect in 1 tap</div>
                </div>
              </div>
            </div>
          </div>

          {/* User Details Summary */}
          <div className="rounded-2xl border border-stone-200 p-5 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Your Submitted Profile
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Full Name</span>
                <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Designation</span>
                <p className="font-semibold text-slate-900 dark:text-white">{user.roleTitle}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Campus Hub</span>
                <p className="font-semibold text-slate-900 dark:text-white">{community.name}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Registered At</span>
                <p className="font-semibold text-slate-900 dark:text-white">Today</p>
              </div>
            </div>
          </div>

          {/* Interactive Prototype Simulation Callout */}
          <div className="rounded-2xl bg-amber-50/70 p-5 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Testing the Manual Admin Approval Flow?
                </h4>
                <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/80">
                  As the evaluator of this prototype, you can switch to the <strong>Campus Admin Portal</strong> right now to review this pending request, approve it with one click, and inspect the security audit trail.
                </p>
                <button
                  onClick={onSwitchToAdmin}
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 shadow-sm transition-colors"
                >
                  <span>Open Admin Approval Portal</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
