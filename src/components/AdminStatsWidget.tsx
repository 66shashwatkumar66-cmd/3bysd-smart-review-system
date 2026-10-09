import React from 'react';
import { CardRecord } from '../types';
import { QrCode, TrendingUp, Radio, Award, ChevronRight, Store } from 'lucide-react';

interface AdminStatsWidgetProps {
  cards: CardRecord[];
  onSelectBusiness?: (businessName: string) => void;
  onPreviewCard?: (card: CardRecord) => void;
}

export const AdminStatsWidget: React.FC<AdminStatsWidgetProps> = ({
  cards,
  onSelectBusiness,
  onPreviewCard,
}) => {
  // Compute analytics
  const totalScans = cards.reduce((sum, c) => sum + (c.scansCount || 0), 0);
  const activeCards = cards.filter((c) => c.status === 'assigned');
  const availableCards = cards.filter((c) => c.status === 'available');
  const disabledCards = cards.filter((c) => c.status === 'disabled');

  const totalCards = cards.length;
  const activeRate = totalCards > 0 ? Math.round((activeCards.length / totalCards) * 100) : 0;
  const avgScans = activeCards.length > 0 ? Math.round(totalScans / activeCards.length) : 0;

  // Group performance by Business Name
  const businessMap = new Map<
    string,
    {
      name: string;
      category: string;
      scans: number;
      cardCount: number;
      representativeCard: CardRecord;
    }
  >();

  for (const card of activeCards) {
    if (!card.businessName) continue;
    const key = card.businessName.trim().toLowerCase();
    const existing = businessMap.get(key);
    if (existing) {
      existing.scans += card.scansCount || 0;
      existing.cardCount += 1;
    } else {
      businessMap.set(key, {
        name: card.businessName,
        category: card.category || 'Local Business',
        scans: card.scansCount || 0,
        cardCount: 1,
        representativeCard: card,
      });
    }
  }

  // Top 3 businesses sorted by scans
  const topBusinesses = Array.from(businessMap.values())
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 3);

  const rankColors = [
    'bg-[#FBBC05] text-slate-950 font-bold', // 1st - Gold/Yellow
    'bg-slate-200 text-slate-800 font-bold', // 2nd - Silver
    'bg-amber-100 text-amber-900 font-bold', // 3rd - Bronze
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Total QR Scans - Google Blue Accent */}
      <div className="relative bg-white rounded-2xl border border-slate-200 p-5 shadow-xs overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#4285F4]" />
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4285F4]" />
              <span>Total QR Scans</span>
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1A73E8] flex items-center justify-center border border-blue-100">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#1A73E8] font-mono tabular-nums">
              {totalScans.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-medium">customer scans</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[#34A853]" />
            <span>Avg <strong className="text-slate-900 font-mono tabular-nums">{avgScans}</strong> scans / active card</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
            {totalCards} total QRs
          </span>
        </div>
      </div>

      {/* 2. Active vs Inactive Campaigns - Google Green & Yellow */}
      <div className="relative bg-white rounded-2xl border border-slate-200 p-5 shadow-xs overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#34A853]" />
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#34A853]" />
              <span>Campaign Deployment</span>
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#34A853] flex items-center justify-center border border-emerald-100">
              <Radio className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#34A853] font-mono tabular-nums">
              {activeCards.length}
            </span>
            <span className="text-xs text-slate-500 font-medium">active businesses</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
          {/* Progress bar with Google Green + Yellow Stock */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
            <div
              className="bg-[#34A853] h-full transition-all duration-500"
              style={{ width: `${activeRate}%` }}
              title={`Active: ${activeRate}%`}
            />
            <div
              className="bg-[#FBBC05] h-full transition-all duration-500"
              style={{
                width: `${totalCards > 0 ? (availableCards.length / totalCards) * 100 : 0}%`,
              }}
              title="Available Stock"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
            <span className="flex items-center gap-1.5 text-[#34A853] font-bold">
              <span className="w-2 h-2 rounded-full bg-[#34A853]" />
              <span className="font-mono tabular-nums">{activeCards.length}</span> Active
            </span>
            <span className="flex items-center gap-1.5 text-amber-800 font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#FBBC05]" />
              <span className="font-mono tabular-nums">{availableCards.length}</span> In Stock
            </span>
            {disabledCards.length > 0 && (
              <span className="flex items-center gap-1.5 text-red-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#EA4335]" />
                <span className="font-mono tabular-nums">{disabledCards.length}</span> Disabled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Top Performing Business Profiles - Google Yellow Accent */}
      <div className="relative bg-white rounded-2xl border border-slate-200 p-5 shadow-xs overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#FBBC05]" />
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FBBC05]" />
              <span>Top Google Profiles</span>
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Award className="w-4 h-4" />
            </div>
          </div>

          {topBusinesses.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs text-slate-400 italic">No assigned businesses yet</p>
            </div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {topBusinesses.map((b, index) => (
                <div
                  key={b.name}
                  onClick={() => onPreviewCard && onPreviewCard(b.representativeCard)}
                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-blue-50/50 transition-colors cursor-pointer group"
                  title="Click to preview customer mobile review page"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-full font-mono text-[10px] flex items-center justify-center shrink-0 shadow-2xs ${
                        rankColors[index] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate group-hover:text-[#1A73E8] transition-colors">
                        {b.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {b.category} · {b.cardCount} {b.cardCount === 1 ? 'stand' : 'stands'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-[#1A73E8] font-mono tabular-nums">
                      {b.scans}
                    </span>
                    <span className="text-[10px] text-slate-400 block -mt-0.5">scans</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>Ranked by customer reviews</span>
          <span className="text-[#1A73E8] font-semibold flex items-center">
            {businessMap.size} {businessMap.size === 1 ? 'client' : 'clients'}
          </span>
        </div>
      </div>
    </div>
  );
};
