import React, { useState, useEffect, useId } from 'react';
import { X, ExternalLink, HelpCircle, Check, MapPin, Store, Sparkles } from 'lucide-react';
import { CardRecord, AdminUser, UserProfile } from '../types';

interface AssignCardModalProps {
  card: CardRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<CardRecord>) => Promise<void>;
  activeAdmin?: AdminUser;
  isMaster?: boolean;
  users?: UserProfile[];
}

export const AssignCardModal: React.FC<AssignCardModalProps> = ({
  card,
  isOpen,
  onClose,
  onSave,
  activeAdmin,
  isMaster = true,
  users = [],
}) => {
  const businessNameId = useId();
  const categoryId = useId();
  const googleUrlId = useId();
  const notesId = useId();
  const statusId = useId();
  const assignedUserId = useId();

  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'available' | 'assigned' | 'disabled'>('assigned');
  const [aiReviewEnabled, setAiReviewEnabled] = useState<boolean>(true);
  const [assignedToEmail, setAssignedToEmail] = useState<string>('');
  const [assignedToName, setAssignedToName] = useState<string>('');
  const [assignedToUid, setAssignedToUid] = useState<string>('');
  const [showHelper, setShowHelper] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (card) {
      setBusinessName(card.businessName || '');
      setCategory(card.category || '');
      setGoogleReviewUrl(card.googleReviewUrl || '');
      setNotes(card.notes || '');
      setStatus(card.status || 'available');
      setAiReviewEnabled(card.aiReviewEnabled !== false);
      setAssignedToEmail(card.assignedToEmail || '');
      setAssignedToName(card.assignedToName || '');
      setAssignedToUid(card.assignedToUid || '');
      setError('');
    }
  }, [card]);

  if (!isOpen || !card) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'assigned') {
      if (!businessName.trim()) {
        setError('Please enter a business name to assign this card.');
        return;
      }
      if (!googleReviewUrl.trim()) {
        setError('Please enter the direct Google Review URL for this business.');
        return;
      }
    }

    setError('');
    setIsSubmitting(true);
    try {
      await onSave(card.id, {
        businessName: businessName.trim(),
        category: category.trim(),
        googleReviewUrl: googleReviewUrl.trim(),
        notes: notes.trim(),
        status: status,
        aiReviewEnabled: aiReviewEnabled,
        assignedToEmail: assignedToEmail.trim() || undefined,
        assignedToName: assignedToName.trim() || undefined,
        assignedToUid: assignedToUid.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-xs">
              #{card.id}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {card.businessName ? `Edit Card #${card.id}` : `Assign Card #${card.id}`}
              </h2>
              <p className="text-[11px] text-slate-500">
                Permanent link: <span className="font-mono text-blue-600">/r/{card.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          {/* User Account Assignment (UBRA Access Control) */}
          {isMaster ? (
            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2">
              <label htmlFor={assignedUserId} className="block text-xs font-bold text-purple-950 flex items-center justify-between">
                <span>Assign to User Account (Google Email)</span>
                <span className="text-[10px] font-mono bg-purple-200 text-purple-900 px-1.5 py-0.2 rounded font-bold">RBAC Access</span>
              </label>

              {users.length > 0 && (
                <select
                  value={assignedToEmail}
                  onChange={(e) => {
                    const selected = users.find(u => u.email.toLowerCase() === e.target.value.toLowerCase());
                    if (selected) {
                      setAssignedToEmail(selected.email);
                      setAssignedToName(selected.displayName);
                      setAssignedToUid(selected.uid);
                    } else {
                      setAssignedToEmail(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-purple-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600 mb-1"
                >
                  <option value="">-- Choose registered Google user --</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.email}>
                      {u.displayName} ({u.email}) - {u.role}
                    </option>
                  ))}
                </select>
              )}

              <input
                id={assignedUserId}
                type="email"
                value={assignedToEmail}
                onChange={(e) => setAssignedToEmail(e.target.value)}
                placeholder="Or type Google email (e.g. merchant@gmail.com)"
                className="w-full px-3 py-1.5 text-xs bg-white border border-purple-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <p className="text-[11px] text-purple-700">
                Only this logged-in Google user will be authorized to see and manage this card.
              </p>
            </div>
          ) : (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Authorized Account:</span>
              <span className="font-mono text-slate-900 font-bold">{card.assignedToEmail || 'Your Account'}</span>
            </div>
          )}

          {/* Business Name */}
          <div>
            <label htmlFor={businessNameId} className="block text-xs font-semibold text-slate-700 mb-1">
              Business Name *
            </label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id={businessNameId}
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Blue Bottle Specialty Coffee & Brunch"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>
          </div>

          {/* Business Category */}
          <div>
            <label htmlFor={categoryId} className="block text-xs font-semibold text-slate-700 mb-1">
              Category / Cuisine (Optional)
            </label>
            <input
              id={categoryId}
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Specialty Café, Bakery, Pizzeria, Boutique Salon"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          {/* Google Review Destination URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={googleUrlId} className="block text-xs font-semibold text-slate-700">
                Google Review Direct URL *
              </label>
              <button
                type="button"
                onClick={() => setShowHelper(!showHelper)}
                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" />
                <span>How to get direct link?</span>
              </button>
            </div>

            <div className="relative">
              <input
                id={googleUrlId}
                type="url"
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://search.google.com/local/writereview?placeid=... or https://g.page/r/..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white font-mono"
              />
            </div>

            {googleReviewUrl && (
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-slate-400">Valid URL format</span>
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Test URL in new tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {showHelper && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 space-y-1.5">
                <div className="font-semibold text-blue-950">How to get your direct Google Review Link:</div>
                <ol className="list-decimal pl-4 space-y-1 text-blue-800">
                  <li>Search for your business on Google or open your Google Business Profile manager.</li>
                  <li>Click on the <strong>&quot;Ask for reviews&quot;</strong> button or <strong>&quot;Get more reviews&quot;</strong>.</li>
                  <li>Copy the direct short link (usually looks like <code className="bg-white/80 px-1 py-0.5 rounded">g.page/r/...</code> or <code className="bg-white/80 px-1 py-0.5 rounded">search.google.com/local/writereview?placeid=...</code>).</li>
                  <li>Paste it into this field. Customers will land directly on your review composer!</li>
                </ol>
              </div>
            )}
          </div>

          {/* Physical Stand Placement & Notes */}
          <div>
            <label htmlFor={notesId} className="block text-xs font-semibold text-slate-700 mb-1">
              Physical Stand / Location Note (Optional)
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id={notesId}
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Table 4 Acrylic Stand, Counter Display, NFC Keychain"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>
          </div>

          {/* AI Review Assistant ON / OFF Toggle */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    aiReviewEnabled ? 'bg-blue-100 text-[#1A73E8]' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>AI Review Generator Feature</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.2 rounded-full font-bold ${
                        aiReviewEnabled
                          ? 'bg-blue-50 text-[#1A73E8] border border-blue-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {aiReviewEnabled ? 'ACTIVE (ON)' : 'BYPASS (OFF)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {aiReviewEnabled
                      ? 'Scans open the AI review assistant first, customer copies draft, then continues to Google.'
                      : 'Scans redirect directly to Google Reviews, skipping the AI generator.'}
                  </p>
                </div>
              </div>

              {/* Toggle Switch Button */}
              <button
                type="button"
                onClick={() => setAiReviewEnabled(!aiReviewEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  aiReviewEnabled ? 'bg-[#1A73E8]' : 'bg-slate-300'
                }`}
                role="switch"
                aria-checked={aiReviewEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    aiReviewEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Card Status */}
          <div>
            <label htmlFor={statusId} className="block text-xs font-semibold text-slate-700 mb-1">
              Card Status
            </label>
            <select
              id={statusId}
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            >
              <option value="assigned">Assigned (Active for customers)</option>
              <option value="available">Available (Unassigned / Physical stock)</option>
              <option value="disabled">Disabled (Temporarily inactive)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Assignment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
