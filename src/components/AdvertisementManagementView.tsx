import React, { useState, useEffect, useMemo, useId } from 'react';
import { Advertisement, AdPlacement, AdStatus, AdminUser } from '../types';
import { fetchAds, saveAd, deleteAd, isSafeUrl } from '../utils/adsApi';
import {
  Megaphone,
  Plus,
  Search,
  ExternalLink,
  Edit3,
  Trash2,
  Play,
  Pause,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  BarChart3,
  MousePointerClick,
  Sparkles,
  X,
  Check,
  ShieldCheck,
  Calendar,
  Sliders,
  Filter,
} from 'lucide-react';

interface AdvertisementManagementViewProps {
  activeAdmin: AdminUser;
}

const PLACEMENT_LABELS: Record<AdPlacement, { label: string; desc: string }> = {
  below_biz_info: {
    label: 'Below Business Info',
    desc: 'Placed right below logo & headline, above star rating',
  },
  between_sections: {
    label: 'Between Sections',
    desc: 'Placed between rating and experience highlights',
  },
  below_draft: {
    label: 'Below Review Draft',
    desc: 'Placed right below the AI draft and copy-to-Google button',
  },
  footer: {
    label: 'Footer Ad',
    desc: 'Placed discreetly near the bottom of the review page',
  },
  disabled: {
    label: 'Disabled / Hidden',
    desc: 'Do not render this ad on public review stands',
  },
};

export const AdvertisementManagementView: React.FC<AdvertisementManagementViewProps> = ({
  activeAdmin,
}) => {
  const isMaster =
    activeAdmin?.role === 'master' ||
    activeAdmin?.email?.toLowerCase() === '66shashwatkumar66@gmail.com';

  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'scheduled' | 'expired'>('all');
  const [placementFilter, setPlacementFilter] = useState<string>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAd, setEditingAd] = useState<Partial<Advertisement> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Delete modal state
  const [adToDelete, setAdToDelete] = useState<Advertisement | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Quick preview modal state
  const [previewAd, setPreviewAd] = useState<Advertisement | null>(null);

  const loadAdsData = async () => {
    setLoading(true);
    try {
      const data = await fetchAds(false);
      setAds(data);
    } catch (err) {
      console.error('Failed to load advertisements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdsData();
  }, []);

  // Compute ad status category (considering dates)
  const getAdEffectiveStatus = (ad: Advertisement): 'active' | 'paused' | 'scheduled' | 'expired' => {
    if (ad.status === 'paused') return 'paused';
    const now = Date.now();
    if (ad.startDate) {
      const s = new Date(ad.startDate).getTime();
      if (!isNaN(s) && now < s) return 'scheduled';
    }
    if (ad.endDate) {
      const e = new Date(ad.endDate).getTime();
      if (!isNaN(e) && now > e) return 'expired';
    }
    return 'active';
  };

  // Filtered ads
  const filteredAds = useMemo(() => {
    return ads.filter((ad) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          ad.name.toLowerCase().includes(q) ||
          ad.advertiser.toLowerCase().includes(q) ||
          ad.headline.toLowerCase().includes(q) ||
          ad.targetUrl.toLowerCase().includes(q) ||
          (ad.description && ad.description.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Placement filter
      if (placementFilter !== 'all' && ad.placement !== placementFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const effectiveStatus = getAdEffectiveStatus(ad);
        if (effectiveStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [ads, searchQuery, statusFilter, placementFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = ads.length;
    let activeCount = 0;
    let totalImpressions = 0;
    let totalClicks = 0;

    ads.forEach((ad) => {
      const effective = getAdEffectiveStatus(ad);
      if (effective === 'active' && ad.placement !== 'disabled') {
        activeCount++;
      }
      totalImpressions += ad.impressions || 0;
      totalClicks += ad.clicks || 0;
    });

    const ctr =
      totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';

    return {
      total,
      activeCount,
      totalImpressions,
      totalClicks,
      ctr,
    };
  }, [ads]);

  // Open create modal
  const handleOpenCreate = () => {
    setEditingAd({
      name: '',
      advertiser: '',
      headline: '',
      description: '',
      imageUrl: '',
      targetUrl: 'https://',
      ctaText: 'Learn More',
      placement: 'below_draft',
      status: 'active',
      priority: 10,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open edit modal
  const handleOpenEdit = (ad: Advertisement) => {
    setEditingAd({ ...ad });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Toggle active/paused status quickly
  const handleToggleStatus = async (ad: Advertisement) => {
    const newStatus: AdStatus = ad.status === 'active' ? 'paused' : 'active';
    try {
      const updated = await saveAd({ ...ad, status: newStatus }, activeAdmin?.email);
      setAds((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err: any) {
      alert(`Failed to update status: ${err?.message || 'Unknown error'}`);
    }
  };

  // Save Ad Form
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAd) return;

    // Field validations
    if (!editingAd.name?.trim()) {
      setFormError('Please enter an ad / campaign name.');
      return;
    }
    if (!editingAd.advertiser?.trim()) {
      setFormError('Please enter an advertiser or sponsor name.');
      return;
    }
    if (!editingAd.headline?.trim()) {
      setFormError('Please enter a headline for the ad.');
      return;
    }
    if (!editingAd.targetUrl?.trim()) {
      setFormError('Please enter a destination URL.');
      return;
    }

    const trimmedUrl = editingAd.targetUrl.trim();
    if (!isSafeUrl(trimmedUrl)) {
      setFormError('Destination URL must start with https:// or http:// (no javascript: or invalid protocols).');
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      const saved = await saveAd(
        {
          ...editingAd,
          name: editingAd.name.trim(),
          advertiser: editingAd.advertiser.trim(),
          headline: editingAd.headline.trim(),
          description: editingAd.description?.trim() || undefined,
          imageUrl: editingAd.imageUrl?.trim() || undefined,
          targetUrl: trimmedUrl,
          ctaText: editingAd.ctaText?.trim() || 'Learn More',
          placement: editingAd.placement || 'below_draft',
          status: editingAd.status || 'active',
          priority: Number(editingAd.priority) || 10,
          startDate: editingAd.startDate ? editingAd.startDate : undefined,
          endDate: editingAd.endDate ? editingAd.endDate : undefined,
        } as any,
        activeAdmin?.email
      );

      setAds((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = saved;
          return updated;
        }
        return [saved, ...prev];
      });

      setSaveSuccessMsg(`Saved "${saved.name}" successfully!`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
      setIsModalOpen(false);
      setEditingAd(null);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save advertisement');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!adToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAd(adToDelete.id, activeAdmin?.email);
      setAds((prev) => prev.filter((a) => a.id !== adToDelete.id));
      setAdToDelete(null);
    } catch (err: any) {
      alert(`Failed to delete advertisement: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isMaster) {
    return (
      <div className="p-8 bg-white rounded-3xl border border-red-200 text-center space-y-4 max-w-lg mx-auto my-12 shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Advertisement management is strictly restricted to the <strong>Master Administrator</strong> (
          <code>66shashwatkumar66@gmail.com</code>). Sub-admins cannot create, modify, or view partner advertisements.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Advertisement & Sponsor Management
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
              Master Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Display discreet, high-trust partner banners on the public customer review pages. Non-intrusive and never blocks review submission.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Advertisement</span>
        </button>
      </div>

      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Ads
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {stats.total}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Active Ads</span>
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {stats.activeCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-blue-500" />
            <span>Impressions</span>
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {stats.totalImpressions.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <MousePointerClick className="w-3.5 h-3.5 text-purple-500" />
            <span>Clicks</span>
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {stats.totalClicks.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
            <span>Avg CTR</span>
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {stats.ctr}%
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, advertiser, headline, or link..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white transition-all"
            />
          </div>

          {/* Placement Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap hidden sm:inline">
              Placement:
            </span>
            <select
              value={placementFilter}
              onChange={(e) => setPlacementFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
            >
              <option value="all">All Placements</option>
              <option value="below_biz_info">Below Biz Info</option>
              <option value="between_sections">Between Sections</option>
              <option value="below_draft">Below Draft</option>
              <option value="footer">Footer</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'paused', label: 'Paused' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'expired', label: 'Expired' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === t.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advertisements List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <div className="inline-block w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs text-slate-500">Loading advertisements...</p>
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Megaphone className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No advertisements found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {ads.length === 0
              ? 'Click "New Advertisement" above to launch your first sponsor campaign.'
              : 'No advertisements match your current search and filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAds.map((ad) => {
            const effStatus = getAdEffectiveStatus(ad);
            const adCtr =
              (ad.impressions || 0) > 0
                ? (((ad.clicks || 0) / (ad.impressions || 1)) * 100).toFixed(1)
                : '0.0';

            return (
              <div
                key={ad.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all p-4 flex flex-col justify-between space-y-3"
              >
                {/* Top: Status, Placement & Priority */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Status Pill */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        effStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : effStatus === 'paused'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : effStatus === 'scheduled'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          effStatus === 'active'
                            ? 'bg-emerald-500 animate-pulse'
                            : effStatus === 'paused'
                            ? 'bg-amber-500'
                            : effStatus === 'scheduled'
                            ? 'bg-blue-500'
                            : 'bg-slate-400'
                        }`}
                      />
                      <span className="capitalize">{effStatus}</span>
                    </span>

                    {/* Placement Badge */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {PLACEMENT_LABELS[ad.placement]?.label || ad.placement}
                    </span>

                    {/* Priority Badge */}
                    <span className="text-[10px] text-slate-500 font-mono">
                      P:{ad.priority || 10}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(ad)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                        ad.status === 'active'
                          ? 'text-amber-600 hover:bg-amber-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={ad.status === 'active' ? 'Pause Campaign' : 'Activate Campaign'}
                    >
                      {ad.status === 'active' ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewAd(ad)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Quick Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(ad)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      title="Edit Advertisement"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdToDelete(ad)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete Advertisement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Middle: Content Preview */}
                <div className="flex items-start gap-3">
                  {ad.imageUrl ? (
                    <img
                      src={ad.imageUrl}
                      alt={ad.headline}
                      className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0 bg-slate-50"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <Megaphone className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                        {ad.advertiser}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {ad.name}
                      </span>
                    </div>

                    <h3 className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-1 mt-0.5">
                      {ad.headline}
                    </h3>

                    {ad.description && (
                      <p className="text-[11px] text-slate-500 leading-snug line-clamp-2 mt-0.5">
                        {ad.description}
                      </p>
                    )}

                    <div className="mt-1.5 flex items-center gap-2">
                      <a
                        href={ad.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A73E8] hover:underline truncate max-w-xs"
                      >
                        <span>{ad.ctaText || 'Learn More'}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Bottom: Performance Metrics & Dates */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-3">
                    <span title="Total Impressions">
                      <strong className="text-slate-900 font-extrabold">
                        {(ad.impressions || 0).toLocaleString()}
                      </strong>{' '}
                      <span className="text-[11px] text-slate-400">views</span>
                    </span>
                    <span title="Total Clicks">
                      <strong className="text-slate-900 font-extrabold">
                        {(ad.clicks || 0).toLocaleString()}
                      </strong>{' '}
                      <span className="text-[11px] text-slate-400">clicks</span>
                    </span>
                    <span title="Click-Through Rate">
                      <strong className="text-blue-600 font-extrabold">{adCtr}%</strong>{' '}
                      <span className="text-[11px] text-slate-400">CTR</span>
                    </span>
                  </div>

                  {(ad.startDate || ad.endDate) && (
                    <div
                      className="text-[10px] text-slate-400 flex items-center gap-1"
                      title={`Schedule: ${ad.startDate || 'Immediate'} to ${ad.endDate || 'Ongoing'}`}
                    >
                      <Calendar className="w-3 h-3" />
                      <span>
                        {ad.startDate ? ad.startDate.split('T')[0] : 'Now'} →{' '}
                        {ad.endDate ? ad.endDate.split('T')[0] : '∞'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT AD MODAL */}
      {isModalOpen && editingAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#4285F4] to-[#34A853] p-0.5">
                  <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center text-[#1A73E8]">
                    <Megaphone className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingAd.id ? 'Edit Advertisement' : 'Create New Advertisement'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configure sponsor creative and destination link
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingAd(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveForm} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Campaign Name & Advertiser Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Internal Campaign Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAd.name || ''}
                    onChange={(e) =>
                      setEditingAd((prev) => ({ ...prev!, name: e.target.value }))
                    }
                    placeholder="e.g. 3DBYSD Stands Promo"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Advertiser / Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAd.advertiser || ''}
                    onChange={(e) =>
                      setEditingAd((prev) => ({ ...prev!, advertiser: e.target.value }))
                    }
                    placeholder="e.g. 3DBYSD Studios"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
                  />
                </div>
              </div>

              {/* Headline */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ad Headline *
                </label>
                <input
                  type="text"
                  required
                  value={editingAd.headline || ''}
                  onChange={(e) =>
                    setEditingAd((prev) => ({ ...prev!, headline: e.target.value }))
                  }
                  placeholder="e.g. Custom 3D Printed NFC & QR Stands for Businesses"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Body (Optional)
                </label>
                <textarea
                  rows={2}
                  value={editingAd.description || ''}
                  onChange={(e) =>
                    setEditingAd((prev) => ({ ...prev!, description: e.target.value }))
                  }
                  placeholder="Short, persuasive sentence..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white resize-none"
                />
              </div>

              {/* Destination URL & CTA Text */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Destination URL (https:// only) *
                  </label>
                  <input
                    type="url"
                    required
                    value={editingAd.targetUrl || ''}
                    onChange={(e) =>
                      setEditingAd((prev) => ({ ...prev!, targetUrl: e.target.value }))
                    }
                    placeholder="https://yourpartner.com"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Must start with https:// or http://
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    CTA Button Text
                  </label>
                  <input
                    type="text"
                    value={editingAd.ctaText || 'Learn More'}
                    onChange={(e) =>
                      setEditingAd((prev) => ({ ...prev!, ctaText: e.target.value }))
                    }
                    placeholder="Learn More"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
                  />
                </div>
              </div>

              {/* Image URL & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Image / Logo URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={editingAd.imageUrl || ''}
                    onChange={(e) =>
                      setEditingAd((prev) => ({ ...prev!, imageUrl: e.target.value }))
                    }
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Priority (Higher = First)
                  </label>
                  <input
                    type="number"
                    value={editingAd.priority ?? 10}
                    onChange={(e) =>
                      setEditingAd((prev) => ({
                        ...prev!,
                        priority: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8] focus:bg-white"
                  />
                </div>
              </div>

              {/* Placement & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Review Page Placement
                  </label>
                  <select
                    value={editingAd.placement || 'below_draft'}
                    onChange={(e) =>
                      setEditingAd((prev) => ({
                        ...prev!,
                        placement: e.target.value as AdPlacement,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  >
                    <option value="below_biz_info">Below Business Info (Above Rating)</option>
                    <option value="between_sections">Between Sections</option>
                    <option value="below_draft">Below Review Draft</option>
                    <option value="footer">Footer Placement</option>
                    <option value="disabled">Disabled / Hidden</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={editingAd.status || 'active'}
                    onChange={(e) =>
                      setEditingAd((prev) => ({
                        ...prev!,
                        status: e.target.value as AdStatus,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  >
                    <option value="active">Active (Visible)</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              {/* Scheduling: Start & End Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Start Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={editingAd.startDate ? editingAd.startDate.split('T')[0] : ''}
                    onChange={(e) =>
                      setEditingAd((prev) => ({
                        ...prev!,
                        startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={editingAd.endDate ? editingAd.endDate.split('T')[0] : ''}
                    onChange={(e) =>
                      setEditingAd((prev) => ({
                        ...prev!,
                        endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                  />
                </div>
              </div>

              {/* LIVE PREVIEW BOX */}
              <div className="pt-2">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Live Customer Experience Preview
                </span>
                <div className="bg-[#FDFCFB] p-3 rounded-2xl border border-dashed border-slate-300">
                  <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs text-left">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        Sponsored · {editingAd.advertiser || 'Partner Brand'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Ad</span>
                    </div>
                    <div className="flex items-start gap-3">
                      {editingAd.imageUrl ? (
                        <img
                          src={editingAd.imageUrl}
                          alt="preview"
                          className="w-12 h-12 object-cover rounded-xl border border-slate-100 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <Megaphone className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                          {editingAd.headline || 'Your compelling headline will appear here'}
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                          {editingAd.description || 'Description explaining your offer or service to customers.'}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A73E8]">
                            <span>{editingAd.ctaText || 'Learn More'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingAd(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-xl shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Advertisement</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK PREVIEW MODAL */}
      {previewAd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Public Review Stand Preview
              </span>
              <button
                type="button"
                onClick={() => setPreviewAd(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#FDFCFB] p-3 rounded-2xl border border-slate-200">
              <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-2xs text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    Sponsored · {previewAd.advertiser}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Ad</span>
                </div>
                <div className="flex items-start gap-3">
                  {previewAd.imageUrl && (
                    <img
                      src={previewAd.imageUrl}
                      alt={previewAd.headline}
                      className="w-12 h-12 object-cover rounded-xl border border-slate-100 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                      {previewAd.headline}
                    </h4>
                    {previewAd.description && (
                      <p className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                        {previewAd.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <a
                        href={previewAd.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A73E8] hover:underline"
                      >
                        <span>{previewAd.ctaText || 'Learn More'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setPreviewAd(null)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {adToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Delete Advertisement?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete <strong>{adToDelete.name}</strong>? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdToDelete(null)}
                className="flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
