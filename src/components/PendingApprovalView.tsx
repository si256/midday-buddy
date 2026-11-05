import React from 'react';
import { Clock, ShieldCheck, UserCheck, AlertCircle, Building, Shield } from 'lucide-react';
import { UserProfile, Community } from '../types';

interface PendingApprovalViewProps {
  user: UserProfile;
  community: Community;
  onSwitchToAdmin: () => void;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  user,
  community,
}) => {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none transition-colors">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-8 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md mb-4">
            <Clock className="h-6 w-6 stroke-[2.5]" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Waiting approval by admin</h2>
          <p className="mt-2 text-sm text-amber-100">
            Welcome to MidDay Buddy at {community.name}. Your account is currently <strong>waiting approval by admin</strong>. To maintain workplace safety and trust, an administrator will verify your details shortly.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-8 space-y-6">
          {/* Status Tracker */}
          <div className="rounded-2xl bg-stone-50 p-5 dark:bg-slate-800/60 border border-stone-200/80 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
              Approval Status
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">Account Details Submitted</div>
                  <div className="text-[11px] text-slate-500">Email ID: {user.email} · Employee ID: {user.employeeId || user.campusId}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white animate-pulse">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Waiting approval by admin</div>
                  <div className="text-[11px] text-slate-500">Queued for verification by platform administrator</div>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-50">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-stone-500 dark:bg-slate-700">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Break Directory Activation</div>
                  <div className="text-[11px] text-slate-500">Broadcast breaks and connect with colleagues</div>
                </div>
              </div>
            </div>
          </div>

          {/* User Details Summary */}
          <div className="rounded-2xl border border-stone-200 p-5 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Submitted Profile Details
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Full Name</span>
                <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Designation / Role</span>
                <p className="font-semibold text-slate-900 dark:text-white">{user.roleTitle}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Employee ID</span>
                <p className="font-semibold text-slate-900 dark:text-white font-mono">{user.employeeId || user.campusId}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Verification State</span>
                <p className="font-bold text-amber-600 dark:text-amber-400">Waiting approval by admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
