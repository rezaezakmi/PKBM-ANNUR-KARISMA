import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  buildInternalEmail,
  db,
  isValidUsernameFormat,
  normalizeUsername,
} from '../lib/firebase';
import { UserProfile, UserRole } from '../types/siakad';
import { saveStoredCredentials } from '../utils/credentialStore';

export type AuthMode = 'firebase';

interface LoginResult {
  ok: boolean;
  error?: string;
  cooldownSeconds?: number;
  needsEmailProviderEnable?: boolean;
}

interface ThrottleState {
  failures: number;
  lockedUntil: number;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  effectiveRole: UserRole;
  authMode: AuthMode | null;
  loading: boolean;
  setupCompleted: boolean;
  checkingSetup: boolean;
  isBootstrappedAdmin: boolean;
  cooldownSeconds: number;
  loginWithUsername: (username: string, password: string) => Promise<LoginResult>;
  setupFirstAdmin: (params: {
    name: string;
    username: string;
    password: string;
  }) => Promise<LoginResult>;
  updateOwnProfileAvatar: (avatarUrl: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const THROTTLE_STORAGE_KEY = 'siakad_login_throttle_v1';

function readThrottle(): ThrottleState {
  try {
    const raw = localStorage.getItem(THROTTLE_STORAGE_KEY);
    if (!raw) return { failures: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<ThrottleState>;
    return {
      failures: Number(parsed.failures || 0),
      lockedUntil: Number(parsed.lockedUntil || 0),
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

function writeThrottle(state: ThrottleState): void {
  try {
    localStorage.setItem(THROTTLE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function clearThrottle(): void {
  try {
    localStorage.removeItem(THROTTLE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function recordFailedAttempt(): { failures: number; waitSeconds: number } {
  const prev = readThrottle();
  const failures = prev.failures + 1;
  let waitSeconds = 0;
  if (failures >= 11) {
    waitSeconds = 120;
  } else if (failures >= 8) {
    waitSeconds = 60;
  } else if (failures >= 5) {
    waitSeconds = 30;
  }
  const lockedUntil = waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : 0;
  writeThrottle({ failures, lockedUntil });
  return { failures, waitSeconds };
}

function mapSnapshotToProfile(uid: string, data: Record<string, unknown>): UserProfile {
  const toIso = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
      return (val as { toDate: () => Date }).toDate().toISOString();
    }
    return undefined;
  };

  return {
    uid: String(data.uid || uid),
    username: String(data.username || ''),
    internalEmail: String(data.internalEmail || ''),
    name: String(data.name || 'Pengguna SIAKAD'),
    role: (data.role as UserRole) || 'murid',
    status: data.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
    authVersion: typeof data.authVersion === 'number' ? data.authVersion : 1,
    nis: typeof data.nis === 'string' ? data.nis : undefined,
    nip: typeof data.nip === 'string' ? data.nip : undefined,
    linkedEntityId: typeof data.linkedEntityId === 'string' ? data.linkedEntityId : undefined,
    classLabel: typeof data.classLabel === 'string' ? data.classLabel : undefined,
    avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl.trim() ? data.avatarUrl : undefined,
    lastLoginAt: toIso(data.lastLoginAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupCompleted, setSetupCompleted] = useState(true);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(() => {
    const { lockedUntil } = readThrottle();
    return lockedUntil > Date.now() ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0;
  });

  const isProvisioningFirstAdminRef = useRef(false);

  // Live countdown timer for login cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      const { lockedUntil } = readThrottle();
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCooldownSeconds(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  // Check one-time Admin initialization lock
  useEffect(() => {
    let active = true;
    const checkSetupStatus = async () => {
      try {
        const setupSnap = await getDoc(doc(db, 'system_config', 'auth_setup'));
        if (active) {
          setSetupCompleted(setupSnap.exists() && setupSnap.data()?.adminInitialized === true);
        }
      } catch (err) {
        console.warn('Gagal memeriksa status setup admin awal:', err);
        if (active) {
          setSetupCompleted(true);
        }
      } finally {
        if (active) {
          setCheckingSetup(false);
        }
      }
    };
    checkSetupStatus();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setAuthMode(null);
        setLoading(false);
        return;
      }

      if (isProvisioningFirstAdminRef.current) {
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userDocRef);

        if (!snap.exists()) {
          // Akun Auth yatim atau sudah direset password-nya -> keluarkan sesi
          await signOut(auth).catch(() => {});
          setProfile(null);
          setAuthMode(null);
          setLoading(false);
          return;
        }

        const loadedProfile = mapSnapshotToProfile(user.uid, snap.data() as Record<string, unknown>);
        if (loadedProfile.status !== 'Aktif') {
          await signOut(auth).catch(() => {});
          setProfile(null);
          setAuthMode(null);
          setLoading(false);
          return;
        }

        setProfile(loadedProfile);
        setAuthMode('firebase');
        setLoading(false);
      } catch (error) {
        console.error('Gagal memuat profil pengguna:', error);
        setProfile(null);
        setAuthMode(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const setupFirstAdmin: AuthContextValue['setupFirstAdmin'] = async ({
    name,
    username,
    password,
  }) => {
    const cleanName = name.trim();
    const cleanUsername = normalizeUsername(username);

    if (cleanName.length < 2) {
      return { ok: false, error: 'Nama lengkap Admin minimal 2 karakter.' };
    }
    if (
      username.includes(' ') ||
      cleanUsername !== username.trim().toLowerCase() ||
      !isValidUsernameFormat(cleanUsername)
    ) {
      return {
        ok: false,
        error: 'Username harus huruf kecil tanpa spasi (3–40 karakter, hanya huruf, angka, titik, _ atau -).',
      };
    }
    if (password.length < 6) {
      return { ok: false, error: 'Password minimal harus 6 karakter.' };
    }

    try {
      const existingSetup = await getDoc(doc(db, 'system_config', 'auth_setup'));
      if (existingSetup.exists()) {
        setSetupCompleted(true);
        return {
          ok: false,
          error: 'Setup Admin pertama sudah selesai dan terkunci. Silakan masuk menggunakan halaman Login.',
        };
      }

      const internalEmail = buildInternalEmail(cleanUsername, 1);
      isProvisioningFirstAdminRef.current = true;

      const cred = await createUserWithEmailAndPassword(auth, internalEmail, password);
      const uid = cred.user.uid;

      const adminDocPayload = {
        uid,
        username: cleanUsername,
        internalEmail,
        name: cleanName.slice(0, 120),
        role: 'admin' as const,
        status: 'Aktif' as const,
        authVersion: 1,
        nip: 'ADM-001',
        createdBy: uid,
        lastLoginAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', uid), adminDocPayload);
      await setDoc(doc(db, 'account_lookups', cleanUsername), {
        username: cleanUsername,
        internalEmail,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'system_config', 'auth_setup'), {
        adminInitialized: true,
        initializedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'login_card_credentials', uid), {
        uid,
        username: cleanUsername,
        name: cleanName.slice(0, 120),
        role: 'admin',
        cardPassword: password.slice(0, 64),
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      saveStoredCredentials([
        {
          uid,
          name: cleanName.slice(0, 120),
          username: cleanUsername,
          password: password.slice(0, 64),
          role: 'admin',
          issuedAt: new Date().toISOString(),
        },
      ]);

      const createdProfile: UserProfile = {
        uid,
        username: cleanUsername,
        internalEmail,
        name: cleanName.slice(0, 120),
        role: 'admin',
        status: 'Aktif',
        authVersion: 1,
        nip: 'ADM-001',
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setSetupCompleted(true);
      setProfile(createdProfile);
      setAuthMode('firebase');
      setLoading(false);
      clearThrottle();
      setCooldownSeconds(0);

      return { ok: true };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        return {
          ok: false,
          needsEmailProviderEnable: true,
          error:
            'Metode login Email/Password belum diaktifkan di Firebase Console > Authentication > Sign-in method.',
        };
      }
      if (code === 'auth/email-already-in-use') {
        return {
          ok: false,
          error: 'Username tersebut sudah pernah dipakai. Silakan pilih username Admin yang lain.',
        };
      }
      if (code === 'auth/weak-password') {
        return { ok: false, error: 'Password terlalu lemah. Gunakan minimal 6 karakter kombinasi.' };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal membuat akun Admin pertama.',
      };
    } finally {
      isProvisioningFirstAdminRef.current = false;
    }
  };

  const loginWithUsername = async (rawUsername: string, password: string): Promise<LoginResult> => {
    const throttle = readThrottle();
    if (throttle.lockedUntil > Date.now()) {
      const remaining = Math.ceil((throttle.lockedUntil - Date.now()) / 1000);
      setCooldownSeconds(remaining);
      return {
        ok: false,
        cooldownSeconds: remaining,
        error: `Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${remaining} detik.`,
      };
    }

    const cleanUsername = normalizeUsername(rawUsername);
    if (!rawUsername.trim() || !password) {
      return { ok: false, error: 'Username dan password wajib diisi.' };
    }

    // Jika username mengandung spasi/huruf aneh tetap tampilkan pesan error generik & aman
    if (!isValidUsernameFormat(cleanUsername) || rawUsername.trim().includes(' ')) {
      const { waitSeconds } = recordFailedAttempt();
      if (waitSeconds > 0) setCooldownSeconds(waitSeconds);
      return {
        ok: false,
        cooldownSeconds: waitSeconds,
        error:
          waitSeconds > 0
            ? `Username atau password salah. Terlalu banyak percobaan gagal, tunggu ${waitSeconds} detik.`
            : 'Username atau password salah.',
      };
    }

    try {
      const lookupSnap = await getDoc(doc(db, 'account_lookups', cleanUsername));
      if (!lookupSnap.exists()) {
        const { waitSeconds } = recordFailedAttempt();
        if (waitSeconds > 0) setCooldownSeconds(waitSeconds);
        return {
          ok: false,
          cooldownSeconds: waitSeconds,
          error:
            waitSeconds > 0
              ? `Username atau password salah. Terlalu banyak percobaan gagal, tunggu ${waitSeconds} detik.`
              : 'Username atau password salah.',
        };
      }

      const internalEmail = String(lookupSnap.data()?.internalEmail || '');
      if (!internalEmail) {
        const { waitSeconds } = recordFailedAttempt();
        if (waitSeconds > 0) setCooldownSeconds(waitSeconds);
        return {
          ok: false,
          cooldownSeconds: waitSeconds,
          error: 'Username atau password salah.',
        };
      }

      const cred = await signInWithEmailAndPassword(auth, internalEmail, password);
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));

      if (!userSnap.exists()) {
        // Kredensial lama yang sudah diganti admin saat reset password
        await signOut(auth).catch(() => {});
        const { waitSeconds } = recordFailedAttempt();
        if (waitSeconds > 0) setCooldownSeconds(waitSeconds);
        return {
          ok: false,
          cooldownSeconds: waitSeconds,
          error: 'Username atau password salah.',
        };
      }

      const userData = userSnap.data() as Record<string, unknown>;
      const loadedProfile = mapSnapshotToProfile(cred.user.uid, userData);

      if (loadedProfile.status !== 'Aktif') {
        await signOut(auth).catch(() => {});
        return {
          ok: false,
          error: 'Akun Anda sedang dinonaktifkan oleh admin sekolah. Hubungi admin untuk mengaktifkan kembali.',
        };
      }

      clearThrottle();
      setCooldownSeconds(0);

      // Catat waktu login terakhir
      updateDoc(doc(db, 'users', cred.user.uid), {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      // Sinkronkan password terverifikasi ke login_card_credentials agar Kartu Login tidak pernah kosong/tersembunyi
      if (password.length >= 6 && password.length <= 64) {
        const cardPayload: Record<string, unknown> = {
          uid: cred.user.uid,
          username: loadedProfile.username,
          name: loadedProfile.name.trim().slice(0, 120),
          role: loadedProfile.role,
          cardPassword: password,
          updatedBy: cred.user.uid,
          updatedAt: serverTimestamp(),
        };
        if (loadedProfile.classLabel?.trim()) {
          cardPayload.classLabel = loadedProfile.classLabel.trim().slice(0, 120);
        }
        setDoc(doc(db, 'login_card_credentials', cred.user.uid), cardPayload).catch(() => {});
        if (loadedProfile.role === 'admin') {
          saveStoredCredentials([
            {
              uid: cred.user.uid,
              name: loadedProfile.name.trim().slice(0, 120),
              username: loadedProfile.username,
              password,
              role: loadedProfile.role,
              classLabel: loadedProfile.classLabel,
              issuedAt: new Date().toISOString(),
            },
          ]);
        }
      }

      const updatedProfile: UserProfile = {
        ...loadedProfile,
        lastLoginAt: new Date().toISOString(),
      };
      setProfile(updatedProfile);
      setAuthMode('firebase');
      setLoading(false);
      return { ok: true };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        return {
          ok: false,
          needsEmailProviderEnable: true,
          error:
            'Metode login Email/Password belum diaktifkan di Firebase Console > Authentication > Sign-in method.',
        };
      }
      if (code === 'auth/too-many-requests') {
        setCooldownSeconds(60);
        writeThrottle({ failures: 8, lockedUntil: Date.now() + 60000 });
        return {
          ok: false,
          cooldownSeconds: 60,
          error: 'Terlalu banyak percobaan login gagal. Silakan tunggu 60 detik sebelum mencoba kembali.',
        };
      }

      const { waitSeconds } = recordFailedAttempt();
      if (waitSeconds > 0) setCooldownSeconds(waitSeconds);

      return {
        ok: false,
        cooldownSeconds: waitSeconds,
        error:
          waitSeconds > 0
            ? `Username atau password salah. Terlalu banyak percobaan gagal, tunggu ${waitSeconds} detik.`
            : 'Username atau password salah.',
      };
    }
  };

  const updateOwnProfileAvatar = async (avatarUrl: string) => {
    if (!firebaseUser || !profile) {
      throw new Error('Sesi pengguna tidak ditemukan. Silakan masuk ulang.');
    }
    if (profile.role === 'murid') {
      throw new Error('Unggah foto profil tersedia untuk akun Guru, Kepala Sekolah, dan Admin.');
    }
    const cleanUrl = avatarUrl.trim();
    if (cleanUrl.length > 118000) {
      throw new Error('Ukuran foto profil melebihi batas penyimpanan (maks ~115 KB).');
    }
    await updateDoc(doc(db, 'users', firebaseUser.uid), {
      avatarUrl: cleanUrl,
      updatedAt: serverTimestamp(),
    });
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            avatarUrl: cleanUrl || undefined,
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
  };

  const logout = async () => {
    if (firebaseUser) {
      await signOut(auth).catch(() => {});
    }
    setProfile(null);
    setAuthMode(null);
  };

  const isBootstrappedAdmin = profile?.role === 'admin' && profile?.status === 'Aktif';
  const effectiveRole: UserRole = profile?.role || 'murid';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        effectiveRole,
        authMode,
        loading,
        setupCompleted,
        checkingSetup,
        isBootstrappedAdmin,
        cooldownSeconds,
        loginWithUsername,
        setupFirstAdmin,
        updateOwnProfileAvatar,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
}
