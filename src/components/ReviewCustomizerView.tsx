import React, { useState, useEffect } from 'react';
import { CardRecord, AdminUser } from '../types';
import {
  Sparkles,
  Plus,
  Trash2,
  Save,
  Check,
  RefreshCw,
  Smartphone,
  Eye,
  Sliders,
  Store,
  Tag,
  Star,
  Coffee,
  Heart,
  Users,
  Clock,
  DollarSign,
  Sparkle,
  Utensils,
  Scissors,
  Stethoscope,
  ShoppingBag,
  Hotel,
  Wrench,
  Briefcase,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { CustomerReviewView } from './CustomerReviewView';
import { getCardScanUrl } from '../utils/url';

interface ReviewCustomizerViewProps {
  cards: CardRecord[];
  activeAdmin?: AdminUser;
  onSaveCardKeywords: (cardId: string, updates: Partial<CardRecord>) => Promise<void>;
  onPreviewCard?: (card: CardRecord) => void;
}

// Industry Presets
const INDUSTRY_PRESETS: {
  category: string;
  icon: any;
  tone: 'enthusiastic' | 'friendly' | 'professional' | 'concise';
  keywords: string[];
}[] = [
  {
    category: 'Café & Bakery',
    icon: Coffee,
    tone: 'friendly',
    keywords: [
      'Specialty Coffee',
      'Fresh Pastries',
      'Cozy Ambience',
      'Friendly Baristas',
      'Fast Wi-Fi',
      'Great Breakfast',
    ],
  },
  {
    category: 'Restaurant & Dining',
    icon: Utensils,
    tone: 'enthusiastic',
    keywords: [
      'Delicious Food',
      'Attentive Staff',
      'Great Ambience',
      'Quick Service',
      'Generous Portions',
      'Fresh Ingredients',
    ],
  },
  {
    category: 'Salon & Spa',
    icon: Scissors,
    tone: 'friendly',
    keywords: [
      'Skilled Stylist',
      'Relaxing Vibe',
      'Hygienic & Clean',
      'On-Time Appointment',
      'Great Hair Treatment',
      'Warm Hospitality',
    ],
  },
  {
    category: 'Clinic & Healthcare',
    icon: Stethoscope,
    tone: 'professional',
    keywords: [
      'Compassionate Care',
      'Doctor Consultation',
      'Minimal Wait Time',
      'Spotless Facility',
      'Clear Advice',
      'Gentle Treatment',
    ],
  },
  {
    category: 'Retail & Shopping',
    icon: ShoppingBag,
    tone: 'friendly',
    keywords: [
      'Great Selection',
      'Helpful Staff',
      'Fair Pricing',
      'Quick Checkout',
      'High Quality',
      'Easy Exchange',
    ],
  },
  {
    category: 'Hotel & Resort',
    icon: Hotel,
    tone: 'enthusiastic',
    keywords: [
      'Spacious Rooms',
      'Comfortable Bed',
      'Excellent Room Service',
      'Prime Location',
      'Scenic Views',
      'Super Clean',
    ],
  },
  {
    category: 'Auto & Repair',
    icon: Wrench,
    tone: 'professional',
    keywords: [
      'Honest Mechanics',
      'Fast Turnaround',
      'Fair Estimate',
      'Quality Workmanship',
      'Clear Explanation',
      'Reliable Service',
    ],
  },
  {
    category: 'Professional Services',
    icon: Briefcase,
    tone: 'professional',
    keywords: [
      'Expert Advice',
      'Prompt Communication',
      'Transparent Pricing',
      'Thorough Work',
      'Trustworthy Team',
      'Highly Recommended',
    ],
  },
];

const DEFAULT_KEYWORDS = [
  'Food & Drinks',
  'Friendly Staff',
  'Cosy Ambience',
  'Fast Service',
  'Great Value',
  'Clean & Welcoming',
];

export const ReviewCustomizerView: React.FC<ReviewCustomizerViewProps> = ({
  cards,
  activeAdmin,
  onSaveCardKeywords,
  onPreviewCard,
}) => {
  // Select which card to customize
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0]?.id || '0001');
  const selectedCard = cards.find((c) => c.id === selectedCardId) || cards[0];

  const [keywords, setKeywords] = useState<string[]>(() => {
    return selectedCard?.customKeywords && selectedCard.customKeywords.length > 0
      ? selectedCard.customKeywords
      : DEFAULT_KEYWORDS;
  });

  const [newKeywordInput, setNewKeywordInput] = useState<string>('');
  const [reviewTone, setReviewTone] = useState<'enthusiastic' | 'friendly' | 'professional' | 'concise'>(
    selectedCard?.reviewTone || 'friendly'
  );
  const [promptStarter, setPromptStarter] = useState<string>(selectedCard?.promptStarter || '');
  const [customHeadline, setCustomHeadline] = useState<string>(selectedCard?.customHeadline || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string>('');
  const [applyToAll, setApplyToAll] = useState<boolean>(false);

  // Sync state when card selection changes
  useEffect(() => {
    if (selectedCard) {
      setKeywords(
        selectedCard.customKeywords && selectedCard.customKeywords.length > 0
          ? selectedCard.customKeywords
          : DEFAULT_KEYWORDS
      );
      setReviewTone(selectedCard.reviewTone || 'friendly');
      setPromptStarter(selectedCard.promptStarter || '');
      setCustomHeadline(selectedCard.customHeadline || '');
      setSaveSuccess(false);
      setSaveError('');
    }
  }, [selectedCardId]);

  const handleAddKeyword = () => {
    const trimmed = newKeywordInput.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) {
      setNewKeywordInput('');
      return;
    }
    setKeywords((prev) => [...prev, trimmed]);
    setNewKeywordInput('');
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyPreset = (preset: typeof INDUSTRY_PRESETS[0]) => {
    setKeywords(preset.keywords);
    setReviewTone(preset.tone);
  };

  const handleResetDefaults = () => {
    setKeywords(DEFAULT_KEYWORDS);
    setReviewTone('friendly');
    setPromptStarter('');
    setCustomHeadline('');
  };

  const handleSave = async () => {
    if (!selectedCard) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError('');

    try {
      const updates: Partial<CardRecord> = {
        customKeywords: keywords,
        reviewTone,
        promptStarter: promptStarter.trim(),
        customHeadline: customHeadline.trim(),
      };

      if (applyToAll) {
        for (const c of cards) {
          await onSaveCardKeywords(c.id, updates);
        }
      } else {
        await onSaveCardKeywords(selectedCard.id, updates);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save keywords:', err);
      setSaveError(err.message || 'Failed to persist keyword changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Preview card with live changes applied in real time
  const previewCard: CardRecord = {
    ...(selectedCard || {
      id: '0001',
      status: 'assigned',
      businessName: 'Your Business Name',
      category: 'Local Business',
      googleReviewUrl: 'https://search.google.com/local/writereview',
      notes: '',
      scansCount: 0,
      createdAt: '',
      updatedAt: '',
    }),
    customKeywords: keywords,
    reviewTone,
    promptStarter,
    customHeadline,
  };

  const scanUrl = getCardScanUrl(previewCard.id);

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold border border-purple-100">
              <Sliders className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              Review Page Customizer & Keywords Manager
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Customize the experience keywords and AI prompt settings displayed to customers when scanning QR / NFC stands.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedCard && (
            <a
              href={`/r/${selectedCard.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              <span>Open /r/{selectedCard.id}</span>
            </a>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Saved!</span>
              </>
            ) : isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Keyword Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Two Column Layout: Left Column Settings & Keywords, Right Column Real-Time Mobile Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Settings (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Target Card Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              1. Choose Stand / Business to Customize
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    Card #{c.id} · {c.businessName || 'Unassigned Stand'} ({c.status})
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-xs text-slate-600 font-medium select-none cursor-pointer self-center">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8] border-slate-300 cursor-pointer"
                />
                <span>Apply to all {cards.length} cards</span>
              </label>
            </div>
          </div>

          {/* 2. Industry Keyword Presets */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                2. Quick Industry Keyword Packs
              </span>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-[11px] text-[#1A73E8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset Default</span>
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Click any industry to load pre-tested high-converting review tags:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {INDUSTRY_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.category}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 hover:border-purple-300 bg-slate-50/70 hover:bg-purple-50/50 text-slate-700 hover:text-purple-900 text-xs font-semibold transition-all group cursor-pointer text-center"
                  >
                    <Icon className="w-4 h-4 text-purple-600 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="truncate w-full text-[11px]">{preset.category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Active Custom Keywords List & Add Tag Input */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  3. Active Experience Keywords ({keywords.length})
                </span>
                <span className="text-[11px] text-slate-500">
                  Customers select these tags on the review page to generate personalized drafts.
                </span>
              </div>
            </div>

            {/* Input to Add New Keyword */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  placeholder="Type new keyword (e.g. Delicious Wood-fired Pizza, Doctor Advice)..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
              </div>
              <button
                type="button"
                onClick={handleAddKeyword}
                disabled={!newKeywordInput.trim()}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tag</span>
              </button>
            </div>

            {/* Keyword Chips List */}
            <div className="flex flex-wrap gap-2 pt-1 min-h-[80px] p-3 rounded-xl bg-slate-50 border border-slate-100">
              {keywords.map((kw, idx) => (
                <div
                  key={`${kw}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-2xs group hover:border-amber-300"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(idx)}
                    className="p-0.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                    title={`Remove ${kw}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {keywords.length === 0 && (
                <div className="text-xs text-slate-400 italic py-2">
                  No keywords added yet. Type a keyword above or select an industry preset.
                </div>
              )}
            </div>
          </div>

          {/* 4. AI Prompt Tone & Headline Customization */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              4. AI Tone & Headline Settings
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  AI Review Tone of Voice:
                </label>
                <select
                  value={reviewTone}
                  onChange={(e) => setReviewTone(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                >
                  <option value="friendly">Warm & Friendly (Recommended for Cafés/Dining)</option>
                  <option value="enthusiastic">Enthusiastic & Delighted (Great for 5-star spots)</option>
                  <option value="professional">Professional & Detailed (Healthcare/Corporate)</option>
                  <option value="concise">Crisp & Short (2 Sentences)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Custom Headline (Optional):
                </label>
                <input
                  type="text"
                  value={customHeadline}
                  onChange={(e) => setCustomHeadline(e.target.value)}
                  placeholder={`e.g. How was your visit today?`}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Special AI Prompt Instructions (Optional):
              </label>
              <input
                type="text"
                value={promptStarter}
                onChange={(e) => setPromptStarter(e.target.value)}
                placeholder="e.g. Highlight our friendly staff and prompt service without exaggerating"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Mobile Preview (5 cols on lg) */}
        <div className="lg:col-span-5 sticky top-20">
          <div className="bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-xl text-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#FBBC05]" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Live Customer Mobile Preview
                </span>
              </div>
              <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                Card #{previewCard.id}
              </span>
            </div>

            {/* Mobile Phone Mockup Frame */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-inner text-slate-900 border border-slate-700 max-h-[640px] overflow-y-auto">
              <CustomerReviewView
                card={previewCard}
                cardId={previewCard.id}
                isSimulator={true}
              />
            </div>

            <div className="text-[11px] text-slate-400 text-center pt-1">
              Keywords and settings update interactively above in real time.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
