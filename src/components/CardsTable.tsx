import React, { useState, useId } from 'react';
import { CardRecord, AdminUser } from '../types';
import {
  Search,
  ExternalLink,
  QrCode,
  Edit3,
  Trash2,
  Copy,
  Check,
  Download,
  Smartphone,
  Eye,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Clock,
  Ban,
  Sparkles,
  Radio,
  Zap,
  Lock,
  Filter,
  ChevronDown,
  CheckSquare,
  Layers,
} from 'lucide-react';
import { downloadCardPng, downloadCardSvg } from '../utils/qr';
import { exportCardsToCsv } from '../utils/csv';
import { bulkUpdateCardsStatus } from '../utils/api';

interface CardsTableProps {
  cards: CardRecord[];
  onAssignCard: (card: CardRecord) => void;
  onDeleteCard: (id: string) => void;
  onPreviewCard: (card: CardRecord) => void;
  onOpenBatchModal: () => void;
  onToggleAiReview?: (id: string, enabled: boolean) => void;
  onBulkUpdateStatus?: (cardIds: string[], status: 'available' | 'assigned') => Promise<void> | void;
  onOpenNfcGenerator?: (card?: CardRecord) => void;
  activeAdmin?: AdminUser;
}

export const CardsTable: React.FC<CardsTableProps> = ({
  cards,
  onAssignCard,
  onDeleteCard,
  onPreviewCard,
  onOpenBatchModal,
  onToggleAiReview,
  onBulkUpdateStatus,
  onOpenNfcGenerator,
  activeAdmin,
}) => {
  const searchInputId = useId();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'available' | 'disabled'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cardToDelete, setCardToDelete] = useState<CardRecord | null>(null);

  // NFC Flasher & Tools Modal State
  const [selectedNfcCard, setSelectedNfcCard] = useState<CardRecord | null>(null);
  const [nfcWriteStatus, setNfcWriteStatus] = useState<string>('');
  const [nfcCopied, setNfcCopied] = useState<boolean>(false);

  // Bulk actions selection state
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);

  const isMaster = !activeAdmin || activeAdmin.role === 'master';
  const canEditCards = isMaster || (activeAdmin?.permissions?.canEditCards ?? true);
  const canToggleAi = isMaster || (activeAdmin?.permissions?.canToggleAi ?? true);
  const canExportCsv = isMaster || (activeAdmin?.permissions?.canExportCsv ?? false);

  // Filter cards based on search input and status dropdown
  const filteredCards = cards.filter((card) => {
    const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
    const term = search.toLowerCase().trim();
    if (!term) return matchesStatus;

    // Support flexible ID searching: #0001, 0001, 1, /r/0001
    const normalizedTerm = term.replace(/^#/, '').replace(/^\/?r\//, '').trim();
    const cardIdNoZero = card.id.replace(/^0+/, '');
    const termNoZero = normalizedTerm.replace(/^0+/, '');

    const matchesId =
      card.id.toLowerCase().includes(term) ||
      card.id.toLowerCase().includes(normalizedTerm) ||
      (cardIdNoZero.length > 0 && termNoZero.length > 0 && cardIdNoZero === termNoZero);

    const matchesSearch =
      matchesId ||
      card.businessName.toLowerCase().includes(term) ||
      (card.category && card.category.toLowerCase().includes(term)) ||
      (card.notes && card.notes.toLowerCase().includes(term)) ||
      (card.googleReviewUrl && card.googleReviewUrl.toLowerCase().includes(term));

    return matchesStatus && matchesSearch;
  });

  const handleCopyLink = (cardId: string) => {
    const fullUrl = `${window.location.origin}/r/${cardId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(cardId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const assignedCount = cards.filter((c) => c.status === 'assigned').length;
  const availableCount = cards.filter((c) => c.status === 'available').length;
  const disabledCount = cards.filter((c) => c.status === 'disabled').length;

  // Selection calculations & helpers
  const filteredCardIds = filteredCards.map((c) => c.id);
  const allFilteredSelected =
    filteredCardIds.length > 0 &&
    filteredCardIds.every((id) => selectedCardIds.includes(id));
  const someFilteredSelected =
    filteredCardIds.some((id) => selectedCardIds.includes(id)) && !allFilteredSelected;

  const handleToggleCardSelection = (id: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredCardIds);
      setSelectedCardIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = new Set([...selectedCardIds, ...filteredCardIds]);
      setSelectedCardIds(Array.from(merged));
    }
  };

  const handleClearSelection = () => {
    setSelectedCardIds([]);
  };

  const handleBulkStatusChange = async (newStatus: 'available' | 'assigned') => {
    if (selectedCardIds.length === 0 || isBulkUpdating) return;
    setIsBulkUpdating(true);
    setBulkSuccessMessage(null);
    try {
      if (onBulkUpdateStatus) {
        await onBulkUpdateStatus(selectedCardIds, newStatus);
      } else {
        await bulkUpdateCardsStatus(selectedCardIds, newStatus, activeAdmin?.id);
      }
      const count = selectedCardIds.length;
      setBulkSuccessMessage(
        `Updated status to "${newStatus === 'assigned' ? 'Assigned' : 'Available'}" for ${count} card${count > 1 ? 's' : ''}.`
      );
      setSelectedCardIds([]);
      setTimeout(() => setBulkSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Bulk update error:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleWriteWebNfc = async (url: string) => {
    if (!('NDEFReader' in window)) {
      setNfcWriteStatus(
        'Web NFC is not supported on this browser/OS. Copy the URL above and use the free "NFC Tools" app on iPhone or Android.'
      );
      return;
    }

    try {
      setNfcWriteStatus('Ready! Touch and hold your NFC tag to the back of your phone now...');
      const ndef = new (window as any).NDEFReader();
      await ndef.write({
        records: [{ recordType: 'url', data: url }],
      });
      setNfcWriteStatus('Success! Tag successfully programmed with permanent review URL.');
    } catch (err: any) {
      setNfcWriteStatus(`NFC write failed: ${err.message || 'Write aborted or timeout'}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar & Status Filter Dropdown Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* 1. Quick Search Bar by Card ID or Business */}
          <div className="relative flex-1 min-w-0">
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-[#4285F4]" />
              </div>

              <input
                id={searchInputId}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Card ID (e.g. 0001, #1) or business name..."
                className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4] focus:bg-white shadow-2xs transition-all"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Status Filter Dropdown & Export Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Status Filter Dropdown */}
            <div className="relative flex items-center">
              <div className="absolute left-2.5 pointer-events-none text-slate-500">
                <Filter className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <select
                id="status-filter-select"
                aria-label="Filter cards by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-[#4285F4] cursor-pointer transition-colors shadow-2xs"
                title="Filter by assigned or available status"
              >
                <option value="all">All Statuses ({cards.length})</option>
                <option value="assigned">🟢 Assigned ({assignedCount})</option>
                <option value="available">🟡 Available ({availableCount})</option>
                <option value="disabled">🔴 Disabled ({disabledCount})</option>
              </select>
              <div className="absolute right-2.5 pointer-events-none text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* NFC Tool Shortcut Button */}
            {onOpenNfcGenerator && (
              <button
                type="button"
                onClick={() => onOpenNfcGenerator()}
                title="Open NFC Chip URL Generator & Hardware Flasher"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-purple-200 bg-purple-50 text-purple-700 hover:text-purple-900 hover:bg-purple-100 transition-colors shadow-2xs shrink-0 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-purple-600" />
                <span className="hidden sm:inline">NFC Tool</span>
              </button>
            )}

            {/* Export CSV Button */}
            {canExportCsv && (
              <button
                onClick={() => exportCardsToCsv(filteredCards)}
                disabled={filteredCards.length === 0}
                title="Download CSV spreadsheet of current card list"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#34A853]" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Segmented Filter Shortcuts + Result Count */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Quick Filter:</span>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({cards.length})
            </button>
            <button
              onClick={() => setStatusFilter('assigned')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                statusFilter === 'assigned'
                  ? 'bg-[#34A853] text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Assigned ({assignedCount})
            </button>
            <button
              onClick={() => setStatusFilter('available')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                statusFilter === 'available'
                  ? 'bg-[#FBBC05] text-slate-950 font-bold shadow-2xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Available ({availableCount})
            </button>
            {disabledCount > 0 && (
              <button
                onClick={() => setStatusFilter('disabled')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  statusFilter === 'disabled'
                    ? 'bg-[#EA4335] text-white shadow-2xs'
                    : 'bg-red-50 text-[#EA4335] hover:bg-red-100'
                }`}
              >
                Disabled ({disabledCount})
              </button>
            )}
          </div>

          {(search || statusFilter !== 'all') && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 ml-auto">
              <span>
                Found <strong className="text-slate-900 font-mono tabular-nums">{filteredCards.length}</strong> of {cards.length}
              </span>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="text-[#4285F4] hover:underline font-bold"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success Notification for Bulk Operations */}
      {bulkSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#34A853] shrink-0" />
            <span>{bulkSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Cards Display Container - Responsive Table on PC, Responsive Cards on Mobile */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Bulk Action Header Strip (Visible when cards are selected) */}
        {selectedCardIds.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 border-b border-blue-200 px-3.5 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#1A73E8] text-white text-[11px] font-mono font-bold">
                {selectedCardIds.length}
              </span>
              <span className="font-bold text-slate-800">
                {selectedCardIds.length === 1 ? '1 card selected' : `${selectedCardIds.length} cards selected`}
              </span>
              {!allFilteredSelected && filteredCards.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const merged = new Set([...selectedCardIds, ...filteredCardIds]);
                    setSelectedCardIds(Array.from(merged));
                  }}
                  className="text-[11px] text-[#1A73E8] hover:underline font-semibold ml-1 cursor-pointer"
                >
                  Select all {filteredCards.length} in view
                </button>
              )}
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                Bulk Status Action:
              </span>
              {isBulkUpdating ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700">
                  <div className="w-3 h-3 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
                  <span>Updating...</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusChange('available')}
                    disabled={!canEditCards}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-white text-amber-800 border border-amber-300 hover:bg-amber-50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    title="Set status of selected cards to Available"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Set Available</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusChange('assigned')}
                    disabled={!canEditCards}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    title="Set status of selected cards to Assigned"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Set Assigned</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {filteredCards.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 text-[#4285F4] mx-auto flex items-center justify-center mb-3 border border-blue-100">
              <QrCode className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No QR cards found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {search || statusFilter !== 'all'
                ? `No cards match "${search || statusFilter}". Try resetting filters.`
                : 'Get started by generating your first batch of sequential QR cards.'}
            </p>
            {search || statusFilter !== 'all' ? (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 text-xs font-semibold text-[#1A73E8] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            ) : (
              <button
                onClick={onOpenBatchModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-lg shadow-sm cursor-pointer"
              >
                Generate First Batch
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 1. Mobile Phone View: Clean, Stacked Responsive Card Items (Zero horizontal scrolling) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {/* Mobile Select-All Toggle Bar */}
              <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                <label className="flex items-center gap-2 cursor-pointer font-medium select-none">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected;
                    }}
                    onChange={handleToggleSelectAllFiltered}
                    className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8] border-slate-300 cursor-pointer"
                  />
                  <span>Select all in view ({filteredCards.length})</span>
                </label>
                {selectedCardIds.length > 0 && (
                  <span className="font-bold text-[#1A73E8]">
                    {selectedCardIds.length} selected
                  </span>
                )}
              </div>

              {filteredCards.map((card) => {
                const permanentUrl = `${window.location.origin}/r/${card.id}`;
                const isAssigned = card.status === 'assigned';
                const isSelected = selectedCardIds.includes(card.id);

                return (
                  <div
                    key={card.id}
                    className={`p-3.5 space-y-3 transition-colors ${
                      isSelected ? 'bg-blue-50/60 ring-1 ring-blue-200' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    {/* Top Row: Checkbox + QR ID + Status + AI Toggle */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleCardSelection(card.id)}
                          aria-label={`Select card ${card.id}`}
                          className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8] border-slate-300 cursor-pointer shrink-0"
                        />
                        <button
                          onClick={() => onPreviewCard(card)}
                          title="Preview Customer Mobile Experience"
                          className="p-1.5 rounded-lg bg-blue-50 text-[#1A73E8] border border-blue-100 shrink-0 cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-extrabold text-slate-900">
                              #{card.id}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              /r/{card.id}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Status Badge */}
                        {card.status === 'assigned' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-[#34A853] border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
                            <span>Assigned</span>
                          </span>
                        )}
                        {card.status === 'available' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                            <span>Available</span>
                          </span>
                        )}
                        {card.status === 'disabled' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-[#EA4335] border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#EA4335]" />
                            <span>Disabled</span>
                          </span>
                        )}

                        {/* AI Toggle on Mobile */}
                        {isAssigned && (
                          <button
                            type="button"
                            onClick={() =>
                              onToggleAiReview &&
                              onToggleAiReview(card.id, card.aiReviewEnabled === false)
                            }
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                              card.aiReviewEnabled !== false
                                ? 'bg-blue-50 text-[#1A73E8] border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {card.aiReviewEnabled !== false ? 'AI ON' : 'Direct'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Middle: Business Profile & Link */}
                    <div className="space-y-1">
                      {isAssigned && card.businessName ? (
                        <div>
                          <div className="font-bold text-slate-900 text-xs truncate">
                            {card.businessName}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                            <span>{card.category || 'Local Business'}</span>
                            {card.notes && (
                              <>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span className="text-slate-400 truncate max-w-[180px]">{card.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-amber-700/90 text-xs font-medium flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                          <span>Unassigned stock (ready to connect)</span>
                        </div>
                      )}

                      {card.assignedToEmail && (
                        <div className="text-[10px] text-purple-700 font-semibold truncate flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                          <span>Owner: {card.assignedToName || card.assignedToEmail}</span>
                        </div>
                      )}

                      {card.googleReviewUrl && (
                        <a
                          href={card.googleReviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1A73E8] hover:underline flex items-center gap-1 text-[11px] font-medium truncate pt-0.5"
                        >
                          <span className="truncate">{card.googleReviewUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                        </a>
                      )}
                    </div>

                    {/* Bottom Row: Scans Count + Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100/80">
                      <div className="text-slate-500 text-[11px]">
                        Scans: <span className="font-mono font-bold text-slate-900">{card.scansCount || 0}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Copy Link */}
                        <button
                          onClick={() => handleCopyLink(card.id)}
                          title="Copy Link"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                          {copiedId === card.id ? (
                            <Check className="w-3.5 h-3.5 text-[#34A853]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Customer Preview */}
                        <button
                          onClick={() => onPreviewCard(card)}
                          title="Phone Preview"
                          className="p-1.5 rounded-lg text-[#1A73E8] hover:bg-blue-50"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                        </button>

                        {/* Download QR */}
                        <button
                          onClick={() => downloadCardPng(permanentUrl, card.id, card.businessName)}
                          title="Download QR"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Program / Copy NFC URL */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedNfcCard(card);
                            setNfcWriteStatus('');
                            setNfcCopied(false);
                          }}
                          title="NFC Flasher & Chip Tools"
                          className="p-1.5 rounded-lg text-purple-600 hover:text-purple-800 hover:bg-purple-50 transition-colors cursor-pointer"
                        >
                          <Radio className="w-3.5 h-3.5" />
                        </button>

                        {/* Assign / Edit */}
                        {canEditCards && (
                          <button
                            onClick={() => onAssignCard(card)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ml-1 ${
                              isAssigned
                                ? 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                                : 'bg-[#1A73E8] text-white hover:bg-[#1557B0]'
                            }`}
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isAssigned ? 'Edit' : 'Assign'}</span>
                          </button>
                        )}

                        {/* Delete */}
                        {isMaster && (
                          <button
                            onClick={() => setCardToDelete(card)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
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

            {/* 2. Desktop PC View: Streamlined Responsive Table (Fitted without horizontal scrollbar) */}
            <div className="hidden md:block w-full overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 sm:px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={handleToggleSelectAllFiltered}
                        aria-label="Select all cards in table"
                        className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8] border-slate-300 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3 sm:px-4">Card ID</th>
                    <th className="py-3 px-3 sm:px-4">Assigned Business</th>
                    <th className="py-3 px-3 sm:px-4">Destination Link</th>
                    <th className="py-3 px-2 sm:px-3 text-center">AI Review</th>
                    <th className="py-3 px-2 sm:px-3 text-center">Status</th>
                    <th className="py-3 px-2 sm:px-3 text-right">Scans</th>
                    <th className="py-3 px-3 sm:px-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCards.map((card) => {
                    const permanentUrl = `${window.location.origin}/r/${card.id}`;
                    const isAssigned = card.status === 'assigned';
                    const isSelected = selectedCardIds.includes(card.id);

                    return (
                      <tr
                        key={card.id}
                        className={`transition-colors group ${
                          isSelected ? 'bg-blue-50/70 border-l-2 border-l-[#1A73E8]' : 'hover:bg-blue-50/30'
                        }`}
                      >
                        {/* Row Selection Checkbox */}
                        <td className="py-3 px-3 sm:px-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCardSelection(card.id)}
                            aria-label={`Select card ${card.id}`}
                            className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8] border-slate-300 cursor-pointer"
                          />
                        </td>

                        {/* Card ID */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onPreviewCard(card)}
                              title="Preview customer mobile experience"
                              className="p-1.5 rounded-lg bg-blue-50 text-[#1A73E8] hover:bg-blue-100 transition-colors border border-blue-100 shrink-0"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                            <div>
                              <span className="font-mono text-xs font-extrabold text-slate-900 tabular-nums">
                                #{card.id}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                /r/{card.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Business Name & User Assignment */}
                        <td className="py-3 px-3 sm:px-4">
                          {isAssigned && card.businessName ? (
                            <div className="min-w-0 max-w-[200px]">
                              <div className="font-bold text-slate-900 truncate">
                                {card.businessName}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {card.category || 'Local Business'}
                                {card.notes && ` · ${card.notes}`}
                              </div>
                              {card.assignedToEmail && (
                                <div className="text-[10px] text-purple-700 font-semibold truncate mt-0.5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                  <span>{card.assignedToName || card.assignedToEmail}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-amber-700/80 text-[11px] font-medium">
                                <span className="w-2 h-2 rounded-full bg-[#FBBC05] shrink-0" />
                                <span>Unassigned stock</span>
                              </div>
                              {card.assignedToEmail && (
                                <div className="text-[10px] text-purple-700 font-semibold truncate flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                  <span>Allocated: {card.assignedToEmail}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Destination Link */}
                        <td className="py-3 px-3 sm:px-4 max-w-[180px]">
                          {card.googleReviewUrl ? (
                            <a
                              href={card.googleReviewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#1A73E8] hover:text-[#1557B0] hover:underline flex items-center gap-1 truncate text-[11px] font-medium"
                              title={card.googleReviewUrl}
                            >
                              <span className="truncate">{card.googleReviewUrl}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Not configured</span>
                          )}
                        </td>

                        {/* AI Review Status */}
                        <td className="py-3 px-2 sm:px-3 text-center whitespace-nowrap">
                          {isAssigned ? (
                            <button
                              type="button"
                              onClick={() =>
                                onToggleAiReview &&
                                onToggleAiReview(card.id, card.aiReviewEnabled === false)
                              }
                              title={
                                card.aiReviewEnabled !== false
                                  ? 'AI Review is ON. Click to switch to direct Google redirect'
                                  : 'AI Review is OFF. Click to switch to AI assistant'
                              }
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all border ${
                                card.aiReviewEnabled !== false
                                  ? 'bg-blue-50 text-[#1A73E8] border-blue-200 hover:bg-blue-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {card.aiReviewEnabled !== false ? (
                                <>
                                  <Sparkles className="w-3 h-3 text-[#1A73E8]" />
                                  <span>AI ON</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3 h-3 text-[#FBBC05]" />
                                  <span>Direct</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Default ON
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-2 sm:px-3 text-center whitespace-nowrap">
                          {card.status === 'assigned' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-[#34A853] border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
                              <span>Assigned</span>
                            </span>
                          )}
                          {card.status === 'available' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                              <span>Available</span>
                            </span>
                          )}
                          {card.status === 'disabled' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-[#EA4335] border border-red-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#EA4335]" />
                              <span>Disabled</span>
                            </span>
                          )}
                        </td>

                        {/* Scans Count */}
                        <td className="py-3 px-2 sm:px-3 text-right font-mono tabular-nums text-slate-800 font-bold whitespace-nowrap">
                          {card.scansCount || 0}
                        </td>

                        {/* Quick Actions */}
                        <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* Copy Link */}
                            <button
                              onClick={() => handleCopyLink(card.id)}
                              title="Copy URL"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            >
                              {copiedId === card.id ? (
                                <Check className="w-3.5 h-3.5 text-[#34A853]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Download PNG */}
                            <button
                              onClick={() => downloadCardPng(permanentUrl, card.id, card.businessName)}
                              title="Download QR PNG"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {/* NFC Chip Tool */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedNfcCard(card);
                                setNfcWriteStatus('');
                                setNfcCopied(false);
                              }}
                              title="Program NFC Tag & Copy URL"
                              className="p-1.5 rounded-lg text-purple-600 hover:text-purple-900 hover:bg-purple-50 transition-colors cursor-pointer"
                            >
                              <Radio className="w-3.5 h-3.5" />
                            </button>

                            {/* Assign / Edit */}
                            {canEditCards && (
                              <button
                                onClick={() => onAssignCard(card)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ml-1 ${
                                  isAssigned
                                    ? 'text-slate-800 bg-slate-100 hover:bg-slate-200'
                                    : 'text-white bg-[#1A73E8] hover:bg-[#1557B0]'
                                }`}
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{isAssigned ? 'Edit' : 'Assign'}</span>
                              </button>
                            )}

                            {/* Delete */}
                            {isMaster && (
                              <button
                                onClick={() => setCardToDelete(card)}
                                title="Delete card"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-[#EA4335] hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          </>
        )}
      </div>

      {/* Floating Bulk Action Toolbar Dock (Visible on Mobile & PC when cards are selected) */}
      {selectedCardIds.length > 0 && (
        <aside
          aria-label="Bulk actions toolbar"
          className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-lg bg-slate-900/95 backdrop-blur-md text-white rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-[#4285F4] text-white font-mono text-xs font-bold tabular-nums">
              {selectedCardIds.length}
            </span>
            <span className="text-xs font-bold text-slate-100 truncate">
              {selectedCardIds.length === 1 ? '1 Card' : `${selectedCardIds.length} Cards`} Selected
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isBulkUpdating ? (
              <div className="flex items-center gap-2 text-xs text-slate-300 px-3 py-1.5 bg-slate-800/80 rounded-xl">
                <div className="w-3.5 h-3.5 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                <span>Updating status...</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange('available')}
                  disabled={!canEditCards}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  title="Update selected to Available"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Available</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkStatusChange('assigned')}
                  disabled={!canEditCards}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  title="Update selected to Assigned"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assigned</span>
                </button>
              </>
            )}
          </div>
        </aside>
      )}

      {/* In-App Delete Confirmation Modal */}
      {cardToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#EA4335] flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-slate-900">
                Delete Card #{cardToDelete.id}?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {cardToDelete.businessName
                  ? `This will remove the assignment for "${cardToDelete.businessName}". Customers scanning this QR will see available stock.`
                  : 'This QR card will be removed from your active inventory.'}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCardToDelete(null)}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCard(cardToDelete.id);
                  setCardToDelete(null);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-[#EA4335] text-white text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NFC Hardware & Tag Programming Modal */}
      {selectedNfcCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    NFC Hardware Tools · Card #{selectedNfcCard.id}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedNfcCard.businessName || 'Unassigned Stock Card'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNfcCard(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Permanent NFC URL */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>NFC Permanent Payload URL</span>
                <span className="text-[10px] text-purple-600 font-mono">NTAG213 / 215 / 216</span>
              </label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-purple-700 font-bold truncate">
                  {`${window.location.origin}/r/${selectedNfcCard.id}`}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/r/${selectedNfcCard.id}`;
                    navigator.clipboard.writeText(url);
                    setNfcCopied(true);
                    setTimeout(() => setNfcCopied(false), 2000);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 shrink-0 shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {nfcCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                When customers tap this NFC card, it opens your Google Review Assistant page directly.
              </p>
            </div>

            {/* Actions: Write to NFC / Test Review Page */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleWriteWebNfc(`${window.location.origin}/r/${selectedNfcCard.id}`)}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Radio className="w-4 h-4" />
                <span>Write to Physical NFC Tag (Web NFC)</span>
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={`/r/${selectedNfcCard.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-xs font-bold border border-blue-200 flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Test Review Generator Page</span>
                </a>

                {onOpenNfcGenerator && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenNfcGenerator(selectedNfcCard);
                      setSelectedNfcCard(null);
                    }}
                    className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Full NFC Tool
                  </button>
                )}
              </div>

              {nfcWriteStatus && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-medium border ${
                    nfcWriteStatus.includes('Success')
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-900 border-amber-200'
                  }`}
                >
                  {nfcWriteStatus}
                </div>
              )}
            </div>

            {/* Mobile NFC Flashing Guide */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-[11px] text-slate-600">
              <div className="font-bold text-slate-800">How to program physical NFC cards:</div>
              <div>1. Install free <strong>NFC Tools</strong> app (iOS App Store or Google Play)</div>
              <div>2. Tap <strong>Write</strong> → <strong>Add a record</strong> → <strong>URL / URI</strong></div>
              <div>3. Paste copied URL: <code className="text-purple-700 font-mono">/r/{selectedNfcCard.id}</code></div>
              <div>4. Tap <strong>Write</strong> and touch your NFC tag, puck, or card stand.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
