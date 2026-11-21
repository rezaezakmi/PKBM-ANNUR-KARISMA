import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Expand,
  Pause,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import { ANIMATION_EASE, useAdaptiveMotion } from '../../config/animations';
import { DEFAULT_ACTIVITY_GALLERY_PHOTOS } from '../../data/activityGalleryDefaults';
import { ActivityGalleryPhoto } from '../../types/siakad';

interface ActivityPhotoShowcaseProps {
  photos: ActivityGalleryPhoto[];
  variant?: 'login' | 'dashboard';
  canManage?: boolean;
  onManagePhotos?: () => void;
}

type TransitionMode = 'auto' | 'curtain' | 'parallax' | 'zoom' | 'iris';
type ConcreteEffect = Exclude<TransitionMode, 'auto'>;

const AUTOPLAY_INTERVAL_MS = 4800;

const CONCRETE_EFFECTS: ConcreteEffect[] = ['curtain', 'zoom', 'parallax', 'iris'];

const TRANSITION_MODES: Array<{ id: TransitionMode; label: string }> = [
  { id: 'auto', label: 'Sinematik' },
  { id: 'curtain', label: 'Tirai' },
  { id: 'parallax', label: 'Paralaks' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'iris', label: 'Iris' },
];

const CINEMA_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const PARALLAX_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Gerak Ken Burns halus berbeda tiap slide agar foto terasa hidup */
const KEN_BURNS_PRESETS = [
  { initial: { scale: 1.0, x: '0%', y: '0%' }, animate: { scale: 1.08, x: '-1.6%', y: '-0.8%' } },
  { initial: { scale: 1.07, x: '1.4%', y: '-0.6%' }, animate: { scale: 1.0, x: '-0.8%', y: '0.8%' } },
  { initial: { scale: 1.0, x: '-1.2%', y: '0.8%' }, animate: { scale: 1.08, x: '1.4%', y: '-0.6%' } },
  { initial: { scale: 1.06, x: '0%', y: '1.2%' }, animate: { scale: 1.01, x: '0%', y: '-1.0%' } },
  { initial: { scale: 1.0, x: '1.2%', y: '0.4%' }, animate: { scale: 1.08, x: '-1.4%', y: '-1.0%' } },
];

function buildSlideVariants(effect: ConcreteEffect, reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      enter: () => ({ opacity: 0, zIndex: 10 }),
      center: {
        opacity: 1,
        zIndex: 10,
        transition: { duration: 0.25 },
      },
      exit: () => ({
        opacity: 0,
        zIndex: 0,
        transition: { duration: 0.2 },
      }),
    };
  }

  switch (effect) {
    case 'curtain':
      return {
        enter: (dir: number) => ({
          zIndex: 10,
          opacity: 0.92,
          scale: 1.09,
          x: dir > 0 ? '4%' : '-4%',
          clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)',
        }),
        center: {
          zIndex: 10,
          opacity: 1,
          scale: 1,
          x: '0%',
          clipPath: 'inset(0% 0% 0% 0%)',
          transition: {
            duration: 0.86,
            ease: CINEMA_EASE,
          },
        },
        exit: (dir: number) => ({
          zIndex: 0,
          opacity: 0.35,
          scale: 0.95,
          x: dir > 0 ? '-6%' : '6%',
          clipPath: 'inset(0% 0% 0% 0%)',
          transition: {
            duration: 0.82,
            ease: CINEMA_EASE,
          },
        }),
      };

    case 'parallax':
      return {
        enter: (dir: number) => ({
          zIndex: 10,
          opacity: 0.85,
          x: dir > 0 ? '100%' : '-100%',
          scale: 1.05,
        }),
        center: {
          zIndex: 10,
          opacity: 1,
          x: '0%',
          scale: 1,
          transition: {
            duration: 0.78,
            ease: PARALLAX_EASE,
          },
        },
        exit: (dir: number) => ({
          zIndex: 0,
          opacity: 0.28,
          x: dir > 0 ? '-28%' : '28%',
          scale: 0.94,
          transition: {
            duration: 0.78,
            ease: PARALLAX_EASE,
          },
        }),
      };

    case 'iris':
      return {
        enter: () => ({
          zIndex: 10,
          opacity: 0,
          scale: 1.13,
          clipPath: 'inset(10% 14% 10% 14% round 22px)',
        }),
        center: {
          zIndex: 10,
          opacity: 1,
          scale: 1,
          clipPath: 'inset(0% 0% 0% 0% round 0px)',
          transition: {
            duration: 0.88,
            ease: CINEMA_EASE,
          },
        },
        exit: () => ({
          zIndex: 0,
          opacity: 0.22,
          scale: 0.94,
          clipPath: 'inset(0% 0% 0% 0% round 0px)',
          transition: {
            duration: 0.82,
            ease: CINEMA_EASE,
          },
        }),
      };

    case 'zoom':
    default:
      return {
        enter: (dir: number) => ({
          zIndex: 10,
          opacity: 0,
          scale: 1.13,
          x: dir > 0 ? 18 : -18,
          filter: 'blur(5px)',
        }),
        center: {
          zIndex: 10,
          opacity: 1,
          scale: 1,
          x: 0,
          filter: 'blur(0px)',
          transition: {
            duration: 0.85,
            ease: CINEMA_EASE,
          },
        },
        exit: (dir: number) => ({
          zIndex: 0,
          opacity: 0,
          scale: 0.94,
          x: dir > 0 ? -18 : 18,
          filter: 'blur(3px)',
          transition: {
            duration: 0.78,
            ease: ANIMATION_EASE.smoothOut,
          },
        }),
      };
  }
}

export const ActivityPhotoShowcase: React.FC<ActivityPhotoShowcaseProps> = ({
  photos,
  variant = 'dashboard',
  canManage = false,
  onManagePhotos,
}) => {
  const motionProfile = useAdaptiveMotion();
  const safePhotos =
    photos.length >= 5 ? photos.slice(0, 5) : DEFAULT_ACTIVITY_GALLERY_PHOTOS;

  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [transitionCount, setTransitionCount] = useState(0);
  const [transitionMode, setTransitionMode] = useState<TransitionMode>('auto');
  const [userPaused, setUserPaused] = useState(false);
  const [stageHovered, setStageHovered] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failedMap, setFailedMap] = useState<Record<string, boolean>>({});
  const isSwipingRef = useRef(false);

  const isPaused = userPaused || stageHovered;

  const goToIndex = useCallback(
    (nextIdx: number) => {
      const normalized = ((nextIdx % safePhotos.length) + safePhotos.length) % safePhotos.length;
      if (normalized === activeIndex) return;
      setDirection(normalized > activeIndex ? 1 : -1);
      setTransitionCount((c) => c + 1);
      setActiveIndex(normalized);
    },
    [activeIndex, safePhotos.length]
  );

  const handleNext = useCallback(() => {
    setDirection(1);
    setTransitionCount((c) => c + 1);
    setActiveIndex((prev) => (prev + 1) % safePhotos.length);
  }, [safePhotos.length]);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    setTransitionCount((c) => c + 1);
    setActiveIndex((prev) => (prev - 1 + safePhotos.length) % safePhotos.length);
  }, [safePhotos.length]);

  const cycleTransitionMode = () => {
    const idx = TRANSITION_MODES.findIndex((m) => m.id === transitionMode);
    const nextMode = TRANSITION_MODES[(idx + 1) % TRANSITION_MODES.length].id;
    setTransitionMode(nextMode);
    // Langsung demonstrasikan efek transisi yang baru dipilih
    setDirection(1);
    setTransitionCount((c) => c + 1);
    setActiveIndex((prev) => (prev + 1) % safePhotos.length);
  };

  useEffect(() => {
    if (isPaused || lightboxOpen || motionProfile.reducedMotion) return;
    const timer = window.setInterval(() => {
      setDirection(1);
      setTransitionCount((c) => c + 1);
      setActiveIndex((prev) => (prev + 1) % safePhotos.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, lightboxOpen, motionProfile.reducedMotion, safePhotos.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, handleNext, handlePrev]);

  const handleStageDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 45 || Math.abs(info.velocity.x) > 320) {
      isSwipingRef.current = true;
      if (info.offset.x < 0) {
        handleNext();
      } else {
        handlePrev();
      }
      window.setTimeout(() => {
        isSwipingRef.current = false;
      }, 150);
    }
  };

  const currentPhoto = safePhotos[activeIndex] || safePhotos[0];
  const fallbackPhoto =
    DEFAULT_ACTIVITY_GALLERY_PHOTOS[activeIndex] || DEFAULT_ACTIVITY_GALLERY_PHOTOS[0];
  const resolvePhotoSrc = (photo: ActivityGalleryPhoto, idx: number) =>
    failedMap[photo.id]
      ? (DEFAULT_ACTIVITY_GALLERY_PHOTOS[idx] || DEFAULT_ACTIVITY_GALLERY_PHOTOS[0]).imageUrl
      : photo.imageUrl;

  const activeEffect: ConcreteEffect =
    transitionMode === 'auto'
      ? CONCRETE_EFFECTS[transitionCount % CONCRETE_EFFECTS.length]
      : transitionMode;

  const slideVariants = buildSlideVariants(activeEffect, motionProfile.reducedMotion);
  const kenBurns = KEN_BURNS_PRESETS[activeIndex % KEN_BURNS_PRESETS.length];
  const activeModeLabel =
    TRANSITION_MODES.find((m) => m.id === transitionMode)?.label || 'Sinematik';

  const isLogin = variant === 'login';

  return (
    <>
      <section
        aria-label="Dokumentasi 5 Foto Kegiatan Belajar Mengajar"
        className={
          isLogin
            ? 'w-full space-y-3'
            : 'rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs space-y-4'
        }
      >
        {/* Header Bar */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
              <span
                className={
                  isLogin ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'
                }
              >
                Dokumentasi KBM
              </span>
              <span
                aria-hidden="true"
                className={isLogin ? 'text-white/40' : 'text-slate-300 dark:text-slate-600'}
              >
                ·
              </span>
              <span
                className={`tabular-nums ${
                  isLogin ? 'text-emerald-100/80' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                0{activeIndex + 1} / 0{safePhotos.length}
              </span>
            </div>
            <h3
              className={`mt-0.5 font-display font-extrabold tracking-tight ${
                isLogin
                  ? 'text-base sm:text-lg text-white'
                  : 'text-lg sm:text-xl text-slate-900 dark:text-white'
              }`}
            >
              Kegiatan Belajar Mengajar PKBM Annur Karisma
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Tombol Ganti Gaya Transisi */}
            <button
              type="button"
              onClick={cycleTransitionMode}
              title="Ganti gaya animasi transisi foto"
              className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isLogin
                  ? 'border-white/20 bg-white/10 hover:bg-white/20 text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{activeModeLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? 'Putar tayangan otomatis' : 'Jeda tayangan otomatis'}
              title={userPaused ? 'Lanjutkan tayangan' : 'Jeda tayangan'}
              className={`min-h-[38px] min-w-[38px] rounded-xl border flex items-center justify-center transition-colors ${
                isLogin
                  ? 'border-white/20 bg-white/10 hover:bg-white/20 text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-700'
              }`}
            >
              {userPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            {canManage && onManagePhotos && (
              <button
                type="button"
                onClick={onManagePhotos}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 text-white text-xs sm:text-sm font-bold shadow-xs hover:brightness-105 inline-flex items-center gap-2 whitespace-nowrap transition-all"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>Unggah 5 Foto KBM</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Editorial Stage + Side/Bottom Filmstrip */}
        <div
          className={
            isLogin
              ? 'space-y-3'
              : 'grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch'
          }
        >
          {/* Active Featured Frame (Overlapping Transitions — Zero Black Flash) */}
          <div
            onMouseEnter={() => setStageHovered(true)}
            onMouseLeave={() => setStageHovered(false)}
            className={`group/stage relative overflow-hidden rounded-2xl bg-slate-950 select-none ${
              isLogin
                ? 'aspect-[16/10] sm:aspect-[16/9] border border-white/15 shadow-2xl shadow-black/30'
                : 'lg:col-span-8 aspect-[16/10] border border-emerald-950/10 dark:border-white/10 shadow-md'
            }`}
          >
            <AnimatePresence custom={direction} initial={false}>
              <motion.div
                key={`${currentPhoto.id}-${activeIndex}-${transitionCount}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                drag={motionProfile.reducedMotion ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.14}
                onDragEnd={handleStageDragEnd}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
              >
                {/* Foto dengan Animasi Ken Burns Halus Berkelanjutan */}
                <motion.img
                  src={resolvePhotoSrc(currentPhoto, activeIndex)}
                  alt={currentPhoto.title}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedMap((prev) => ({ ...prev, [currentPhoto.id]: true }))
                  }
                  initial={motionProfile.reducedMotion ? undefined : kenBurns.initial}
                  animate={
                    motionProfile.reducedMotion || isPaused
                      ? undefined
                      : kenBurns.animate
                  }
                  transition={{
                    duration: (AUTOPLAY_INTERVAL_MS + 900) / 1000,
                    ease: 'linear',
                  }}
                  className="w-full h-full object-cover will-change-transform"
                  onClick={() => {
                    if (!isSwipingRef.current) setLightboxOpen(true);
                  }}
                />

                {/* Kilau Cahaya Diagonal Lembut Saat Foto Baru Masuk */}
                {!motionProfile.reducedMotion && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ x: '-120%', opacity: 0.7 }}
                    animate={{ x: '140%', opacity: 0 }}
                    transition={{ duration: 0.95, ease: CINEMA_EASE }}
                    className="pointer-events-none absolute inset-y-0 -inset-x-12 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/18 to-transparent"
                  />
                )}

                {/* Measured Gradient Scrim for Guaranteed WCAG Text Contrast */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-950/32 to-slate-950/15"
                />

                {/* Staggered Editorial Caption Reveal */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white">
                  <motion.div
                    initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.12, ease: CINEMA_EASE }}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300"
                  >
                    <span>{currentPhoto.paketLabel || fallbackPhoto.paketLabel}</span>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <span className="tabular-nums text-emerald-200/90">
                      Foto {activeIndex + 1} dari 5
                    </span>
                  </motion.div>

                  <motion.h4
                    initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.18, ease: CINEMA_EASE }}
                    className="mt-1 font-display font-extrabold text-base sm:text-xl leading-snug text-white drop-shadow-xs"
                  >
                    {currentPhoto.title}
                  </motion.h4>

                  {currentPhoto.caption && (
                    <motion.p
                      initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.24, ease: CINEMA_EASE }}
                      className="mt-1 text-xs sm:text-sm text-slate-200/92 leading-relaxed line-clamp-2 max-w-2xl"
                    >
                      {currentPhoto.caption}
                    </motion.p>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Top-Right Fullscreen Button */}
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Perbesar foto kegiatan"
              className="absolute top-3 right-3 z-20 min-h-[38px] min-w-[38px] rounded-xl bg-slate-950/55 hover:bg-slate-950/85 text-white backdrop-blur-xs border border-white/15 flex items-center justify-center transition-all hover:scale-105"
            >
              <Expand className="w-4 h-4" />
            </button>

            {/* Left / Right Arrow Controls */}
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Foto kegiatan sebelumnya"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 min-h-[40px] min-w-[40px] rounded-xl bg-slate-950/50 hover:bg-slate-950/85 text-white backdrop-blur-xs border border-white/15 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Foto kegiatan berikutnya"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 min-h-[40px] min-w-[40px] rounded-xl bg-slate-950/50 hover:bg-slate-950/85 text-white backdrop-blur-xs border border-white/15 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Smooth Autoplay Progress Line */}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15 z-20 overflow-hidden">
              {!isPaused && !lightboxOpen && !motionProfile.reducedMotion ? (
                <motion.div
                  key={`progress-${activeIndex}-${transitionCount}-${isPaused}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: AUTOPLAY_INTERVAL_MS / 1000, ease: 'linear' }}
                  style={{ transformOrigin: 'left center' }}
                  className="h-full w-full bg-gradient-to-r from-emerald-400 via-amber-300 to-amber-400"
                />
              ) : (
                <div
                  className="h-full bg-amber-300/80 transition-all duration-300"
                  style={{ width: `${((activeIndex + 1) / safePhotos.length) * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* 5-Thumbnail Interactive Filmstrip */}
          {isLogin ? (
            <div className="grid grid-cols-5 gap-2">
              {safePhotos.map((photo, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => goToIndex(idx)}
                    aria-label={`Tampilkan Foto ${idx + 1}: ${photo.title}`}
                    className={`group relative aspect-[4/3] rounded-xl overflow-hidden border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                      isActive
                        ? 'border-amber-300 scale-[1.03] opacity-100 shadow-lg shadow-black/30'
                        : 'border-white/15 opacity-65 hover:opacity-100 hover:border-white/40 hover:-translate-y-0.5'
                    }`}
                  >
                    <img
                      src={resolvePhotoSrc(photo, idx)}
                      alt={photo.title}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedMap((prev) => ({ ...prev, [photo.id]: true }))
                      }
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent"
                    />
                    <span className="absolute left-1.5 bottom-1.5 text-[10px] font-bold text-white tabular-nums">
                      0{idx + 1}
                    </span>

                    {/* Garis Progres Aktif pada Thumbnail Login */}
                    {isActive && (
                      <motion.div
                        layoutId="login-gallery-active-ring"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-amber-300"
                      />
                    )}
                    {isActive && !isPaused && !lightboxOpen && !motionProfile.reducedMotion && (
                      <motion.div
                        key={`thumb-bar-login-${activeIndex}-${transitionCount}`}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: AUTOPLAY_INTERVAL_MS / 1000, ease: 'linear' }}
                        style={{ transformOrigin: 'left center' }}
                        className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-300"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-1 gap-2">
              {safePhotos.map((photo, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => goToIndex(idx)}
                    className={`group relative overflow-hidden w-full text-left p-2 rounded-xl border transition-all duration-300 flex items-center gap-3 ${
                      isActive
                        ? 'border-emerald-500/60 bg-emerald-50/85 dark:bg-emerald-950/50 shadow-xs'
                        : 'border-slate-100 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/40 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/35 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {/* Indikator Geser Aktif Sisi Kiri */}
                    {isActive && (
                      <motion.span
                        layoutId="dashboard-gallery-active-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        aria-hidden="true"
                        className="hidden lg:block absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-emerald-600 to-amber-500"
                      />
                    )}

                    <div className="relative w-16 h-12 sm:w-full sm:h-14 lg:w-16 lg:h-12 rounded-lg overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800">
                      <img
                        src={resolvePhotoSrc(photo, idx)}
                        alt={photo.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedMap((prev) => ({ ...prev, [photo.id]: true }))
                        }
                        className={`w-full h-full object-cover transition-transform duration-500 ${
                          isActive ? 'scale-105' : 'group-hover:scale-110'
                        }`}
                      />
                      <span
                        className={`absolute left-1 bottom-1 px-1 rounded text-[9px] font-bold tabular-nums transition-colors ${
                          isActive
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-950/70 text-white'
                        }`}
                      >
                        0{idx + 1}
                      </span>
                    </div>

                    <div className="min-w-0 sm:hidden lg:block flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 truncate">
                        {photo.paketLabel}
                      </p>
                      <p
                        className={`text-xs font-bold leading-snug line-clamp-2 ${
                          isActive
                            ? 'text-slate-950 dark:text-white'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {photo.title}
                      </p>
                    </div>

                    {/* Mini Progres Halus di Bawah Item Aktif */}
                    {isActive && !isPaused && !lightboxOpen && !motionProfile.reducedMotion && (
                      <motion.div
                        key={`thumb-bar-dash-${activeIndex}-${transitionCount}`}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: AUTOPLAY_INTERVAL_MS / 1000, ease: 'linear' }}
                        style={{ transformOrigin: 'left center' }}
                        className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-emerald-500 to-amber-400"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Fullscreen Lightbox Viewer dengan Transisi Foto Halus */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxOpen(false);
            }}
            className="fixed inset-0 z-50 bg-slate-950/92 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          >
            <motion.div
              initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.26, ease: CINEMA_EASE }}
              className="relative w-full max-w-5xl space-y-4"
            >
              <div className="flex items-center justify-between gap-3 text-white">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
                    {currentPhoto.paketLabel} · Foto 0{activeIndex + 1} / 0{safePhotos.length}
                  </p>
                  <h4 className="font-display font-extrabold text-lg sm:text-xl truncate">
                    {currentPhoto.title}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Tutup pratinjau penuh"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[16/10] border border-white/15">
                <AnimatePresence custom={direction} initial={false}>
                  <motion.img
                    key={`lightbox-${currentPhoto.id}-${activeIndex}`}
                    src={resolvePhotoSrc(currentPhoto, activeIndex)}
                    alt={currentPhoto.title}
                    referrerPolicy="no-referrer"
                    initial={
                      motionProfile.reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: direction > 0 ? 48 : -48, scale: 1.03 }
                    }
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={
                      motionProfile.reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: direction > 0 ? -48 : 48, scale: 0.97 }
                    }
                    transition={{ duration: 0.42, ease: CINEMA_EASE }}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </AnimatePresence>

                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Foto sebelumnya"
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] rounded-xl bg-slate-950/65 hover:bg-slate-950/90 text-white border border-white/15 flex items-center justify-center transition-transform hover:scale-105"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Foto berikutnya"
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] rounded-xl bg-slate-950/65 hover:bg-slate-950/90 text-white border border-white/15 flex items-center justify-center transition-transform hover:scale-105"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {currentPhoto.caption && (
                <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">
                  {currentPhoto.caption}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
