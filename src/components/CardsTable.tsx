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
} from 'lucide-react';
import { downloadCardPng, downloadCardSvg } from '../utils/qr';
import { exportCardsToCsv } from '../utils/csv';

interface CardsTableProps {
  cards: CardRecord[];
  onAssignCard: (card: CardRecord) => void;
  onDeleteCard: (id: string) => void;
  onPreviewCard: (card: CardRecord) => void;
  onOpenBatchModal: () => void;
  onToggleAiReview?: (id: string, enabled: boolean) => void;
  activeAdmin?: AdminUser;
}

export const CardsTable: React.FC<CardsTableProps> = ({
  cards,
  onAssignCard,
  onDeleteCard,
  onPreviewCard,
  onOpenBatchModal,
  onToggleAiReview,
  activeAdmin,
}) => {
  const searchInputId = useId();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'available' | 'disabled'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cardToDelete, setCardToDelete] = useState<CardRecord | null>(null);

  const isMaster = !activeAdmin || activeAdmin.role === 'master';
  const canEditCards = isMaster || (activeAdmin?.permissions?.canEditCards ?? true);
  const canToggleAi = isMaster || (activeAdmin?.permissions?.canToggleAi ?? true);
  const canExportCsv = isMaster || (activeAdmin?.permissions?.canExportCsv ?? false);

  // Filter cards based on search and status
  const filteredCards = cards.filter((card) => {
    const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      card.id.toLowerCase().includes(term) ||
      card.businessName.toLowerCase().includes(term) ||
      (card.category && card.category.toLowerCase().includes(term)) ||
      (card.notes && card.notes.toLowerCase().includes(term));
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

  return (
    <div className="space-y-4">
      {/* Google-Themed Search and Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Google-Styled Search Input */}
          <div className="relative flex-1 max-w-lg">
            <div className="relative flex items-center">
              {/* Google 4-color Search Icon */}
              <div className="absolute left-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-[#4285F4]" />
              </div>

              <input
                id={searchInputId}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search QR ID (e.g. 0001), café name, or stand note..."
                className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4] focus:bg-white shadow-2xs transition-all"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Google 4-Color Status Filter Segmented Chips */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* All Filter */}
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap active:scale-95 ${
                statusFilter === 'all'
                  ? 'bg-[#1A73E8] text-white shadow-sm shadow-blue-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span>All QRs</span>
              <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                statusFilter === 'all' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {cards.length}
              </span>
            </button>

            {/* Assigned Filter (Google Green) */}
            <button
              onClick={() => setStatusFilter('assigned')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap active:scale-95 ${
                statusFilter === 'assigned'
                  ? 'bg-[#34A853] text-white shadow-sm shadow-emerald-500/25 ring-2 ring-emerald-300'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Assigned</span>
              <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                statusFilter === 'assigned' ? 'bg-white/25 text-white' : 'bg-emerald-200/70 text-emerald-900'
              }`}>
                {assignedCount}
              </span>
            </button>

            {/* Available Filter (Google Blue / Stock) */}
            <button
              onClick={() => setStatusFilter('available')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap active:scale-95 ${
                statusFilter === 'available'
                  ? 'bg-[#FBBC05] text-slate-950 shadow-sm shadow-amber-500/25 ring-2 ring-amber-300 font-bold'
                  : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Available Stock</span>
              <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                statusFilter === 'available' ? 'bg-black/10 text-slate-950' : 'bg-amber-200/70 text-amber-950'
              }`}>
                {availableCount}
              </span>
            </button>

            {/* Disabled Filter (Google Red) */}
            <button
              onClick={() => setStatusFilter('disabled')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap active:scale-95 ${
                statusFilter === 'disabled'
                  ? 'bg-[#EA4335] text-white shadow-sm shadow-red-500/25 ring-2 ring-red-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Disabled</span>
              <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                statusFilter === 'disabled' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {disabledCount}
              </span>
            </button>

            {/* Export CSV Button */}
            <button
              onClick={() => exportCardsToCsv(filteredCards)}
              disabled={filteredCards.length === 0}
              title="Download CSV spreadsheet of current card list"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs shrink-0 disabled:opacity-50 ml-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#34A853]" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Search Results Summary Tag if Search is active */}
        {search && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-900 font-mono tabular-nums">{filteredCards.length}</strong> matches for &ldquo;{search}&rdquo;
            </span>
            <button
              onClick={() => setSearch('')}
              className="text-[#4285F4] hover:underline font-medium text-[11px]"
            >
              Reset search
            </button>
          </div>
        )}
      </div>

      {/* Cards Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredCards.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#4285F4] mx-auto flex items-center justify-center mb-3 border border-blue-100">
              <QrCode className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No QR cards found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {search || statusFilter !== 'all'
                ? `No cards found matching "${search || statusFilter}". Try resetting your filters.`
                : 'Get started by generating your first batch of sequential QR cards.'}
            </p>
            {search || statusFilter !== 'all' ? (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 text-xs font-semibold text-[#1A73E8] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                Clear all filters
              </button>
            ) : (
              <button
                onClick={onOpenBatchModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-lg shadow-sm"
              >
                Generate First Batch
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Card ID</th>
                  <th className="py-3.5 px-4">Assigned Business</th>
                  <th className="py-3.5 px-4">Destination Link</th>
                  <th className="py-3.5 px-4 text-center">AI Review</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Scans</th>
                  <th className="py-3.5 px-4 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCards.map((card) => {
                  const permanentUrl = `${window.location.origin}/r/${card.id}`;
                  const isAssigned = card.status === 'assigned';

                  return (
                    <tr
                      key={card.id}
                      className="hover:bg-blue-50/30 transition-colors group"
                    >
                      {/* Card ID with Google 4-color accent */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => onPreviewCard(card)}
                            title="Preview customer mobile experience"
                            className="p-1.5 rounded-lg bg-blue-50 text-[#1A73E8] hover:bg-blue-100 transition-colors border border-blue-100"
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

                      {/* Business Name & Category */}
                      <td className="py-3.5 px-4">
                        {isAssigned && card.businessName ? (
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{card.businessName}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="font-medium text-slate-600">{card.category || 'Local Business'}</span>
                              {card.notes && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300">·</span>
                                  <span className="text-slate-500 truncate max-w-xs">{card.notes}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-700/80 text-[11px] font-medium">
                            <span className="w-2 h-2 rounded-full bg-[#FBBC05]" />
                            <span>Unassigned stock (ready to connect)</span>
                          </div>
                        )}
                      </td>

                      {/* Destination Link */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {card.googleReviewUrl ? (
                          <a
                            href={card.googleReviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1A73E8] hover:text-[#1557B0] hover:underline flex items-center gap-1.5 truncate text-[11px] font-medium"
                            title={card.googleReviewUrl}
                          >
                            <span className="truncate">{card.googleReviewUrl}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Not configured</span>
                        )}
                      </td>

                      {/* AI Review Status & 1-click Toggle */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isAssigned ? (
                          <button
                            type="button"
                            onClick={() =>
                              onToggleAiReview &&
                              onToggleAiReview(card.id, card.aiReviewEnabled === false)
                            }
                            title={
                              card.aiReviewEnabled !== false
                                ? 'AI Review Generator is ON. Click to switch to direct Google redirect'
                                : 'AI Review Generator is OFF (Direct). Click to switch to AI Review Assistant'
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
                              card.aiReviewEnabled !== false
                                ? 'bg-blue-50 text-[#1A73E8] border-blue-200 hover:bg-blue-100 hover:border-blue-300 shadow-2xs'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:text-slate-900'
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
                                <span>Direct OFF</span>
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
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {card.status === 'assigned' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-[#34A853] border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
                            <span>Assigned</span>
                          </span>
                        )}
                        {card.status === 'available' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                            <span>Available</span>
                          </span>
                        )}
                        {card.status === 'disabled' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-[#EA4335] border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#EA4335]" />
                            <span>Disabled</span>
                          </span>
                        )}
                      </td>

                      {/* Scans Count */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 font-bold whitespace-nowrap">
                        {card.scansCount || 0}
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Copy Permanent Card Link */}
                          <button
                            onClick={() => handleCopyLink(card.id)}
                            title="Copy permanent card URL"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            {copiedId === card.id ? (
                              <Check className="w-3.5 h-3.5 text-[#34A853]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Copy NFC Payload URL */}
                          <button
                            onClick={() => handleCopyLink(card.id)}
                            title="Copy NFC tag payload URL (/r/[id])"
                            className="p-1.5 rounded-lg text-purple-600 hover:text-purple-800 hover:bg-purple-50 transition-colors"
                          >
                            <Radio className="w-3.5 h-3.5" />
                          </button>

                          {/* Preview / Simulate */}
                          <button
                            onClick={() => onPreviewCard(card)}
                            title="Preview Customer Mobile Page"
                            className="p-1.5 rounded-lg text-[#1A73E8] hover:bg-blue-50 transition-colors"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                          </button>

                          {/* Download PNG */}
                          <button
                            onClick={() => downloadCardPng(permanentUrl, card.id, card.businessName)}
                            title="Download high-resolution PNG"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Assign / Edit */}
                          {canEditCards && (
                            <button
                              onClick={() => onAssignCard(card)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ml-1 ${
                                isAssigned
                                  ? 'text-slate-800 bg-slate-100 hover:bg-slate-200'
                                  : 'text-white bg-[#1A73E8] hover:bg-[#1557B0] shadow-2xs'
                              }`}
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{isAssigned ? 'Edit' : 'Assign'}</span>
                            </button>
                          )}

                          {/* Delete (Master Admin Only) */}
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
        )}
      </div>

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
    </div>
  );
};
