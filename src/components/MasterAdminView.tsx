import React, { useState, useId } from 'react';
import { CardRecord, AdminUser, AdminPermissions } from '../types';
import {
  Shield,
  ShieldCheck,
  UserPlus,
  Key,
  Lock,
  Unlock,
  Check,
  X,
  Trash2,
  Edit3,
  User,
  Users,
  Search,
  Sparkles,
  ExternalLink,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Eye,
} from 'lucide-react';
import { FirebaseCloudPanel } from './FirebaseCloudPanel';
import { formatApiError } from '../utils/api';

interface MasterAdminViewProps {
  cards: CardRecord[];
  admins: AdminUser[];
  activeAdmin: AdminUser;
  onSelectActiveAdmin: (admin: AdminUser) => void;
  onSaveAdmin: (adminData: Partial<AdminUser>) => Promise<void>;
  onDeleteAdmin: (adminId: string) => Promise<void>;
  onRefreshCards?: () => Promise<void>;
}

export const isMasterTestCardId = (id: string): boolean => /^0*([1-9]|10)$/.test(id.trim());

export const MasterAdminView: React.FC<MasterAdminViewProps> = ({
  cards,
  admins,
  activeAdmin,
  onSelectActiveAdmin,
  onSaveAdmin,
  onDeleteAdmin,
  onRefreshCards,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);

  // Form state
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'master' | 'restricted'>('restricted');
  const [assignedCardIds, setAssignedCardIds] = useState<string[]>([]);
  const [canEditCards, setCanEditCards] = useState<boolean>(true);
  const [canToggleAi, setCanToggleAi] = useState<boolean>(true);
  const [canExportCsv, setCanExportCsv] = useState<boolean>(false);
  const [canCreateCards, setCanCreateCards] = useState<boolean>(false);

  const [cardSearch, setCardSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [adminToDelete, setAdminToDelete] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openCreateModal = () => {
    setEditingAdmin(null);
    setName('');
    setEmail('');
    setRole('restricted');
    setAssignedCardIds([]);
    setCanEditCards(true);
    setCanToggleAi(true);
    setCanExportCsv(false);
    setCanCreateCards(false);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setName(admin.name);
    setEmail(admin.email);
    setRole(admin.role);
    setAssignedCardIds(admin.assignedCardIds || []);
    setCanEditCards(admin.permissions?.canEditCards ?? true);
    setCanToggleAi(admin.permissions?.canToggleAi ?? true);
    setCanExportCsv(admin.permissions?.canExportCsv ?? false);
    setCanCreateCards(admin.role === 'master');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleToggleCardSelection = (cardId: string) => {
    setAssignedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  const handleSelectAllCards = () => {
    setAssignedCardIds(cards.filter((c) => !isMasterTestCardId(c.id)).map((c) => c.id));
  };

  const handleClearAllCards = () => {
    setAssignedCardIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) {
      setFormError('Please enter the admin name.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    const isPrimaryMasterTarget = editingAdmin?.email?.toLowerCase().trim() === '66shashwatkumar66@gmail.com';
    const effectiveRole: 'master' | 'restricted' = isPrimaryMasterTarget ? 'master' : role;
    const effectiveEmail = isPrimaryMasterTarget ? '66shashwatkumar66@gmail.com' : trimmedEmail;
    const dedupedCardIds =
      effectiveRole === 'master'
        ? []
        : Array.from(new Set(assignedCardIds.map((id) => id.trim()).filter(Boolean)));

    setFormError('');
    setIsSubmitting(true);
    try {
      await onSaveAdmin({
        id: editingAdmin ? editingAdmin.id : undefined,
        name: trimmedName,
        email: effectiveEmail,
        role: effectiveRole,
        assignedCardIds: dedupedCardIds,
        permissions: {
          canEditCards,
          canToggleAi,
          canExportCsv: effectiveRole === 'master' ? true : canExportCsv,
          canCreateCards: effectiveRole === 'master',
        },
      });
      setIsModalOpen(false);
      setActionFeedback({
        type: 'success',
        text: editingAdmin
          ? `Updated permissions for "${trimmedName}" (${effectiveEmail}).`
          : `Registered sub-admin "${trimmedName}" (${effectiveEmail}) successfully.`,
      });
    } catch (err: any) {
      setFormError(formatApiError(err, 'Failed to update administrator permissions.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!adminToDelete || isDeleting) return;
    const target = adminToDelete;
    setIsDeleting(true);
    setActionFeedback(null);
    try {
      await onDeleteAdmin(target.id);
      setAdminToDelete(null);
      setActionFeedback({
        type: 'success',
        text: `Admin "${target.name}" (${target.email}) was deleted and their access has been revoked immediately. Assigned QR cards, business configs, and scan logs remain untouched.`,
      });
    } catch (err: any) {
      setAdminToDelete(null);
      setActionFeedback({
        type: 'error',
        text: formatApiError(err, `Failed to delete admin "${target.name}". Please try again.`),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const editingIsPrimaryMaster = editingAdmin?.email?.toLowerCase().trim() === '66shashwatkumar66@gmail.com';
  const knownCardIdsLower = new Set(cards.map((c) => c.id.toLowerCase()));
  const unlistedAssignedIds = assignedCardIds.filter((cid) => !knownCardIdsLower.has(cid.toLowerCase()));

  const filteredCardsForModal = cards.filter((c) => {
    const term = cardSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      c.id.toLowerCase().includes(term) ||
      (c.businessName && c.businessName.toLowerCase().includes(term)) ||
      (c.notes && c.notes.toLowerCase().includes(term))
    );
  });

  const masterAdminCount = admins.filter((a) => a.role === 'master').length;
  const restrictedAdminCount = admins.filter((a) => a.role === 'restricted').length;

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#4285F4] to-[#1A73E8] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  Master Admin & Staff Access Control
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200 font-mono">
                  RBAC Mode
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Register new sub-admins with restricted permissions. Each sub-admin can only view and edit the specific cards you assign to them.
              </p>
            </div>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/25 active:scale-95 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Sub-Admin</span>
          </button>
        </div>
      </div>

      {/* Action Success / Error Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-2xs ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-semibold">{actionFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity shrink-0"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Role Simulation Switcher */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-[#FBBC05] text-slate-950 text-[10px] font-black uppercase tracking-wider">
              Current Session
            </span>
            <span className="text-xs text-slate-300">
              Switch role below to test the exact experience of any restricted sub-admin
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm sm:text-base font-bold">
            {activeAdmin.role === 'master' ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Master Admin Mode ({activeAdmin.name}) · Full Unrestricted Control</span>
              </span>
            ) : (
              <span className="text-amber-300 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  <span>
                    Restricted Sub-Admin Mode ({activeAdmin.name}) · Limited to {activeAdmin.assignedCardIds.length} cards
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const master = admins.find((a) => a.role === 'master' || a.email.toLowerCase() === '66shashwatkumar66@gmail.com') || admins[0];
                    if (master) onSelectActiveAdmin(master);
                  }}
                  className="px-2.5 py-0.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 text-xs font-bold border border-amber-400/40 cursor-pointer transition-colors"
                >
                  Exit to Master Admin
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-xs text-slate-400 mr-1 hidden sm:inline">Active Role:</div>
          <select
            value={activeAdmin.id}
            onChange={(e) => {
              const selected = admins.find((a) => a.id === e.target.value);
              if (selected) onSelectActiveAdmin(selected);
            }}
            className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4285F4]"
          >
            {admins.map((adm) => (
              <option key={adm.id} value={adm.id}>
                {adm.role === 'master' ? '👑 Master: ' : '🔒 Sub-Admin: '} {adm.name} ({adm.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Admins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {admins.map((admin) => {
          const isMaster = admin.role === 'master';
          const isActive = activeAdmin.id === admin.id;

          return (
            <div
              key={admin.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all relative ${
                isActive
                  ? 'border-[#1A73E8] ring-2 ring-blue-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                {/* Header Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      isMaster
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {isMaster ? <ShieldCheck className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    <span>{isMaster ? 'Master Admin' : 'Restricted Sub-Admin'}</span>
                  </span>

                  {isActive && (
                    <span className="text-[10px] font-extrabold text-[#1A73E8] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      ACTIVE SESSION
                    </span>
                  )}
                </div>

                {/* Admin Details */}
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-400" />
                  <span>{admin.name}</span>
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">{admin.email}</p>

                {/* Assigned Cards Section */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                    <span>Authorized Cards:</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {isMaster ? 'All Inventory' : `${admin.assignedCardIds.length} cards`}
                    </span>
                  </div>

                  {isMaster ? (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                      Unrestricted access to generate, edit, and assign all cards in system.
                    </div>
                  ) : admin.assignedCardIds.length === 0 ? (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                      No QR cards assigned yet. Sub-admin can log in cleanly and will see an empty state until cards are assigned.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-xl">
                      {admin.assignedCardIds.map((cardId) => (
                        <span
                          key={cardId}
                          className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-slate-800 border border-slate-200 shadow-2xs"
                        >
                          #{cardId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Permissions Badges */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1 text-[10px]">
                  <span
                    className={`px-2 py-0.5 rounded-md font-medium border ${
                      admin.permissions?.canEditCards ?? true
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    Edit Cards
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-medium border ${
                      admin.permissions?.canToggleAi ?? true
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    Toggle AI Review
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-medium border ${
                      admin.permissions?.canExportCsv
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    Export CSV
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectActiveAdmin(admin)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-slate-600 cursor-default'
                      : 'bg-blue-50 hover:bg-blue-100 text-[#1A73E8]'
                  }`}
                >
                  {isActive ? 'Current Active' : 'Switch & Test'}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(admin)}
                    title="Edit Card Assignments & Permissions"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {admin.email.toLowerCase() !== '66shashwatkumar66@gmail.com' &&
                    (!isMaster || masterAdminCount > 1) && (
                      <button
                        type="button"
                        onClick={() => setAdminToDelete(admin)}
                        title="Delete Admin"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Google Cloud Firestore Database Panel */}
      <FirebaseCloudPanel cards={cards} onRefreshCards={onRefreshCards || (async () => {})} />

      {/* Add / Edit Admin Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#1A73E8] text-white flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {editingAdmin ? `Edit Admin: ${editingAdmin.name}` : 'Register New Sub-Admin'}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Configure restricted card access & operational powers
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                  {formError}
                </div>
              )}

              {/* Admin Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={nameId} className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
                  />
                </div>

                <div>
                  <label htmlFor={emailId} className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    id={emailId}
                    type="email"
                    value={email}
                    disabled={editingIsPrimaryMaster}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. rahul@artisan.com"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Authority Level
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border transition-all ${
                      editingIsPrimaryMaster ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      role === 'restricted'
                        ? 'bg-blue-50/50 border-[#1A73E8] text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminRole"
                      disabled={editingIsPrimaryMaster}
                      checked={role === 'restricted'}
                      onChange={() => setRole('restricted')}
                      className="mt-0.5 text-[#1A73E8]"
                    />
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Restricted Sub-Admin</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Can ONLY edit and view the specific cards assigned below.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                      role === 'master'
                        ? 'bg-purple-50/50 border-purple-500 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminRole"
                      disabled={editingIsPrimaryMaster}
                      checked={role === 'master'}
                      onChange={() => setRole('master')}
                      className="mt-0.5 text-purple-600"
                    />
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                        <span>Master Admin</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Full powers across all cards, batch generation & admin management.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Card Assignment (Only for Restricted Sub-Admins) */}
              {role === 'restricted' && (
                <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-[#1A73E8]" />
                        <span>Assigned Cards ({assignedCardIds.length} selected)</span>
                      </span>
                      <p className="text-[11px] text-slate-500">
                        This sub-admin will ONLY be responsible for editing these cards:
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllCards}
                        className="text-[#1A73E8] hover:underline font-semibold"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={handleClearAllCards}
                        className="text-slate-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Card Search in Modal */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={cardSearch}
                      onChange={(e) => setCardSearch(e.target.value)}
                      placeholder="Search card ID or business name..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1A73E8]"
                    />
                  </div>

                  {/* Checklist of cards */}
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded-xl bg-white p-2">
                    {filteredCardsForModal.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-3">No matching cards found</p>
                    ) : (
                      filteredCardsForModal.map((card) => {
                        const isChecked = assignedCardIds.includes(card.id);
                        return (
                          <label
                            key={card.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                              isChecked
                                ? 'bg-blue-50/70 border border-blue-200 text-slate-900'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCardSelection(card.id)}
                                className="rounded text-[#1A73E8] focus:ring-blue-500"
                              />
                              <span className="font-mono font-bold text-xs">#{card.id}</span>
                              {isMasterTestCardId(card.id) && (
                                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-bold border border-purple-200 shrink-0">
                                  Master Test Card
                                </span>
                              )}
                              <span className="truncate font-medium text-slate-800">
                                {card.businessName || 'Unassigned stock'}
                              </span>
                            </div>

                            {card.notes && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                {card.notes}
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>

                  {unlistedAssignedIds.length > 0 && (
                    <div className="pt-1.5 space-y-1">
                      <p className="text-[10px] font-semibold text-amber-800">
                        Additional assigned card IDs ({unlistedAssignedIds.length}):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {unlistedAssignedIds.map((cid) => (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => handleToggleCardSelection(cid)}
                            title={`Remove #${cid}`}
                            className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                          >
                            <span>#{cid}</span>
                            <X className="w-2.5 h-2.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Granular Operational Powers */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="block text-xs font-bold text-slate-900">
                  Operational Powers & Feature Toggles
                </span>

                <div className="space-y-2 text-xs">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-slate-700">Can edit business name & review URL on assigned cards</span>
                    <input
                      type="checkbox"
                      checked={canEditCards}
                      onChange={(e) => setCanEditCards(e.target.checked)}
                      className="rounded text-[#1A73E8]"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-slate-700">Can toggle AI Review feature (ON / OFF)</span>
                    <input
                      type="checkbox"
                      checked={canToggleAi}
                      onChange={(e) => setCanToggleAi(e.target.checked)}
                      className="rounded text-[#1A73E8]"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-slate-700">Can export card inventory as CSV</span>
                    <input
                      type="checkbox"
                      checked={canExportCsv}
                      onChange={(e) => setCanExportCsv(e.target.checked)}
                      className="rounded text-[#1A73E8]"
                    />
                  </label>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                    <span>QR card batch creation & deletion</span>
                    <span className="font-semibold text-slate-700">
                      {role === 'master' ? 'Enabled (Master Admin)' : 'Master Admin Only'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save Admin Permissions'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Admin Confirmation Modal */}
      {adminToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#EA4335] flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                Delete Registered Admin?
              </h3>
              <p className="text-xs text-slate-600">
                Remove <strong>{adminToDelete.name}</strong>{' '}
                (<span className="font-mono">{adminToDelete.email}</span>) and revoke their admin access immediately.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Data Protection Guarantee:</div>
              <p>
                Assigned QR cards ({adminToDelete.assignedCardIds?.length || 0}), business configurations, historical scan logs, customer reviews, and subscriptions will remain completely untouched.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setAdminToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAdmin}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl bg-[#EA4335] text-white text-xs font-bold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Delete Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
