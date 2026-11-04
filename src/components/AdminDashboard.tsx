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
  Sparkles
} from 'lucide-react';
import { UserProfile, Community, CampusLocation, AuditLog } from '../types';

interface AdminDashboardProps {
  community: Community;
  allUsers: UserProfile[];
  onApproveUser: (userId: string) => void;
  onRejectUser: (userId: string, reason: string) => void;
  onToggleUserStatus: (userId: string, newStatus: 'approved' | 'suspended') => void;
  locations: CampusLocation[];
  onAddLocation: (name: string, zone: string, description: string) => void;
  auditLogs: AuditLog[];
  onSwitchToApprovedUser: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  community,
  allUsers,
  onApproveUser,
  onRejectUser,
  onToggleUserStatus,
  locations,
  onAddLocation,
  auditLogs,
  onSwitchToApprovedUser,
}) => {
  const [activeTab, setActiveTab] = React.useState<'pending' | 'members' | 'locations' | 'audit'>('pending');
  const [searchQuery, setSearchQuery] = React.useState('');
  
  // Location form state
  const [showLocationForm, setShowLocationForm] = React.useState(false);
  const [newLocName, setNewLocName] = React.useState('');
  const [newLocZone, setNewLocZone] = React.useState('Central Spine');
  const [newLocDesc, setNewLocDesc] = React.useState('');

  const pendingUsers = allUsers.filter((u) => u.status === 'pending_approval');
  const filteredMembers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.roleTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) return;
    onAddLocation(newLocName.trim(), newLocZone, newLocDesc.trim());
    setNewLocName('');
    setNewLocDesc('');
    setShowLocationForm(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Admin Header with Metrics */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-colors">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                Campus Admin Console
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {community.name} Moderation
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manual verification queue, member management, Central Spine spots, and security logs.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onSwitchToApprovedUser}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <span>Back to Break Directory</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Strip */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-amber-50/70 p-4 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">Pending Approvals</span>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 text-3xl font-extrabold text-amber-700 dark:text-amber-400 font-mono-numbers">
              {pendingUsers.length}
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-50/70 p-4 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">Approved Members</span>
              <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono-numbers">
              {allUsers.filter((u) => u.status === 'approved').length}
            </div>
          </div>

          <div className="rounded-2xl bg-blue-50/70 p-4 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">Spine Landmarks</span>
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-2 text-3xl font-extrabold text-blue-700 dark:text-blue-400 font-mono-numbers">
              {locations.length}
            </div>
          </div>

          <div className="rounded-2xl bg-purple-50/70 p-4 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-900 dark:text-purple-300">Audit Actions</span>
              <History className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-2 text-3xl font-extrabold text-purple-700 dark:text-purple-400 font-mono-numbers">
              {auditLogs.length}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-stone-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('pending')}
          className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'pending'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Pending Approvals Queue</span>
          {pendingUsers.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              activeTab === 'pending' ? 'bg-white text-amber-700' : 'bg-rose-500 text-white'
            }`}>
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'members'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Member Directory</span>
        </button>

        <button
          onClick={() => setActiveTab('locations')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'locations'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span>Spine Landmarks ({locations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'audit'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Security Audit Trail</span>
        </button>
      </div>

      {/* Tab 1: Pending Approvals Queue */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Applicants Awaiting Manual Review ({pendingUsers.length})
            </h2>
            <span className="text-xs text-slate-500">
              Only verified campus members can access the break directory.
            </span>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">All Caught Up!</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                There are no pending registrations waiting for review. New applicants will appear here immediately upon sign up.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pendingUsers.map((applicant) => (
                <div
                  key={applicant.id}
                  className="flex flex-col justify-between rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${applicant.avatarBgColor} text-base font-bold text-white shadow-xs`}>
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
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Pending
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 border-t border-stone-100 dark:border-slate-800 pt-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Corporate Email:</span>
                        <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{applicant.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target Campus:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{community.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Dietary & Battery:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{applicant.dietary} · {applicant.socialBattery}</span>
                      </div>
                    </div>

                    {applicant.bio && (
                      <div className="rounded-xl bg-stone-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 italic">
                        "{applicant.bio}"
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 flex items-center gap-3 pt-3 border-t border-stone-100 dark:border-slate-800">
                    <button
                      onClick={() => onApproveUser(applicant.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Approve Member</span>
                    </button>
                    
                    <button
                      onClick={() => onRejectUser(applicant.id, 'Incomplete verification credentials')}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-slate-800 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Member Directory & Moderation */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Campus Member Directory ({allUsers.length})
            </h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, role, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 dark:bg-slate-800/60 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Colleague</th>
                    <th className="py-3 px-4 font-semibold">Corporate Email</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                    <th className="py-3 px-4 font-semibold text-right">Moderation Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-stone-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${member.avatarBgColor} text-xs font-bold text-white`}>
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{member.name}</div>
                            <div className="text-[11px] text-slate-500">{member.roleTitle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {member.email}
                      </td>
                      <td className="py-3.5 px-4">
                        {member.status === 'approved' && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Approved
                          </span>
                        )}
                        {member.status === 'pending_approval' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Pending Review
                          </span>
                        )}
                        {member.status === 'suspended' && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Suspended
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 capitalize">
                          {member.role === 'community_admin' ? 'Administrator' : 'Employee'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {member.status === 'approved' && member.role !== 'community_admin' && (
                          <button
                            onClick={() => onToggleUserStatus(member.id, 'suspended')}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors"
                          >
                            Suspend Member
                          </button>
                        )}
                        {member.status === 'suspended' && (
                          <button
                            onClick={() => onToggleUserStatus(member.id, 'approved')}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                          >
                            Reinstate Member
                          </button>
                        )}
                        {member.status === 'pending_approval' && (
                          <button
                            onClick={() => onApproveUser(member.id)}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                          >
                            Approve Now
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Spine Landmarks & Meetup Spots */}
      {activeTab === 'locations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Designated Central Spine & Cafeteria Spots ({locations.length})
              </h2>
              <p className="text-xs text-slate-500">
                Official landmarks for quick meeting and tea/lunch coordination.
              </p>
            </div>

            <button
              onClick={() => setShowLocationForm(!showLocationForm)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Spot</span>
            </button>
          </div>

          {/* Add Location Form Drawer */}
          {showLocationForm && (
            <form
              onSubmit={handleAddLocationSubmit}
              className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4"
            >
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Register New Campus Landmark</h3>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Spot Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Spine South Coffee Kiosk"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Zone / Wing
                  </label>
                  <select
                    value={newLocZone}
                    onChange={(e) => setNewLocZone(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="Central Spine">Central Spine</option>
                    <option value="Food Court 1">Food Court 1</option>
                    <option value="Food Court 2">Food Court 2</option>
                    <option value="Outdoor Greens">Outdoor Greens</option>
                    <option value="Kiosks">Kiosks</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description & Landmark Clue
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near the main entrance glass door, wooden benches available"
                  value={newLocDesc}
                  onChange={(e) => setNewLocDesc(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowLocationForm(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Save Landmark
                </button>
              </div>
            </form>
          )}

          {/* Locations Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">{loc.name}</h4>
                      <span className="text-[11px] text-slate-500 font-medium">{loc.zone}</span>
                    </div>
                  </div>
                  {loc.isPopular && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High Traffic
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                  {loc.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Security Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Immutable Security Audit Trail ({auditLogs.length} Events)
            </h2>
            <span className="text-xs text-slate-500">
              Tracks all administrative approval, rejection, and suspension decisions.
            </span>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="divide-y divide-stone-100 dark:divide-slate-800 text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      <History className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {log.adminName}
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {log.action}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600 dark:text-slate-400">
                        {log.details}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
