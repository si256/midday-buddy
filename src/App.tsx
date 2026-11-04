import React from 'react';
import { 
  Coffee, 
  Utensils, 
  Footprints, 
  Zap, 
  Sparkles, 
  MapPin, 
  Filter, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight,
  Plus,
  Clock,
  RotateCcw,
  Check
} from 'lucide-react';
import { 
  Community, 
  CampusLocation, 
  UserProfile, 
  BreakPost, 
  AuditLog, 
  BreakType,
  AppNotification,
  PasswordResetRequest 
} from './types';
import { StorageService } from './services/storage';
import { ApiService } from './services/api';
import { Navbar } from './components/Navbar';
import { BreakCard } from './components/BreakCard';
import { InterestModal } from './components/InterestModal';
import { BroadcastModal } from './components/BroadcastModal';
import { ChatDrawer } from './components/ChatDrawer';
import { AdminDashboard } from './components/AdminDashboard';
import { PendingApprovalView } from './components/PendingApprovalView';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { NotificationCenter } from './components/NotificationCenter';
import { ZeroCostArchitectureModal } from './components/ZeroCostArchitectureModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = React.useState(false);

  // Live real-time clock (ticks every 1s for live countdowns)
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Core Persistent State
  const [communities, setCommunities] = React.useState<Community[]>(() => StorageService.getCommunities());
  const [activeCommunity, setActiveCommunity] = React.useState<Community>(() => {
    const comms = StorageService.getCommunities();
    return comms[0];
  });
  const [allUsers, setAllUsers] = React.useState<UserProfile[]>(() => StorageService.getUsers());
  const [currentUser, setCurrentUser] = React.useState<UserProfile | null>(() => StorageService.getCurrentSessionUser());
  const [breakPosts, setBreakPosts] = React.useState<BreakPost[]>(() => StorageService.getBreaks());
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>(() => StorageService.getAuditLogs());
  const [resetRequests, setResetRequests] = React.useState<PasswordResetRequest[]>([]);
  const [notifications, setNotifications] = React.useState<AppNotification[]>(() => {
    const user = StorageService.getCurrentSessionUser();
    return user ? StorageService.getNotifications(user.id) : [];
  });

  // Navigation & View State
  const [activeView, setActiveView] = React.useState<'board' | 'admin' | 'architecture'>('board');
  const [selectedBreakType, setSelectedBreakType] = React.useState<'all' | 'tea' | 'lunch' | 'walk'>('all');
  const [onlyFreeNow, setOnlyFreeNow] = React.useState(false);
  const [selectedZone, setSelectedZone] = React.useState<string>('all');

  // Modals & Drawers State
  const [selectedPostForInterests, setSelectedPostForInterests] = React.useState<BreakPost | null>(null);
  const [activeChatPost, setActiveChatPost] = React.useState<BreakPost | null>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = React.useState(false);
  const [isAuthOpen, setIsAuthOpen] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [isZeroCostOpen, setIsZeroCostOpen] = React.useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Sync dark class on documentElement
  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load & periodically sync with Real Authoritative Backend API
  const syncWithBackend = React.useCallback(async () => {
    try {
      const [comms, users, breaks, logs, resets] = await Promise.all([
        ApiService.getCommunities(),
        ApiService.getUsers(),
        ApiService.getBreaks(),
        ApiService.getAuditLogs(),
        ApiService.getResetRequests().catch(() => []),
      ]);
      setCommunities(comms);
      if (comms.length > 0) {
        setActiveCommunity((prev) => comms.find((c) => c.id === prev.id) || comms[0]);
      }
      setAllUsers(users);
      setBreakPosts(breaks);
      setAuditLogs(logs);
      setResetRequests(resets || []);

      if (currentUser) {
        const notifs = await ApiService.getNotifications(currentUser.id);
        setNotifications(notifs);
        const fresh = users.find((u) => u.id === currentUser.id);
        if (fresh && fresh.status !== currentUser.status) {
          setCurrentUser(fresh);
        }
      }
    } catch (err) {
      // Backend sync fallback if network blip
    }
  }, [currentUser]);

  React.useEffect(() => {
    syncWithBackend();
    const interval = setInterval(syncWithBackend, 4000);
    return () => clearInterval(interval);
  }, [syncWithBackend]);

  // Sync session & notifications when currentUser changes
  React.useEffect(() => {
    if (currentUser) {
      StorageService.setCurrentSessionUser(currentUser);
      ApiService.getNotifications(currentUser.id)
        .then(setNotifications)
        .catch(() => setNotifications(StorageService.getNotifications(currentUser.id)));
    } else {
      StorageService.setCurrentSessionUser(null);
      setNotifications([]);
    }
  }, [currentUser]);

  // Automatically sync activeCommunity to user's registered campus
  React.useEffect(() => {
    if (currentUser?.campusId && communities.length > 0) {
      const match = communities.find((c) => c.id === currentUser.campusId);
      if (match && match.id !== activeCommunity.id) {
        setActiveCommunity(match);
      }
    }
  }, [currentUser?.campusId, communities, activeCommunity.id]);

  // Reset zone filter whenever campus changes
  React.useEffect(() => {
    setSelectedZone('all');
  }, [activeCommunity.id]);

  // Compute available zones dynamically from current campus locations
  const availableCampusZones = React.useMemo(() => {
    return Array.from(new Set(activeCommunity.locations.map((l) => l.zone))).filter(Boolean);
  }, [activeCommunity]);

  const pendingApprovalsCount = allUsers.filter((u) => u.status === 'pending_approval').length;
  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  // Filter posts based on active community and filters
  const filteredPosts = breakPosts.filter((post) => {
    if (post.communityId !== activeCommunity.id) return false;
    if (selectedBreakType !== 'all' && post.breakType !== selectedBreakType) return false;
    if (onlyFreeNow && post.expiresAt <= now) return false;
    if (selectedZone !== 'all' && post.zone !== selectedZone) return false;
    return true;
  });

  // Current user's active break (if any)
  const myActiveBreak = currentUser
    ? breakPosts.find((p) => p.userId === currentUser.id && p.expiresAt > now)
    : null;

  // Real Admin Actions (Backed by Server API)
  const handleApproveUser = async (userId: string) => {
    try {
      const adminInfo = { id: currentUser?.id || 'admin', name: currentUser?.name || 'Campus Admin' };
      const { user: updatedUser, log } = await ApiService.approveUser(userId, adminInfo);
      setAllUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
      setAuditLogs((prev) => [log, ...prev]);
      if (currentUser?.id === userId) {
        setCurrentUser(updatedUser);
      }
      showToast(`✅ Approved ${updatedUser.name}! Profile is now verified.`);
    } catch (err: any) {
      showToast(`Approval failed: ${err.message}`);
    }
  };

  const handleRejectUser = async (userId: string, reason: string) => {
    try {
      const adminInfo = { id: currentUser?.id || 'admin', name: currentUser?.name || 'Campus Admin' };
      const { log } = await ApiService.rejectUser(userId, adminInfo, reason);
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      setAuditLogs((prev) => [log, ...prev]);
      showToast(`Rejected registration.`);
    } catch (err: any) {
      showToast(`Reject failed: ${err.message}`);
    }
  };

  const handleToggleUserStatus = async (userId: string, newStatus: 'approved' | 'suspended') => {
    try {
      const adminInfo = { id: currentUser?.id || 'admin', name: currentUser?.name || 'Campus Admin' };
      const { user: updatedUser, log } = await ApiService.toggleUserStatus(userId, adminInfo);
      setAllUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
      setAuditLogs((prev) => [log, ...prev]);
      if (currentUser?.id === userId) {
        setCurrentUser(updatedUser);
      }
      showToast(`Updated status for ${updatedUser.name} to ${newStatus}.`);
    } catch (err: any) {
      showToast(`Status update failed: ${err.message}`);
    }
  };

  const handleAddLocation = async (name: string, zone: string, description: string) => {
    try {
      const adminInfo = { id: currentUser?.id || 'admin', name: currentUser?.name || 'Campus Admin' };
      const newLoc: CampusLocation = {
        id: `loc_${Date.now()}`,
        communityId: activeCommunity.id,
        name,
        zone,
        description,
        isPopular: false,
      };
      await ApiService.addLocation(activeCommunity.id, newLoc, adminInfo);
      await syncWithBackend();
      showToast(`Added new campus spot "${name}"!`);
    } catch (err: any) {
      showToast(`Add location failed: ${err.message}`);
    }
  };

  const handleApproveResetRequest = async (requestId: string) => {
    try {
      const adminInfo = { id: currentUser?.id || 'admin', name: currentUser?.name || 'Campus Admin' };
      const res = await ApiService.approveResetRequest(requestId, adminInfo);
      showToast(res.message || 'Password reset approved! User can now sign in without password to set new password.');
      await syncWithBackend();
    } catch (err: any) {
      showToast(`Approval failed: ${err.message}`);
    }
  };

  // Broadcast user's availability (Server API)
  const handleBroadcastBreak = async (data: {
    breakType: BreakType;
    durationMinutes: number;
    locationName: string;
    zone: string;
    customNote: string;
  }) => {
    if (!currentUser) return;
    try {
      const newPost = await ApiService.broadcastBreak({
        userId: currentUser.id,
        communityId: activeCommunity.id,
        breakType: data.breakType,
        durationMinutes: data.durationMinutes,
        locationName: data.locationName,
        zone: data.zone,
        customNote: data.customNote,
      });
      setBreakPosts((prev) => [newPost, ...prev]);
      showToast(`⚡ Your ${data.breakType.toUpperCase()} break is live on the campus board!`);
    } catch (err: any) {
      showToast(`Broadcast failed: ${err.message}`);
    }
  };

  // Extend active break by 10 minutes (Server API)
  const handleExtendMyBreak = async () => {
    if (!myActiveBreak) return;
    try {
      const res = await ApiService.extendBreak(myActiveBreak.id);
      setBreakPosts((prev) => prev.map((p) => (p.id === myActiveBreak.id ? res.post : p)));
      showToast('Extended your break by 10 minutes!');
    } catch (err: any) {
      showToast(`Extend failed: ${err.message}`);
    }
  };

  // Finish active break (Server API)
  const handleFinishMyBreak = async () => {
    if (!myActiveBreak) return;
    try {
      const res = await ApiService.completeBreak(myActiveBreak.id);
      setBreakPosts((prev) => prev.map((p) => (p.id === myActiveBreak.id ? res.post : p)));
      showToast('Break marked as completed.');
    } catch (err: any) {
      showToast(`Complete failed: ${err.message}`);
    }
  };

  // User Profile save (Server API)
  const handleSaveProfile = async (updated: UserProfile) => {
    try {
      const res = await ApiService.updateProfile(updated.id, updated);
      setCurrentUser(res.user);
      setAllUsers((prev) => prev.map((u) => (u.id === updated.id ? res.user : u)));
      showToast('Profile updated successfully!');
    } catch (err: any) {
      showToast(`Profile update failed: ${err.message}`);
    }
  };

  // New user registration (Server API)
  const handleRegisterNewUser = async (newUser: UserProfile) => {
    try {
      const targetCampusId = newUser.campusId || activeCommunity.id;
      const registered = await ApiService.registerUser({
        name: newUser.name,
        email: newUser.email,
        campusId: targetCampusId,
        roleTitle: newUser.roleTitle,
        communityId: targetCampusId,
        interests: newUser.interests,
        dietary: newUser.dietary,
        icebreaker: newUser.icebreaker,
      });
      setAllUsers((prev) => [...prev, registered]);
      setCurrentUser(registered);
      const userCampus = communities.find((c) => c.id === targetCampusId);
      if (userCampus) {
        setActiveCommunity(userCampus);
      }
      setActiveView('board');
      showToast(`Welcome ${registered.name}! Waiting approval by admin.`);
    } catch (err: any) {
      showToast(`Registration failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#FAF9F6] text-slate-900 dark:bg-[#0B0F19] dark:text-slate-100 transition-colors">
      {/* 3-Zone Top Navigation */}
      <Navbar
        communities={communities}
        activeCommunity={activeCommunity}
        onSelectCommunity={(c) => {
          setActiveCommunity(c);
          showToast(`Switched hub to ${c.name}`);
        }}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onSignOut={async () => {
          await ApiService.logout();
          setCurrentUser(null);
          showToast('Signed out of MidDay Buddy.');
        }}
        onOpenZeroCostModal={() => setIsZeroCostOpen(true)}
        activeView={activeView}
        onChangeView={setActiveView}
        pendingApprovalsCount={pendingApprovalsCount}
        unreadNotificationsCount={unreadNotificationsCount}
        onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />

      {/* Notification Center Popover */}
      {currentUser && (
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <NotificationCenter
            notifications={notifications}
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            onMarkAllRead={() => {
              StorageService.markNotificationsRead(currentUser.id);
              setNotifications(StorageService.getNotifications(currentUser.id));
              showToast('All notifications marked as read.');
            }}
          />
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 pb-24 md:pb-16 max-w-full overflow-x-hidden">
        {/* VIEW 1: Campus Admin Portal */}
        {activeView === 'admin' ? (
          currentUser?.role === 'community_admin' ? (
            <AdminDashboard
              community={activeCommunity}
              allUsers={allUsers}
              onApproveUser={handleApproveUser}
              onRejectUser={handleRejectUser}
              onToggleUserStatus={handleToggleUserStatus}
              locations={activeCommunity.locations}
              onAddLocation={handleAddLocation}
              auditLogs={auditLogs}
              resetRequests={resetRequests}
              onApproveResetRequest={handleApproveResetRequest}
              onSwitchToApprovedUser={() => {
                const approvedUser = allUsers.find((u) => u.status === 'approved' && u.role === 'user') || allUsers[0];
                setCurrentUser(approvedUser);
                setActiveView('board');
              }}
            />
          ) : (
            <div className="mx-auto max-w-lg p-12 text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-indigo-500" />
              <h2 className="mt-3 text-lg font-bold">Admin Portal Access Restricted</h2>
              <p className="mt-1 text-xs text-slate-500">
                You must be logged in as a Campus Administrator to access this section.
              </p>
              <button
                onClick={() => setIsAuthOpen(true)}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Sign In as Admin
              </button>
            </div>
          )
        ) : !currentUser ? (
          /* VIEW 2: Unauthenticated Visitor Landing */
          <div className="mx-auto max-w-3xl px-4 py-16 text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-2xl bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
              <Coffee className="h-4 w-4" />
              <span>{activeCommunity.name} · Verified Workplace Network</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Connect for Tea & Lunch Breaks at {activeCommunity.name}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              Never eat alone or step out in silence. Spontaneously find companions for chai, meals, and outdoor strolls across {activeCommunity.name} ({activeCommunity.city}).
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3.5 text-xs font-bold text-white shadow-lg shadow-orange-500/25 hover:from-amber-600 hover:to-orange-700 active:scale-[0.98] transition-all"
              >
                <Zap className="h-4 w-4 fill-current" />
                <span>Sign In / Create Account</span>
              </button>
            </div>
          </div>
        ) : currentUser.status === 'pending_approval' ? (
          /* VIEW 3: Gated Pending Approval View */
          <PendingApprovalView
            user={currentUser}
            community={activeCommunity}
            onSwitchToAdmin={() => {
              const admin = allUsers.find((u) => u.role === 'community_admin') || allUsers[0];
              setCurrentUser(admin);
              setActiveView('admin');
            }}
          />
        ) : currentUser.status === 'suspended' ? (
          /* VIEW 4: Suspended User View */
          <div className="mx-auto max-w-md p-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
            <h2 className="mt-3 text-lg font-bold">Account Access Suspended</h2>
            <p className="mt-1 text-xs text-slate-500">
              Your campus account has been temporarily suspended by community moderators. Please contact campus culture admin.
            </p>
          </div>
        ) : (
          /* VIEW 5: Live Break Directory (Approved Members) */
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
            {/* My Active Break Pinned Banner (If current user has an ongoing break) */}
            {myActiveBreak && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 dark:border-emerald-800 dark:from-emerald-950/40 dark:to-teal-950/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-xs">
                    <Coffee className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        ⚡ Your Active Break is Live!
                      </span>
                      <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200 font-mono-numbers">
                        {Math.max(0, Math.floor((myActiveBreak.expiresAt - now) / 60000))}m remaining
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                      Spot: <strong>{myActiveBreak.locationName}</strong> · "{myActiveBreak.customNote}"
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleExtendMyBreak}
                    className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:bg-slate-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span>+10m</span>
                  </button>
                  <button
                    onClick={handleFinishMyBreak}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Done</span>
                  </button>
                </div>
              </div>
            )}

            {/* Campus Banner & Hero */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 sm:p-8 text-white shadow-lg shadow-orange-500/10">
              <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-xs">
                      {activeCommunity.name} · {activeCommunity.city}
                    </span>
                    <span className="text-xs text-amber-100">
                      {filteredPosts.filter((p) => p.expiresAt > now).length} active right now
                    </span>
                  </div>
                  <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">
                    Never eat or grab chai alone at {activeCommunity.name}.
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-amber-100 max-w-xl">
                    Connect with verified colleagues across {activeCommunity.name} ({activeCommunity.city}) for spontaneous tea breaks, cafeteria meals, and outdoor walks.
                  </p>
                </div>

                {/* Primary CTA: Broadcast Break */}
                <div className="shrink-0">
                  <button
                    onClick={() => setIsBroadcastOpen(true)}
                    className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-bold text-slate-900 shadow-md hover:bg-amber-50 active:scale-[0.98] transition-all whitespace-nowrap"
                  >
                    <Zap className="h-4 w-4 text-orange-600 fill-current" />
                    <span>Broadcast My Break (5s)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Strip & Interactive Controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 dark:border-slate-800 pb-4 max-w-full">
              {/* Segmented Filter Buttons */}
              <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-slate-800 rounded-2xl max-w-full overflow-x-auto no-scrollbar shrink-0">
                <button
                  onClick={() => setSelectedBreakType('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                    selectedBreakType === 'all'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  All Breaks ({breakPosts.filter((p) => p.communityId === activeCommunity.id).length})
                </button>

                <button
                  onClick={() => setSelectedBreakType('tea')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                    selectedBreakType === 'tea'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Coffee className="h-3.5 w-3.5" />
                  <span>Tea & Coffee (15m)</span>
                </button>

                <button
                  onClick={() => setSelectedBreakType('lunch')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                    selectedBreakType === 'lunch'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Utensils className="h-3.5 w-3.5" />
                  <span>Lunch Companions (30m)</span>
                </button>

                <button
                  onClick={() => setSelectedBreakType('walk')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                    selectedBreakType === 'walk'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Footprints className="h-3.5 w-3.5" />
                  <span>Walks</span>
                </button>
              </div>

              {/* Secondary Filters: Free Right Now & Spine Zones */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setOnlyFreeNow(!onlyFreeNow)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    onlyFreeNow
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span>Active Now Only</span>
                </button>

                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  <option value="all">All Campus Zones ({activeCommunity.locations.length} spots)</option>
                  {availableCampusZones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Break Cards Grid */}
            {filteredPosts.length === 0 ? (
              <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <Coffee className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                  No active breaks found with these filters
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Be the first to step out! Broadcast your availability and colleagues will join you along the Central Spine.
                </p>
                <button
                  onClick={() => setIsBroadcastOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 transition-colors"
                >
                  <Zap className="h-3.5 w-3.5 fill-current" />
                  <span>Broadcast Break Now</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {filteredPosts.map((post) => (
                  <BreakCard
                    key={post.id}
                    post={post}
                    now={now}
                    onSelectPost={(p) => setSelectedPostForInterests(p)}
                    onInstantConnect={(p) => {
                      setActiveChatPost(p);
                      showToast(`⚡ Connected with ${p.userName.split(' ')[0]}! Opening live coordination chat.`);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODALS & SLIDE-OVERS */}
      {/* 1. Interest & Icebreaker Pop-up */}
      <InterestModal
        post={selectedPostForInterests}
        onClose={() => setSelectedPostForInterests(null)}
        onConnect={(p) => {
          setActiveChatPost(p);
          showToast(`Connected with ${p.userName}!`);
        }}
      />

      {/* 2. Broadcast Availability Modal */}
      {currentUser && (
        <BroadcastModal
          isOpen={isBroadcastOpen}
          onClose={() => setIsBroadcastOpen(false)}
          currentUser={currentUser}
          locations={activeCommunity.locations}
          onBroadcast={handleBroadcastBreak}
        />
      )}

      {/* 3. Real-time Meetup Chat Drawer */}
      {currentUser && (
        <ChatDrawer
          isOpen={Boolean(activeChatPost)}
          onClose={() => setActiveChatPost(null)}
          activePost={activeChatPost}
          currentUser={currentUser}
        />
      )}

      {/* 4. Real Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          if (user.campusId) {
            const userCampus = communities.find((c) => c.id === user.campusId);
            if (userCampus) {
              setActiveCommunity(userCampus);
            }
          }
          showToast(`Signed in as ${user.name}`);
        }}
        allUsers={allUsers}
        communities={communities}
        activeCommunity={activeCommunity}
        onRegisterNew={handleRegisterNewUser}
      />

      {/* 5. Profile & Settings Modal */}
      {currentUser && (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          onSaveProfile={handleSaveProfile}
        />
      )}

      {/* 6. Zero-Cost Cloudflare Deployment Modal */}
      <ZeroCostArchitectureModal
        isOpen={isZeroCostOpen}
        onClose={() => setIsZeroCostOpen(false)}
      />

      {/* 7. Mandatory Force Password Change Modal (After Admin Approved Reset) */}
      {currentUser && currentUser.mustChangePassword && (
        <ForcePasswordChangeModal
          isOpen={true}
          userId={currentUser.id}
          userName={currentUser.name}
          onPasswordChanged={async (msg) => {
            await ApiService.logout();
            setCurrentUser(null);
            showToast(msg);
            setIsAuthOpen(true);
          }}
        />
      )}

      {/* Footer Branded for CoreReacher Enterprises (Properly padded above mobile bottom nav) */}
      <footer className="w-full border-t border-stone-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pt-6 pb-24 md:pb-6 px-4 text-center mt-auto z-10 transition-colors">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white text-[10px] font-bold">MB</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              MidDay Buddy backed by CoreReacher Enterprises
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Workplace Break Coordinator · Verified Employee Network
          </div>
        </div>
      </footer>

      {/* Mobile Ergonomic Bottom Navigation Bar */}
      <MobileBottomNav
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenBroadcast={() => setIsBroadcastOpen(true)}
        onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)}
        unreadNotificationsCount={unreadNotificationsCount}
        currentUser={currentUser}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-18 md:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl dark:bg-white dark:text-slate-900 animate-in fade-in-50 slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
