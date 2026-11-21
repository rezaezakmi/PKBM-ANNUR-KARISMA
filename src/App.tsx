import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { getNavItemsForRole } from './config/navigation';
import {
  ANIMATION_DURATIONS,
  createPageVariants,
  scaledDuration,
  useAdaptiveMotion,
} from './config/animations';
import { resolveSchoolLogo } from './assets/branding';
import { PageRoute } from './types/siakad';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { NotFoundPage } from './components/ui/NotFoundPage';
import { DashboardSkeleton } from './components/ui/SkeletonLoader';
import { TopProgressBar, WelcomeSplashScreen } from './components/ui/MotionPrimitives';
import { LoginPage } from './components/auth/LoginPage';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { DashboardView } from './components/dashboard/DashboardView';
import { MasterDataView } from './components/master/MasterDataView';
import { SchoolSettingsView } from './components/settings/SchoolSettingsView';
import { DocumentsView } from './components/documents/A4DocumentPrinter';
import { PerangkatAjarView } from './components/perangkat-ajar/PerangkatAjarView';
import { GeneratorSoalView } from './components/ujian/GeneratorSoalView';
import { StudentOnlineExamsView } from './components/ujian/StudentOnlineExamsView';
import { PresensiView } from './components/presensi/PresensiView';
import { TugasView } from './components/tugas/TugasView';
import { PenilaianRaporView } from './components/penilaian/PenilaianRaporView';
import { ManajemenAkunView } from './components/accounts/ManajemenAkunView';
import { KelasOnlineView } from './components/kelas-online/KelasOnlineView';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';

const VALID_ROUTES: ReadonlySet<PageRoute> = new Set<PageRoute>([
  'dashboard',
  'students',
  'teachers',
  'subjects',
  'classes',
  'assignments',
  'online-classes',
  'attendance',
  'tasks',
  'grades',
  'generator',
  'exam-generator',
  'online-exams',
  'accounts',
  'school-settings',
  'documents',
]);

function parsePathname(pathname: string): { route: PageRoute; notFoundPath: string | null } {
  const cleaned = pathname.replace(/\/+$/, '') || '/';
  if (cleaned === '/' || cleaned === '/dashboard') {
    return { route: 'dashboard', notFoundPath: null };
  }
  const slug = cleaned.replace(/^\//, '') as PageRoute;
  if (VALID_ROUTES.has(slug)) {
    return { route: slug, notFoundPath: null };
  }
  return { route: 'dashboard', notFoundPath: cleaned };
}

const AuthenticatedWorkspace: React.FC = () => {
  const { profile, effectiveRole, firebaseUser, loading, logout } = useAuth();
  const {
    loading: dataLoading,
    schoolSettings,
    onlineClasses,
    tasks,
    students,
  } = useData();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();
  const initialParsed = useMemo(() => parsePathname(window.location.pathname), []);

  const [activeRoute, setActiveRoute] = useState<PageRoute>(initialParsed.route);
  const [notFoundPath, setNotFoundPath] = useState<string | null>(initialParsed.notFoundPath);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [navProgressActive, setNavProgressActive] = useState(false);

  // Brief (< 1s) welcome transition screen right after interactive login
  const prevAuthStateRef = useRef<'init' | 'guest' | 'authed'>('init');
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(false);

  // Baseline refs untuk notifikasi penugasan baru di Kelas Online
  const onlineClassBaselineRef = useRef<{
    uid: string | null;
    initialized: boolean;
    sessions: Map<string, { status: string; materialIds: Set<string> }>;
    taskIds: Set<string>;
  }>({
    uid: null,
    initialized: false,
    sessions: new Map(),
    taskIds: new Set(),
  });

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      prevAuthStateRef.current = 'guest';
      setShowWelcomeSplash(false);
      return;
    }
    if (prevAuthStateRef.current === 'guest') {
      setShowWelcomeSplash(true);
      const timer = window.setTimeout(() => {
        setShowWelcomeSplash(false);
      }, ANIMATION_DURATIONS.welcomeSplashMs);
      prevAuthStateRef.current = 'authed';
      return () => window.clearTimeout(timer);
    }
    prevAuthStateRef.current = 'authed';
  }, [loading, profile]);

  const allowedRoutes = useMemo(
    () => new Set(getNavItemsForRole(effectiveRole).map((item) => item.id)),
    [effectiveRole]
  );

  const navigateTo = useCallback((route: PageRoute) => {
    setNotFoundPath(null);
    setActiveRoute(route);
    setNavProgressActive(true);
    window.setTimeout(() => setNavProgressActive(false), 380);
    const targetPath = route === 'dashboard' ? '/' : `/${route}`;
    if (window.location.pathname !== targetPath) {
      try {
        window.history.pushState({ route }, '', targetPath);
      } catch {
        // Ignore history pushState restriction in sandboxed environments
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Notifikasi Toast real-time saat ada penugasan / modul / sesi baru di Kelas Online
  useEffect(() => {
    const activeUid = firebaseUser?.uid || profile?.uid || null;
    if (!activeUid || !profile || dataLoading) {
      if (!activeUid) {
        onlineClassBaselineRef.current = {
          uid: null,
          initialized: false,
          sessions: new Map(),
          taskIds: new Set(),
        };
      }
      return;
    }

    const storageKey = `siakad_seen_online_assignments_v1_${activeUid}`;
    const currentStudent =
      effectiveRole === 'murid'
        ? students.find(
            (s) =>
              s.ownerUid === activeUid ||
              (profile.linkedEntityId && s.id === profile.linkedEntityId)
          ) || null
        : null;

    const isRelevantOnlineClass = (oc: (typeof onlineClasses)[number]) => {
      if (!oc.isPublished) return false;
      if (effectiveRole !== 'murid' || !currentStudent) return true;
      return oc.paket === currentStudent.paket || oc.classId === currentStudent.classId;
    };

    const isRelevantTask = (t: (typeof tasks)[number]) => {
      if (effectiveRole !== 'murid' || !currentStudent) return true;
      return t.paket === currentStudent.paket || t.classId === currentStudent.classId;
    };

    const relevantSessions = onlineClasses.filter(isRelevantOnlineClass);
    const relevantTasks = tasks.filter(isRelevantTask);

    const persistSeenSnapshot = () => {
      try {
        const payload = {
          sessionIds: relevantSessions.map((s) => s.id),
          materialKeys: relevantSessions.flatMap((s) => s.materials.map((m) => `${s.id}:${m.id}`)),
          taskIds: relevantTasks.map((t) => t.id),
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors
      }
    };

    // Inisialisasi baseline per sesi akun (cek juga penugasan baru sejak login terakhir)
    if (!onlineClassBaselineRef.current.initialized || onlineClassBaselineRef.current.uid !== activeUid) {
      const nextSessions = new Map<string, { status: string; materialIds: Set<string> }>();
      relevantSessions.forEach((s) => {
        nextSessions.set(s.id, {
          status: s.status,
          materialIds: new Set(s.materials.map((m) => m.id)),
        });
      });

      let savedSeen: { sessionIds?: string[]; materialKeys?: string[]; taskIds?: string[] } | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) savedSeen = JSON.parse(raw);
      } catch {
        savedSeen = null;
      }

      onlineClassBaselineRef.current = {
        uid: activeUid,
        initialized: true,
        sessions: nextSessions,
        taskIds: new Set(relevantTasks.map((t) => t.id)),
      };

      // Jika pengguna pernah login sebelumnya dan ada penugasan baru saat offline, tampilkan 1 ringkasan toast
      if (savedSeen && Array.isArray(savedSeen.sessionIds)) {
        const seenSessionSet = new Set(savedSeen.sessionIds);
        const seenMaterialSet = new Set(savedSeen.materialKeys || []);
        const unseenSessions = relevantSessions.filter((s) => !seenSessionSet.has(s.id));
        const unseenLkpd = relevantSessions.flatMap((s) =>
          s.materials
            .filter((m) => !seenMaterialSet.has(`${s.id}:${m.id}`) && m.type === 'LKPD / Latihan')
            .map((m) => ({ session: s, material: m }))
        );

        if (unseenSessions.length > 0) {
          const latest = unseenSessions[0];
          showToast(
            'Penugasan Baru di Kelas Online',
            'info',
            unseenSessions.length === 1
              ? `${latest.paket} · ${latest.subjectName}: "${latest.title}" telah tersedia.`
              : `Terdapat ${unseenSessions.length} sesi kelas online baru termasuk ${latest.paket} (${latest.subjectName}).`,
            {
              actionLabel: 'Buka Kelas Online',
              onAction: () => navigateTo('online-classes'),
              durationMs: 6000,
            }
          );
        } else if (unseenLkpd.length > 0) {
          const latest = unseenLkpd[0];
          showToast(
            'LKPD / Penugasan Baru di Kelas Online',
            'info',
            `${latest.session.paket} · ${latest.session.subjectName}: "${latest.material.title}".`,
            {
              actionLabel: 'Buka Kelas Online',
              onAction: () => navigateTo('online-classes'),
              durationMs: 6000,
            }
          );
        }
      }

      persistSeenSnapshot();
      return;
    }

    // Deteksi perubahan real-time saat aplikasi sedang terbuka
    const prevSessions = onlineClassBaselineRef.current.sessions;
    const prevTaskIds = onlineClassBaselineRef.current.taskIds;
    let hasChanges = false;

    for (const session of relevantSessions) {
      const prev = prevSessions.get(session.id);

      if (!prev) {
        hasChanges = true;
        const lkpdCount = session.materials.filter((m) => m.type === 'LKPD / Latihan').length;
        showToast(
          'Penugasan Baru di Kelas Online',
          'info',
          `${session.paket} · ${session.subjectName}: "${session.title}" (${
            lkpdCount > 0 ? `${lkpdCount} LKPD/Latihan` : `${session.materials.length} modul belajar`
          }).`,
          {
            actionLabel: 'Buka Kelas Online',
            onAction: () => navigateTo('online-classes'),
            durationMs: 6000,
          }
        );
      } else {
        const addedMaterials = session.materials.filter((m) => !prev.materialIds.has(m.id));
        if (addedMaterials.length > 0) {
          hasChanges = true;
          const firstAdded = addedMaterials[0];
          const isLkpd = addedMaterials.some((m) => m.type === 'LKPD / Latihan');
          showToast(
            isLkpd ? 'LKPD / Penugasan Baru di Kelas Online' : 'Modul Baru di Kelas Online',
            'info',
            `${session.paket} · ${session.subjectName}: "${firstAdded.title}" pada sesi ${session.title}.`,
            {
              actionLabel: 'Lihat Materi',
              onAction: () => navigateTo('online-classes'),
              durationMs: 6000,
            }
          );
        } else if (prev.status !== 'Live' && session.status === 'Live') {
          hasChanges = true;
          showToast(
            'Kelas Online Sedang Live!',
            'warning',
            `${session.paket} · ${session.subjectName} bersama ${session.teacherName} telah dimulai.`,
            {
              actionLabel: 'Masuk Kelas',
              onAction: () => navigateTo('online-classes'),
              durationMs: 6000,
            }
          );
        }
      }
    }

    for (const task of relevantTasks) {
      if (!prevTaskIds.has(task.id)) {
        hasChanges = true;
        const isOnlineTask = task.deliveryMode === 'online' || Boolean(task.onlineClassId);
        showToast(
          isOnlineTask ? 'Tugas Baru di Kelas Online' : 'Penugasan Baru Pembelajaran',
          'info',
          isOnlineTask
            ? `${task.paket} · ${task.onlineClassTitle || task.subjectName}: "${task.title}".`
            : `${task.paket} · ${task.subjectName} (${task.className}): "${task.title}".`,
          {
            actionLabel: 'Buka Tugas',
            onAction: () => navigateTo('tasks'),
            durationMs: 6000,
          }
        );
      }
    }

    // Perbarui baseline snapshot
    const updatedSessions = new Map<string, { status: string; materialIds: Set<string> }>();
    relevantSessions.forEach((s) => {
      updatedSessions.set(s.id, {
        status: s.status,
        materialIds: new Set(s.materials.map((m) => m.id)),
      });
    });
    onlineClassBaselineRef.current.sessions = updatedSessions;
    onlineClassBaselineRef.current.taskIds = new Set(relevantTasks.map((t) => t.id));

    if (hasChanges) {
      persistSeenSnapshot();
    }
  }, [
    dataLoading,
    effectiveRole,
    firebaseUser?.uid,
    navigateTo,
    onlineClasses,
    profile,
    showToast,
    students,
    tasks,
  ]);

  // Sync browser back / forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parsePathname(window.location.pathname);
      setActiveRoute(parsed.route);
      setNotFoundPath(parsed.notFoundPath);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pageVariants = useMemo(() => createPageVariants(motionProfile), [motionProfile]);

  const authViewKey = loading
    ? 'auth-loading'
    : !profile
      ? 'auth-login'
      : showWelcomeSplash
        ? 'auth-welcome'
        : 'auth-workspace';

  const isForbiddenRoute = !notFoundPath && !allowedRoutes.has(activeRoute);

  const renderPageContent = () => {
    if (notFoundPath) {
      return (
        <NotFoundPage
          mode="not-found"
          attemptedPath={notFoundPath}
          role={effectiveRole}
          onNavigateDashboard={() => navigateTo('dashboard')}
          onNavigateRoute={navigateTo}
        />
      );
    }

    if (isForbiddenRoute) {
      return (
        <NotFoundPage
          mode="forbidden"
          attemptedPath={`/${activeRoute}`}
          role={effectiveRole}
          onNavigateDashboard={() => navigateTo('dashboard')}
          onNavigateRoute={navigateTo}
        />
      );
    }

    switch (activeRoute) {
      case 'dashboard':
        return <DashboardView onNavigate={navigateTo} />;
      case 'students':
      case 'teachers':
      case 'subjects':
      case 'classes':
      case 'assignments':
        return <MasterDataView entityType={activeRoute} globalSearch={globalSearch} />;
      case 'online-classes':
        return <KelasOnlineView onNavigate={navigateTo} />;
      case 'attendance':
        return <PresensiView />;
      case 'tasks':
        return <TugasView />;
      case 'grades':
        return <PenilaianRaporView />;
      case 'generator':
        return <PerangkatAjarView />;
      case 'exam-generator':
        return <GeneratorSoalView />;
      case 'online-exams':
        return <StudentOnlineExamsView />;
      case 'accounts':
        return <ManajemenAkunView />;
      case 'school-settings':
        return <SchoolSettingsView />;
      case 'documents':
        return <DocumentsView />;
      default:
        return (
          <NotFoundPage
            mode="not-found"
            role={effectiveRole}
            onNavigateDashboard={() => navigateTo('dashboard')}
            onNavigateRoute={navigateTo}
          />
        );
    }
  };

  const viewKey = notFoundPath
    ? `not_found_${notFoundPath}`
    : isForbiddenRoute
      ? `forbidden_${activeRoute}_${effectiveRole}`
      : `${activeRoute}_${effectiveRole}`;

  return (
    <>
      <TopProgressBar active={loading || dataLoading || navProgressActive} />
      <OfflineIndicator />

      <AnimatePresence mode="wait">
        {authViewKey === 'auth-loading' && (
          <motion.div
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scaledDuration(0.2) }}
            className="min-h-screen p-4 sm:p-8 lg:p-10 bg-[#FAFAF7] dark:bg-[#0B1110]"
          >
            <div className="max-w-7xl mx-auto">
              <DashboardSkeleton />
            </div>
          </motion.div>
        )}

        {authViewKey === 'auth-login' && (
          <motion.div
            key="auth-login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scaledDuration(0.28) }}
          >
            <LoginPage />
          </motion.div>
        )}

        {authViewKey === 'auth-welcome' && profile && (
          <WelcomeSplashScreen
            key="auth-welcome"
            userName={profile.name || profile.username}
            schoolName={schoolSettings.schoolName || 'PKBM ANNUR KARISMA'}
            logoUrl={resolveSchoolLogo(schoolSettings.logoUrl)}
          />
        )}

        {authViewKey === 'auth-workspace' && profile && (
          <motion.div
            key="auth-workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scaledDuration(0.25) }}
            className="min-h-screen flex bg-[#FAFAF7] dark:bg-[#0B1110] text-[#1F2937] dark:text-[#F3F4F6]"
          >
            <Sidebar
              activeRoute={notFoundPath ? 'dashboard' : activeRoute}
              onNavigate={navigateTo}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              role={effectiveRole}
              onLogout={logout}
            />

            <div className="flex-1 min-w-0 flex flex-col">
              <Header
                activeRoute={activeRoute}
                onNavigate={navigateTo}
                globalSearch={globalSearch}
                onGlobalSearchChange={setGlobalSearch}
              />

              <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-10 max-w-[1440px] w-full mx-auto overflow-x-clip">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={viewKey}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {renderPageContent()}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>

            <BottomNav
              activeRoute={notFoundPath ? 'dashboard' : activeRoute}
              onNavigate={navigateTo}
              role={effectiveRole}
              onLogout={logout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <DataProvider>
                <AuthenticatedWorkspace />
              </DataProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
