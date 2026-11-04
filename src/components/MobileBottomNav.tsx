import React from 'react';
import { Coffee, Zap, Bell, Shield, User } from 'lucide-react';
import { UserProfile } from '../types';

interface MobileBottomNavProps {
  activeView: 'board' | 'admin' | 'architecture';
  onChangeView: (view: 'board' | 'admin' | 'architecture') => void;
  onOpenBroadcast: () => void;
  onToggleNotifications: () => void;
  unreadNotificationsCount: number;
  currentUser: UserProfile | null;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  pendingApprovalsCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onChangeView,
  onOpenBroadcast,
  onToggleNotifications,
  unreadNotificationsCount,
  currentUser,
  onOpenProfile,
  onOpenAuth,
  pendingApprovalsCount,
}) => {
  const isAdmin = currentUser?.role === 'community_admin' || currentUser?.role === 'platform_admin';

  return (
    <nav 
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-stone-200 dark:border-slate-800 transition-colors shadow-lg"
    >
      <div className="grid grid-cols-4 items-center h-14 max-w-md mx-auto px-2">
        {/* Tab 1: Break Directory */}
        <button
          onClick={() => onChangeView('board')}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
            activeView === 'board'
              ? 'text-orange-600 dark:text-orange-400 font-bold'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Coffee className="h-5 w-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Directory</span>
        </button>

        {/* Tab 2: Broadcast My Break (Thumb CTA) */}
        <button
          onClick={onOpenBroadcast}
          className="flex flex-col items-center justify-center h-full min-h-[44px] text-orange-600 dark:text-orange-400 font-bold hover:opacity-90 active:scale-95 transition-all"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-xs">
            <Zap className="h-4 w-4 fill-current" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Broadcast</span>
        </button>

        {/* Tab 3: Notifications / Activity */}
        <button
          onClick={onToggleNotifications}
          className="relative flex flex-col items-center justify-center h-full min-h-[44px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <div className="relative">
            <Bell className="h-5 w-5" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-orange-600 px-0.5 text-[8px] font-bold text-white">
                {unreadNotificationsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Activity</span>
        </button>

        {/* Tab 4: Admin Portal (if admin) or Profile */}
        {isAdmin ? (
          <button
            onClick={() => onChangeView('admin')}
            className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              activeView === 'admin'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Shield className="h-5 w-5" />
              {pendingApprovalsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold text-white">
                  {pendingApprovalsCount}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">Admin</span>
          </button>
        ) : currentUser ? (
          <button
            onClick={onOpenProfile}
            className="flex flex-col items-center justify-center h-full min-h-[44px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <User className="h-5 w-5" />
            <span className="text-[10px] tracking-tight mt-0.5">Profile</span>
          </button>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex flex-col items-center justify-center h-full min-h-[44px] text-orange-600 font-bold transition-colors"
          >
            <User className="h-5 w-5" />
            <span className="text-[10px] tracking-tight mt-0.5">Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
};
