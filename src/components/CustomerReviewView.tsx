import React, { useState, useEffect, useId } from 'react';
import { CardRecord, ReviewLanguage, ReviewTone } from '../types';
import { generateAiReview } from '../utils/api';
import { generateSmartFallbackReview } from '../services/reviewGenerator';
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
  Smile,
  Award,
  Zap,
  MessageSquare,
  RefreshCw,
  Languages,
} from 'lucide-react';

interface CustomerReviewViewProps {
  card: CardRecord | null;
  cardId: string;
  onBackToAdmin?: () => void;
  isSimulator?: boolean;
  isLoading?: boolean;
}

const DEFAULT_EXPERIENCE_TAGS = [
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

const TONE_OPTIONS: { id: ReviewTone; label: string; desc: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'casual', label: 'Casual & Friendly', desc: 'Warm, conversational & approachable', icon: Smile },
  { id: 'warm', label: 'Warm & Appreciative', desc: 'Heartfelt thanks & hospitality', icon: Heart },
  { id: 'professional', label: 'Professional & Polished', desc: 'Clear, articulate & objective', icon: Award },
  { id: 'enthusiastic', label: 'Enthusiastic', desc: 'High energy & vibrant praise', icon: Zap },
  { id: 'direct', label: 'Simple & Direct', desc: 'Concise & straight to the point', icon: MessageSquare },
];

export const CustomerReviewView: React.FC<CustomerReviewViewProps> = ({
  card,
  cardId,
  onBackToAdmin,
  isSimulator = false,
  isLoading = false,
}) => {
  const notesInputId = useId();
  const reviewDraftId = useId();

  // Dynamic tags list: Use customKeywords if configured on card, otherwise defaults
  const activeTagsList = React.useMemo(() => {
    if (card?.customKeywords && card.customKeywords.length > 0) {
      return card.customKeywords.map((kw) => ({
        id: kw,
        label: kw,
        icon: Sparkles,
      }));
    }
    return DEFAULT_EXPERIENCE_TAGS;
  }, [card?.customKeywords]);

  // Allow simulator to preview AI enabled even if disabled on card, for testing
  const [simulatorOverrideAi] = useState<boolean | null>(null);

  const effectiveAiReviewEnabled =
    simulatorOverrideAi !== null
      ? simulatorOverrideAi
      : (card?.aiReviewEnabled !== false);

  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (card?.customKeywords && card.customKeywords.length > 0) {
      return card.customKeywords.slice(0, 2);
    }
    return ['Food & Drinks', 'Friendly Staff'];
  });
  const [customNotes, setCustomNotes] = useState<string>('');

  // Language selection: 'en' (default) or 'hinglish'
  const [language, setLanguage] = useState<ReviewLanguage>('en');

  // Tone selection: 5 distinct tones (default: 'casual')
  const [tone, setTone] = useState<ReviewTone>(() => {
    if (card?.reviewTone === 'concise') return 'direct';
    if (card?.reviewTone === 'enthusiastic') return 'enthusiastic';
    if (card?.reviewTone === 'professional') return 'professional';
    return 'casual';
  });

  // Recent drafts session history (kept in component state to avoid duplicates)
  const [recentDrafts, setRecentDrafts] = useState<string[]>([]);
  const [generatedReview, setGeneratedReview] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [redirected, setRedirected] = useState<boolean>(false);

  // Sync selected tags if card changes
  useEffect(() => {
    if (card?.customKeywords && card.customKeywords.length > 0) {
      setSelectedTags((prev) => (prev.length > 0 ? prev : card.customKeywords!.slice(0, 2)));
    }
  }, [card?.customKeywords]);

  const isAssigned = Boolean(card && card.status === 'assigned');
  const effectiveBusinessName =
    card?.businessName?.trim() || (isAssigned ? 'Our Business' : `Card #${cardId} Review Stand`);
  const effectiveCategory = card?.category?.trim() || 'Customer Experience';

  const handleGenerate = async (
    explicitTone?: ReviewTone,
    explicitLang?: ReviewLanguage,
    explicitRating?: number,
    explicitTags?: string[]
  ) => {
    setIsGenerating(true);
    setCopied(false);
    const activeTone = explicitTone || tone;
    const activeLang = explicitLang || language;
    const activeRating = explicitRating !== undefined ? explicitRating : rating;
    const activeTags = explicitTags || selectedTags;

    try {
      const res = await generateAiReview({
        businessName: effectiveBusinessName,
        category: effectiveCategory,
        rating: activeRating,
        tags: activeTags,
        notes: customNotes.trim() || undefined,
        language: activeLang,
        tone: activeTone,
        recentDrafts,
      });

      if (res.success && res.review) {
        setGeneratedReview(res.review);
        setRecentDrafts((prev) => [res.review!, ...prev.filter((d) => d !== res.review)].slice(0, 4));
      } else {
        // Fallback to contextual generator if server returned an error (e.g. 405 or network)
        const fallback = generateSmartFallbackReview(
          effectiveBusinessName,
          activeRating,
          activeTags,
          customNotes.trim(),
          activeLang,
          activeTone,
          recentDrafts
        );
        setGeneratedReview(fallback);
        setRecentDrafts((prev) => [fallback, ...prev.filter((d) => d !== fallback)].slice(0, 4));
      }
    } catch (err) {
      console.warn('Network generate failed, using local generator:', err);
      const fallback = generateSmartFallbackReview(
        effectiveBusinessName,
        activeRating,
        activeTags,
        customNotes.trim(),
        activeLang,
        activeTone
      );
      setGeneratedReview(fallback);
      setRecentDrafts((prev) => [fallback, ...prev.filter((d) => d !== fallback)].slice(0, 4));
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-generate starter review draft when AI review assistant is active
  useEffect(() => {
    if (effectiveAiReviewEnabled && !generatedReview && !isGenerating) {
      handleGenerate();
    }
  }, [card?.id, effectiveAiReviewEnabled]);

  const handleLanguageChange = (newLang: ReviewLanguage) => {
    if (newLang === language) return;
    setLanguage(newLang);
    handleGenerate(tone, newLang);
  };

  const handleToneChange = (newTone: ReviewTone) => {
    if (newTone === tone) return;
    setTone(newTone);
    handleGenerate(newTone, language);
  };

  const handleRatingChange = (newRating: number) => {
    setRating(newRating);
    handleGenerate(tone, language, newRating);
  };

  const toggleTag = (tagId: string) => {
    const updated = selectedTags.includes(tagId)
      ? selectedTags.filter((t) => t !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(updated);
    handleGenerate(tone, language, rating, updated);
  };

  const handleCopyAndRedirect = async () => {
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

    // Open target Google Review URL if configured
    if (card?.googleReviewUrl) {
      if (isSimulator) {
        window.open(card.googleReviewUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = card.googleReviewUrl;
      }
    }
  };

  // State 0: Loading in-progress
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex flex-col justify-center items-center p-6 text-slate-900 antialiased">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4 animate-fadeIn">
          {/* Google 4-Color Pulse Ring */}
          <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853] p-0.5 shadow-md shadow-blue-500/10">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
            </div>
          </div>

          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900">
              Connecting to Google Reviews
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Opening your review experience...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // State 2: Card Assigned -> High-trust Google-styled review concierge experience
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
              <span>Back</span>
            </button>
          ) : (
            <span className="text-xs font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full bg-[#4285F4]" />
                <span className="w-2 h-2 rounded-full bg-[#EA4335]" />
                <span className="w-2 h-2 rounded-full bg-[#FBBC05]" />
                <span className="w-2 h-2 rounded-full bg-[#34A853]" />
              </div>
              <span>Google Review Assistant</span>
            </span>
          )}

          {card?.googleReviewUrl && (
            <a
              href={card.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-[#1A73E8] hover:underline flex items-center gap-1"
            >
              <span>Skip to Google</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-md w-full mx-auto px-4 py-6 space-y-5 flex-1">
        {/* Unassigned Demo Banner if testing unconfigured card */}
        {!isAssigned && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span><strong>Card #{cardId}</strong> · Live Interactive Preview</span>
            </div>
            {onBackToAdmin && (
              <button
                onClick={onBackToAdmin}
                className="px-2.5 py-1 bg-white hover:bg-blue-100 text-[#1A73E8] font-bold rounded-lg border border-blue-200 transition-colors"
              >
                Configure in Admin
              </button>
            )}
          </div>
        )}

        {/* Business Branding Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs text-center space-y-2">
          {card?.logoUrl ? (
            <div className="w-16 h-16 rounded-2xl p-1 mx-auto shadow-sm border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
              <img
                src={card.logoUrl}
                alt={effectiveBusinessName}
                className="w-full h-full object-contain rounded-xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#4285F4] to-[#34A853] p-0.5 mx-auto shadow-sm">
              <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center font-bold text-xl text-slate-900">
                {effectiveBusinessName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
              {card?.customHeadline || effectiveBusinessName}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {effectiveCategory}
            </p>
          </div>
          <p className="text-xs text-slate-600 pt-1">
            Tap your rating below to craft your 5-star review in seconds.
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
                  onClick={() => handleRatingChange(star)}
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
            {activeTagsList.map((tag) => {
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
              Any specific dish, drink, or staff member mention? (Optional)
            </label>
            <input
              id={notesInputId}
              type="text"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="e.g. delicious iced latte, quick service, friendly Rahul..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Step 3: Language & Tone Customizer */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              3. Language & Tone
            </span>
            <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
              <Languages className="w-3.5 h-3.5" />
              <span>Multi-Style</span>
            </span>
          </div>

          {/* Language Selector */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Language
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>English</span>
                <span className="text-[10px] text-slate-400 font-normal">(Fluent)</span>
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('hinglish')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  language === 'hinglish'
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Hinglish</span>
                <span className="text-[10px] text-slate-400 font-normal">(हिन्दी-Eng)</span>
              </button>
            </div>
          </div>

          {/* Tone Selector */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Review Tone
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TONE_OPTIONS.map((t) => {
                const isSelected = tone === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleToneChange(t.id)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 text-blue-950 shadow-2xs ring-1 ring-blue-400/40'
                        : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-[#1A73E8]' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold leading-tight truncate">
                        {t.label}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                        {t.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Re-generate trigger button */}
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-500 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Drafting fresh review...' : 'Update Review Draft'}</span>
          </button>
        </div>

        {/* Step 4: Generated Review Draft */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              4. Review Draft (Editable)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span className="capitalize">{tone} · {language === 'hinglish' ? 'Hinglish' : 'English'}</span>
              </span>
            </div>
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
                placeholder="Click 'Update Review Draft' above to generate..."
                className="w-full p-3.5 text-xs sm:text-sm bg-slate-50/70 border border-slate-200 rounded-2xl text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white resize-none"
              />
            )}
          </div>

          {/* Word count & fresh variation quick trigger */}
          {!isGenerating && generatedReview && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>{generatedReview.split(/\s+/).filter(Boolean).length} words</span>
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating}
                className="text-[#1A73E8] hover:underline font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try another version</span>
              </button>
            </div>
          )}

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

          {/* Fallback button if browser popup blocker or mobile tab didn't navigate */}
          {redirected && card?.googleReviewUrl && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1.5 animate-fadeIn">
              <p className="text-xs text-emerald-900 font-semibold">
                Draft copied to your clipboard! Paste into Google:
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
          {card?.googleReviewUrl && (
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

      {/* Clean Footer */}
      <footer className="text-center py-4 text-[11px] text-slate-400 border-t border-slate-100 bg-white/60">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between">
          <span>{effectiveBusinessName}</span>
          <span>Google Review Assistant</span>
        </div>
      </footer>
    </div>
  );
};
