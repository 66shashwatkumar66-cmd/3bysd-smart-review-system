import React, { useState, useId } from 'react';
import { X, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { CardRecord } from '../types';

interface BatchGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCards: CardRecord[];
  onGenerateBatch: (params: {
    count: number;
    startNumber: number;
    paddingDigits: number;
    prefix?: string;
  }) => Promise<void>;
}

export const BatchGeneratorModal: React.FC<BatchGeneratorModalProps> = ({
  isOpen,
  onClose,
  existingCards,
  onGenerateBatch,
}) => {
  const batchCountId = useId();
  const startNumId = useId();
  const paddingId = useId();
  const prefixId = useId();

  // Find highest numeric ID among existing cards to suggest the next start number
  const highestExisting = existingCards.reduce((max, card) => {
    // strip non-digits
    const numPart = parseInt(card.id.replace(/\D/g, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);

  const [count, setCount] = useState<number>(10);
  const [startNumber, setStartNumber] = useState<number>(highestExisting + 1 || 1);
  const [paddingDigits, setPaddingDigits] = useState<number>(4);
  const [prefix, setPrefix] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  // Calculate preview IDs
  const previewStart = prefix
    ? `${prefix}-${String(startNumber).padStart(paddingDigits, '0')}`
    : String(startNumber).padStart(paddingDigits, '0');
  const previewEnd = prefix
    ? `${prefix}-${String(startNumber + count - 1).padStart(paddingDigits, '0')}`
    : String(startNumber + count - 1).padStart(paddingDigits, '0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (count < 1) {
      setError('Please specify at least 1 card to generate');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onGenerateBatch({
        count,
        startNumber,
        paddingDigits,
        prefix: prefix.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to generate cards');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Generate Batch Dynamic QRs</h2>
              <p className="text-[11px] text-slate-500">Manufacture & print first, assign businesses anytime</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Preset Buttons for Count */}
          <div>
            <label htmlFor={batchCountId} className="block text-xs font-semibold text-slate-700 mb-1.5">
              How many QR cards to generate?
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[5, 10, 25, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCount(preset)}
                  className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                    count === preset
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset} cards
                </button>
              ))}
            </div>
            <input
              id={batchCountId}
              type="number"
              min="1"
              max="250"
              value={count}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              placeholder="Or enter custom count..."
            />
          </div>

          {/* Start Number & Digits Padding */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={startNumId} className="block text-xs font-semibold text-slate-700 mb-1">
                Start Number
              </label>
              <input
                id={startNumId}
                type="number"
                min="1"
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white font-mono tabular-nums"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Next free: {highestExisting + 1}</span>
            </div>

            <div>
              <label htmlFor={paddingId} className="block text-xs font-semibold text-slate-700 mb-1">
                Zero-Padding Format
              </label>
              <select
                id={paddingId}
                value={paddingDigits}
                onChange={(e) => setPaddingDigits(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white font-mono"
              >
                <option value={4}>4-digit (0001, 0002...)</option>
                <option value={3}>3-digit (001, 002...)</option>
                <option value={5}>5-digit (00001, 00002...)</option>
              </select>
            </div>
          </div>

          {/* Optional Prefix */}
          <div>
            <label htmlFor={prefixId} className="block text-xs font-semibold text-slate-700 mb-1">
              Optional Prefix (Optional)
            </label>
            <input
              id={prefixId}
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g. SD or CAFE (leave empty for standard numbers)"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white uppercase font-mono"
            />
          </div>

          {/* Real-time Sequence Preview Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Batch Preview
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 font-mono tabular-nums">
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-xs">#{previewStart}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-xs">#{previewEnd}</span>
              <span className="text-slate-500 font-sans font-normal text-[11px] ml-auto">
                Total: {count} dynamic cards
              </span>
            </div>
            <p className="text-[11px] text-slate-500 pt-1">
              Permanent URL scheme:{' '}
              <span className="text-blue-700 font-mono">
                {window.location.origin}/r/{previewStart}
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? 'Generating...' : `Create ${count} Cards`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
