import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  CheckCircle,
  Search,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  Mail,
  Smartphone,
  Calendar,
  Lock,
  UserCheck,
  Award,
  AlertCircle,
  X,
} from 'lucide-react';
import { UserProfile, AdminUser } from '../types';
import { fetchUsers, deleteUser, authorizeUserAsAdmin, formatApiError } from '../utils/api';
import { GoogleAuthModal } from './GoogleAuthModal';

interface UsersManagementViewProps {
  activeAdmin: AdminUser;
  callerEmail?: string;
  onRefreshAdmins?: () => void;
}

export const UsersManagementView: React.FC<UsersManagementViewProps> = ({
  activeAdmin,
  callerEmail,
  onRefreshAdmins,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'master' | 'restricted' | 'member'>('all');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState<boolean>(false);
  const [updatingUserUid, setUpdatingUserUid] = useState<string | null>(null);

  const caller = {
    id: activeAdmin.id,
    email: callerEmail || activeAdmin.email,
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUserVerified = (newUser: UserProfile) => {
    loadData();
    if (onRefreshAdmins) onRefreshAdmins();
    setActionSuccess(`User ${newUser.displayName} (${newUser.email}) verified and saved!`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleRoleChange = async (user: UserProfile, newRole: 'master' | 'restricted' | 'member') => {
    if (updatingUserUid === user.uid) return;
    setUpdatingUserUid(user.uid);
    setActionError(null);
    setActionSuccess(null);
    try {
      await authorizeUserAsAdmin(
        {
          email: user.email,
          displayName: user.displayName,
          role: newRole,
          existingUid: user.uid,
          ...(newRole === 'member' ? { assignedCardIds: [] } : {}),
        },
        caller
      );

      await loadData();
      if (onRefreshAdmins) await onRefreshAdmins();
      setActionSuccess(
        `Updated ${user.displayName}'s role to ${
          newRole === 'master' ? 'Master Admin' : newRole === 'restricted' ? 'Sub-Admin' : 'Viewer'
        }`
      );
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(`Failed to update role: ${formatApiError(err, 'Unauthorized or database write failed')}`);
    } finally {
      setUpdatingUserUid(null);
    }
  };

  const handleRequestDeleteUser = (user: UserProfile) => {
    setActionError(null);
    if (user.email.trim().toLowerCase() === '66shashwatkumar66@gmail.com') {
      setActionError('Cannot delete the primary Master Admin account.');
      return;
    }
    setUserToDelete(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    setActionError(null);
    try {
      await deleteUser(userToDelete.uid, caller);
      const removedEmail = userToDelete.email;
      setUserToDelete(null);
      await loadData();
      if (onRefreshAdmins) onRefreshAdmins();
      setActionSuccess(`User ${removedEmail} removed.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(`Failed to delete user: ${err?.message || 'Permission denied'}`);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const exportUsersJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(users, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `3dbysd_users_export_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const masterCount = users.filter((u) => u.role === 'master').length;
  const verifiedCount = users.filter((u) => u.emailVerified).length;

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Google Verified Users & Logins
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1A73E8] text-xs font-bold">
              {users.length} Recorded
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete registry of every user authenticated via Google OAuth, Firestore, and Admin portal
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportUsersJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Users JSON</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Verify & Add User</span>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-800 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Accounts</span>
            <Users className="w-4 h-4 text-[#4285F4]" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{users.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Stored in Firestore & Server</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Google Verified</span>
            <CheckCircle className="w-4 h-4 text-[#34A853]" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2">{verifiedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">100% Verified Google Emails</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Master Admins</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-900 mt-2">{masterCount}</div>
          <div className="text-[11px] text-purple-700 mt-1">Full system authorization</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Session</span>
            <UserCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-sm font-bold text-slate-900 mt-2 truncate">
            {activeAdmin.email}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Role: {activeAdmin.role}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search email, name, or UID..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(['all', 'master', 'restricted', 'member'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                roleFilter === r
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r === 'all' ? 'All Roles' : r}
            </button>
          ))}
          <button
            onClick={loadData}
            title="Refresh list"
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Display Container - Responsive Table on PC, Responsive Cards on Mobile */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No users matching criteria found
          </div>
        ) : (
          <>
            {/* Mobile View: Stacked User Cards (Zero horizontal scrollbar) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <div key={user.uid} className="p-3.5 space-y-2.5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email)}`}
                        alt={user.displayName}
                        className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                          <span>{user.displayName}</span>
                          {user.role === 'master' && (
                            <span className="text-[9px] font-black text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                              👑 MASTER
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {user.role === 'master' ? '••••••••@internal.admin' : user.email}
                        </div>
                      </div>
                    </div>

                    {user.email.trim().toLowerCase() !== '66shashwatkumar66@gmail.com' && (
                      <button
                        onClick={() => handleRequestDeleteUser(user)}
                        title="Delete user"
                        className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100/80 text-xs">
                    <div className="flex items-center gap-1.5">
                      {user.accessRevoked ? (
                        <span className="text-[10px] bg-red-50 text-red-700 font-bold px-1.5 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> Revoked
                        </span>
                      ) : user.emailVerified !== false ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5" /> Verified
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-1.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> Pending
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">
                        {user.loginCount || 1} logins
                      </span>
                    </div>

                    <select
                      value={user.role}
                      disabled={user.email.trim().toLowerCase() === '66shashwatkumar66@gmail.com' || updatingUserUid === user.uid}
                      onChange={(e) => handleRoleChange(user, e.target.value as any)}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border focus:outline-none ${
                        user.role === 'master'
                          ? 'bg-purple-50 text-purple-900 border-purple-200'
                          : user.role === 'restricted'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <option value="master">Master</option>
                      <option value="restricted">Sub-Admin</option>
                      <option value="member">Viewer</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop PC View: Streamlined Fitted Table */}
            <div className="hidden md:block w-full overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">User & Identity</th>
                    <th className="py-3 px-3">Google Verification</th>
                    <th className="py-3 px-3">Access Role</th>
                    <th className="py-3 px-3">Logins</th>
                    <th className="py-3 px-3">Last Login</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-slate-50/70 transition-colors">
                      {/* User & Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email)}`}
                            alt={user.displayName}
                            className="w-7 h-7 rounded-full border border-slate-200 object-cover shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span className="truncate">{user.displayName}</span>
                              {user.role === 'master' && (
                                <span className="text-[9px] font-black text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200 shrink-0">
                                  👑 MASTER
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              {user.role === 'master' ? '••••••••@internal.admin' : user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Google Verification Status */}
                      <td className="py-3 px-3">
                        {user.accessRevoked ? (
                          <div className="flex items-center gap-1 text-red-700 font-semibold text-[11px] bg-red-50 px-2 py-0.5 rounded-full border border-red-200 w-fit">
                            <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                            <span>Revoked</span>
                          </div>
                        ) : user.emailVerified !== false ? (
                          <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 w-fit">
                            <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Verified</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-800 font-semibold text-[11px] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 w-fit">
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Pending</span>
                          </div>
                        )}
                      </td>

                      {/* Role Selector */}
                      <td className="py-3 px-3">
                        <select
                          value={user.role}
                          disabled={user.email.trim().toLowerCase() === '66shashwatkumar66@gmail.com' || updatingUserUid === user.uid}
                          onChange={(e) => handleRoleChange(user, e.target.value as any)}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg border focus:outline-none ${
                            user.role === 'master'
                              ? 'bg-purple-50 text-purple-900 border-purple-200'
                              : user.role === 'restricted'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <option value="master">Master Admin</option>
                          <option value="restricted">Sub-Admin</option>
                          <option value="member">Viewer</option>
                        </select>
                      </td>

                      {/* Login Count */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 text-xs">
                        {user.loginCount || 1}
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-3 text-slate-600 text-[11px]">
                        <div>{new Date(user.lastLoginAt).toLocaleDateString()}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {user.email.trim().toLowerCase() !== '66shashwatkumar66@gmail.com' && (
                          <button
                            onClick={() => handleRequestDeleteUser(user)}
                            title="Delete user"
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Remove User Account?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to remove{' '}
                  <strong className="text-slate-900">{userToDelete.displayName}</strong>{' '}
                  (<span className="font-mono">{userToDelete.email}</span>)?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeletingUser ? 'Removing...' : 'Remove User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Auth Modal */}
      <GoogleAuthModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleUserVerified}
        defaultEmail={activeAdmin.email || '66shashwatkumar66@gmail.com'}
        adminCaller={caller}
      />
    </div>
  );
};
