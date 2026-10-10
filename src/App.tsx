import React, { useState, useEffect } from 'react';
import { CardRecord, AdminUser } from './types';
import {
  fetchCards,
  fetchCardById,
  createBatchCards,
  assignCard,
  deleteCard,
  fetchAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from './utils/api';
import { AdminHeader } from './components/AdminHeader';
import { CardsTable } from './components/CardsTable';
import { BatchGeneratorModal } from './components/BatchGeneratorModal';
import { AssignCardModal } from './components/AssignCardModal';
import { PrintSheetView } from './components/PrintSheetView';
import { CustomerReviewView } from './components/CustomerReviewView';
import { MobileSimulatorModal } from './components/MobileSimulatorModal';
import { AdminStatsWidget } from './components/AdminStatsWidget';
import { NfcGeneratorView } from './components/NfcGeneratorView';
import { MasterAdminView } from './components/MasterAdminView';
import { exportCardsToCsv } from './utils/csv';
import {
  QrCode,
  Plus,
  Smartphone,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

export default function App() {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'cards' | 'print' | 'nfc' | 'simulator' | 'admins'>('cards');

  // Admin Management State
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [activeAdmin, setActiveAdmin] = useState<AdminUser | null>(null);

  // Customer route state (e.g. /r/0001)
  const [customerCardId, setCustomerCardId] = useState<string | null>(null);
  const [customerCard, setCustomerCard] = useState<CardRecord | null>(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState<boolean>(true);

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

        // Instant local cache check to eliminate any white flash or loading delay
        const cachedRaw = localStorage.getItem('3dbysd_smart_reviews_cards');
        let initialFound: CardRecord | null = null;
        if (cachedRaw) {
          try {
            const parsed = JSON.parse(cachedRaw) as CardRecord[];
            const hit = parsed.find((c) => c.id.toLowerCase() === targetCardId.toLowerCase());
            if (hit) {
              initialFound = hit;
              setCustomerCard(hit);
              setIsCustomerLoading(false);

              // If AI Review is not explicitly enabled, immediate zero-delay redirect to Google Reviews!
              if (hit.aiReviewEnabled !== true && hit.googleReviewUrl && hit.status === 'assigned') {
                window.location.replace(hit.googleReviewUrl);
                return;
              }
            }
          } catch {
            // ignore
          }
        }

        if (!initialFound) {
          setIsCustomerLoading(true);
        }

        // Fetch fresh card from backend / Firestore and record scan count
        const found = await fetchCardById(targetCardId, true);
        if (found) {
          setCustomerCard(found);
          if (found.aiReviewEnabled !== true && found.googleReviewUrl && found.status === 'assigned') {
            window.location.replace(found.googleReviewUrl);
            return;
          }
        }
        setIsCustomerLoading(false);
      }
    };

    checkPath();
    loadCards();
    loadAdminsData();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    const data = await fetchCards();
    setCards(data);
    setLoading(false);
  };

  const loadAdminsData = async () => {
    const list = await fetchAdmins();
    setAdmins(list);
    // Set default active admin to Master Admin
    const master = list.find((a) => a.role === 'master') || list[0];
    if (master) {
      setActiveAdmin(master);
    }
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
    const updated = await assignCard(id, updates, effectiveActiveAdmin.id);
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

  const handleSaveAdmin = async (adminData: Partial<AdminUser>) => {
    if (adminData.id) {
      const updated = await updateAdmin(adminData.id, adminData);
      if (updated) {
        setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        if (activeAdmin && activeAdmin.id === updated.id) {
          setActiveAdmin(updated);
        }
      }
    } else {
      const created = await createAdmin(adminData);
      if (created) {
        setAdmins((prev) => [...prev, created]);
      }
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    await deleteAdmin(adminId);
    setAdmins((prev) => prev.filter((a) => a.id !== adminId));
  };

  // If viewing customer URL directly (e.g. /r/0001)
  if (customerCardId) {
    return (
      <CustomerReviewView
        card={customerCard}
        cardId={customerCardId}
        isLoading={isCustomerLoading}
        onBackToAdmin={() => {
          // Reset pathname and view admin
          window.history.pushState({}, '', '/');
          setCustomerCardId(null);
        }}
      />
    );
  }

  // Active admin fallback
  const effectiveActiveAdmin: AdminUser =
    activeAdmin ||
    admins[0] || {
      id: 'master-admin-01',
      email: '66shashwatkumar66@gmail.com',
      name: 'Master Admin',
      role: 'master',
      assignedCardIds: [],
      permissions: {
        canEditCards: true,
        canToggleAi: true,
        canExportCsv: true,
        canCreateCards: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

  const masterAdmin = admins.find((a) => a.role === 'master') || effectiveActiveAdmin;
  const isMaster = effectiveActiveAdmin.role === 'master';

  // Filter cards based on current active admin permissions
  // If restricted, ONLY show and allow editing of the cards registered by master admin
  const displayedCards = isMaster
    ? cards
    : cards.filter((c) => effectiveActiveAdmin.assignedCardIds.includes(c.id));

  const assignedCount = displayedCards.filter((c) => c.status === 'assigned').length;
  const availableCount = displayedCards.filter((c) => c.status === 'available').length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Top Admin Navigation */}
      <AdminHeader
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'simulator') {
            setSimulatorCardId(displayedCards[0]?.id || cards[0]?.id || '0001');
          } else {
            setCurrentTab(tab);
          }
        }}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        totalCards={displayedCards.length}
        assignedCount={assignedCount}
        availableCount={availableCount}
        activeAdmin={effectiveActiveAdmin}
        admins={admins}
        onSelectActiveAdmin={(adm) => setActiveAdmin(adm)}
      />

      {/* Main Admin Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Restricted Admin Notice Banner if logged in as sub-admin */}
        {!isMaster && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center font-bold">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-amber-950 flex items-center gap-2">
                  <span>Restricted Sub-Admin Active: {effectiveActiveAdmin.name}</span>
                  <span className="font-mono text-[10px] bg-amber-200 text-amber-900 px-2 py-0.2 rounded-full font-bold">
                    {effectiveActiveAdmin.assignedCardIds.length} Assigned Cards
                  </span>
                </div>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  You are restricted to managing only cards registered to you: [{effectiveActiveAdmin.assignedCardIds.map((id) => `#${id}`).join(', ')}].
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveAdmin(masterAdmin)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded-xl font-bold transition-colors shrink-0 self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Switch Back to Master Admin</span>
            </button>
          </div>
        )}

        {/* Quick Testing & Direct Customer Link Bar with Google Colors */}
        <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-hidden">
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
            {displayedCards.slice(0, 3).map((card) => (
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
              onClick={() => setSimulatorCardId(displayedCards[0]?.id || '0001')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/25 active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Open Phone Preview</span>
            </button>
          </div>
        </div>

        {/* Summary Stats Overview Widget */}
        <AdminStatsWidget
          cards={displayedCards}
          onPreviewCard={handleOpenCustomerPreview}
        />

        {/* Tab 1: Cards Inventory */}
        {currentTab === 'cards' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  {isMaster ? 'Card Inventory & Assignments' : `My Assigned Cards (${displayedCards.length})`}
                </h1>
                <p className="text-xs text-slate-500">
                  {isMaster
                    ? 'Manage physical card IDs, connect Google Review profiles, and configure AI settings'
                    : `Managing authorized cards: ${effectiveActiveAdmin.assignedCardIds.map((id) => `#${id}`).join(', ')}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(isMaster || effectiveActiveAdmin.permissions?.canExportCsv) && (
                  <button
                    onClick={() => exportCardsToCsv(displayedCards)}
                    disabled={displayedCards.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                    title="Export current card inventory as CSV spreadsheet"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>
                )}

                {(isMaster || effectiveActiveAdmin.permissions?.canCreateCards) && (
                  <button
                    onClick={() => setIsBatchModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Cards</span>
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
                <div className="inline-block w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs text-slate-500">Loading cards...</p>
              </div>
            ) : (
              <CardsTable
                cards={displayedCards}
                onAssignCard={(card) => setCardToAssign(card)}
                onDeleteCard={isMaster ? handleDeleteCard : () => alert('Only Master Admin can delete cards.')}
                onPreviewCard={handleOpenCustomerPreview}
                onOpenBatchModal={() => setIsBatchModalOpen(true)}
                onToggleAiReview={
                  isMaster || effectiveActiveAdmin.permissions?.canToggleAi
                    ? handleToggleAiReview
                    : undefined
                }
                activeAdmin={effectiveActiveAdmin}
              />
            )}
          </div>
        )}

        {/* Tab 2: Print Sheets */}
        {currentTab === 'print' && <PrintSheetView cards={displayedCards} />}

        {/* Tab 3: NFC URL Generator */}
        {currentTab === 'nfc' && (
          <NfcGeneratorView
            cards={displayedCards}
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

        {/* Tab 4: Master Admin Management */}
        {currentTab === 'admins' && isMaster && (
          <MasterAdminView
            cards={cards}
            admins={admins}
            activeAdmin={effectiveActiveAdmin}
            onSelectActiveAdmin={(adm) => setActiveAdmin(adm)}
            onSaveAdmin={handleSaveAdmin}
            onDeleteAdmin={handleDeleteAdmin}
            onRefreshCards={loadCards}
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
          <div>Built with Google Gemini AI for authentic, honest customer reviews</div>
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
        activeAdmin={effectiveActiveAdmin}
      />

      {/* Mobile Simulator Modal */}
      {simulatorCardId && (
        <MobileSimulatorModal
          cards={displayedCards.length > 0 ? displayedCards : cards}
          initialCardId={simulatorCardId}
          onClose={() => setSimulatorCardId(null)}
        />
      )}
    </div>
  );
}
