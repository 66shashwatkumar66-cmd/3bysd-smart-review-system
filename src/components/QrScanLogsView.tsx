import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  RefreshCw,
  Download,
  Search,
  Filter,
  QrCode,
  Radio,
  ExternalLink,
  Calendar,
  Smartphone,
  Laptop,
  Globe,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AdminUser, CardRecord, QRScanLog } from '../types';
import { fetchQrLogs, fetchQrLogStats, recordQrScanLog } from '../utils/api';
import { exportQrLogsToCsv } from '../utils/csv';

interface QrScanLogsViewProps {
  activeAdmin: AdminUser;
  cards: CardRecord[];
  onPreviewCard?: (card: CardRecord) => void;
  initialCardFilter?: string;
}

export const QrScanLogsView: React.FC<QrScanLogsViewProps> = ({
  activeAdmin,
  cards,
  onPreviewCard,
  initialCardFilter,
}) => {
  const [logs, setLogs] = useState<QRScanLog[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stats, setStats] = useState<{
    totalScans: number;
    uniqueCards: number;
    todayScans: number;
    sourceBreakdown: Record<string, number>;
    deviceBreakdown: Record<string, number>;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cardFilter, setCardFilter] = useState<string>(initialCardFilter || 'all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'qr' | 'nfc'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Test scan simulation state
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simulationSuccess, setSimulationSuccess] = useState<string | null>(null);

  const isRestricted = activeAdmin.role === 'restricted';
  const assignedCards = useMemo(() => {
    if (!isRestricted) return cards;
    return cards.filter((c) => activeAdmin.assignedCardIds?.includes(c.id));
  }, [cards, activeAdmin, isRestricted]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const data = await fetchQrLogStats();
      setStats(data);
    } catch (err) {
      console.warn('Failed to load QR log stats:', err);
    }
  }, []);

  // Calculate start date ISO for date filter
  const getStartDateForFilter = useCallback((filter: string): string | undefined => {
    if (filter === 'all') return undefined;
    const now = new Date();
    if (filter === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return today.toISOString();
    }
    if (filter === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return sevenDaysAgo.toISOString();
    }
    if (filter === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return thirtyDaysAgo.toISOString();
    }
    return undefined;
  }, []);

  // Load logs
  const loadLogs = useCallback(
    async (isManualRefresh: boolean = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const startDate = getStartDateForFilter(dateFilter);
        const result = await fetchQrLogs({
          cardId: cardFilter !== 'all' ? cardFilter : undefined,
          source: sourceFilter !== 'all' ? sourceFilter : undefined,
          search: searchQuery.trim() || undefined,
          startDate,
          page: currentPage,
          limit: pageSize,
          adminId: activeAdmin.id,
        });

        setLogs(result.logs || []);
        setTotalCount(result.totalCount || 0);
      } catch (err) {
        console.error('Failed to fetch QR logs:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cardFilter, sourceFilter, searchQuery, dateFilter, currentPage, pageSize, activeAdmin, getStartDateForFilter]
  );

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Reset page when filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setCurrentPage(1);
  };

  // Trigger test scan
  const handleSimulateScan = async (source: 'qr' | 'nfc') => {
    setSimulating(true);
    setSimulationSuccess(null);
    try {
      const targetCard = cardFilter !== 'all'
        ? cards.find((c) => c.id === cardFilter) || cards[0]
        : assignedCards[0] || cards[0];

      if (!targetCard) {
        alert('No stand available to simulate.');
        return;
      }

      const res = await recordQrScanLog({
        cardId: targetCard.id,
        businessName: targetCard.businessName || 'Test Business',
        category: targetCard.category || 'Local Business',
        source,
      });

      if (res) {
        setSimulationSuccess(`Logged 1 new ${source.toUpperCase()} scan for Stand #${targetCard.id}!`);
        await loadLogs(true);
        await loadStats();
        setTimeout(() => setSimulationSuccess(null), 4000);
      }
    } catch (err: any) {
      alert(`Simulation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setSimulating(false);
    }
  };

  // Format relative timestamp
  const formatTime = (isoString?: string) => {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-5">
      {/* Top Banner / Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#34A853] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cloud Firestore Telemetry
              </span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                100% Recovered
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>QR & NFC Scan Telemetry</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Authoritative historical scan logs and real-time customer touchpoints across all 3DBYSD smart stands.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => loadLogs(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Refresh logs from Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => exportQrLogsToCsv(logs)}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              title="Download RFC-4180 CSV report"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>

            {/* Quick Simulation Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => handleSimulateScan('qr')}
                disabled={simulating}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-[#1A73E8] hover:bg-blue-50 text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title="Simulate 1 QR scan"
              >
                <QrCode className="w-3 h-3" />
                <span>+QR Scan</span>
              </button>
              <button
                onClick={() => handleSimulateScan('nfc')}
                disabled={simulating}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-purple-700 hover:bg-purple-50 text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title="Simulate 1 NFC scan"
              >
                <Radio className="w-3 h-3" />
                <span>+NFC Tap</span>
              </button>
            </div>
          </div>
        </div>

        {/* Simulation Feedback Alert */}
        {simulationSuccess && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{simulationSuccess}</span>
          </div>
        )}

        {/* Restricted Sub-Admin Filter Notice */}
        {isRestricted && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900">
            <Shield className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Restricted Sub-Admin Access: Showing logs exclusively for your assigned stands:{' '}
              <strong className="font-mono">
                {activeAdmin.assignedCardIds?.map((id) => `#${id}`).join(', ') || 'None'}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Analytics KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Total Scans */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#4285F4]" />
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Scans</span>
            <div className="w-6 h-6 rounded-md bg-blue-50 text-[#1A73E8] flex items-center justify-center">
              <QrCode className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#1A73E8] font-mono tabular-nums">
            {(stats?.totalScans ?? totalCount).toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Recorded in Firestore database</p>
        </div>

        {/* Metric 2: Today's Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#34A853]" />
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Today's Scans</span>
            <div className="w-6 h-6 rounded-md bg-emerald-50 text-[#34A853] flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#34A853] font-mono tabular-nums">
            {(stats?.todayScans ?? 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Live customer touchpoints today</p>
        </div>

        {/* Metric 3: Active Stands */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#FBBC05]" />
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Unique Stands</span>
            <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-800 font-mono tabular-nums">
            {(stats?.uniqueCards ?? assignedCards.length).toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Stands with recorded scan logs</p>
        </div>

        {/* Metric 4: Source Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#EA4335]" />
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">QR vs NFC Split</span>
            <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-700 flex items-center justify-center">
              <Radio className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900 font-mono">
              {stats?.sourceBreakdown?.qr ?? 0}
            </span>
            <span className="text-[11px] text-slate-500 font-bold">QR</span>
            <span className="text-slate-300">/</span>
            <span className="text-xl font-black text-purple-700 font-mono">
              {stats?.sourceBreakdown?.nfc ?? 0}
            </span>
            <span className="text-[11px] text-purple-700 font-bold">NFC</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Channel attribution</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Free Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
              placeholder="Search Stand #, Business, IP..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            />
          </div>

          {/* 2. Stand Filter */}
          <div>
            <select
              value={cardFilter}
              onChange={(e) => handleFilterChange(setCardFilter, e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            >
              <option value="all">All Stands ({assignedCards.length})</option>
              {assignedCards.map((c) => (
                <option key={c.id} value={c.id}>
                  Stand #{c.id} {c.businessName ? `— ${c.businessName}` : '(Available)'}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Source Filter */}
          <div>
            <select
              value={sourceFilter}
              onChange={(e) => handleFilterChange(setSourceFilter, e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            >
              <option value="all">All Sources (QR & NFC)</option>
              <option value="qr">QR Code Scans Only</option>
              <option value="nfc">NFC Tag Taps Only</option>
            </select>
          </div>

          {/* 4. Date Range Filter */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => handleFilterChange(setDateFilter, e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            >
              <option value="all">All Time (Historical Included)</option>
              <option value="today">Today Only</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </select>
          </div>
        </div>

        {/* Results Counter and Active Filter Tags */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800 font-mono">{logs.length}</strong> of{' '}
              <strong className="text-slate-800 font-mono">{totalCount}</strong> recorded logs
            </span>
            {(cardFilter !== 'all' || sourceFilter !== 'all' || dateFilter !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCardFilter('all');
                  setSourceFilter('all');
                  setDateFilter('all');
                  setCurrentPage(1);
                }}
                className="text-[#1A73E8] hover:underline font-bold text-[11px]"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Telemetry Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-500">Retrieving scan telemetry from Firestore...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <History className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No scan logs found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No scan activity matches the selected filters. Try broadening your search or simulate a test scan using the button above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Stand ID</th>
                  <th className="px-4 py-3">Business Profile</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Client Device & Browser</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const card = cards.find((c) => c.id === log.cardId);
                  const isNfc = (log.source || '').toLowerCase() === 'nfc';
                  const isMobile =
                    (log.device || '').toLowerCase().includes('mobile') ||
                    (log.device || '').toLowerCase().includes('iphone') ||
                    (log.device || '').toLowerCase().includes('android') ||
                    (log.device || '').toLowerCase().includes('pixel');

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {formatTime(log.timestamp)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                        </div>
                      </td>

                      {/* Stand ID */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (card && onPreviewCard) onPreviewCard(card);
                          }}
                          className="inline-flex items-center gap-1 font-mono font-extrabold text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-[#1A73E8] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                          title="Click to preview this stand's review page"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>#{log.cardId}</span>
                        </button>
                      </td>

                      {/* Business Profile */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 truncate max-w-[200px]">
                          {log.businessName || card?.businessName || (
                            <span className="text-slate-400 italic">Unassigned Stand</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                          {log.category || card?.category || 'Stand Touchpoint'}
                        </div>
                      </td>

                      {/* Scan Source */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isNfc
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-[#1A73E8] border border-blue-200'
                          }`}
                        >
                          {isNfc ? <Radio className="w-2.5 h-2.5" /> : <QrCode className="w-2.5 h-2.5" />}
                          <span>{isNfc ? 'NFC Chip' : 'QR Scan'}</span>
                        </span>
                      </td>

                      {/* Client Device & Browser */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          {isMobile ? (
                            <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          ) : (
                            <Laptop className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                          <span className="font-medium truncate max-w-[220px]">
                            {log.device || 'Mobile Device'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[220px]">
                          {log.browser || 'Web Browser'} {log.ip ? `· ${log.ip}` : ''}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/r/${log.cardId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1A73E8] hover:bg-blue-50 transition-colors"
                            title="Open customer review URL"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && logs.length > 0 && totalPages > 1 && (
          <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Page <strong className="text-slate-900 font-mono">{currentPage}</strong> of{' '}
              <strong className="text-slate-900 font-mono">{totalPages}</strong>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 5 && currentPage > 3) {
                  p = Math.min(totalPages - 4 + i, currentPage - 2 + i);
                }
                return (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      currentPage === p
                        ? 'bg-[#1A73E8] text-white shadow-2xs'
                        : 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
