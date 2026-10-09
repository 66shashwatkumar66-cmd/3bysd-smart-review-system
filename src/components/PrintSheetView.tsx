import React, { useState, useEffect } from 'react';
import { CardRecord } from '../types';
import { Printer, Download, Star, Radio, Check } from 'lucide-react';
import { generateQrPng, downloadCardPng, downloadCardSvg } from '../utils/qr';

interface PrintSheetViewProps {
  cards: CardRecord[];
}

export const PrintSheetView: React.FC<PrintSheetViewProps> = ({ cards }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'assigned' | 'available'>('all');
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [loadingQr, setLoadingQr] = useState<boolean>(true);
  const [layoutSize, setLayoutSize] = useState<'standard' | 'compact'>('standard');

  const filteredCards = cards.filter((card) => {
    if (filterMode === 'assigned') return card.status === 'assigned';
    if (filterMode === 'available') return card.status === 'available';
    return true;
  });

  // Pre-generate QR data URLs for printable rendering
  useEffect(() => {
    let isMounted = true;
    const generateAll = async () => {
      setLoadingQr(true);
      const map: Record<string, string> = {};
      for (const card of filteredCards) {
        const url = `${window.location.origin}/r/${card.id}`;
        try {
          const dataUrl = await generateQrPng(url, 400);
          map[card.id] = dataUrl;
        } catch (err) {
          console.error(`Failed to generate QR for ${card.id}:`, err);
        }
      }
      if (isMounted) {
        setQrImages(map);
        setLoadingQr(false);
      }
    };

    generateAll();
    return () => {
      isMounted = false;
    };
  }, [cards, filterMode]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar (hidden during print) */}
      <div className="no-print bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Printable Batch Card Sheets</h2>
            <p className="text-xs text-slate-500">
              Print batch sheets on cardstock or sticker paper for 3D printed stands and NFC cards
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 font-semibold rounded-md transition-colors ${
                  filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                All ({cards.length})
              </button>
              <button
                onClick={() => setFilterMode('available')}
                className={`px-2.5 py-1 font-semibold rounded-md transition-colors ${
                  filterMode === 'available' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Unassigned Stock ({cards.filter((c) => c.status === 'available').length})
              </button>
              <button
                onClick={() => setFilterMode('assigned')}
                className={`px-2.5 py-1 font-semibold rounded-md transition-colors ${
                  filterMode === 'assigned' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Assigned ({cards.filter((c) => c.status === 'assigned').length})
              </button>
            </div>

            {/* Print CTA */}
            <button
              onClick={handlePrint}
              disabled={loadingQr || filteredCards.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sheet Canvas */}
      {loadingQr ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="inline-block w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs text-slate-500">Rendering high-resolution vector QR codes for sheet...</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <p className="text-xs text-slate-500">No cards match the selected filter.</p>
        </div>
      ) : (
        <div className="bg-slate-100 p-4 sm:p-8 rounded-xl border border-slate-200 print:bg-white print:p-0 print:border-none">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 print:grid-cols-3 print:gap-4 max-w-5xl mx-auto">
            {filteredCards.map((card) => {
              const qrSrc = qrImages[card.id];
              const permanentUrl = `${window.location.origin}/r/${card.id}`;

              return (
                <div
                  key={card.id}
                  className="print-card relative bg-white border-2 border-dashed border-slate-300 rounded-2xl p-5 flex flex-col items-center justify-between text-center shadow-xs print:shadow-none print:border-slate-400 print:rounded-xl min-h-[340px]"
                >
                  {/* Top Header */}
                  <div className="w-full flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      #{card.id}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="text-slate-600 font-sans">SMART REVIEWS</span>
                    </div>
                  </div>

                  {/* Business or Stand Brand */}
                  <div className="my-1">
                    <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                      {card.businessName || '3DBYSD Smart Stand'}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {card.category || 'NFC & Dynamic QR Review Card'}
                    </p>
                  </div>

                  {/* QR Code Container */}
                  <div className="my-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    {qrSrc ? (
                      <img
                        src={qrSrc}
                        alt={`QR code for card ${card.id}`}
                        className="w-36 h-36 object-contain"
                      />
                    ) : (
                      <div className="w-36 h-36 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                        Generating...
                      </div>
                    )}
                  </div>

                  {/* NFC & Scan Prompt */}
                  <div className="w-full pt-1">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-800">
                      <Radio className="w-3.5 h-3.5 text-blue-600" />
                      <span>TAP NFC OR SCAN QR</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className="w-3 h-3 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono mt-1">
                      Permanent ID: /r/{card.id}
                    </p>
                  </div>

                  {/* Bottom Cut Line Guide */}
                  <div className="no-print mt-3 pt-2 border-t border-slate-100 w-full flex items-center justify-center gap-2">
                    <button
                      onClick={() => downloadCardPng(permanentUrl, card.id, card.businessName)}
                      className="text-[10px] text-slate-600 hover:text-slate-900 flex items-center gap-1 p-1 hover:bg-slate-50 rounded"
                    >
                      <Download className="w-3 h-3" />
                      <span>PNG</span>
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => downloadCardSvg(permanentUrl, card.id, card.businessName)}
                      className="text-[10px] text-slate-600 hover:text-slate-900 flex items-center gap-1 p-1 hover:bg-slate-50 rounded"
                    >
                      <Download className="w-3 h-3" />
                      <span>SVG</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
