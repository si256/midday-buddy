import React from 'react';
import { 
  Coffee, 
  Shield, 
  MapPin, 
  Sun, 
  Moon, 
  ChevronDown, 
  CloudLightning,
  Bell,
  Settings,
  LogOut,
  LogIn
} from 'lucide-react';
import { Community, UserProfile } from '../types';

interface NavbarProps {
  communities: Community[];
  activeCommunity: Community;
  onSelectCommunity: (community: Community) => void;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  onOpenZeroCostModal: () => void;
  activeView: 'board' | 'admin' | 'architecture';
  onChangeView: (view: 'board' | 'admin' | 'architecture') => void;
  pendingApprovalsCount: number;
  unreadNotificationsCount: number;
  onToggleNotifications: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  communities,
  activeCommunity,
  onSelectCommunity,
  currentUser,
  onOpenAuth,
  onOpenProfile,
  onSignOut,
  onOpenZeroCostModal,
  activeView,
  onChangeView,
  pendingApprovalsCount,
  unreadNotificationsCount,
  onToggleNotifications,
  darkMode,
  onToggleDarkMode,
}) => {
  const [showCommunityMenu, setShowCommunityMenu] = React.useState(false);
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const isAdmin = currentUser?.role === 'community_admin' || currentUser?.role === 'platform_admin';

  return (
    <header className="sticky top-0 z-30 w-full border-b border-stone-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 transition-colors">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark & Campus Hub Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          <button 
            onClick={() => onChangeView('board')}
            className="flex items-center gap-2 text-left focus:outline-none group shrink-0"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm shadow-orange-500/25 group-hover:scale-105 transition-transform shrink-0">
              <Coffee className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
            </div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              MidDay Buddy
            </span>
          </button>

          {/* Campus Hub Selector (Tablet/Desktop) */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowCommunityMenu(!showCommunityMenu)}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 transition-colors"
            >
              <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span className="max-w-[130px] truncate">{activeCommunity.name}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showCommunityMenu && (
              <div 
                className="absolute left-0 mt-1 w-64 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in-50 zoom-in-95 duration-100"
                onMouseLeave={() => setShowCommunityMenu(false)}
              >
                <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Campus Hub Network
                </div>
                {communities.map((comm) => (
                  <button
                    key={comm.id}
                    onClick={() => {
                      onSelectCommunity(comm);
                      setShowCommunityMenu(false);
                    }}
                    className={`flex w-full items-start gap-2 rounded-xl p-2 text-left text-xs transition-colors ${
                      comm.id === activeCommunity.id
                        ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-200 font-semibold'
                        : 'text-slate-700 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <div className="font-semibold">{comm.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{comm.city} · {comm.memberCount} members</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Zone 2: Navigation Links (Hidden on mobile to prevent overflow) */}
        <nav className="hidden md:flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onChangeView('board')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeView === 'board'
                ? 'bg-stone-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Coffee className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Break Directory</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => onChangeView('admin')}
              className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeView === 'admin'
                  ? 'bg-stone-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Admin Portal</span>
              {pendingApprovalsCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={onOpenZeroCostModal}
            className="hidden lg:flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
            title="Cloudflare 100% Free Tier Architecture"
          >
            <CloudLightning className="h-3.5 w-3.5" />
            <span>$0 Cloudflare Stack</span>
          </button>
        </nav>

        {/* Zone 3: Notification Bell, Theme & User Profile (Compact on Mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Notification Center Trigger */}
          {currentUser && (
            <button
              onClick={onToggleNotifications}
              className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-stone-200 text-slate-600 hover:bg-stone-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Campus notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[9px] font-bold text-white">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          )}

          {/* Theme Switcher */}
          <button
            onClick={onToggleDarkMode}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-stone-200 text-slate-600 hover:bg-stone-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User Account Controls */}
          {currentUser ? (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-stone-200 bg-stone-50 p-1 sm:p-1.5 sm:pr-3 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700/80 transition-colors"
                aria-label="User account menu"
              >
                <div className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg ${currentUser.avatarBgColor} text-xs font-bold text-white shadow-xs shrink-0`}>
                  {currentUser.name.charAt(0)}
                </div>
                {/* Text hidden on mobile to prevent header overflow */}
                <div className="hidden md:block text-left text-xs leading-tight">
                  <div className="font-bold text-slate-900 dark:text-white max-w-[90px] truncate">
                    {currentUser.name.split(' ')[0]}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    {currentUser.status === 'approved' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Verified</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Pending</span>
                    )}
                  </div>
                </div>
                <ChevronDown className="h-3 w-3 text-slate-400 opacity-60 shrink-0" />
              </button>

              {showUserMenu && (
                <div 
                  className="absolute right-0 mt-2 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in-50 zoom-in-95 duration-100"
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div className="p-2 border-b border-stone-100 dark:border-slate-800 mb-1">
                    <div className="font-bold text-xs text-slate-900 dark:text-white">{currentUser.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{currentUser.email}</div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">{currentUser.roleTitle}</div>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenProfile();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl p-2 text-xs text-slate-700 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors font-medium"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                    <span>My Profile & Passions</span>
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onChangeView('admin');
                      }}
                      className="flex w-full items-center gap-2 rounded-xl p-2 text-xs text-slate-700 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors font-medium"
                    >
                      <Shield className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Campus Admin Console</span>
                    </button>
                  )}

                  <div className="mt-1 border-t border-stone-100 dark:border-slate-800 pt-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onSignOut();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl p-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors font-medium"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 rounded-xl bg-orange-600 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition-colors shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
