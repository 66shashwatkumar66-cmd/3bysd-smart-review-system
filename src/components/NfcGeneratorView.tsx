import React, { useState, useId } from 'react';
import { CardRecord } from '../types';
import { assignCard, createBatchCards } from '../utils/api';
import {
  Radio,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Smartphone,
  HelpCircle,
  QrCode,
  ArrowRight,
  Wifi,
  Store,
  CheckCircle2,
} from 'lucide-react';
import { generateQrPng, downloadCardPng } from '../utils/qr';

interface NfcGeneratorViewProps {
  cards: CardRecord[];
  onCardUpdated: (card: CardRecord) => void;
  onPreviewCard: (card: CardRecord) => void;
}

export const NfcGeneratorView: React.FC<NfcGeneratorViewProps> = ({
  cards,
  onCardUpdated,
  onPreviewCard,
}) => {
  const businessNameId = useId();
  const reviewUrlId = useId();
  const categoryId = useId();
  const cardSelectId = useId();
  const notesId = useId();

  // Find next available unassigned card, or next sequential ID
  const availableCards = cards.filter((c) => c.status === 'available');
  const defaultSelectedId = availableCards[0]?.id || '';

  const [businessName, setBusinessName] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('NFC Tag Stand');
  const [selectedCardId, setSelectedCardId] = useState<string>(defaultSelectedId);
  const [autoCreateNew, setAutoCreateNew] = useState<boolean>(availableCards.length === 0);
  const [aiReviewEnabled, setAiReviewEnabled] = useState<boolean>(true);

  const [generatedCard, setGeneratedCard] = useState<CardRecord | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nfcWriteStatus, setNfcWriteStatus] = useState<string>('');
  const [error, setError] = useState('');
  const [qrPreviewSrc, setQrPreviewSrc] = useState<string>('');

  // Highest card number for auto-generating
  const highestExisting = cards.reduce((max, card) => {
    const numPart = parseInt(card.id.replace(/\D/g, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);

  const handleGenerateNfc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Please provide a business name.');
      return;
    }
    if (!googleReviewUrl.trim()) {
      setError('Please paste the business Google Review URL.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    setCopiedUrl(false);
    setNfcWriteStatus('');

    try {
      let targetId = selectedCardId;

      // If user chose to create a new card or no available card was picked
      if (autoCreateNew || !targetId) {
        const nextNum = highestExisting + 1;
        const newBatch = await createBatchCards({
          count: 1,
          startNumber: nextNum,
          paddingDigits: 4,
        });
        const created = newBatch.find((c) => c.id.includes(String(nextNum).padStart(4, '0')));
        targetId = created ? created.id : String(nextNum).padStart(4, '0');
      }

      // Assign the business details to the card
      const updated = await assignCard(targetId, {
        businessName: businessName.trim(),
        googleReviewUrl: googleReviewUrl.trim(),
        category: category.trim() || 'Local Business',
        notes: notes.trim(),
        status: 'assigned',
        aiReviewEnabled: aiReviewEnabled,
      });

      if (updated) {
        setGeneratedCard(updated);
        onCardUpdated(updated);

        // Pre-generate companion QR
        const nfcUrl = `${window.location.origin}/r/${updated.id}`;
        try {
          const qrData = await generateQrPng(nfcUrl, 512);
          setQrPreviewSrc(qrData);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate NFC URL');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  // Web NFC writing support (for Android Chrome / Web NFC enabled devices)
  const handleWriteWebNfc = async (nfcUrl: string) => {
    if (!('NDEFReader' in window)) {
      setNfcWriteStatus('Web NFC is not supported on this browser/OS. Please copy the URL and use the free "NFC Tools" app on iOS or Android.');
      return;
    }

    try {
      setNfcWriteStatus('Scanning for NFC tag... Hold your NFC tag/card to the back of your phone now.');
      const ndef = new (window as any).NDEFReader();
      await ndef.write({
        records: [{ recordType: 'url', data: nfcUrl }],
      });
      setNfcWriteStatus('Success! Tag successfully programmed with permanent URL.');
    } catch (err: any) {
      setNfcWriteStatus(`NFC write failed: ${err.message || 'Write aborted or timeout'}`);
    }
  };

  const currentNfcUrl = generatedCard
    ? `${window.location.origin}/r/${generatedCard.id}`
    : '';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1A73E8] to-[#1557B0] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>NFC URL Generator & Card Flasher</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#34A853] text-[10px] font-bold border border-emerald-200">
                  Dual QR + NFC Compatible
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Paste any Google Review link to generate permanent URLs for NFC chips (NTAG213, NTAG215, NTAG216) & stands.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Generator Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">1. Business & Review Link Input</h2>
            <p className="text-xs text-slate-500">
              The generated NFC URL will direct customers to your AI review draft assistant and then redirect to Google.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#EA4335] font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleGenerateNfc} className="space-y-4">
            {/* Business Name */}
            <div>
              <label htmlFor={businessNameId} className="block text-xs font-semibold text-slate-700 mb-1">
                Business Name *
              </label>
              <div className="relative">
                <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id={businessNameId}
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Blue Bottle Specialty Coffee & Bakery"
                  className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Google Review Destination URL */}
            <div>
              <label htmlFor={reviewUrlId} className="block text-xs font-semibold text-slate-700 mb-1">
                Paste Direct Google Review URL *
              </label>
              <input
                id={reviewUrlId}
                type="url"
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://search.google.com/local/writereview?placeid=... or https://g.page/r/..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white font-mono transition-all"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Found in Google Business Profile &gt; &quot;Ask for reviews&quot;
              </span>
            </div>

            {/* Category / Cuisine */}
            <div>
              <label htmlFor={categoryId} className="block text-xs font-semibold text-slate-700 mb-1">
                Category / Cuisine (Optional)
              </label>
              <input
                id={categoryId}
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Specialty Café, Bakery, Pizzeria, Salon"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white transition-all"
              />
            </div>

            {/* Card Allocation Mode */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Card ID & Permanent URL Assignment
              </label>

              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="cardAllocation"
                    checked={!autoCreateNew && availableCards.length > 0}
                    onChange={() => setAutoCreateNew(false)}
                    disabled={availableCards.length === 0}
                    className="text-[#1A73E8]"
                  />
                  <span>Assign to existing stock card</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="cardAllocation"
                    checked={autoCreateNew || availableCards.length === 0}
                    onChange={() => setAutoCreateNew(true)}
                    className="text-[#1A73E8]"
                  />
                  <span>Create new sequential card (#{String(highestExisting + 1).padStart(4, '0')})</span>
                </label>
              </div>

              {!autoCreateNew && availableCards.length > 0 && (
                <div className="pt-1">
                  <label htmlFor={cardSelectId} className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Select Available Card ID:
                  </label>
                  <select
                    id={cardSelectId}
                    value={selectedCardId}
                    onChange={(e) => setSelectedCardId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-mono"
                  >
                    {availableCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        Card #{c.id} ({c.notes || 'Unassigned stock'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Stand Location Notes */}
            <div>
              <label htmlFor={notesId} className="block text-xs font-semibold text-slate-700 mb-1">
                NFC Hardware / Stand Placement
              </label>
              <input
                id={notesId}
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Table 4 NFC Puck, Front Counter 3D Stand"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white transition-all"
              />
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
                      <span>AI Review Assistant</span>
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
                        ? 'Customer drafts review with Gemini before Google'
                        : 'Direct redirect straight to Google Review page'}
                    </p>
                  </div>
                </div>

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

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20 transition-all active:scale-98 disabled:opacity-50"
              >
                <Radio className="w-4 h-4" />
                <span>{isSubmitting ? 'Generating & Linking...' : 'Generate NFC Review URL'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Output & NFC Programming Guide */}
        <div className="lg:col-span-5 space-y-4">
          {generatedCard ? (
            <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 text-xs font-bold text-[#34A853]">
                <CheckCircle2 className="w-4 h-4" />
                <span>NFC Permanent Review URL Ready</span>
              </div>

              {/* Display Permanent URL */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>NFC Chip Payload URL</span>
                  <span className="font-mono text-slate-900 font-bold">#{generatedCard.id}</span>
                </div>
                <div className="font-mono text-xs text-[#1A73E8] font-bold break-all bg-white p-2.5 rounded-lg border border-slate-200 select-all">
                  {currentNfcUrl}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(currentNfcUrl)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#34A853]" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy NFC URL</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onPreviewCard(generatedCard)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-xs font-bold transition-all border border-blue-100"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Test Flow</span>
                </button>
              </div>

              {/* Web NFC Writer */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleWriteWebNfc(currentNfcUrl)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#34A853] hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Write to NFC Tag (Web NFC)</span>
                </button>

                {nfcWriteStatus && (
                  <p className="text-[11px] text-slate-600 mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    {nfcWriteStatus}
                  </p>
                )}
              </div>

              {/* Companion QR code preview */}
              {qrPreviewSrc && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
                  <img src={qrPreviewSrc} alt="Companion QR" className="w-14 h-14 rounded-lg border border-slate-200" />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">Companion QR Code</div>
                    <p className="text-[11px] text-slate-500">Dual QR print on the reverse of the NFC card/stand</p>
                    <button
                      onClick={() => downloadCardPng(currentNfcUrl, generatedCard.id, generatedCard.businessName)}
                      className="text-[#1A73E8] hover:underline text-[11px] font-medium mt-0.5"
                    >
                      Download QR PNG
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 mx-auto flex items-center justify-center border border-slate-200">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-bold text-slate-700">No NFC URL Generated Yet</h3>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Fill in the business name and Google Review link on the left to generate your permanent NFC card URL.
              </p>
            </div>
          )}

          {/* NFC Programming Guide */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <HelpCircle className="w-4 h-4 text-[#4285F4]" />
              <span>How to Program Physical NFC Tags:</span>
            </div>

            <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-slate-600 leading-relaxed">
              <li>
                <strong>NFC Chip Types:</strong> Works with standard <strong>NTAG213</strong>, <strong>NTAG215</strong>, or <strong>NTAG216</strong> adhesive stickers, keychains, or 3D printed pucks.
              </li>
              <li>
                <strong>Free Mobile App:</strong> Download <em>NFC Tools</em> (free on iOS App Store &amp; Google Play Store) or <em>NFC TagWriter by NXP</em>.
              </li>
              <li>
                <strong>Write Record:</strong> In NFC Tools &gt; tap <strong>Write</strong> &gt; <strong>Add a record</strong> &gt; <strong>URL / URI</strong> &gt; paste your generated permanent URL (<code className="bg-slate-100 px-1 py-0.5 rounded text-[#1A73E8]">/r/0005</code>).
              </li>
              <li>
                <strong>Tap &amp; Lock:</strong> Tap your physical card to write. Leave un-locked so you can reprogram it later if needed!
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
