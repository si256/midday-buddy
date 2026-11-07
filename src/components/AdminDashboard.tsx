import React from 'react';
import { 
  ShieldCheck, 
  UserCheck, 
  UserX, 
  MapPin, 
  History, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  AlertTriangle,
  Building2,
  Users,
  Clock,
  Sparkles,
  KeyRound,
  Trash2,
  Edit2,
  ShieldAlert,
  Shield,
  ArrowRight,
  Check,
  X
} from 'lucide-react';
import { UserProfile, Community, CampusLocation, AuditLog, PasswordResetRequest, UserRole } from '../types';

interface AdminDashboardProps {
  communities: Community[];
  activeCommunity: Community;
  onSelectCommunity: (community: Community) => void;
  onCreateCommunity: (data: { name: string; city: string; description?: string }) => Promise<void>;
  onUpdateCommunity: (id: string, data: { name: string; city: string; description?: string }) => Promise<void>;
  onDeleteCommunity: (id: string) => Promise<void>;
  allUsers: UserProfile[];
  onApproveUser: (userId: string) => void;
  onRejectUser: (userId: string, reason: string) => void;
  onToggleUserStatus: (userId: string, newStatus: 'approved' | 'suspended') => void;
  onChangeUserRole: (userId: string, newRole: UserRole) => void;
  onDeleteUser: (userId: string) => void;
  onCreateUser: (userData: {
    name: string;
    email: string;
    employeeId: string;
    role: UserRole;
    roleTitle?: string;
    campusId?: string;
    password?: string;
  }) => Promise<void>;
  locations: CampusLocation[];
  onAddLocation: (communityId: string, name: string, zone: string, description: string, isPopular?: boolean) => Promise<void>;
  onUpdateLocation: (communityId: string, locId: string, updates: Partial<CampusLocation>) => Promise<void>;
  onDeleteLocation: (communityId: string, locId: string) => Promise<void>;
  auditLogs: AuditLog[];
  onSwitchToApprovedUser: () => void;
  resetRequests?: PasswordResetRequest[];
  onApproveResetRequest?: (requestId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  communities,
  activeCommunity,
  onSelectCommunity,
  onCreateCommunity,
  onUpdateCommunity,
  onDeleteCommunity,
  allUsers,
  onApproveUser,
  onRejectUser,
  onToggleUserStatus,
  onChangeUserRole,
  onDeleteUser,
  onCreateUser,
  locations,
  onAddLocation,
  onUpdateLocation,
  onDeleteLocation,
  auditLogs,
  onSwitchToApprovedUser,
  resetRequests = [],
  onApproveResetRequest,
}) => {
  const [activeTab, setActiveTab] = React.useState<'pending' | 'reset_requests' | 'members' | 'locations' | 'audit'>('pending');
  const [searchQuery, setSearchQuery] = React.useState('');
  
  // Selected campus inside the Locations/Campus tab
  const [selectedCampusId, setSelectedCampusId] = React.useState<string>(activeCommunity?.id || communities[0]?.id || 'comm_siruseri');

  const currentViewingCommunity = communities.find((c) => c.id === selectedCampusId) || activeCommunity || communities[0] || {
    id: 'comm_siruseri',
    name: 'Workplace Campus',
    slug: 'workplace-campus',
    city: 'Chennai',
    description: '',
    memberCount: 0,
    activeBreaksCount: 0,
    locations: [],
  };
  const currentViewingLocations = currentViewingCommunity?.locations || [];

  // Modals state
  const [showAddCampusModal, setShowAddCampusModal] = React.useState(false);
  const [editingCampus, setEditingCampus] = React.useState<Community | null>(null);
  const [deletingCampus, setDeletingCampus] = React.useState<Community | null>(null);
  const [campusWarning, setCampusWarning] = React.useState<string | null>(null);
  
  const [showAddSpotModal, setShowAddSpotModal] = React.useState(false);
  const [editingSpot, setEditingSpot] = React.useState<CampusLocation | null>(null);
  const [deletingSpot, setDeletingSpot] = React.useState<CampusLocation | null>(null);

  const [showAddUserModal, setShowAddUserModal] = React.useState(false);
  const [deletingUser, setDeletingUser] = React.useState<UserProfile | null>(null);
  const [rejectingUserId, setRejectingUserId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('Does not meet campus verification criteria');

  // Form inputs for Campus
  const [campusName, setCampusName] = React.useState('');
  const [campusCity, setCampusCity] = React.useState('Chennai');
  const [campusDesc, setCampusDesc] = React.useState('');

  // Form inputs for Spot
  const [spotName, setSpotName] = React.useState('');
  const [spotZone, setSpotZone] = React.useState('Central Spine');
  const [spotDesc, setSpotDesc] = React.useState('');
  const [spotIsPopular, setSpotIsPopular] = React.useState(false);

  // Form inputs for New User
  const [newUserName, setNewUserName] = React.useState('');
  const [newUserEmail, setNewUserEmail] = React.useState('');
  const [newUserEmpId, setNewUserEmpId] = React.useState('');
  const [newUserRole, setNewUserRole] = React.useState<UserRole>('user');
  const [newUserRoleTitle, setNewUserRoleTitle] = React.useState('Software Engineer');
  const [newUserCampusId, setNewUserCampusId] = React.useState(activeCommunity?.id || communities[0]?.id || 'comm_siruseri');
  const [newUserPassword, setNewUserPassword] = React.useState('');

  // Filtering
  const pendingUsers = allUsers.filter((u) => u.status === 'pending_approval');
  const pendingResets = resetRequests.filter((r) => r.status === 'pending');
  const filteredMembers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.employeeId && u.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      u.roleTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Handlers for Campus ---
  const handleOpenAddCampus = () => {
    setCampusName('');
    setCampusCity('Chennai');
    setCampusDesc('');
    setShowAddCampusModal(true);
  };

  const handleOpenEditCampus = (comm: Community) => {
    setEditingCampus(comm);
    setCampusName(comm.name);
    setCampusCity(comm.city);
    setCampusDesc(comm.description || '');
  };

  const handleSaveCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campusName.trim() || !campusCity.trim()) return;

    if (editingCampus) {
      await onUpdateCommunity(editingCampus.id, {
        name: campusName.trim(),
        city: campusCity.trim(),
        description: campusDesc.trim(),
      });
      setEditingCampus(null);
    } else {
      await onCreateCommunity({
        name: campusName.trim(),
        city: campusCity.trim(),
        description: campusDesc.trim(),
      });
      setShowAddCampusModal(false);
    }
  };

  const handleDeleteCampusClick = (comm: Community) => {
    if (communities.length <= 1) {
      setCampusWarning('Cannot delete the only campus. At least one workplace campus must exist.');
      return;
    }
    setDeletingCampus(comm);
  };

  const handleConfirmDeleteCampus = async () => {
    if (!deletingCampus) return;
    const commToDelete = deletingCampus;
    setDeletingCampus(null);
    await onDeleteCommunity(commToDelete.id);
    const remaining = communities.filter((c) => c.id !== commToDelete.id);
    if (remaining.length > 0) {
      setSelectedCampusId(remaining[0].id);
      onSelectCommunity(remaining[0]);
    }
  };

  // --- Handlers for Spots ---
  const handleOpenAddSpot = () => {
    setSpotName('');
    setSpotZone('Central Spine');
    setSpotDesc('');
    setSpotIsPopular(false);
    setShowAddSpotModal(true);
  };

  const handleOpenEditSpot = (loc: CampusLocation) => {
    setEditingSpot(loc);
    setSpotName(loc.name);
    setSpotZone(loc.zone);
    setSpotDesc(loc.description || '');
    setSpotIsPopular(Boolean(loc.isPopular));
  };

  const handleSaveSpot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotName.trim() || !spotZone.trim()) return;

    if (editingSpot) {
      await onUpdateLocation(currentViewingCommunity.id, editingSpot.id, {
        name: spotName.trim(),
        zone: spotZone.trim(),
        description: spotDesc.trim(),
        isPopular: spotIsPopular,
      });
      setEditingSpot(null);
    } else {
      await onAddLocation(
        currentViewingCommunity.id,
        spotName.trim(),
        spotZone.trim(),
        spotDesc.trim(),
        spotIsPopular
      );
      setShowAddSpotModal(false);
    }
  };

  const handleDeleteSpotClick = (loc: CampusLocation) => {
    setDeletingSpot(loc);
  };

  const handleConfirmDeleteSpot = async () => {
    if (!deletingSpot) return;
    const locToDelete = deletingSpot;
    setDeletingSpot(null);
    await onDeleteLocation(currentViewingCommunity.id, locToDelete.id);
  };

  // --- Handlers for Users ---
  const handleSaveNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserEmpId.trim()) return;

    await onCreateUser({
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      employeeId: newUserEmpId.trim().toUpperCase(),
      role: newUserRole,
      roleTitle: newUserRoleTitle.trim(),
      campusId: newUserCampusId,
      password: newUserPassword.trim() || 'Buddy@12345',
    });

    setShowAddUserModal(false);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserEmpId('');
    setNewUserPassword('');
  };

  const handleConfirmReject = () => {
    if (rejectingUserId) {
      onRejectUser(rejectingUserId, rejectionReason);
      setRejectingUserId(null);
      setRejectionReason('Does not meet campus verification criteria');
    }
  };

  const handleDeleteUserClick = (user: UserProfile) => {
    setDeletingUser(user);
  };

  const handleConfirmDeleteUser = () => {
    if (!deletingUser) return;
    const userToDelete = deletingUser;
    setDeletingUser(null);
    onDeleteUser(userToDelete.id);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Banner & Stats */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-300 mb-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Campus Admin Console</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {activeCommunity?.name || 'Workplace Campus'} Moderation
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Campus administration, member verification, multi-campus spots, and security logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchToApprovedUser}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Back to Break Directory
            </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div 
            onClick={() => setActiveTab('pending')}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeTab === 'pending'
                ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                : 'border-stone-100 bg-stone-50/50 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Approvals</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
              {pendingUsers.length}
            </div>
          </div>

          <div 
            onClick={() => setActiveTab('reset_requests')}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeTab === 'reset_requests'
                ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 shadow-xs'
                : 'border-stone-100 bg-stone-50/50 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Password Resets</span>
              <KeyRound className="h-4 w-4 text-orange-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-orange-600 dark:text-orange-400">
              {pendingResets.length}
            </div>
          </div>

          <div 
            onClick={() => setActiveTab('members')}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeTab === 'members'
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs'
                : 'border-stone-100 bg-stone-50/50 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">All Members</span>
              <Users className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {allUsers.filter((u) => u.status === 'approved').length}
            </div>
          </div>

          <div 
            onClick={() => setActiveTab('locations')}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeTab === 'locations'
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-xs'
                : 'border-stone-100 bg-stone-50/50 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Campuses & Spots</span>
              <MapPin className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {communities.reduce((acc, c) => acc + (c.locations?.length || 0), 0)}
            </div>
          </div>

          <div 
            onClick={() => setActiveTab('audit')}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeTab === 'audit'
                ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 shadow-xs'
                : 'border-stone-100 bg-stone-50/50 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Audit Actions</span>
              <History className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
              {auditLogs.length}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex gap-2 border-b border-stone-200 dark:border-slate-800 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'pending'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Pending Approvals</span>
          {pendingUsers.length > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reset_requests')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'reset_requests'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>Password Resets</span>
          {pendingResets.length > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {pendingResets.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'members'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Member Directory</span>
        </button>

        <button
          onClick={() => setActiveTab('locations')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'locations'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span>Campuses & Spots ({communities.length} Campuses)</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'audit'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Security Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: PENDING APPROVALS */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Applicants Awaiting Manual Review ({pendingUsers.length})
              </h2>
              <span className="text-xs text-slate-500">
                Only verified campus members can access the break directory.
              </span>
            </div>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">All Caught Up!</h3>
              <p className="mt-1 text-xs text-slate-500">
                There are no pending registrations waiting for review. New applicants will appear here immediately upon sign up.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pendingUsers.map((applicant) => {
                const targetCampus = communities.find((c) => c.id === applicant.campusId) || activeCommunity;
                return (
                  <div
                    key={applicant.id}
                    className="flex flex-col justify-between rounded-3xl border border-stone-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-amber-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${applicant.avatarBgColor} text-base font-bold text-white shadow-xs`}>
                            {applicant.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base">
                              {applicant.name}
                            </h3>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {applicant.roleTitle}
                            </div>
                          </div>
                        </div>

                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Pending
                        </span>
                      </div>

                      <div className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 border-t border-stone-100 dark:border-slate-800 pt-3">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Email ID:</span>
                          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{applicant.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Employee ID:</span>
                          <span className="font-mono text-[11px] font-bold text-amber-700 dark:text-amber-400">{applicant.employeeId || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Target Campus:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{targetCampus.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Dietary & Battery:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{applicant.dietary} · {applicant.socialBattery}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-2 border-t border-stone-100 dark:border-slate-800 pt-4">
                      <button
                        onClick={() => onApproveUser(applicant.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Approve Member</span>
                      </button>
                      <button
                        onClick={() => setRejectingUserId(applicant.id)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PASSWORD RESETS */}
      {activeTab === 'reset_requests' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Password Reset Requests ({pendingResets.length})
            </h2>
            <p className="text-xs text-slate-500">
              Users raise a request with Email ID and Employee ID. Once approved, they can log in without password to set a fresh one.
            </p>
          </div>

          {pendingResets.length === 0 ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No Reset Requests</h3>
              <p className="mt-1 text-xs text-slate-500">
                All password reset requests have been reviewed and approved.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pendingResets.map((reqItem) => (
                <div
                  key={reqItem.id}
                  className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-orange-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400">
                        <KeyRound className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base">
                          {reqItem.userName}
                        </h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Employee ID: <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{reqItem.employeeId}</span>
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Waiting approval by admin
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 border-t border-stone-100 dark:border-slate-800 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Email ID:</span>
                      <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{reqItem.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Employee ID:</span>
                      <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">{reqItem.employeeId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Requested At:</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">
                        {new Date(reqItem.requestedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-stone-100 dark:border-slate-800 pt-4">
                    <button
                      onClick={() => onApproveResetRequest && onApproveResetRequest(reqItem.id)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Approve Password Reset (Enable 1-Time Entry)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEMBER & CAMPUS ADMIN DIRECTORY */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Campus Member & Administrator Directory ({allUsers.length})
              </h2>
              <p className="text-xs text-slate-500">
                Manage roles, promote/revoke campus admins, suspend accounts, or add new verified colleagues.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-stone-200 bg-white py-1.5 pl-8 pr-3 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white w-48 sm:w-60"
                />
              </div>

              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Add Member / Admin</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider dark:border-slate-800 dark:bg-slate-800/40">
                    <th className="py-3 px-4">Colleague</th>
                    <th className="py-3 px-4">Email ID</th>
                    <th className="py-3 px-4">Campus</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs dark:divide-slate-800">
                  {filteredMembers.map((member) => {
                    const memberCampus = communities.find((c) => c.id === member.campusId) || activeCommunity;
                    const isMasterAdmin = member.email === 'admin@middaybuddy.com';
                    const isCampusAdmin = member.role === 'community_admin' || member.role === 'platform_admin';

                    return (
                      <tr key={member.id} className="hover:bg-stone-50/60 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${member.avatarBgColor} text-xs font-bold text-white`}>
                              {member.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                {member.name}
                                {isMasterAdmin && (
                                  <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    Master
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {member.roleTitle} {member.employeeId ? `· Emp ID: ${member.employeeId}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                          {member.email}
                        </td>

                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          {memberCampus.name}
                        </td>

                        <td className="py-3.5 px-4">
                          {isCampusAdmin ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                              <ShieldCheck className="h-3 w-3" />
                              Campus Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Member
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {member.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Approved
                            </span>
                          )}
                          {member.status === 'suspended' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Suspended
                            </span>
                          )}
                          {member.status === 'pending_approval' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Role Toggle: Make Admin / Revoke Admin */}
                            {!isMasterAdmin && (
                              <button
                                onClick={() => onChangeUserRole(member.id, isCampusAdmin ? 'user' : 'community_admin')}
                                title={isCampusAdmin ? 'Revoke Admin Privileges' : 'Promote to Campus Administrator'}
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                                  isCampusAdmin
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300'
                                    : 'border-stone-200 bg-stone-50 text-slate-700 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {isCampusAdmin ? 'Revoke Admin' : 'Make Admin'}
                              </button>
                            )}

                            {/* Status toggle */}
                            {member.status === 'approved' && !isMasterAdmin && (
                              <button
                                onClick={() => onToggleUserStatus(member.id, 'suspended')}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                              >
                                Suspend
                              </button>
                            )}
                            {member.status === 'suspended' && (
                              <button
                                onClick={() => onToggleUserStatus(member.id, 'approved')}
                                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                              >
                                Reinstate
                              </button>
                            )}

                            {/* Delete User */}
                            {!isMasterAdmin && (
                              <button
                                onClick={() => handleDeleteUserClick(member)}
                                title="Delete User Permanently"
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CAMPUSES & SPOTS MANAGEMENT */}
      {activeTab === 'locations' && (
        <div className="space-y-6">
          {/* Campus Selector and Campus CRUD */}
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Multi-Campus Architecture
                </span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Workplace Campuses ({communities.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Select a campus to inspect and manage all cafeteria, tea, and outdoor spots underneath it.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAddCampus}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New Campus</span>
                </button>
              </div>
            </div>

            {/* Campus Selector Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {communities.map((comm) => {
                const isSelected = comm.id === selectedCampusId;
                return (
                  <button
                    key={comm.id}
                    onClick={() => {
                      setSelectedCampusId(comm.id);
                      onSelectCommunity(comm);
                    }}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all shrink-0 border ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:border-indigo-500 dark:text-indigo-200 shadow-xs'
                        : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Building2 className={`h-4 w-4 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span>{comm.name}</span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      isSelected ? 'bg-indigo-200 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100' : 'bg-stone-100 dark:bg-slate-700 text-slate-500'
                    }`}>
                      {comm.locations?.length || 0} spots
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Campus Detail Card & Edit/Delete Controls */}
            <div className="rounded-2xl border border-stone-100 bg-stone-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {currentViewingCommunity.name}
                  </h3>
                  <span className="rounded-md bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {currentViewingCommunity.city}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {currentViewingCommunity.description || 'No campus description added.'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleOpenEditCampus(currentViewingCommunity)}
                  className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>Edit Campus</span>
                </button>

                <button
                  onClick={() => handleDeleteCampusClick(currentViewingCommunity)}
                  className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Campus</span>
                </button>
              </div>
            </div>
          </div>

          {/* Spots Under This Campus */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-orange-500" />
                  Spots in {currentViewingCommunity.name} ({currentViewingLocations.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Designated cafeteria spots, kiosks, and outdoor seating specific to this campus.
                </p>
              </div>

              <button
                onClick={handleOpenAddSpot}
                className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 shadow-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Spot to this Campus</span>
              </button>
            </div>

            {currentViewingLocations.length === 0 ? (
              <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <MapPin className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" />
                <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No Spots Registered Yet</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Add meeting spots, cafeteria tables, or tea kiosks for {currentViewingCommunity.name}.
                </p>
                <button
                  onClick={handleOpenAddSpot}
                  className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
                >
                  Add First Spot
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {currentViewingLocations.map((loc) => (
                  <div
                    key={loc.id}
                    className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-orange-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                            <MapPin className="h-4 w-4" />
                          </span>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white">{loc.name}</h4>
                            <span className="text-[11px] font-medium text-slate-500">{loc.zone}</span>
                          </div>
                        </div>

                        {loc.isPopular && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            High Traffic
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {loc.description || 'No additional landmark clue provided.'}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-slate-800 pt-3">
                      <button
                        onClick={() => handleOpenEditSpot(loc)}
                        className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleDeleteSpotClick(loc)}
                        className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Security & Moderation Audit Trail ({auditLogs.length})
            </h2>
            <p className="text-xs text-slate-500">
              Immutable historical logs of all administrative approvals, campus edits, and account modifications.
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {auditLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No audit records logged yet.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-center justify-between text-xs hover:bg-stone-50/50 dark:hover:bg-slate-800/30">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {log.action}
                        </span>
                        <span>{log.details}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Admin: <span className="font-medium text-slate-600 dark:text-slate-300">{log.adminName}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CAMPUS */}
      {(showAddCampusModal || editingCampus) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingCampus ? 'Edit Workplace Campus' : 'Register New Campus'}
              </h3>
              <button
                onClick={() => {
                  setShowAddCampusModal(false);
                  setEditingCampus(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCampus} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Campus Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TCS Siruseri Campus"
                  value={campusName}
                  onChange={(e) => setCampusName(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  City *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chennai, Bengaluru, Hyderabad"
                  value={campusCity}
                  onChange={(e) => setCampusCity(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Campus Description
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. 70-acre technology campus with central food court and outdoor lawns..."
                  value={campusDesc}
                  onChange={(e) => setCampusDesc(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCampusModal(false);
                    setEditingCampus(null);
                  }}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
                >
                  {editingCampus ? 'Save Changes' : 'Create Campus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CAMPUS SPOT */}
      {(showAddSpotModal || editingSpot) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingSpot ? 'Edit Campus Spot' : `Add Spot to ${currentViewingCommunity.name}`}
              </h3>
              <button
                onClick={() => {
                  setShowAddSpotModal(false);
                  setEditingSpot(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSpot} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Spot / Landmark Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spine Chai Point (Near Core)"
                  value={spotName}
                  onChange={(e) => setSpotName(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Zone / Wing *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Central Spine, Food Court 1, Lawn Area, Ground Floor"
                  value={spotZone}
                  onChange={(e) => setSpotZone(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description & Landmark Clue
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near glass doors by West Wing elevators"
                  value={spotDesc}
                  onChange={(e) => setSpotDesc(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="spotPopularCheck"
                  checked={spotIsPopular}
                  onChange={(e) => setSpotIsPopular(e.target.checked)}
                  className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="spotPopularCheck" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Mark as High Traffic Spot (Shown with badge)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSpotModal(false);
                    setEditingSpot(null);
                  }}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white hover:bg-orange-700 transition-colors"
                >
                  {editingSpot ? 'Save Spot' : 'Register Spot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEMBER / CAMPUS ADMIN */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Add Member or Administrator
              </h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sivasankar Raman"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email ID *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@company.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP-1092"
                    value={newUserEmpId}
                    onChange={(e) => setNewUserEmpId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono uppercase text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Access Role *
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="user">Verified Member</option>
                    <option value="community_admin">Campus Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Workplace Campus *
                  </label>
                  <select
                    value={newUserCampusId}
                    onChange={(e) => setNewUserCampusId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  >
                    {communities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Designation / Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Software Engineer"
                    value={newUserRoleTitle}
                    onChange={(e) => setNewUserRoleTitle(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Initial Password
                  </label>
                  <input
                    type="text"
                    placeholder="Default: Buddy@12345"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Create & Verify Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REJECT REASON CONFIRMATION */}
      {rejectingUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Confirm Registration Rejection
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Rejecting will permanently decline this applicant and remove the request from the pending queue.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Rejection
              </label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              >
                <option value="Does not meet campus verification criteria">Does not meet campus verification criteria</option>
                <option value="Invalid or unverified Employee ID">Invalid or unverified Employee ID</option>
                <option value="Duplicate or conflicting registration details">Duplicate or conflicting registration details</option>
                <option value="Not located in this campus network">Not located in this campus network</option>
              </select>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingUserId(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors shadow-sm"
              >
                Confirm & Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CAMPUS WARNING (CANNOT DELETE ONLY CAMPUS) */}
      {campusWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Campus Action Restricted
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {campusWarning}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setCampusWarning(null)}
                className="rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white hover:bg-orange-700 transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE CAMPUS */}
      {deletingCampus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <Trash2 className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Delete Campus Permanently
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">"{deletingCampus.name}"</span>?
            </p>
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
              Warning: All {deletingCampus.locations?.length || 0} cafeteria & tea spots under this campus, active break posts, and associated records will be permanently removed. This action cannot be reversed.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingCampus(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCampus}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors shadow-sm"
              >
                Delete Campus Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE SPOT */}
      {deletingSpot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <Trash2 className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Delete Spot
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to delete spot <span className="font-bold text-slate-900 dark:text-white">"{deletingSpot.name}"</span> ({deletingSpot.zone})?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingSpot(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSpot}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors shadow-sm"
              >
                Delete Spot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE USER */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <Trash2 className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Delete Colleague Account
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to permanently delete user <span className="font-bold text-slate-900 dark:text-white">"{deletingUser.name}"</span> ({deletingUser.email})?
            </p>
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
              This will scrub the user profile, active break history, and credentials from the system.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors shadow-sm"
              >
                Delete User Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
