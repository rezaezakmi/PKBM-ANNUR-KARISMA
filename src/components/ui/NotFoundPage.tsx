import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Compass, Home, ShieldAlert } from 'lucide-react';
import { getNavItemsForRole } from '../../config/navigation';
import { PageRoute, UserRole } from '../../types/siakad';

interface NotFoundPageProps {
  mode?: 'not-found' | 'forbidden';
  attemptedPath?: string;
  role: UserRole;
  onNavigateDashboard: () => void;
  onNavigateRoute: (route: PageRoute) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  mode = 'not-found',
  attemptedPath,
  role,
  onNavigateDashboard,
  onNavigateRoute,
}) => {
  const isForbidden = mode === 'forbidden';
  const shortcuts = getNavItemsForRole(role).slice(0, 4);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="py-10 sm:py-16 flex items-center justify-center"
    >
      <div className="max-w-2xl w-full rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-6 sm:p-10 shadow-xl text-center">
        <div
          className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg ${
            isForbidden
              ? 'bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-rose-900/15'
              : 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-amber-500 text-white shadow-emerald-900/20'
          }`}
        >
          {isForbidden ? <ShieldAlert className="w-8 h-8" /> : <Compass className="w-8 h-8" />}
        </div>

        <p className="mt-5 font-mono text-xs font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-400 tabular-nums">
          {isForbidden ? 'Kode 403 · Akses Terbatas' : 'Kode 404 · Halaman Tidak Tersedia'}
        </p>

        <h2 className="mt-2 font-display font-extrabold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
          {isForbidden
            ? 'Anda Tidak Memiliki Akses ke Halaman Ini'
            : 'Halaman yang Anda Tuju Tidak Ditemukan'}
        </h2>

        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg mx-auto">
          {isForbidden
            ? 'Menu atau halaman ini khusus untuk peran pengguna lain di PKBM Annur Karisma. Silakan kembali ke dasbor atau pilih menu yang sesuai dengan akun Anda.'
            : 'Tautan yang Anda buka mungkin telah berpindah, salah ketik, atau belum tersedia pada SIAKAD PKBM Annur Karisma.'}
        </p>

        {attemptedPath && (
          <div className="mt-4 inline-block px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
            Alamat diminta: {attemptedPath}
          </div>
        )}

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onNavigateDashboard}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-md shadow-emerald-900/15 hover:brightness-105 inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>Kembali ke Dasbor</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                onNavigateDashboard();
              }
            }}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Halaman Sebelumnya</span>
          </button>
        </div>

        {shortcuts.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 text-center">
              Menu Utama yang Tersedia untuk Anda
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {shortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigateRoute(item.id)}
                    className="min-h-[48px] px-3.5 py-2.5 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800/60 hover:border-emerald-600/50 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 flex items-center gap-3 text-left transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
};
