import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { Check } from 'lucide-react';
import {
  ANIMATION_DURATIONS,
  ANIMATION_EASE,
  ANIMATION_SPRINGS,
  scaledDuration,
  useAdaptiveMotion,
} from '../../config/animations';

/**
 * Progress bar tipis gradien hijau-emas di bagian paling atas layar
 * saat berpindah halaman atau memuat data (hanya menganimasikan transform & opacity).
 */
export const TopProgressBar: React.FC<{ active: boolean }> = ({ active }) => {
  const profile = useAdaptiveMotion();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="no-print fixed top-0 left-0 right-0 z-[120] h-[3px] pointer-events-none overflow-hidden bg-emerald-950/5 dark:bg-white/5"
        >
          <motion.div
            initial={{ scaleX: 0.08, x: '-25%' }}
            animate={
              profile.reducedMotion
                ? { scaleX: 1, x: '0%' }
                : { scaleX: [0.22, 0.72, 0.96], x: ['0%', '12%', '0%'] }
            }
            exit={{ scaleX: 1, opacity: 0 }}
            transition={{
              duration: scaledDuration(0.42),
              ease: ANIMATION_EASE.smoothOut,
            }}
            style={{ transformOrigin: '0% 50%' }}
            className="h-full w-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Layar transisi sambutan singkat (< 1 detik) setelah login berhasil
 * menampilkan logo sekolah + teks "Selamat datang, [nama]".
 */
export const WelcomeSplashScreen: React.FC<{
  userName: string;
  schoolName: string;
  logoUrl: string;
}> = ({ userName, schoolName, logoUrl }) => {
  const profile = useAdaptiveMotion();

  return (
    <motion.div
      key="welcome-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: scaledDuration(0.25) }}
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center p-6 bg-gradient-to-br from-emerald-950 via-emerald-900 to-amber-800 text-white"
    >
      <motion.div
        initial={profile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
        animate={profile.reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: scaledDuration(0.35), ease: ANIMATION_EASE.smoothOut }}
        className="w-20 h-20 rounded-2xl bg-white p-2 shadow-2xl border border-amber-300/50 flex items-center justify-center"
      >
        <img
          src={logoUrl}
          alt={`Logo ${schoolName}`}
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain"
        />
      </motion.div>

      <motion.p
        initial={profile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={profile.reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: scaledDuration(0.28), ease: ANIMATION_EASE.smoothOut }}
        className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-amber-300"
      >
        {schoolName}
      </motion.p>

      <motion.h2
        initial={profile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={profile.reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: scaledDuration(0.3), ease: ANIMATION_EASE.smoothOut }}
        className="mt-1.5 font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-center text-white"
      >
        Selamat datang, {userName}
      </motion.h2>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{
          duration: Math.max(0.35, (ANIMATION_DURATIONS.welcomeSplashMs - 150) / 1000),
          ease: ANIMATION_EASE.smoothOut,
        }}
        style={{ transformOrigin: '0% 50%' }}
        className="mt-6 h-1 w-40 rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-white/90"
      />
    </motion.div>
  );
};

export interface MotionModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  zIndexClass?: string;
  /** Hilangkan padding bawaan & serahkan scroll ke konten dalam (agar header + footer modal selalu menempel/sticky) */
  noPadding?: boolean;
  /** Nonaktifkan swipe-down tutup pada HP (penting saat modal berisi kanvas geser/crop foto) */
  disableSwipeClose?: boolean;
}

/**
 * Wrapper Modal responsif:
 * - Desktop: scale 0.95 -> 1 + fade dengan backdrop blur lembut
 * - HP (< 640px): Bottom Sheet naik dari bawah & bisa digeser turun (swipe down) untuk menutup
 */
export const MotionModal: React.FC<MotionModalProps> = ({
  open,
  onClose,
  ariaLabelledBy,
  maxWidthClass = 'max-w-md',
  children,
  zIndexClass = 'z-[90]',
  noPadding = false,
  disableSwipeClose = false,
}) => {
  const profile = useAdaptiveMotion();
  const [isMobileSheet, setIsMobileSheet] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => setIsMobileSheet(window.innerWidth < 640);
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 85 || info.velocity.y > 380) {
      onClose();
    }
  };

  const allowMobileDrag = !profile.reducedMotion && !disableSwipeClose;

  const modalTree = (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          className={`no-print fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center sm:p-4`}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scaledDuration(0.2) }}
            onClick={onClose}
            className={`fixed inset-0 bg-slate-950/60 ${
              profile.enableBlur ? 'backdrop-blur-sm' : ''
            }`}
          />

          {isMobileSheet ? (
            <motion.div
              initial={profile.reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
              animate={profile.reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
              exit={profile.reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0.8 }}
              transition={
                profile.reducedMotion
                  ? { duration: 0.16 }
                  : ANIMATION_SPRINGS.sheet
              }
              drag={allowMobileDrag ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.55 }}
              onDragEnd={allowMobileDrag ? handleDragEnd : undefined}
              className={`relative z-10 w-full max-h-[92dvh] rounded-t-3xl border-t border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl ${
                noPadding
                  ? 'flex flex-col overflow-hidden'
                  : 'overflow-y-auto p-5 pb-7 touch-pan-y'
              }`}
            >
              {!disableSwipeClose && (
                <div
                  aria-hidden="true"
                  className={`w-11 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto shrink-0 cursor-grab active:cursor-grabbing ${
                    noPadding ? 'mt-3 mb-1' : 'mb-4'
                  }`}
                />
              )}
              {children}
            </motion.div>
          ) : (
            <motion.div
              initial={profile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              animate={profile.reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={profile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
              transition={{
                duration: scaledDuration(ANIMATION_DURATIONS.modal),
                ease: ANIMATION_EASE.smoothOut,
              }}
              className={`relative z-10 w-full ${maxWidthClass} max-h-[90dvh] rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 ${
                profile.enableBlur ? 'backdrop-blur-md' : ''
              } shadow-2xl ${
                noPadding ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-6'
              }`}
            >
              {children}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalTree, document.body);
  }
  return modalTree;
};

/**
 * Badge animasi centang singkat pada tombol Simpan ketika aksi berhasil.
 */
export const AnimatedSaveCheck: React.FC<{ visible: boolean }> = ({ visible }) => {
  const profile = useAdaptiveMotion();
  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.span
          key="save-check"
          initial={profile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
          animate={profile.reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={ANIMATION_SPRINGS.tactile}
          className="inline-flex items-center justify-center"
        >
          <Check className="w-4 h-4 stroke-[2.75]" />
        </motion.span>
      )}
    </AnimatePresence>
  );
};
