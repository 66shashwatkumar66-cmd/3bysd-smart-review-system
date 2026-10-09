import React, { useState, useEffect } from 'react';
import { CardRecord } from './types';
import { fetchCards, fetchCardById, createBatchCards, assignCard, deleteCard } from './utils/api';
import { AdminHeader } from './components/AdminHeader';
import { CardsTable } from './components/CardsTable';
import { BatchGeneratorModal } from './components/BatchGeneratorModal';
import { AssignCardModal } from './components/AssignCardModal';
import { PrintSheetView } from './components/PrintSheetView';
import { CustomerReviewView } from './components/CustomerReviewView';
import { MobileSimulatorModal } from './components/MobileSimulatorModal';
import { AdminStatsWidget } from './components/AdminStatsWidget';
import { NfcGeneratorView } from './components/NfcGeneratorView';
import { exportCardsToCsv } from './utils/csv';
import { QrCode, Plus, Smartphone, ExternalLink, FileSpreadsheet } from 'lucide-react';

export default function App() {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'cards' | 'print' | 'nfc' | 'simulator'>('cards');

  // Customer route state (e.g. /r/0001)
  const [customerCardId, setCustomerCardId] = useState<string | null>(null);
  const [customerCard, setCustomerCard] = useState<CardRecord | null>(null);

  // Modals state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [cardToAssign, setCardToAssign] = useState<CardRecord | null>(null);
  const [simulatorCardId, setSimulatorCardId] = useState<string | null>(null);

  // Parse route from window.location
  useEffect(() => {
    const checkPath = async () => {
      const pathname = window.location.pathname;
      const urlParams = new URLSearchParams(window.location.search);
      const queryCard = urlParams.get('card') || urlParams.get('r');

      let targetCardId: string | null = null;
      if (pathname.startsWith('/r/')) {
        targetCardId = pathname.replace('/r/', '').trim();
      } else if (queryCard) {
        targetCardId = queryCard.trim();
      }

      if (targetCardId) {
        setCustomerCardId(targetCardId);
        // Record scan analytics
        const found = await fetchCardById(targetCardId, true);
        setCustomerCard(found);
      }
    };

    checkPath();
    loadCards();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    const data = await fetchCards();
    setCards(data);
    setLoading(false);
  };

  const handleGenerateBatch = async (params: {
    count: number;
    startNumber: number;
    paddingDigits: number;
    prefix?: string;
  }) => {
    const updated = await createBatchCards(params);
    setCards(updated);
  };

  const handleAssignCard = async (id: string, updates: Partial<CardRecord>) => {
    const updated = await assignCard(id, updates);
    if (updated) {
      setCards((prev) =>
        prev.map((c) => (c.id.toLowerCase() === id.toLowerCase() ? updated : c))
      );
      if (customerCardId && customerCardId.toLowerCase() === id.toLowerCase()) {
        setCustomerCard(updated);
      }
    }
  };

  const handleDeleteCard = async (id: string) => {
    await deleteCard(id);
    setCards((prev) => prev.filter((c) => c.id.toLowerCase() !== id.toLowerCase()));
  };

  const handleToggleAiReview = async (id: string, enabled: boolean) => {
    await handleAssignCard(id, { aiReviewEnabled: enabled });
  };

  const handleOpenCustomerPreview = (card: CardRecord) => {
    setSimulatorCardId(card.id);
  };

  // If viewing customer URL directly (e.g. /r/0001)
  if (customerCardId) {
    return (
      <CustomerReviewView
        card={customerCard}
        cardId={customerCardId}
        onBackToAdmin={() => {
          // Reset pathname and view admin
          window.history.pushState({}, '', '/');
          setCustomerCardId(null);
        }}
      />
    );
  }

  const assignedCount = cards.filter((c) => c.status === 'assigned').length;
  const availableCount = cards.filter((c) => c.status === 'available').length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Top Admin Navigation */}
      <AdminHeader
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'simulator') {
            setSimulatorCardId(cards[0]?.id || '0001');
          } else {
            setCurrentTab(tab);
          }
        }}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        totalCards={cards.length}
        assignedCount={assignedCount}
        availableCount={availableCount}
      />

      {/* Main Admin Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Quick Testing & Direct Customer Link Bar with Google Colors */}
        <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-hidden">
          {/* Subtle Google Color Accent Glow in background */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-[#4285F4]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-1 relative z-10">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#FBBC05] text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-2xs">
                Live Google Review Engine
              </span>
              <span className="text-xs text-slate-300">
                Cards encode permanent URLs · Assign business profiles anytime
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Test customer review scan on any mobile device</span>
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap relative z-10">
            {cards.slice(0, 3).map((card) => (
              <a
                key={card.id}
                href={`/r/${card.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 hover:bg-[#1A73E8] text-xs font-mono text-slate-200 hover:text-white transition-all border border-slate-700/80 shadow-2xs group"
              >
                <span>/r/{card.id}</span>
                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-white" />
              </a>
            ))}

            <button
              onClick={() => setSimulatorCardId(cards[0]?.id || '0001')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/25 active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Open Phone Preview</span>
            </button>
          </div>
        </div>

        {/* Summary Stats Overview Widget */}
        <AdminStatsWidget
          cards={cards}
          onPreviewCard={handleOpenCustomerPreview}
        />

        {/* Tab 1: Cards Inventory */}
        {currentTab === 'cards' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Card Inventory & Assignments</h1>
                <p className="text-xs text-slate-500">
                  Manage physical card IDs, connect Google Review profiles, and download QR vectors
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportCardsToCsv(cards)}
                  disabled={cards.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                  title="Export entire card inventory as CSV spreadsheet"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => setIsBatchModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cards</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
                <div className="inline-block w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs text-slate-500">Loading cards...</p>
              </div>
            ) : (
              <CardsTable
                cards={cards}
                onAssignCard={(card) => setCardToAssign(card)}
                onDeleteCard={handleDeleteCard}
                onPreviewCard={handleOpenCustomerPreview}
                onOpenBatchModal={() => setIsBatchModalOpen(true)}
                onToggleAiReview={handleToggleAiReview}
              />
            )}
          </div>
        )}

        {/* Tab 2: Print Sheets */}
        {currentTab === 'print' && <PrintSheetView cards={cards} />}

        {/* Tab 3: NFC URL Generator */}
        {currentTab === 'nfc' && (
          <NfcGeneratorView
            cards={cards}
            onCardUpdated={(updated) => {
              setCards((prev) => {
                const idx = prev.findIndex((c) => c.id === updated.id);
                if (idx !== -1) {
                  const copy = [...prev];
                  copy[idx] = updated;
                  return copy;
                }
                return [...prev, updated];
              });
            }}
            onPreviewCard={handleOpenCustomerPreview}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">3DBYSD Smart Reviews</span>
            <span aria-hidden="true">·</span>
            <span>NFC & 3D Stand Dynamic Review Engine</span>
          </div>
          <div>
            Built with Google Gemini AI for authentic, honest customer reviews
          </div>
        </div>
      </footer>

      {/* Batch Generator Modal */}
      <BatchGeneratorModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        existingCards={cards}
        onGenerateBatch={handleGenerateBatch}
      />

      {/* Assign Card Modal */}
      <AssignCardModal
        card={cardToAssign}
        isOpen={Boolean(cardToAssign)}
        onClose={() => setCardToAssign(null)}
        onSave={handleAssignCard}
      />

      {/* Mobile Simulator Modal */}
      {simulatorCardId && (
        <MobileSimulatorModal
          cards={cards}
          initialCardId={simulatorCardId}
          onClose={() => setSimulatorCardId(null)}
        />
      )}
    </div>
  );
}
