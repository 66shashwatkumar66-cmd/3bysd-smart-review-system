import React, { useState, useEffect, useMemo } from 'react';
import { CardRecord, ScanLogRecord, AdminUser } from '../types';
import { fetchScanLogs } from '../utils/api';
import { getSubscriptionStatus, formatDisplayDate } from '../utils/subscription';
import {
  Activity,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  QrCode,
  Radio,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  ChevronLeft,
  ChevronRight,
  Filter,
  BarChart3,
  History,
  X,
} from 'lucide-react';

interface ScanLogsViewProps {
  cards: CardRecord[];
  activeAdmin: AdminUser;
  isMaster: boolean;
  initialCardFilter?: string | null;
  onClearInitialCardFilter?: () => void;
  onPreviewCard?: (card: CardRecord) => void;
}

const PAGE_SIZE = 25;

function escapeCsv(val: string | number | undefined | null): string {
  const str = val === undefined || val === null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ScanLogsView: React.FC<ScanLogsViewProps> = ({
  cards,
  activeAdmin,
  isMaster,
  initialCardFilter,
  onClearInitialCardFilter,
  onPreviewCard,
}) => {
  const [logs, setLogs] = useState<ScanLogRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active sub-tab: 'events' (timestamped scan_logs) vs 'summary' (historical cumulative card totals)
  const [viewMode, setViewMode] = useState<'summary' | 'events'>('summary');

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string>(initialCardFilter || 'all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'qr' | 'nfc' | 'direct'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<
    'all' | 'allowed' | 'expired' | 'upcoming' | 'disabled' | 'unassigned'
  >('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [onlyScannedCards, setOnlyScannedCards] = useState<boolean>(false);

  // Pagination
  const [eventsPage, setEventsPage] = useState<number>(1);
  const [summaryPage, setSummaryPage] = useState<number>(1);

  useEffect(() => {
    if (initialCardFilter) {
      setSelectedCardId(initialCardFilter);
      setEventsPage(1);
      setSummaryPage(1);
    }
  }, [initialCardFilter]);

  const loadLogs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchScanLogs({
        isMaster,
        email: activeAdmin?.email,
      });
      setLogs(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to fetch QR scan event logs from Cloud Firestore.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [isMaster, activeAdmin?.email]);

  // Reset pagination whenever filters change
  useEffect(() => {
    setEventsPage(1);
    setSummaryPage(1);
  }, [search, selectedCardId, sourceFilter, outcomeFilter, startDate, endDate, onlyScannedCards]);

  // Cards scoped & sorted by scan volume (historical + live cumulative counts)
  const filteredCardsSummary = useMemo(() => {
    return cards
      .filter((c) => {
        if (selectedCardId !== 'all' && c.id.toLowerCase() !== selectedCardId.toLowerCase()) {
          return false;
        }
        if (onlyScannedCards && (c.scansCount || 0) === 0) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase().trim().replace(/^#/, '');
          const match =
            c.id.toLowerCase().includes(q) ||
            (c.businessName && c.businessName.toLowerCase().includes(q)) ||
            (c.category && c.category.toLowerCase().includes(q)) ||
            (c.assignedToEmail && c.assignedToEmail.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => (b.scansCount || 0) - (a.scansCount || 0) || a.id.localeCompare(b.id));
  }, [cards, selectedCardId, onlyScannedCards, search]);

  // Timestamped scan events filtered
  const filteredLogs = useMemo(() => {
    const startTs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const endTs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
    const allowedCardIds = new Set(cards.map((c) => c.id.toLowerCase()));

    return logs.filter((log) => {
      if (!isMaster && !allowedCardIds.has(log.cardId.toLowerCase())) {
        return false;
      }
      if (selectedCardId !== 'all' && log.cardId.toLowerCase() !== selectedCardId.toLowerCase()) {
        return false;
      }
      if (sourceFilter !== 'all' && log.source !== sourceFilter) {
        return false;
      }
      if (outcomeFilter !== 'all' && log.outcome !== outcomeFilter) {
        return false;
      }
      if (startTs || endTs) {
        const ts = new Date(log.scannedAt).getTime();
        if (!isNaN(ts)) {
          if (startTs && ts < startTs) return false;
          if (endTs && ts > endTs) return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim().replace(/^#/, '');
        const match =
          log.cardId.toLowerCase().includes(q) ||
          (log.businessName && log.businessName.toLowerCase().includes(q)) ||
          (log.category && log.category.toLowerCase().includes(q)) ||
          (log.assignedToEmail && log.assignedToEmail.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [logs, cards, isMaster, selectedCardId, sourceFilter, outcomeFilter, startDate, endDate, search]);

  const totalHistoricalScans = useMemo(
    () => cards.reduce((acc, c) => acc + (c.scansCount || 0), 0),
    [cards]
  );
  const cardsWithScans = useMemo(
    () => cards.filter((c) => (c.scansCount || 0) > 0).length,
    [cards]
  );

  // Pagination slices
  const summaryTotalPages = Math.max(1, Math.ceil(filteredCardsSummary.length / PAGE_SIZE));
  const paginatedSummary = filteredCardsSummary.slice(
    (summaryPage - 1) * PAGE_SIZE,
    summaryPage * PAGE_SIZE
  );

  const eventsTotalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedEvents = filteredLogs.slice(
    (eventsPage - 1) * PAGE_SIZE,
    eventsPage * PAGE_SIZE
  );

  const handleExportCsv = () => {
    const rows =
      viewMode === 'events'
        ? [
            ['Log ID', 'Card ID', 'Business Name', 'Category', 'Scanned At', 'Source', 'Outcome', 'Subscription Status', 'Owner Email'],
            ...filteredLogs.map((l) => [
              l.id,
              l.cardId,
              l.businessName,
              l.category || '',
              l.scannedAt,
              l.source,
              l.outcome,
              l.subscriptionStatus,
              l.assignedToEmail || '',
            ]),
          ]
        : [
            ['Card ID', 'Business Name', 'Category', 'Status', 'Subscription Status', 'Total Scans', 'Created At', 'Last Updated / Scanned', 'Owner Email'],
            ...filteredCardsSummary.map((c) => [
              c.id,
              c.businessName || 'Unassigned',
              c.category || '',
              c.status,
              getSubscriptionStatus(c),
              c.scansCount || 0,
              c.createdAt,
              c.lastScannedAt || c.updatedAt,
              c.assignedToEmail || '',
            ]),
          ];

    const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `3dbysd_qr_${viewMode}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCardId('all');
    setSourceFilter('all');
    setOutcomeFilter('all');
    setStartDate('');
    setEndDate('');
    setOnlyScannedCards(false);
    if (onClearInitialCardFilter) onClearInitialCardFilter();
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    selectedCardId !== 'all' ||
    sourceFilter !== 'all' ||
    outcomeFilter !== 'all' ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    onlyScannedCards;

  return (
    <div className="space-y-5 w-full max-w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-[#1A73E8]" />
              <span>QR Scan Logs & Historical Activity</span>
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1A73E8] border border-blue-200">
              {isMaster ? 'All Cards' : 'Assigned Cards Only'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Historical cumulative QR scan totals preserved in Cloud Firestore alongside timestamped live scan events.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#1A73E8]' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Total Historical Scans</span>
            <BarChart3 className="w-4 h-4 text-[#1A73E8]" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5 font-mono tabular-nums">
            {totalHistoricalScans.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {cards.length} Firestore cards
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Active Scanned Stands</span>
            <QrCode className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1.5 font-mono tabular-nums">
            {cardsWithScans}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Stands with 1+ recorded scans
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Timestamped Events</span>
            <Activity className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-700 mt-1.5 font-mono tabular-nums">
            {logs.length.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Live immutable scan_logs entries
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Scope</span>
            <Filter className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-sm font-extrabold text-slate-900 mt-2 truncate">
            {selectedCardId === 'all' ? 'All Accessible Stands' : `Stand #${selectedCardId}`}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isMaster ? 'Master Admin View' : activeAdmin.email}
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
        <button
          type="button"
          onClick={() => setViewMode('summary')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            viewMode === 'summary'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-[#1A73E8]" />
          <span>Historical Card Totals ({filteredCardsSummary.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('events')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            viewMode === 'events'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-purple-600" />
          <span>Timestamped Scan Events ({filteredLogs.length})</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">Could not load scan event logs</div>
            <p className="mt-0.5 text-rose-700">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search card ID, business, owner..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
            />
          </div>

          <select
            aria-label="Filter by QR Card"
            value={selectedCardId}
            onChange={(e) => setSelectedCardId(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
          >
            <option value="all">All Stands ({cards.length})</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id} · {c.businessName || 'Unassigned'} ({c.scansCount || 0} scans)
              </option>
            ))}
          </select>

          {viewMode === 'events' ? (
            <>
              <select
                aria-label="Filter by scan source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as any)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              >
                <option value="all">All Sources (QR / NFC / Direct)</option>
                <option value="qr">QR Scan</option>
                <option value="nfc">NFC Tap</option>
                <option value="direct">Direct Redirect</option>
              </select>

              <select
                aria-label="Filter by scan outcome"
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as any)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              >
                <option value="all">All Outcomes</option>
                <option value="allowed">Allowed</option>
                <option value="expired">Blocked (Expired)</option>
                <option value="upcoming">Blocked (Upcoming)</option>
                <option value="disabled">Blocked (Disabled)</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </>
          ) : (
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={onlyScannedCards}
                onChange={(e) => setOnlyScannedCards(e.target.checked)}
                className="rounded text-[#1A73E8]"
              />
              <span>Show only stands with 1+ historical scans</span>
            </label>
          )}
        </div>

        {viewMode === 'events' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date Range:</span>
            </div>
            <input
              type="date"
              aria-label="Start date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              aria-label="End date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto flex items-center gap-1 text-xs font-bold text-[#1A73E8] hover:underline cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        )}

        {viewMode === 'summary' && hasActiveFilters && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs font-bold text-[#1A73E8] hover:underline cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* SECTION A: Historical Cumulative Card Summary */}
      {viewMode === 'summary' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {paginatedSummary.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No QR stands match your current filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Stand ID</th>
                      <th className="py-3 px-4">Business</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-center">Subscription</th>
                      <th className="py-3 px-3 text-right">Historical Scans</th>
                      <th className="py-3 px-4">Created / Last Activity</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedSummary.map((card) => {
                      const subStatus = getSubscriptionStatus(card);
                      return (
                        <tr key={card.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-extrabold text-slate-900 whitespace-nowrap">
                            #{card.id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">
                              {card.businessName || <span className="text-slate-400 font-normal">Unassigned stock</span>}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {card.category || '—'}
                              {card.assignedToEmail && (
                                <span className="text-purple-700 font-medium"> · {card.assignedToEmail}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                card.status === 'assigned'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : card.status === 'disabled'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {card.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                subStatus === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : subStatus === 'expired'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : subStatus === 'upcoming'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {subStatus}
                            </span>
                            {(card.subscriptionStartDate || card.subscriptionEndDate) && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {card.subscriptionStartDate ? formatDisplayDate(card.subscriptionStartDate) : 'Open'} →{' '}
                                {card.subscriptionEndDate ? formatDisplayDate(card.subscriptionEndDate) : 'Open'}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-sm font-black text-slate-900 tabular-nums">
                            {(card.scansCount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-600 whitespace-nowrap">
                            <div>Created: {formatDateTime(card.createdAt)}</div>
                            <div className="text-slate-400">
                              Last: {formatDateTime(card.lastScannedAt || card.updatedAt)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCardId(card.id);
                                  setViewMode('events');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Event Log
                              </button>
                              {onPreviewCard && (
                                <button
                                  type="button"
                                  onClick={() => onPreviewCard(card)}
                                  title="Preview customer page"
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
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

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Showing {(summaryPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(summaryPage * PAGE_SIZE, filteredCardsSummary.length)} of{' '}
                  <strong>{filteredCardsSummary.length}</strong> stands
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={summaryPage <= 1}
                    onClick={() => setSummaryPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono font-bold px-2">
                    {summaryPage} / {summaryTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={summaryPage >= summaryTotalPages}
                    onClick={() => setSummaryPage((p) => Math.min(summaryTotalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* SECTION B: Timestamped Live Scan Events (scan_logs collection) */}
      {viewMode === 'events' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {loading ? (
            <div className="p-10 text-center">
              <div className="inline-block w-6 h-6 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs text-slate-500">Loading timestamped scan logs from Cloud Firestore...</p>
            </div>
          ) : paginatedEvents.length === 0 ? (
            <div className="p-10 text-center space-y-2.5 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">No timestamped scan events yet</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {logs.length === 0
                  ? 'Earlier scans were recorded as cumulative totals on each QR card (visible in the "Historical Card Totals" tab above). Every new QR scan and NFC tap is now automatically saved here as an immutable timestamped event.'
                  : 'No scan events match your active filters. Try clearing your filters.'}
              </p>
              <button
                type="button"
                onClick={() => setViewMode('summary')}
                className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-xs font-bold transition-colors cursor-pointer"
              >
                View Historical Card Totals ({totalHistoricalScans} scans)
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-3">Stand ID</th>
                      <th className="py-3 px-4">Business</th>
                      <th className="py-3 px-3 text-center">Source</th>
                      <th className="py-3 px-3 text-center">Outcome</th>
                      <th className="py-3 px-3 text-center">Subscription</th>
                      <th className="py-3 px-4">Path</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedEvents.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {formatDateTime(log.scannedAt)}
                        </td>
                        <td className="py-3 px-3 font-mono font-extrabold text-slate-900 whitespace-nowrap">
                          #{log.cardId}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {log.businessName || 'Unassigned Stand'}
                          </div>
                          {log.category && (
                            <div className="text-[11px] text-slate-500">{log.category}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                            {log.source === 'nfc' ? (
                              <Radio className="w-3 h-3 text-purple-600" />
                            ) : (
                              <QrCode className="w-3 h-3 text-[#1A73E8]" />
                            )}
                            <span>{log.source}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              log.outcome === 'allowed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : log.outcome === 'upcoming'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : log.outcome === 'unassigned'
                                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {log.outcome === 'allowed' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : log.outcome === 'upcoming' ? (
                              <Clock className="w-3 h-3" />
                            ) : (
                              <Ban className="w-3 h-3" />
                            )}
                            <span className="capitalize">{log.outcome}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap text-[11px] text-slate-600 capitalize">
                          {log.subscriptionStatus}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {log.path || `/r/${log.cardId}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Showing {(eventsPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(eventsPage * PAGE_SIZE, filteredLogs.length)} of{' '}
                  <strong>{filteredLogs.length}</strong> events
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={eventsPage <= 1}
                    onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono font-bold px-2">
                    {eventsPage} / {eventsTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={eventsPage >= eventsTotalPages}
                    onClick={() => setEventsPage((p) => Math.min(eventsTotalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
