import React, { useState, useId } from 'react';
import { CardRecord } from '../types';
import { CustomerReviewView } from './CustomerReviewView';
import { X, ExternalLink, Smartphone } from 'lucide-react';
import { getCardScanUrl } from '../utils/url';

interface MobileSimulatorModalProps {
  cards: CardRecord[];
  initialCardId?: string;
  onClose: () => void;
}

export const MobileSimulatorModal: React.FC<MobileSimulatorModalProps> = ({
  cards,
  initialCardId,
  onClose,
}) => {
  const cardSelectId = useId();
  const [selectedCardId, setSelectedCardId] = useState<string>(
    initialCardId || (cards[0] ? cards[0].id : '0001')
  );

  const activeCard = cards.find((c) => c.id === selectedCardId) || null;
  const fullUrl = getCardScanUrl(selectedCardId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Simulator Control Header */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span className="text-xs sm:text-sm font-bold">Mobile Device Simulator</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Card Switcher Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2 py-1 text-xs">
              <label htmlFor={cardSelectId} className="text-slate-400 text-[11px]">Card:</label>
              <select
                id={cardSelectId}
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="bg-transparent text-white font-mono font-semibold focus:outline-none cursor-pointer"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                    #{c.id} {c.businessName ? `(${c.businessName})` : '(Available)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Open in full new tab */}
            <a
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Open customer link in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mock Smartphone Frame Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex items-center justify-center">
          <div className="w-full max-w-[390px] bg-black rounded-[42px] p-3 shadow-2xl border-4 border-slate-800">
            {/* Phone Screen Glass */}
            <div className="bg-[#FDFCFB] rounded-[32px] overflow-hidden border border-slate-700 max-h-[720px] overflow-y-auto relative">
              {/* Phone Speaker & Dynamic Island Notch */}
              <div className="sticky top-0 z-30 pt-2 pb-1 bg-white flex justify-center">
                <div className="w-20 h-4 bg-black rounded-full" />
              </div>

              {/* Render the customer review component */}
              <CustomerReviewView
                card={activeCard}
                cardId={selectedCardId}
                isSimulator={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
