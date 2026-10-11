import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  QrCode,
  AlertCircle,
  Eye,
  Loader2,
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup } from '../firebase';
import { saveUser } from '../utils/api';
import { UserProfile } from '../types';

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

  // Official Real Google OAuth Popup via Firebase Auth
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = (user.email || '').toLowerCase().trim();
      const isMaster =
        email === '66shashwatkumar66@gmail.com' ||
        (user.displayName && user.displayName.toLowerCase().includes('kalwa'));

      const profile: Partial<UserProfile> & { uid: string; email: string } = {
        uid: user.uid,
        email,
        displayName:
          user.displayName ||
          email.split('@')[0] ||
          (isMaster ? 'Kalwa Chodu' : 'Google User'),
        photoURL:
          user.photoURL ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
            email
          )}&backgroundColor=1a73e8&textColor=ffffff`,
        provider: 'google.com',
        role: isMaster ? 'master' : 'member',
        emailVerified: user.emailVerified || true,
        device: navigator.userAgent.slice(0, 60),
      };

      const saved = await saveUser(profile);
      onLoginSuccess(saved);
    } catch (err: any) {
      console.warn('Google sign-in popup error:', err);
      const code = err?.code || '';
      const msg = err?.message || '';

      if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in cancelled: The Google popup window was closed before completing authentication.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Sign-in blocked: Your browser blocked the Google popup window. Please allow popups for this site and try again.');
      } else if (code === 'auth/cancelled-popup-request') {
        setErrorMsg('Sign-in request superseded by another popup.');
      } else {
        setErrorMsg(`Authentication error: ${msg || 'Failed to authenticate with Firebase Google provider.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
              <QrCode className="w-5 h-5 text-[#FBBC05]" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-slate-900 tracking-tight block">
                3DBYSD Smart Reviews
              </span>
              <span className="text-[11px] text-slate-500 font-medium block">
                Dynamic QR & NFC Stand Management Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onPreviewCard('0001')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>Public Scan Preview (/r/0001)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-10 sm:py-16 flex flex-col justify-center space-y-6">
        {/* Sign In Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xl space-y-6 relative overflow-hidden">
          {/* Google 4-Color Accent Bar */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

          {/* Heading */}
          <div className="text-center space-y-2 pt-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-[#1A73E8] flex items-center justify-center mx-auto shadow-xs">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Sign In to Your Account
            </h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Authenticate securely with your Google account via Firebase to access your review cards.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Notice</span>
                <p className="text-amber-800 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Sole Primary Action: Real Firebase Google Sign-In */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-bold flex items-center justify-center gap-3 shadow-xs hover:shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-[#1A73E8]" />
                  <span>Signing in with Google...</span>
                </>
              ) : (
                <>
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
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>

          {/* Role-Based Access Info Box */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-[11px]">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Real Google Authentication (Firebase Auth):</span>
            </div>
            <ul className="space-y-1 text-slate-600 pl-4 list-disc">
              <li>
                <strong>Master Admin (Kalwa Chodu):</strong> Logging in with <code>66shashwatkumar66@gmail.com</code> grants full control to generate new QR batches and assign cards.
              </li>
              <li>
                <strong>Client Users:</strong> Log in with any Google account to view and configure only the cards allocated to you.
              </li>
              <li>
                <strong>Public Scans:</strong> Customers scanning physical QR stands or NFC tags access reviews directly without login.
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1">
          <div>3DBYSD Smart Reviews · Google Review Concierge Platform</div>
          <div>Protected by Firebase Authentication & Firestore</div>
        </div>
      </footer>
    </div>
  );
};
