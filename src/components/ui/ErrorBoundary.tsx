import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Home,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  stack: string;
  showDetails: boolean;
}

interface ParsedFriendlyError {
  title: string;
  description: string;
  category: 'permission' | 'network' | 'quota' | 'general';
  detailText: string;
}

function classifyFriendlyError(rawMessage: string): ParsedFriendlyError {
  let detailText = rawMessage;
  let coreMsg = rawMessage;

  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed?.error) {
      coreMsg = String(parsed.error);
      detailText = `Operasi: ${parsed.operationType || '-'}\nPath: ${parsed.path || '-'}\nPesan: ${parsed.error}`;
    }
  } catch {
    // plain string
  }

  const lower = coreMsg.toLowerCase();

  if (
    lower.includes('permission_denied') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied')
  ) {
    return {
      title: 'Akses Data Dibatasi',
      description:
        'Akun Anda hanya diizinkan mengakses data milik sendiri atau kelas yang Anda ampu. Jika memerlukan akses tambahan, silakan hubungi Admin PKBM.',
      category: 'permission',
      detailText,
    };
  }

  if (
    lower.includes('offline') ||
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('unavailable')
  ) {
    return {
      title: 'Gangguan Koneksi Jaringan',
      description:
        'Sistem kesulitan terhubung ke server SIAKAD. Pastikan koneksi internet Anda stabil, lalu coba pulihkan kembali.',
      category: 'network',
      detailText,
    };
  }

  if (lower.includes('quota') || lower.includes('429') || lower.includes('rate limit')) {
    return {
      title: 'Layanan AI Sedang Padat',
      description:
        'Batas permintaan layanan kecerdasan buatan sedang tercapai sementara. Tunggu beberapa saat lalu coba kembali.',
      category: 'quota',
      detailText,
    };
  }

  return {
    title: 'Terjadi Kendala Sementara',
    description:
      'Maaf, sistem mengalami kendala tak terduga saat memuat halaman ini. Data Anda tetap aman tersimpan. Anda dapat mencoba memulihkan tampilan atau kembali ke dasbor.',
    category: 'general',
    detailText,
  };
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', stack: '', showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan pada aplikasi.',
      stack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary menangkap kesalahan:', error);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, message: '', stack: '', showDetails: false });
  };

  private handleGoHome = () => {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      // Ignore history error
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const info = classifyFriendlyError(this.state.message);

      return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#FAFAF7] dark:bg-[#0B1110]">
          <div className="max-w-lg w-full rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                info.category === 'permission'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  : info.category === 'network'
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
              }`}
            >
              {info.category === 'permission' ? (
                <ShieldAlert className="w-7 h-7" />
              ) : info.category === 'network' ? (
                <WifiOff className="w-7 h-7" />
              ) : (
                <AlertTriangle className="w-7 h-7" />
              )}
            </div>

            <h2 className="font-display font-extrabold text-xl text-slate-900 dark:text-white">
              {info.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {info.description}
            </p>

            {/* Collapsible technical details */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
              >
                {this.state.showDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                <span>{this.state.showDetails ? 'Sembunyikan Detail Teknis' : 'Lihat Detail Teknis'}</span>
              </button>

              {this.state.showDetails && (
                <pre className="mt-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {info.detailText}
                </pre>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={this.handleRecover}
                className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>Coba Pulihkan</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Home className="w-4 h-4 shrink-0" />
                <span>Kembali ke Dasbor</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2.5 w-full min-h-[42px] px-4 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Muat Ulang Penuh Browser</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
