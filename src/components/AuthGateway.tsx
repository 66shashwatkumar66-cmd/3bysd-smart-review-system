import React, { useState } from 'react';
import {
  Lock,
  QrCode,
  AlertCircle,
  Eye,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signInWithRedirect } from '../firebase';
import { saveUser, fetchAdmins, fetchCards, MASTER_ADMIN_EMAIL } from '../utils/api';
import { UserProfile } from '../types';
import { logAuthFailure } from '../utils/firebaseDiagnostics';
import { FirebaseDiagnosticsModal } from './FirebaseDiagnosticsModal';

interface AuthGatewayProps {
  onLoginSuccess: (user: UserProfile) => void;
  onPreviewCard: (cardId: string) => void;
}

export const AuthGateway: React.FC<AuthGatewayProps> = ({
  onLoginSuccess,
  onPreviewCard,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRedirectHint, setShowRedirectHint] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);

  // Official Google OAuth Popup Authentication via Firebase
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    setShowRedirectHint(false);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = (user.email || '').toLowerCase().trim();
      const isMaster = email === MASTER_ADMIN_EMAIL && user.emailVerified;

      // Now that auth.currentUser is verified, resolve role from authoritative Firestore
      const [admins, cards] = await Promise.all([
        fetchAdmins().catch(() => []),
        fetchCards({ isMaster, email, uid: user.uid }).catch(() => []),
      ]);
      const authorizedAdmin = admins.find((a) => a.email.toLowerCase() === email);
      const hasAssignedCards = cards.some(
        (c) =>
          (c.assignedToEmail && c.assignedToEmail.toLowerCase() === email) ||
          (c.assignedToUid && c.assignedToUid === user.uid)
      );

      let role: 'master' | 'restricted' | 'member' = 'member';
      if (isMaster) {
        role = 'master';
      } else if (authorizedAdmin) {
        role = authorizedAdmin.role === 'master' ? 'master' : 'restricted';
      } else if (hasAssignedCards) {
        role = 'restricted';
      }

      const profile: Partial<UserProfile> & { uid: string; email: string } = {
        uid: user.uid,
        email,
        displayName: user.displayName || email.split('@')[0],
        photoURL:
          user.photoURL ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}&backgroundColor=1a73e8&textColor=ffffff`,
        provider: 'google.com',
        role,
        emailVerified: Boolean(user.emailVerified),
        device: navigator.userAgent.slice(0, 60),
      };

      const saved = await saveUser(profile);
      onLoginSuccess(saved);
    } catch (err: any) {
      logAuthFailure(err, 'Auth Gateway Google Sign-In');
      const code = err?.code || '';
      const msg = err?.message || '';

      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setErrorMsg(
          `Domain "${window.location.hostname}" is not authorized in Firebase Authentication. Open Firebase Diagnostics below to add this domain to Firebase Console.`
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Your browser blocked the Google sign-in popup. Please allow popups or use Redirect Sign-In below.');
        setShowRedirectHint(true);
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in popup was closed before completion. Please try again.');
      } else {
        setErrorMsg(msg || 'Google sign-in could not be completed. Please try again.');
        setShowRedirectHint(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Redirect fallback for mobile Safari / strict popup blockers (still genuine Firebase Google OAuth)
  const handleGoogleRedirectSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      logAuthFailure(err, 'Auth Gateway Google Redirect Sign-In');
      setErrorMsg(err?.message || 'Unable to start Google redirect sign-in.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <QrCode className="w-5 h-5 text-[#FBBC05]" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-sm text-slate-900 tracking-tight block truncate">
                3DBYSD Smart Reviews
              </span>
              <span className="text-[11px] text-slate-500 font-medium block truncate">
                Dynamic QR & NFC Stand Management Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onPreviewCard('0001')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Public Scan Preview (/r/0001)</span>
              <span className="sm:hidden">Preview</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center space-y-5">
        {/* Sign In Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xl space-y-6 relative overflow-hidden">
          {/* Google 4-Color Accent Bar */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

          {/* Heading */}
          <div className="text-center space-y-2 pt-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-[#1A73E8] flex items-center justify-center mx-auto shadow-xs">
              <Lock className="w-7 h-7 text-[#1A73E8]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Admin & Business Sign-In
            </h1>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Sign in with your verified Google account. Access is protected by Firebase Authentication and strict role-based security rules.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <span className="font-semibold">Authentication Notice</span>
                <p className="text-amber-800 leading-relaxed">{errorMsg}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsDiagnosticsOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-200 text-amber-950 font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                    <span>Firebase & Domain Diagnostics</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Primary Action: Google OAuth Popup + Mobile Redirect option */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl border border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-3 shadow-xs hover:shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28V6.57H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.43l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.57l4.03 3.15c.95-2.83 3.6-4.97 6.72-4.97z"
                />
              </svg>
              <span>{loading ? 'Authenticating...' : 'Sign in with Google'}</span>
            </button>

            {showRedirectHint && (
              <button
                type="button"
                onClick={handleGoogleRedirectSignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/70 text-[#1A73E8] text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Use Full-Page Google Redirect Sign-In</span>
              </button>
            )}

            <p className="text-[11px] text-slate-400 text-center pt-1">
              Verified Google OAuth is required to access Cloud Firestore records.
            </p>
          </div>
        </div>

        {/* Public Stand Testing Strip */}
        <div className="text-center space-y-2">
          <p className="text-xs text-slate-500">
            Testing customer NFC or QR stand scanning?
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onPreviewCard('0001')}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:border-blue-400 hover:text-blue-600 transition-colors shadow-2xs cursor-pointer"
            >
              Scan Stand #0001
            </button>
            <button
              type="button"
              onClick={() => onPreviewCard('0002')}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:border-blue-400 hover:text-blue-600 transition-colors shadow-2xs cursor-pointer"
            >
              Scan Stand #0002
            </button>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>3DBYSD Smart Reviews · Stand Management Platform</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsDiagnosticsOpen(true)}
              className="text-[#1A73E8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Firebase Diagnostics</span>
            </button>
            <span aria-hidden="true">·</span>
            <span>Powered by Google Gemini AI</span>
          </div>
        </div>
      </footer>

      {/* Diagnostics Modal */}
      <FirebaseDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        initialError={errorMsg}
      />
    </div>
  );
};
