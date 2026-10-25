import React, { useState, useEffect, useId, useRef, useMemo } from 'react';
import { CardRecord, ReviewLanguage, ReviewTone, Advertisement } from '../types';
import { generateAiReview } from '../utils/api';
import { generateSmartFallbackReview } from '../services/reviewGenerator';
import { fetchAds, recordAdImpression, recordAdClick, isSafeUrl } from '../utils/adsApi';
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
  AlertCircle,
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

/**
 * Discreet, high-trust Advertisement Component
 */
const SponsoredAdCard: React.FC<{
  ad: Advertisement;
  onAdClick: (ad: Advertisement) => void;
}> = ({ ad, onAdClick }) => {
  const safeTarget = isSafeUrl(ad.targetUrl) ? ad.targetUrl : '#';

  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-2xs hover:border-blue-300 transition-all text-left">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          Sponsored · {ad.advertiser || 'Partner'}
        </span>
        <span className="text-[10px] text-slate-400 font-medium">Ad</span>
      </div>
      <div className="flex items-start gap-3">
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt={ad.headline || ad.name}
            className="w-12 h-12 object-cover rounded-xl border border-slate-100 shrink-0"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
            {ad.headline || ad.name}
          </h4>
          {ad.description && (
            <p className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
              {ad.description}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <a
              href={safeTarget}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onAdClick(ad)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A73E8] hover:text-[#1557B0] hover:underline"
            >
              <span>{ad.ctaText || 'Learn More'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const activeTagsList = useMemo(() => {
    if (card?.customKeywords && card.customKeywords.length > 0) {
      return card.customKeywords.map((kw) => ({
        id: kw,
        label: kw,
        icon: Sparkles,
      }));
    }
    return DEFAULT_EXPERIENCE_TAGS;
  }, [card?.customKeywords]);

  // AI Assistant Mode toggle: defaults to true if undefined, false if explicitly false
  const effectiveAiReviewEnabled = card?.aiReviewEnabled !== false;

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
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [redirected, setRedirected] = useState<boolean>(false);

  // Advertisements state
  const [ads, setAds] = useState<Advertisement[]>([]);
  const impressionsTrackedRef = useRef<Set<string>>(new Set());

  // Load public eligible ads
  useEffect(() => {
    let mounted = true;
    fetchAds(true)
      .then((eligibleAds) => {
        if (mounted) {
          setAds(eligibleAds);
        }
      })
      .catch((err) => {
        console.warn('Failed to load ads for review view:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Track impressions once per session per ad ID
  useEffect(() => {
    ads.forEach((ad) => {
      if (ad.placement !== 'disabled' && !impressionsTrackedRef.current.has(ad.id)) {
        impressionsTrackedRef.current.add(ad.id);
        recordAdImpression(ad.id);
      }
    });
  }, [ads]);

  const handleAdClick = (ad: Advertisement) => {
    recordAdClick(ad.id);
  };

  // Group ads by placement
  const adsByPlacement = useMemo(() => {
    const map: Record<string, Advertisement[]> = {
      below_biz_info: [],
      between_sections: [],
      below_draft: [],
      footer: [],
    };
    ads.forEach((ad) => {
      if (map[ad.placement]) {
        map[ad.placement].push(ad);
      }
    });
    return map;
  }, [ads]);

  // Cross-card isolation: cleanly reset state whenever the active card changes
  const currentCardKey = card?.id || cardId;
  const prevCardKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevCardKeyRef.current !== null && prevCardKeyRef.current !== currentCardKey) {
      if (card?.customKeywords && card.customKeywords.length > 0) {
        setSelectedTags(card.customKeywords.slice(0, 2));
      } else {
        setSelectedTags(['Food & Drinks', 'Friendly Staff']);
      }
      setRating(5);
      setCustomNotes('');
      setRecentDrafts([]);
      setGeneratedReview('');
      setGenerationError(null);
      if (card?.reviewTone === 'concise') setTone('direct');
      else if (card?.reviewTone === 'enthusiastic') setTone('enthusiastic');
      else if (card?.reviewTone === 'professional') setTone('professional');
      else setTone('casual');
    }
    prevCardKeyRef.current = currentCardKey;
  }, [currentCardKey]);

  // Sync selected tags if card's custom keywords list changes in customizer
  useEffect(() => {
    if (card?.customKeywords && card.customKeywords.length > 0) {
      setSelectedTags((prev) => {
        const valid = prev.filter((t) => card.customKeywords!.includes(t));
        return valid.length > 0 ? valid : card.customKeywords!.slice(0, 2);
      });
    }
  }, [card?.customKeywords]);

  const isAssigned = Boolean(card && card.status === 'assigned');
  const effectiveBusinessName =
    card?.businessName?.trim() || (isAssigned ? 'Our Business' : `Card #${cardId} Review Stand`);
  const effectiveCategory = card?.category?.trim() || 'Customer Experience';
  const effectiveBusinessDescription =
    card?.businessDescription?.trim() ||
    card?.promptStarter?.trim() ||
    (card?.notes &&
    !card.notes.toLowerCase().includes('stand') &&
    !card.notes.toLowerCase().includes('batch') &&
    !card.notes.toLowerCase().includes('unassigned')
      ? card.notes.trim()
      : '');

  const handleGenerate = async (
    explicitTone?: ReviewTone,
    explicitLang?: ReviewLanguage,
    explicitRating?: number,
    explicitTags?: string[]
  ) => {
    // If AI Assistant Mode is OFF, do not generate reviews or call backend
    if (!effectiveAiReviewEnabled) return;

    setIsGenerating(true);
    setCopied(false);
    setGenerationError(null);
    const activeTone = explicitTone || tone;
    const activeLang = explicitLang || language;
    const activeRating = explicitRating !== undefined ? explicitRating : rating;
    const activeTags = explicitTags !== undefined ? explicitTags : selectedTags;

    try {
      const res = await generateAiReview({
        businessName: effectiveBusinessName,
        category: effectiveCategory,
        businessDescription: effectiveBusinessDescription || undefined,
        rating: activeRating,
        tags: activeTags,
        notes: customNotes.trim() || undefined,
        language: activeLang,
        tone: activeTone,
        recentDrafts,
        cardId: card?.id || cardId,
        aiReviewEnabled: effectiveAiReviewEnabled,
      });

      if (res.success && res.review) {
        setGeneratedReview(res.review);
        setRecentDrafts((prev) => [res.review!, ...prev.filter((d) => d !== res.review)].slice(0, 4));
        setGenerationError(null);
      } else {
        if (res.message && (res.message.includes('disabled') || res.message.includes('Forbidden'))) {
          setGenerationError(res.message);
          return;
        }
        // Fallback to category-aware and keyword-aware generator
        const fallback = generateSmartFallbackReview(
          effectiveBusinessName,
          effectiveCategory,
          effectiveBusinessDescription,
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
    } catch (err: any) {
      console.warn('Network generate notice, using local generator:', err);
      const fallback = generateSmartFallbackReview(
        effectiveBusinessName,
        effectiveCategory,
        effectiveBusinessDescription,
        activeRating,
        activeTags,
        customNotes.trim(),
        activeLang,
        activeTone,
        recentDrafts
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
    if (effectiveAiReviewEnabled) {
      handleGenerate(tone, newLang);
    }
  };

  const handleToneChange = (newTone: ReviewTone) => {
    if (newTone === tone) return;
    setTone(newTone);
    if (effectiveAiReviewEnabled) {
      handleGenerate(newTone, language);
    }
  };

  const handleRatingChange = (newRating: number) => {
    setRating(newRating);
    if (effectiveAiReviewEnabled) {
      handleGenerate(tone, language, newRating);
    }
  };

  const toggleTag = (tagId: string) => {
    const updated = selectedTags.includes(tagId)
      ? selectedTags.filter((t) => t !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(updated);
    if (effectiveAiReviewEnabled) {
      handleGenerate(tone, language, rating, updated);
    }
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

  // State 0.5: Business Configuration cannot be retrieved
  if (!isLoading && !card && !isSimulator && cardId) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex flex-col justify-center items-center p-6 text-slate-900 antialiased">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertCircle className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900">
              Business Configuration Not Found
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Could not retrieve business details for Stand #{cardId}. Please verify the QR code or link.
            </p>
          </div>
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  // Review Experience: either AI Assistant Mode OR Direct Google Review Mode
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
              <span>{effectiveAiReviewEnabled ? 'Google Review Assistant' : 'Google Reviews'}</span>
            </span>
          )}

          {card?.googleReviewUrl && (
            <a
              href={card.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-[#1A73E8] hover:underline flex items-center gap-1"
            >
              <span>{effectiveAiReviewEnabled ? 'Skip to Google' : 'Open Google'}</span>
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
            {effectiveAiReviewEnabled
              ? 'Tap your rating below to craft your 5-star review in seconds.'
              : 'Tap your rating below to leave your review directly on Google.'}
          </p>
        </div>

        {/* AD PLACEMENT 1: Below Business Info */}
        {adsByPlacement.below_biz_info && adsByPlacement.below_biz_info.length > 0 && (
          <div className="space-y-2">
            {adsByPlacement.below_biz_info.map((ad) => (
              <SponsoredAdCard key={ad.id} ad={ad} onAdClick={handleAdClick} />
            ))}
          </div>
        )}

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

        {/* AD PLACEMENT 2: Between Sections */}
        {adsByPlacement.between_sections && adsByPlacement.between_sections.length > 0 && (
          <div className="space-y-2">
            {adsByPlacement.between_sections.map((ad) => (
              <SponsoredAdCard key={ad.id} ad={ad} onAdClick={handleAdClick} />
            ))}
          </div>
        )}

        {/* CONDITIONAL BRANCH: AI ASSISTANT ON vs OFF */}
        {effectiveAiReviewEnabled ? (
          <>
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

              {generationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold">Review Assistant Notice</div>
                    <div className="text-[11px] mt-0.5">{generationError}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGenerationError(null)}
                    className="text-red-400 hover:text-red-700 font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}

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
          </>
        ) : (
          /* DIRECT GOOGLE REVIEW CARD (AI ASSISTANT MODE OFF) */
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto border border-amber-200/60">
              <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                You're rating {effectiveBusinessName} {rating} Star{rating > 1 ? 's' : ''}!
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Tap the button below to share your rating and review directly on Google.
              </p>
            </div>

            {card?.googleReviewUrl ? (
              <a
                href={card.googleReviewUrl}
                target={isSimulator ? '_blank' : '_self'}
                rel="noopener noreferrer"
                className="w-full h-12 rounded-2xl bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all"
              >
                <span>Write Review on Google</span>
                <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
              </a>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Google review link is not configured yet for this stand.
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              You will be redirected straight to the official Google Review form for {effectiveBusinessName}.
            </p>
          </div>
        )}

        {/* AD PLACEMENT 3: Below Draft / Below Action Card */}
        {adsByPlacement.below_draft && adsByPlacement.below_draft.length > 0 && (
          <div className="space-y-2">
            {adsByPlacement.below_draft.map((ad) => (
              <SponsoredAdCard key={ad.id} ad={ad} onAdClick={handleAdClick} />
            ))}
          </div>
        )}

        {/* AD PLACEMENT 4: Footer Ad */}
        {adsByPlacement.footer && adsByPlacement.footer.length > 0 && (
          <div className="space-y-2">
            {adsByPlacement.footer.map((ad) => (
              <SponsoredAdCard key={ad.id} ad={ad} onAdClick={handleAdClick} />
            ))}
          </div>
        )}
      </div>

      {/* Clean Footer */}
      <footer className="text-center py-4 text-[11px] text-slate-400 border-t border-slate-100 bg-white/60">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between">
          <span>{effectiveBusinessName}</span>
          <span>{effectiveAiReviewEnabled ? 'Google Review Assistant' : 'Google Review Direct'}</span>
        </div>
      </footer>
    </div>
  );
};
