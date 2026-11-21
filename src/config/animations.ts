import { useEffect, useState } from 'react';
import { useReducedMotion, type Transition, type Variants } from 'motion/react';

/**
 * ============================================================================
 * KONFIGURASI ANIMASI TERPUSAT — SIAKAD PKBM ANNUR KARISMA
 * ============================================================================
 * Ubah `ANIMATION_SPEED_SCALE` untuk mempercepat (< 1, misal 0.7) atau
 * memperlambat (> 1, misal 1.3) seluruh animasi di aplikasi secara serentak.
 */
export const ANIMATION_SPEED_SCALE = 1;

/** Batas maksimal item yang diberi efek stagger agar daftar panjang tetap 60fps */
export const STAGGER_ITEM_LIMIT = 20;

/** Durasi dasar (detik) sebelum dikalikan ANIMATION_SPEED_SCALE */
export const ANIMATION_DURATIONS = {
  /** Transisi perpindahan halaman (maksimal 0.4 detik) */
  page: 0.35,
  /** Transisi halaman khusus perangkat seluler / lambat */
  pageMobile: 0.22,
  /** Munculnya judul & subjudul setelah konten utama */
  titleDelay: 0.1,
  /** Jeda antar kartu statistik di Dashboard */
  statStagger: 0.08,
  /** Jeda antar baris tabel / kartu daftar */
  listStagger: 0.035,
  /** Durasi masuk elemen tunggal (fade + slide) */
  item: 0.28,
  /** Durasi modal & drawer */
  modal: 0.24,
  /** Durasi dropdown / popover */
  dropdown: 0.16,
  /** Durasi toast masuk/keluar */
  toast: 0.25,
  /** Durasi transisi warna tema terang/gelap (detik) */
  theme: 0.4,
  /** Durasi layar sambutan singkat pasca login (ms, maks 1000ms) */
  welcomeSplashMs: 850,
  /** Durasi efek getar (shake) pesan error form */
  shake: 0.36,
  /** Durasi animasi grafik Recharts (ms) */
  chartMs: 850,
} as const;

export const ANIMATION_EASE = {
  smoothOut: [0.22, 1, 0.36, 1] as [number, number, number, number],
  gentleOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
  exitIn: [0.4, 0, 1, 1] as [number, number, number, number],
};

export const ANIMATION_SPRINGS = {
  /** Pegas lembut untuk indikator menu sidebar & segmented control */
  navPill: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 32,
    mass: 0.85,
  },
  /** Pegas halus untuk ciutkan/lebarkan sidebar */
  sidebar: {
    type: 'spring' as const,
    stiffness: 340,
    damping: 32,
    mass: 0.9,
  },
  /** Pegas responsif untuk bottom sheet & modal */
  sheet: {
    type: 'spring' as const,
    stiffness: 380,
    damping: 34,
    mass: 0.85,
  },
  /** Pegas cepat untuk mikro-interaksi tombol & ikon */
  tactile: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 28,
  },
} as const;

/** Helper untuk menskalakan durasi dengan batas aman */
export function scaledDuration(seconds: number, maxSeconds?: number): number {
  const val = Math.max(0.05, seconds * ANIMATION_SPEED_SCALE);
  return typeof maxSeconds === 'number' ? Math.min(val, maxSeconds) : val;
}

export interface AdaptiveMotionProfile {
  /** True jika pengguna mengaktifkan prefers-reduced-motion di OS */
  reducedMotion: boolean;
  /** True pada layar kecil (< 768px) atau perangkat berdaya rendah */
  isMobileOrLowPower: boolean;
  /** Nonaktifkan filter blur pada HP / reduced motion agar selalu 60fps */
  enableBlur: boolean;
  /** Skala durasi efektif (lebih pendek di HP) */
  durationMultiplier: number;
}

function detectLowPowerOrMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const smallViewport = window.innerWidth < 768;
  const lowCores =
    typeof navigator !== 'undefined' &&
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency > 0 &&
    navigator.hardwareConcurrency <= 4;
  return smallViewport || lowCores;
}

/**
 * Hook adaptif untuk membaca preferensi `prefers-reduced-motion` dan mendeteksi
 * perangkat seluler/lambat secara otomatis.
 */
export function useAdaptiveMotion(): AdaptiveMotionProfile {
  const prefersReduced = Boolean(useReducedMotion());
  const [isMobileOrLowPower, setIsMobileOrLowPower] = useState<boolean>(() =>
    detectLowPowerOrMobile()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobileOrLowPower(detectLowPowerOrMobile());
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    reducedMotion: prefersReduced,
    isMobileOrLowPower,
    enableBlur: !prefersReduced && !isMobileOrLowPower,
    durationMultiplier: prefersReduced ? 0.45 : isMobileOrLowPower ? 0.72 : 1,
  };
}

/**
 * Varian transisi antar halaman:
 * - Halaman lama memudar + bergeser sedikit ke kiri
 * - Halaman baru masuk dari kanan (+20px) + fade (+ blur halus di desktop)
 * - Total durasi <= 0.4 detik dan tidak memblokir interaksi
 */
export function createPageVariants(profile: AdaptiveMotionProfile): Variants {
  if (profile.reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: {
        opacity: 1,
        transition: { duration: scaledDuration(0.16, 0.2), ease: 'easeOut' },
      },
      exit: {
        opacity: 0,
        transition: { duration: scaledDuration(0.12, 0.16), ease: 'easeIn' },
      },
    };
  }

  const enterDur = scaledDuration(
    profile.isMobileOrLowPower ? ANIMATION_DURATIONS.pageMobile : ANIMATION_DURATIONS.page,
    0.38
  );
  const exitDur = scaledDuration(profile.isMobileOrLowPower ? 0.14 : 0.18, 0.2);

  return {
    initial: {
      opacity: 0,
      x: profile.isMobileOrLowPower ? 12 : 20,
      ...(profile.enableBlur ? { filter: 'blur(4px)' } : {}),
    },
    animate: {
      opacity: 1,
      x: 0,
      ...(profile.enableBlur ? { filter: 'blur(0px)' } : {}),
      transition: {
        duration: enterDur,
        ease: ANIMATION_EASE.smoothOut,
      },
      transitionEnd: {
        filter: 'none',
        transform: 'none',
      },
    },
    exit: {
      opacity: 0,
      x: profile.isMobileOrLowPower ? -10 : -16,
      transition: {
        duration: exitDur,
        ease: ANIMATION_EASE.exitIn,
      },
    },
  };
}

/** Varian judul & subjudul halaman dengan jeda kecil setelah konten utama */
export function createTitleVariants(profile: AdaptiveMotionProfile): Variants {
  if (profile.reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.15 } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    };
  }
  return {
    initial: { opacity: 0, y: 6 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        delay: scaledDuration(ANIMATION_DURATIONS.titleDelay * profile.durationMultiplier, 0.14),
        duration: scaledDuration(0.24 * profile.durationMultiplier, 0.3),
        ease: ANIMATION_EASE.smoothOut,
      },
    },
    exit: {
      opacity: 0,
      y: -4,
      transition: { duration: 0.12 },
    },
  };
}

/**
 * Helper transisi item daftar berurutan (stagger) — otomatis membatasi hanya
 * 20 item pertama (`STAGGER_ITEM_LIMIT`) agar daftar besar tetap ringan.
 */
export function getStaggerItemProps(
  index: number,
  profile: AdaptiveMotionProfile,
  stepDelay = ANIMATION_DURATIONS.listStagger
) {
  if (profile.reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.14 } as Transition,
    };
  }

  if (index >= STAGGER_ITEM_LIMIT) {
    return {
      initial: false as const,
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 } as Transition,
    };
  }

  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: scaledDuration(ANIMATION_DURATIONS.item * profile.durationMultiplier, 0.34),
      delay: Math.min(index, STAGGER_ITEM_LIMIT - 1) * stepDelay * profile.durationMultiplier * ANIMATION_SPEED_SCALE,
      ease: ANIMATION_EASE.smoothOut,
    } as Transition,
  };
}

/** Varian dropdown / popover yang mengembang dari titik pemicunya */
export function createDropdownVariants(profile: AdaptiveMotionProfile): Variants {
  if (profile.reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.12 } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.94, y: -6 },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: scaledDuration(ANIMATION_DURATIONS.dropdown * profile.durationMultiplier, 0.22),
        ease: ANIMATION_EASE.smoothOut,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -4,
      transition: { duration: scaledDuration(0.12, 0.16), ease: ANIMATION_EASE.exitIn },
    },
  };
}

/** Varian getaran sekali (shake) untuk pesan error form */
export const ERROR_SHAKE_VARIANTS: Variants = {
  initial: { opacity: 0, x: 0, y: -4 },
  animate: {
    opacity: 1,
    y: 0,
    x: [0, -7, 7, -5, 5, -2, 0],
    transition: {
      x: { duration: scaledDuration(ANIMATION_DURATIONS.shake), ease: 'easeInOut' },
      opacity: { duration: 0.18 },
      y: { duration: 0.18 },
    },
  },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14 } },
};

/** Varian toast meluncur dari kanan atas */
export function createToastVariants(profile: AdaptiveMotionProfile): Variants {
  if (profile.reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.16 } },
      exit: { opacity: 0, transition: { duration: 0.14 } },
    };
  }
  return {
    initial: { opacity: 0, x: 48, scale: 0.96 },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        duration: scaledDuration(ANIMATION_DURATIONS.toast * profile.durationMultiplier, 0.32),
        ease: ANIMATION_EASE.smoothOut,
      },
    },
    exit: {
      opacity: 0,
      x: 56,
      scale: 0.96,
      transition: {
        duration: scaledDuration(0.2 * profile.durationMultiplier, 0.25),
        ease: ANIMATION_EASE.exitIn,
      },
    },
  };
}
