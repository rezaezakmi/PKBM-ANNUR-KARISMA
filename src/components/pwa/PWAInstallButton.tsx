import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { resolveSchoolLogo } from '../../assets/branding';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useToast } from '../../context/ToastContext';
import { MotionModal } from '../ui/MotionPrimitives';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar' | 'banner';
  collapsed?: boolean;
  logoUrl?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  collapsed = false,
  logoUrl,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const { showToast } = useToast();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideTab, setGuideTab] = useState<'android' | 'ios'>(isIOS ? 'ios' : 'android');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Otomatis sembunyikan tombol bila sudah berjalan dalam mode aplikasi terpasang (standalone)
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        const accepted = await install();
        if (accepted) {
          showToast(
            'Aplikasi SIAKAD PKBM berhasil dipasang!',
            'success',
            'Ikon aplikasi kini tersedia di layar utama HP Anda.'
          );
        }
      } finally {
        setInstalling(false);
      }
      return;
    }

    setGuideTab(isIOS ? 'ios' : 'android');
    setShowGuideModal(true);
  };

  const handleCopyAppUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedUrl(true);
      showToast('Link aplikasi berhasil disalin. Buka di Chrome/Safari HP untuk memasang.', 'success');
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      showToast('Salin link dari bilah alamat browser untuk membuka di HP.', 'info');
    }
  };

  const renderTrigger = () => {
    if (variant === 'banner') {
      return (
        <button
          type="button"
          onClick={handleClick}
          disabled={installing}
          className="w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl border border-emerald-600/25 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/65 px-4 py-2.5 text-left transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 truncate">
                {isInstallable
                  ? 'Pasang Aplikasi SIAKAD di HP'
                  : 'Gunakan sebagai Aplikasi di HP (Android & iPhone)'}
              </p>
              <p className="text-[11px] text-emerald-700/90 dark:text-emerald-300/80 truncate">
                {isInstallable
                  ? '1 ketukan · Layar penuh & akses lebih cepat'
                  : 'Tampil layar penuh di layar utama tanpa Play Store'}
              </p>
            </div>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white">
            <Download className="w-3.5 h-3.5" />
            {installing ? 'Memasang...' : 'Pasang'}
          </span>
        </button>
      );
    }

    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          data-no-lift
          onClick={handleClick}
          disabled={installing}
          title={collapsed ? 'Pasang Aplikasi HP' : undefined}
          className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold border border-emerald-600/25 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <span className="whitespace-nowrap truncate">
              {installing ? 'Memasang...' : 'Pasang Aplikasi HP'}
            </span>
          )}
        </button>
      );
    }

    // Default: 'header'
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        aria-label="Pasang aplikasi SIAKAD di HP"
        title="Pasang aplikasi SIAKAD di HP (Android & iPhone)"
        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50/90 dark:bg-emerald-950/50 px-2.5 sm:px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Smartphone className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap">
          {installing ? 'Memasang...' : 'Pasang HP'}
        </span>
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      <MotionModal
        open={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        maxWidthClass="max-w-md"
        ariaLabelledBy="pwa-install-guide-title"
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl border border-emerald-500/25 bg-[#FAFAF7] p-1.5 shadow-sm shrink-0 flex items-center justify-center">
                <img
                  src={resolveSchoolLogo(logoUrl)}
                  alt="Ikon SIAKAD PKBM Annur Karisma"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Aplikasi Mobile SIAKAD
                </p>
                <h3
                  id="pwa-install-guide-title"
                  className="font-display text-lg font-extrabold text-slate-900 dark:text-white leading-tight"
                >
                  Pasang di Layar Utama HP
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              aria-label="Tutup panduan instalasi"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Pasang <strong>SIAKAD PKBM ANNUR KARISMA</strong> langsung ke HP Anda agar tampil layar penuh tanpa bilah browser, lebih ringan, dan selalu otomatis terbarui.
          </p>

          {/* Platform Switcher */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-950/60 p-1">
            <button
              type="button"
              onClick={() => setGuideTab('android')}
              className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                guideTab === 'android'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Android (Chrome)
            </button>
            <button
              type="button"
              onClick={() => setGuideTab('ios')}
              className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                guideTab === 'ios'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              iPhone / iPad (Safari)
            </button>
          </div>

          {guideTab === 'android' ? (
            <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  1
                </span>
                <span className="leading-relaxed">
                  Buka tautan SIAKAD ini melalui browser <strong>Google Chrome</strong> di HP Android Anda.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  2
                </span>
                <span className="leading-relaxed">
                  Ketuk tombol titik tiga{' '}
                  <MoreVertical className="inline w-4 h-4 align-text-bottom text-slate-500" /> di pojok kanan atas Chrome.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  3
                </span>
                <span className="leading-relaxed">
                  Pilih <strong>&ldquo;Tambahkan ke layar utama&rdquo;</strong> atau{' '}
                  <strong>&ldquo;Instal aplikasi&rdquo;</strong>, lalu tekan <strong>Instal</strong>.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  1
                </span>
                <span className="leading-relaxed">
                  Buka tautan SIAKAD ini menggunakan browser <strong>Safari</strong> di iPhone/iPad.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  2
                </span>
                <span className="leading-relaxed">
                  Ketuk ikon <strong>Bagikan (Share)</strong>{' '}
                  <Share className="inline w-4 h-4 align-text-bottom text-sky-600" /> di bar bawah Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  3
                </span>
                <span className="leading-relaxed">
                  Gulir ke bawah dan pilih <strong>&ldquo;Tambah ke Layar Utama&rdquo;</strong>{' '}
                  <PlusSquare className="inline w-4 h-4 align-text-bottom text-emerald-600" />, lalu ketuk{' '}
                  <strong>Tambah</strong>.
                </span>
              </li>
            </ol>
          )}

          {!isAndroid && !isIOS && (
            <div className="rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-950/50 p-3 text-xs text-slate-600 dark:text-slate-300">
              Sedang membuka dari komputer/laptop? Salin link aplikasi di bawah lalu bagikan ke grup WhatsApp guru &amp; siswa agar bisa langsung dipasang di HP masing-masing.
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyAppUrl}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
            >
              {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedUrl ? 'Link Aplikasi Disalin!' : 'Salin Link untuk HP'}
            </button>
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="min-h-[44px] rounded-xl border border-emerald-950/15 dark:border-white/15 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      </MotionModal>
    </>
  );
};
