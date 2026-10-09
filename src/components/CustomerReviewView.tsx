import React, { useState, useEffect, useId } from 'react';
import { CardRecord } from '../types';
import { generateAiReview } from '../utils/api';
import {
  Star,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
  Coffee,
  Heart,
  Users,
  Clock,
  DollarSign,
  Sparkle,
  ArrowRight,
  Store,
  Zap,
  Globe,
  Radio,
} from 'lucide-react';

interface CustomerReviewViewProps {
  card: CardRecord | null;
  cardId: string;
  onBackToAdmin?: () => void;
  isSimulator?: boolean;
}

const EXPERIENCE_TAGS = [
  { id: 'Food & Drinks', label: 'Food & Drinks', icon: Coffee },
  { id: 'Friendly Staff', label: 'Friendly Staff', icon: Users },
  { id: 'Cosy Ambience', label: 'Cosy Ambience', icon: Heart },
  { id: 'Fast Service', label: 'Fast Service', icon: Clock },
  { id: 'Great Value', label: 'Great Value', icon: DollarSign },
  { id: 'Clean & Welcoming', label: 'Clean & Welcoming', icon: Sparkle },
];

const RATING_LABELS: Record<number, string> = {
  5: '5 Stars · Exceptional Experience!',
  4: '4 Stars · Really Great Visit',
  3: '3 Stars · Good Experience',
  2: '2 Stars · Fair / Room for Improvement',
  1: '1 Star · Below Expectations',
};

export const CustomerReviewView: React.FC<CustomerReviewViewProps> = ({
  card,
  cardId,
  onBackToAdmin,
  isSimulator = false,
}) => {
  const notesInputId = useId();
  const reviewDraftId = useId();

  // Allow simulator to preview AI enabled even if disabled on card, for testing
  const [simulatorOverrideAi, setSimulatorOverrideAi] = useState<boolean | null>(null);

  const effectiveAiReviewEnabled =
    simulatorOverrideAi !== null
      ? simulatorOverrideAi
      : (card?.aiReviewEnabled !== false);

  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([
    'Food & Drinks',
    'Friendly Staff',
  ]);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [generatedReview, setGeneratedReview] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [redirected, setRedirected] = useState<boolean>(false);
  const [directRedirectCountdown, setDirectRedirectCountdown] = useState<number>(2);

  // Auto-generate starter review only if AI Review is enabled
  useEffect(() => {
    if (
      card &&
      card.status === 'assigned' &&
      effectiveAiReviewEnabled &&
      !generatedReview &&
      !isGenerating
    ) {
      handleGenerate();
    }
  }, [card?.id, effectiveAiReviewEnabled]);

  // Handle auto-redirect if AI review is OFF and not in simulator
  useEffect(() => {
    if (card && card.status === 'assigned' && !effectiveAiReviewEnabled && card.googleReviewUrl) {
      if (!isSimulator) {
        const timer = setTimeout(() => {
          window.location.href = card.googleReviewUrl;
        }, 1500);

        const countInterval = setInterval(() => {
          setDirectRedirectCountdown((prev) => (prev > 1 ? prev - 1 : 1));
        }, 800);

        return () => {
          clearTimeout(timer);
          clearInterval(countInterval);
        };
      }
    }
  }, [card?.id, effectiveAiReviewEnabled, isSimulator, card?.googleReviewUrl]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleGenerate = async () => {
    if (!card) return;
    setIsGenerating(true);
    setCopied(false);
    try {
      const res = await generateAiReview({
        businessName: card.businessName || 'this business',
        category: card.category || 'Café / Local Business',
        rating,
        tags: selectedTags,
        notes: customNotes.trim() || undefined,
      });

      if (res.success && res.review) {
        setGeneratedReview(res.review);
      }
    } catch (err) {
      console.error('Failed to generate review draft:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyAndRedirect = async () => {
    if (!card) return;
    const reviewToCopy = generatedReview.trim();

    try {
      if (reviewToCopy && navigator.clipboard) {
        await navigator.clipboard.writeText(reviewToCopy);
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }

    setCopied(true);
    setRedirected(true);

    // Open target Google Review URL
    if (card.googleReviewUrl) {
      setTimeout(() => {
        window.open(card.googleReviewUrl, '_blank', 'noopener,noreferrer');
      }, 350);
    }
  };

  // State 1: Card not found or unassigned stock
  if (!card || card.status !== 'assigned') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 text-slate-900">
        <div className="max-w-md w-full mx-auto my-auto bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <Store className="w-7 h-7" />
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-slate-100 font-mono text-xs font-bold text-slate-800 mb-2">
            Card #{cardId}
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Card Ready for Assignment
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
            This 3DBYSD Smart Review card is currently unassigned stock. In your admin dashboard, you can connect this card to any café, restaurant, or business Google Review profile with one click.
          </p>

          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="w-full py-3 px-4 rounded-xl bg-[#1A73E8] text-white font-semibold text-xs sm:text-sm hover:bg-[#1557B0] transition-colors shadow-sm"
            >
              Open Admin Dashboard to Assign
            </button>
          )}
        </div>

        <div className="text-center text-[11px] text-slate-400 py-4">
          3DBYSD Smart Reviews · NFC & Dynamic QR Card
        </div>
      </div>
    );
  }

  // State 2: Card Assigned, but Admin Turned OFF AI Review (Direct Google Mode)
  if (!effectiveAiReviewEnabled) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex flex-col justify-between text-slate-900 antialiased">
        {/* Top Mobile Bar */}
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            {onBackToAdmin ? (
              <button
                onClick={onBackToAdmin}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Admin</span>
              </button>
            ) : (
              <span className="text-xs font-bold tracking-tight text-slate-900 flex items-center gap-1">
                <span>3DBYSD Smart Reviews</span>
              </span>
            )}

            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              <span>Card #{card.id}</span>
            </div>
          </div>
        </div>

        {/* Content Area for Direct Mode */}
        <div className="max-w-md w-full mx-auto px-4 py-8 space-y-6 flex-1 flex flex-col justify-center">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
            {/* Google 4-color Ring & Business Initial */}
            <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#4285F4] to-[#34A853] p-0.5 shadow-md shadow-blue-500/10">
              <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center font-bold text-2xl text-slate-900">
                {card.businessName.charAt(0)}
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold mb-2">
                <Zap className="w-3 h-3 text-[#FBBC05]" />
                <span>Direct Google Review Mode</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
                {card.businessName}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {card.category || 'Specialty Business'}
              </p>
            </div>

            {/* Direct Redirect Message */}
            <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#1A73E8]">
                <Globe className="w-4 h-4 animate-spin text-[#4285F4]" />
                <span>
                  {isSimulator
                    ? 'Direct Mode: AI generator bypassed for this QR'
                    : `Redirecting you to Google Reviews...`}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                The administrator has configured this QR code to transfer customers straight to your Google Business Review profile.
              </p>
            </div>

            {/* Direct Link Button */}
            <a
              href={card.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-2xl bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all"
            >
              <span>Leave a Review on Google</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Simulator Toggle Test */}
            {isSimulator && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSimulatorOverrideAi(true)}
                  className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-purple-200"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Preview with AI Review Generator Active (ON)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-4 text-[11px] text-slate-400 border-t border-slate-100 bg-white/60">
          <div className="max-w-md mx-auto px-4 flex items-center justify-between">
            <span>Powered by 3DBYSD Smart Reviews</span>
            <span>Google Business Hand-off</span>
          </div>
        </footer>
      </div>
    );
  }

  // State 3: Card Assigned with AI Review Generator ON
  return (
    <div className="min-h-screen bg-[#FDFCFB] flex flex-col justify-between text-slate-900 antialiased selection:bg-amber-100 selection:text-amber-900">
      {/* Top Mobile Bar */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {onBackToAdmin ? (
            <button
              onClick={onBackToAdmin}
              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Admin</span>
            </button>
          ) : (
            <span className="text-xs font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              <span>3DBYSD Smart Reviews</span>
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {/* AI Review Active Badge */}
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#1A73E8] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-[#1A73E8]" />
              <span>AI Review: ON</span>
            </span>
            <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              #{card.id}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-md w-full mx-auto px-4 py-6 space-y-6 flex-1">
        {/* Business Branding Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 mx-auto flex items-center justify-center font-bold text-xl border border-amber-500/20">
            {card.businessName.charAt(0)}
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
              {card.businessName}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {card.category || 'Specialty Café & Dining'}
            </p>
          </div>
          <p className="text-xs text-slate-600 pt-1">
            Tap a rating below to generate your Google review draft in seconds.
          </p>
        </div>

        {/* Step 1: Star Rating */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. Your Rating
            </span>
            <span className="text-xs font-semibold text-amber-600">
              {RATING_LABELS[rating]}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= rating;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 sm:p-2 rounded-2xl transition-transform active:scale-90 hover:scale-105 focus:outline-none"
                  aria-label={`Rate ${star} stars`}
                >
                  <Star
                    className={`w-9 h-9 sm:w-10 sm:h-10 transition-colors ${
                      isFilled
                        ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                        : 'text-slate-200 fill-slate-50'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Experience Highlights */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Experience Highlights
            </span>
            <span className="text-[11px] text-slate-400">Select any that apply</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {EXPERIENCE_TAGS.map((tag) => {
              const Icon = tag.icon;
              const isSelected = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-semibold transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-amber-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{tag.label}</span>
                </button>
              );
            })}
          </div>

          {/* Optional Customer Words / Notes */}
          <div className="pt-2">
            <label htmlFor={notesInputId} className="block text-[11px] font-semibold text-slate-600 mb-1">
              Any specific dish, drink, or barista mention? (Optional)
            </label>
            <input
              id={notesInputId}
              type="text"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="e.g. delicious oat cappuccino, quick service..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white transition-all"
            />
          </div>

          {/* Re-generate trigger */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-500 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Drafting with Gemini...' : 'Update Review Draft'}</span>
          </button>
        </div>

        {/* Step 3: Generated Review Draft */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              3. Review Draft (Editable)
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>AI Draft</span>
            </span>
          </div>

          <div className="relative">
            {isGenerating ? (
              <div className="h-28 rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col items-center justify-center space-y-2">
                <div className="w-5 h-5 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500">Crafting personalized review...</span>
              </div>
            ) : (
              <textarea
                id={reviewDraftId}
                rows={4}
                value={generatedReview}
                onChange={(e) => setGeneratedReview(e.target.value)}
                placeholder="Click 'Generate Review' above to create draft..."
                className="w-full p-3.5 text-xs sm:text-sm bg-slate-50/70 border border-slate-200 rounded-2xl text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white resize-none"
              />
            )}
          </div>

          {/* Primary Action Button: Copy & Open Google */}
          <button
            type="button"
            onClick={handleCopyAndRedirect}
            disabled={!generatedReview || isGenerating}
            className="w-full h-13 rounded-2xl bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5 text-emerald-300" />
                <span>Review Copied! Opening Google...</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy & Open Google Review</span>
                <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
              </>
            )}
          </button>

          {/* Fallback button if popup blocker intercepted the redirect */}
          {redirected && card.googleReviewUrl && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1.5 animate-fadeIn">
              <p className="text-xs text-emerald-900 font-semibold">
                Draft copied to your clipboard! Paste it into Google:
              </p>
              <a
                href={card.googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#34A853] text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                <span>Tap here to submit on Google</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Option to skip AI directly to Google */}
          {card.googleReviewUrl && (
            <div className="text-center pt-1">
              <a
                href={card.googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-slate-400 hover:text-[#1A73E8] transition-colors inline-flex items-center gap-1"
              >
                <span>Prefer to write manually? Skip directly to Google</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-[11px] text-slate-400 border-t border-slate-100 bg-white/60">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between">
          <span>Powered by 3DBYSD Smart Reviews</span>
          <span>Google Business Hand-off</span>
        </div>
      </footer>
    </div>
  );
};
