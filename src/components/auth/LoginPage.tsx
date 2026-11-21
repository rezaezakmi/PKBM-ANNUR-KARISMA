import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  User,
  UserCog,
} from 'lucide-react';
import { DEFAULT_PKBM_LOGO, DEFAULT_PKBM_LOGIN_BANNER, resolveSchoolLogo } from '../../assets/branding';
import {
  ANIMATION_EASE,
  ANIMATION_SPRINGS,
  ERROR_SHAKE_VARIANTS,
  scaledDuration,
  useAdaptiveMotion,
} from '../../config/animations';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { db, normalizeUsername } from '../../lib/firebase';
import {
  GALLERY_SLOT_IDS,
  mergeGalleryPhotosWithDefaults,
  readCachedPublicGalleryPhotos,
  writeCachedPublicGalleryPhotos,
} from '../../data/activityGalleryDefaults';
import { ActivityGalleryPhoto } from '../../types/siakad';
import { ActivityPhotoShowcase } from '../gallery/ActivityPhotoShowcase';
import { LoginAuthSkeleton } from '../ui/SkeletonLoader';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

export const LoginPage: React.FC = () => {
  const {
    loginWithUsername,
    setupFirstAdmin,
    setupCompleted,
    checkingSetup,
    cooldownSeconds,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();

  // Login Form States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('siakad_public_branding_v1');
      if (cached) {
        const parsed = JSON.parse(cached) as { logoUrl?: string };
        return resolveSchoolLogo(parsed.logoUrl);
      }
    } catch {
      // Ignore cache error
    }
    return DEFAULT_PKBM_LOGO;
  });
  const [schoolName, setSchoolName] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('siakad_public_branding_v1');
      if (cached) {
        const parsed = JSON.parse(cached) as { schoolName?: string };
        if (parsed.schoolName) return parsed.schoolName;
      }
    } catch {
      // Ignore
    }
    return 'PKBM ANNUR KARISMA';
  });
  const [schoolSlogan, setSchoolSlogan] = useState<string>(
    'Mencerdaskan Kehidupan Bangsa Melalui Pendidikan Kesetaraan Berkualitas'
  );
  const [galleryPhotos, setGalleryPhotos] = useState<ActivityGalleryPhoto[]>(
    readCachedPublicGalleryPhotos
  );

  useEffect(() => {
    try {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = logoUrl || DEFAULT_PKBM_LOGO;
    } catch {
      // Ignore DOM favicon error
    }
  }, [logoUrl]);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, 'school_branding', 'main'))
      .then((snap) => {
        if (!active || !snap.exists()) return;
        const d = snap.data();
        const nextLogo = resolveSchoolLogo(typeof d.logoUrl === 'string' ? d.logoUrl : '');
        const nextName = typeof d.schoolName === 'string' && d.schoolName ? d.schoolName : 'PKBM ANNUR KARISMA';
        const nextSlogan = typeof d.slogan === 'string' && d.slogan ? d.slogan : '';
        setLogoUrl(nextLogo);
        setSchoolName(nextName);
        if (nextSlogan) setSchoolSlogan(nextSlogan);
        try {
          localStorage.setItem(
            'siakad_public_branding_v1',
            JSON.stringify({ logoUrl: nextLogo, schoolName: nextName, slogan: nextSlogan })
          );
        } catch {
          // Ignore quota
        }
      })
      .catch(() => {});

    Promise.all(
      GALLERY_SLOT_IDS.map((slotId) =>
        getDoc(doc(db, 'gallery_photos', slotId))
          .then((snap) => {
            if (!snap.exists()) return null;
            const data = snap.data();
            return {
              id: snap.id,
              slotIndex: Number(data.slotIndex || 1) as 1 | 2 | 3 | 4 | 5,
              title: typeof data.title === 'string' ? data.title : '',
              caption: typeof data.caption === 'string' ? data.caption : '',
              paketLabel: typeof data.paketLabel === 'string' ? data.paketLabel : '',
              imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
              updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
            };
          })
          .catch(() => null)
      )
    )
      .then((results) => {
        if (!active) return;
        const validRemote = results.filter(
          (item): item is NonNullable<typeof item> => item !== null
        );
        const merged = mergeGalleryPhotosWithDefaults(validRemote);
        setGalleryPhotos(merged);
        writeCachedPublicGalleryPhotos(merged);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // First-time Admin Setup States
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailProviderHint, setNeedsEmailProviderHint] = useState(false);

  const isLocked = cooldownSeconds > 0;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || submitting) return;

    setErrorMessage(null);
    setNeedsEmailProviderHint(false);
    setSubmitting(true);

    const res = await loginWithUsername(username, password);
    setSubmitting(false);

    if (!res.ok) {
      setErrorMessage(res.error || 'Username atau password salah.');
      if (res.needsEmailProviderEnable) {
        setNeedsEmailProviderHint(true);
      }
      return;
    }

    showToast('Berhasil masuk ke SIAKAD PKBM Annur Karisma', 'success');
  };

  const handleSetupAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setErrorMessage(null);
    setNeedsEmailProviderHint(false);

    if (adminPassword !== adminConfirmPassword) {
      setErrorMessage('Konfirmasi password tidak cocok.');
      return;
    }

    setSubmitting(true);
    const res = await setupFirstAdmin({
      name: adminName,
      username: adminUsername,
      password: adminPassword,
    });
    setSubmitting(false);

    if (!res.ok) {
      setErrorMessage(res.error || 'Gagal membuat akun Admin pertama.');
      if (res.needsEmailProviderEnable) {
        setNeedsEmailProviderHint(true);
      }
      return;
    }

    showToast('Akun Admin pertama berhasil dibuat dan sistem setup telah dikunci.', 'success');
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 bg-[#FAFAF7] dark:bg-[#0B1110]">
      {/* Kiri: Gradien Hijau-Emas dengan Logo & Slogan PKBM ANNUR KARISMA */}
      <div className="relative lg:col-span-6 xl:col-span-7 overflow-hidden min-h-[280px] lg:min-h-screen flex flex-col justify-between p-7 sm:p-10 xl:p-14 text-white">
        <img
          src={DEFAULT_PKBM_LOGIN_BANNER}
          alt="Suasana ruang belajar PKBM Annur Karisma"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          aria-hidden="true"
          className={`absolute -inset-6 bg-gradient-to-br from-emerald-950/95 via-emerald-900/85 to-amber-700/80 ${
            motionProfile.reducedMotion ? '' : 'animate-gradient-drift'
          }`}
        />

        {/* Logo & Nama Lembaga */}
        <motion.div
          initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
          animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={{ duration: scaledDuration(0.38), ease: ANIMATION_EASE.smoothOut }}
          className="relative z-10 flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white p-1 shadow-lg border border-amber-300/40 shrink-0 flex items-center justify-center">
            <img
              src={resolveSchoolLogo(logoUrl)}
              alt={`Lambang ${schoolName}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wider text-amber-300">
              SISTEM INFORMASI AKADEMIK · CIANJUR
            </p>
            <h2 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight text-white">
              {schoolName}
            </h2>
          </div>
        </motion.div>

        {/* Slogan, Galeri Animasi 5 Foto KBM & Program Pendidikan */}
        <div className="relative z-10 max-w-2xl mt-7 lg:mt-6 space-y-5">
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl xl:text-[36px] leading-[1.16] tracking-tight text-balance">
              {schoolSlogan}
            </h1>
            <p className="mt-2.5 text-xs sm:text-sm text-emerald-50/90 leading-relaxed max-w-xl">
              Portal akademik resmi untuk pengelolaan data warga belajar, jadwal mengajar tutor,
              presensi, kelas online, tugas daring, bank soal ujian, hingga rapor Kurikulum Merdeka.
            </p>
          </div>

          <ActivityPhotoShowcase photos={galleryPhotos} variant="login" />

          <div className="pt-4 border-t border-white/20 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm font-medium text-amber-200">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              Paket A (Setara SD)
            </span>
            <span aria-hidden="true" className="text-white/40">
              ·
            </span>
            <span>Paket B (Setara SMP)</span>
            <span aria-hidden="true" className="text-white/40">
              ·
            </span>
            <span>Paket C (Setara SMA)</span>
          </div>
        </div>
      </div>

      {/* Kanan: Form Login (Username & Password) atau Setup Admin Pertama (Satu Kali) */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-16 relative">
        <motion.button
          type="button"
          data-no-lift
          onClick={toggleTheme}
          whileTap={motionProfile.reducedMotion ? undefined : { scale: 0.93 }}
          aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          className="absolute top-5 right-5 min-h-[44px] min-w-[44px] rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-amber-300 shadow-sm hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors overflow-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            {theme === 'dark' ? (
              <motion.span
                key="login-sun"
                initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
                animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                exit={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
                transition={ANIMATION_SPRINGS.tactile}
                className="inline-flex"
              >
                <Sun className="w-5 h-5" />
              </motion.span>
            ) : (
              <motion.span
                key="login-moon"
                initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
                animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                exit={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
                transition={ANIMATION_SPRINGS.tactile}
                className="inline-flex"
              >
                <Moon className="w-5 h-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <motion.div
          key={checkingSetup ? 'loading' : setupCompleted ? 'login' : 'setup'}
          initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, x: 26 }}
          animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          transition={{ duration: scaledDuration(0.35), ease: ANIMATION_EASE.smoothOut }}
          className="w-full max-w-md mx-auto"
        >
          {checkingSetup ? (
            <LoginAuthSkeleton />
          ) : !setupCompleted ? (
            /* Halaman Setup Admin Pertama (Otomatis Terkunci Setelah Selesai) */
            <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <span className="inline-block text-[11px] font-bold tracking-wider text-amber-700 dark:text-amber-400">
                    INISIALISASI SATU KALI
                  </span>
                  <h2 className="font-display font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">
                    Setup Admin Pertama
                  </h2>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
                Belum ada akun Administrator terdaftar. Buat akun Admin utama untuk mengelola
                seluruh akun Guru dan Murid. Halaman ini otomatis terkunci setelah Admin pertama dibuat.
              </p>

              <form onSubmit={handleSetupAdminSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="setup-admin-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Nama Lengkap Admin
                  </label>
                  <input
                    id="setup-admin-name"
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Contoh: Rizky Pratama, S.Kom."
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="setup-admin-username"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Username Admin (huruf kecil, tanpa spasi)
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="setup-admin-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(normalizeUsername(e.target.value))}
                      placeholder="contoh: admin.pkbm"
                      className="w-full min-h-[46px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-admin-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Password Awal (minimal 6 karakter)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="setup-admin-password"
                      type={showSetupPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Masukkan password admin"
                      className="w-full min-h-[46px] pl-10 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword((p) => !p)}
                      aria-label={showSetupPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {showSetupPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-admin-confirm"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Ulangi Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="setup-admin-confirm"
                      type={showSetupPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={adminConfirmPassword}
                      onChange={(e) => setAdminConfirmPassword(e.target.value)}
                      placeholder="Ulangi password admin"
                      className="w-full min-h-[46px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {errorMessage && (
                    <motion.div
                      key={errorMessage}
                      role="alert"
                      variants={motionProfile.reducedMotion ? undefined : ERROR_SHAKE_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-3.5 text-xs text-rose-800 dark:text-rose-200 leading-relaxed space-y-1"
                    >
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                      </p>
                      {needsEmailProviderHint && (
                        <p className="text-[11px] opacity-90">
                          Pastikan provider <strong>Email/Password</strong> sudah diaktifkan pada
                          Firebase Console → Authentication → Sign-in method.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-md shadow-emerald-900/15 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span>{submitting ? 'Membuat Akun Admin...' : 'Aktifkan Admin & Kunci Setup'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            /* Form Login Standar: HANYA Username dan Password */
            <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
              <div className="mb-6">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Akses Terkelola Sekolah</span>
                </div>
                <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
                  Masuk ke SIAKAD
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Masukkan username dan password yang diberikan oleh admin sekolah.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="floating-field">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  <input
                    id="siakad-username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder=" "
                    disabled={isLocked}
                    className="w-full min-h-[54px] pt-4 pb-1.5 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus-visible:outline-none disabled:opacity-60 transition-all"
                  />
                  <label htmlFor="siakad-username" className="floating-field-label">
                    Username (NIS / nama.guru)
                  </label>
                </div>

                <div className="floating-field">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  <input
                    id="siakad-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=" "
                    disabled={isLocked}
                    className="w-full min-h-[54px] pt-4 pb-1.5 pl-10 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus-visible:outline-none disabled:opacity-60 transition-all"
                  />
                  <label htmlFor="siakad-password" className="floating-field-label">
                    Password
                  </label>
                  <button
                    type="button"
                    data-no-lift
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {isLocked && (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5"
                  >
                    <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-bold">Jeda Keamanan Aktif</p>
                      <p className="tabular-nums">
                        Terlalu banyak percobaan gagal. Silakan coba lagi dalam{' '}
                        <span className="font-bold">{cooldownSeconds}</span> detik.
                      </p>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {errorMessage && !isLocked && (
                    <motion.div
                      key={errorMessage}
                      role="alert"
                      variants={motionProfile.reducedMotion ? undefined : ERROR_SHAKE_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-3.5 text-xs text-rose-800 dark:text-rose-200 leading-relaxed"
                    >
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                      </p>
                      {needsEmailProviderHint && (
                        <p className="mt-1.5 text-[11px] opacity-90">
                          Aktifkan sign-in method <strong>Email/Password</strong> di Firebase Console →
                          Authentication.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={submitting || isLocked}
                  className="siakad-btn-interactive btn-ripple w-full min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-md shadow-emerald-900/15 hover:brightness-105 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>
                    {submitting
                      ? 'Memverifikasi...'
                      : isLocked
                        ? `Tunggu (${cooldownSeconds} dtk)`
                        : 'Masuk'}
                  </span>
                  {!isLocked && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <PWAInstallButton variant="banner" logoUrl={logoUrl} />
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                  Lupa password? <span className="font-semibold text-slate-700 dark:text-slate-200">Hubungi admin sekolah</span>
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
