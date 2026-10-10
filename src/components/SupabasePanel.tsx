import React, { useState, useEffect } from 'react';
import { CardRecord } from '../types';
import {
  SUPABASE_URL,
  testSupabaseConnection,
  fetchCardsFromSupabase,
  upsertCardToSupabase,
  SUPABASE_SQL_SCHEMA,
} from '../supabase';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ArrowDownToLine,
  ArrowUpToLine,
  ExternalLink,
  Code2,
} from 'lucide-react';

interface SupabasePanelProps {
  cards: CardRecord[];
  onRefreshCards: () => Promise<void>;
}

export const SupabasePanel: React.FC<SupabasePanelProps> = ({ cards, onRefreshCards }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{
    connected: boolean;
    cardsTableExists: boolean;
    rowCount: number;
    adminsTableExists: boolean;
    error?: string;
  } | null>(null);

  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSql, setShowSql] = useState<boolean>(false);

  const checkConnection = async () => {
    setLoading(true);
    setSyncMessage(null);
    try {
      const res = await testSupabaseConnection();
      setStatus(res);
    } catch (err: any) {
      setStatus({
        connected: false,
        cardsTableExists: false,
        rowCount: 0,
        adminsTableExists: false,
        error: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleCopySql = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    }
  };

  const handlePushToSupabase = async () => {
    setLoading(true);
    setSyncMessage(null);
    try {
      let count = 0;
      for (const card of cards) {
        const res = await upsertCardToSupabase(card);
        if (res.success) count++;
      }
      setSyncMessage({
        type: 'success',
        text: `Successfully synced ${count} card(s) to Supabase cloud!`,
      });
      await checkConnection();
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: `Push error: ${err.message || 'Failed to sync to Supabase'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePullFromSupabase = async () => {
    setLoading(true);
    setSyncMessage(null);
    try {
      const res = await fetchCardsFromSupabase();
      if (!res.success) {
        setSyncMessage({
          type: 'error',
          text: `Pull error: ${res.error || 'Failed to fetch from Supabase'}`,
        });
        return;
      }

      // Sync via backend API
      const syncRes = await fetch('/api/supabase/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'pull' }),
      });
      const data = await syncRes.json();

      if (data.success) {
        await onRefreshCards();
        setSyncMessage({
          type: 'success',
          text: `Successfully pulled ${res.cards.length} card(s) from Supabase and updated local state!`,
        });
      } else {
        setSyncMessage({
          type: 'error',
          text: data.message || 'Sync failed',
        });
      }
      await checkConnection();
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: `Pull error: ${err.message || 'Failed to pull from Supabase'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Supabase Cloud Database Integration
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                Live Cloud Sync
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {SUPABASE_URL}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={checkConnection}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>

          <a
            href="https://supabase.com/dashboard/project/lebpkfffdygcwqagjart"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
          >
            <span>Supabase Console</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            syncMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {syncMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{syncMessage.text}</span>
        </div>
      )}

      {/* Connection Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Connection Status
          </div>
          <div className="mt-1 flex items-center gap-2">
            {status?.connected ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-700">Connected & Verified</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-xs font-bold text-rose-700">
                  {status?.error || 'Checking...'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Supabase Table: cards
          </div>
          <div className="mt-1 flex items-center gap-2">
            {status?.cardsTableExists ? (
              <span className="text-xs font-bold text-slate-800">
                Ready · {status.rowCount} row(s) sampled
              </span>
            ) : (
              <span className="text-xs font-semibold text-amber-600">
                Pending schema initialization
              </span>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Local App Cards
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              {cards.length} card(s) in active memory
            </span>
          </div>
        </div>
      </div>

      {/* Two-Way Sync Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          onClick={handlePushToSupabase}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
        >
          <ArrowUpToLine className="w-4 h-4 text-emerald-400" />
          <span>Push Local Cards to Supabase Cloud</span>
        </button>

        <button
          onClick={handlePullFromSupabase}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all disabled:opacity-50"
        >
          <ArrowDownToLine className="w-4 h-4 text-blue-600" />
          <span>Pull & Merge Cards from Supabase</span>
        </button>

        <button
          onClick={() => setShowSql(!showSql)}
          className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Code2 className="w-4 h-4" />
          <span>{showSql ? 'Hide SQL Script' : 'View SQL Migration Schema'}</span>
        </button>
      </div>

      {/* SQL Migration Script Box */}
      {showSql && (
        <div className="mt-3 p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-2 font-mono">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Supabase SQL Migration (PostgreSQL DDL)</span>
            </div>
            <button
              onClick={handleCopySql}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-mono font-semibold transition-colors"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy SQL</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-emerald-300 bg-black/40 p-3 rounded-lg overflow-x-auto max-h-56 leading-relaxed">
            {SUPABASE_SQL_SCHEMA}
          </pre>
          <p className="text-[11px] text-slate-400">
            Paste this SQL script into your Supabase Dashboard &gt; SQL Editor to guarantee all columns and permissions are configured.
          </p>
        </div>
      )}
    </div>
  );
};
