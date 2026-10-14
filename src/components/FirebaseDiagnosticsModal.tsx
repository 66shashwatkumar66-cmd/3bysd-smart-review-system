import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  ShieldAlert,
  Database,
  Globe,
  Key,
} from 'lucide-react';
import {
  runFirebaseDiagnostics,
  FirebaseDiagnosticReport,
} from '../utils/firebaseDiagnostics';

interface FirebaseDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialError?: string | null;
}

export const FirebaseDiagnosticsModal: React.FC<FirebaseDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  initialError,
}) => {
  const [report, setReport] = useState<FirebaseDiagnosticReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);

  const refreshDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await runFirebaseDiagnostics();
      setReport(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyDomain = (domain: string) => {
    navigator.clipboard.writeText(domain);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Google 4-Color Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

        {/* Modal Header */}
        <div className="p-4 sm:p-6 pb-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-2xs">
              <ShieldAlert className="w-5 h-5 text-[#1A73E8]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                Firebase & OAuth Diagnostics
              </h3>
              <p className="text-xs text-slate-500">
                Real-time validation of Firebase SDK, Firestore, and OAuth domain authorization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar text-xs">
          {initialError && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <span className="font-bold">Recent Auth Error Trigger:</span>
                <p className="font-mono text-[11px] text-amber-800 break-words">{initialError}</p>
              </div>
            </div>
          )}

          {loading || !report ? (
            <div className="p-12 text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#1A73E8] mx-auto" />
              <p className="text-slate-500 font-medium">Validating Firebase & domain parameters...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Domain Authorization Card */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#1A73E8]" />
                    <span className="font-bold text-slate-900 text-sm">OAuth Domain Status</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                      report.isStandardFirebaseDomain
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {report.isStandardFirebaseDomain ? '✓ Standard Domain' : '⚠️ Custom / Cloud Run Domain'}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 text-[11px]">Current Hostname:</span>
                    <span className="font-mono font-bold text-slate-800 break-all text-[11px]">
                      {report.currentHostname}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-slate-500 text-[11px]">Authorized in Firebase?</span>
                    {report.isStandardFirebaseDomain ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Authorized by default
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyDomain(report.currentHostname)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px] transition-colors"
                        >
                          {copiedDomain ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedDomain ? 'Copied Hostname!' : 'Copy Domain'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {!report.isStandardFirebaseDomain && (
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-900 space-y-1.5 text-[11px]">
                    <span className="font-bold flex items-center gap-1.5">
                      <span>To authorize this domain for Google OAuth:</span>
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 text-[11px]">
                      <li>
                        Open{' '}
                        <a
                          href={`https://console.firebase.google.com/project/${report.projectId}/authentication/settings`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1A73E8] font-bold underline inline-flex items-center gap-0.5"
                        >
                          Firebase Authentication Settings <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </li>
                      <li>Navigate to the <strong>Authorized domains</strong> section</li>
                      <li>Click <strong>Add domain</strong> and paste: <code className="bg-white px-1 py-0.5 rounded border border-slate-300 font-mono text-[10px]">{report.currentHostname}</code></li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Service Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Firestore Status */}
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <span>Firestore Database</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        report.firestoreConnected
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {report.firestoreConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    ID: {report.firestoreDatabaseId}
                  </div>
                </div>

                {/* OAuth Client ID */}
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Key className="w-4 h-4 text-purple-600" />
                      <span>OAuth Client</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                      Configured
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    {report.oAuthClientId.slice(0, 24)}...
                  </div>
                </div>
              </div>

              {/* Default Authorized Domains List */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/30 space-y-2">
                <span className="font-bold text-slate-700 text-[11px]">
                  Default Pre-Authorized Domains in Project ({report.projectId}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {report.standardAuthorizedDomains.map((dom) => (
                    <span
                      key={dom}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono text-[10px] text-slate-700"
                    >
                      {dom}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={refreshDiagnostics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-run Checks</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
