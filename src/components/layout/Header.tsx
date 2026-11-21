import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Bell,
  Camera,
  ChevronDown,
  GraduationCap,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ROLE_LABELS } from '../../config/navigation';
import {
  ANIMATION_SPRINGS,
  createDropdownVariants,
  createTitleVariants,
  useAdaptiveMotion,
} from '../../config/animations';
import { resolveSchoolLogo } from '../../assets/branding';
import { PageRoute, PaketType } from '../../types/siakad';
import { InitialAvatar } from '../ui/InitialAvatar';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ProfilePhotoModal } from '../profile/ProfilePhotoModal';

interface HeaderProps {
  activeRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  globalSearch: string;
  onGlobalSearchChange: (val: string) => void;
}

const ROUTE_TITLES: Record<PageRoute, string> = {
  dashboard: 'Dasbor Akademik',
  students: 'Data Induk Murid',
  teachers: 'Data Guru & Tutor',
  subjects: 'Kurikulum & Mata Pelajaran',
  classes: 'Manajemen Kelas & Rombel',
  assignments: 'Penugasan & Jadwal Mengajar',
  'online-classes': 'Kelas Online Paket A, B & C',
  attendance: 'Presensi & Rekap Kehadiran',
  tasks: 'Tugas & Penugasan Belajar',
  grades: 'Penilaian & Rapor Akademik',
  generator: 'Generator Perangkat Ajar AI',
  'exam-generator': 'Generator Soal & Bank Soal',
  'online-exams': 'Ujian Online Warga Belajar',
  accounts: 'Manajemen Akun Guru & Murid',
  'school-settings': 'Pengaturan Identitas Lembaga',
  documents: 'Pusat Cetak Dokumen A4',
};

export const Header: React.FC<HeaderProps> = ({
  activeRoute,
  onNavigate,
  globalSearch,
  onGlobalSearchChange,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { profile, effectiveRole, logout } = useAuth();
  const {
    announcements,
    students,
    teachers,
    subjects,
    classes,
    assignments,
    tasks,
    taskSubmissions,
    schoolSettings,
    selectedProgram,
    setSelectedProgram,
  } = useData();

  const [showNotif, setShowNotif] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfilePhotoModal, setShowProfilePhotoModal] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);

  const motionProfile = useAdaptiveMotion();
  const titleVariants = useMemo(() => createTitleVariants(motionProfile), [motionProfile]);
  const dropdownVariants = useMemo(() => createDropdownVariants(motionProfile), [motionProfile]);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfileMenu(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchResults(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentStudent = useMemo(() => {
    if (effectiveRole !== 'murid') return null;
    return (
      students.find(
        (s) => s.id === profile?.linkedEntityId || s.nis === profile?.nis || s.ownerUid === profile?.uid
      ) ||
      students[0] ||
      null
    );
  }, [effectiveRole, students, profile]);

  const currentTeacher = useMemo(() => {
    if (effectiveRole !== 'guru') return null;
    return (
      teachers.find(
        (t) =>
          t.id === profile?.linkedEntityId ||
          t.ownerUid === profile?.uid ||
          (Boolean(profile?.nip) && t.nip === profile?.nip) ||
          (Boolean(profile?.email) && t.email === profile?.email)
      ) ||
      teachers[0] ||
      null
    );
  }, [effectiveRole, teachers, profile]);

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((a) => {
      if (effectiveRole === 'murid') return a.targetRole === 'Semua' || a.targetRole === 'Murid';
      if (effectiveRole === 'guru') return a.targetRole === 'Semua' || a.targetRole === 'Guru';
      return true;
    });
  }, [announcements, effectiveRole]);

  // Role-scoped Task Notifications inside the Bell Icon
  const taskNotifications = useMemo(() => {
    const items: Array<{
      id: string;
      badge: string;
      tone: 'emerald' | 'amber' | 'rose' | 'sky';
      title: string;
      detail: string;
      dateStr: string;
      route: PageRoute;
    }> = [];

    if (effectiveRole === 'murid' && currentStudent) {
      const classAssignments = assignments.filter((a) => a.classId === currentStudent.classId);
      const validClassTasks = tasks.filter((t) => {
        if (t.classId !== currentStudent.classId) return false;
        if (classAssignments.length === 0) return true;
        return (
          classAssignments.some((a) => a.subjectId === t.subjectId) ||
          subjects.some((s) => s.id === t.subjectId && s.paket === currentStudent.paket)
        );
      });

      validClassTasks.forEach((t) => {
        const sub = taskSubmissions.find((s) => s.taskId === t.id && s.studentId === currentStudent.id);
        if (!sub) {
          items.push({
            id: `notif_task_new_${t.id}`,
            badge: 'Tugas Baru',
            tone: 'amber',
            title: t.title,
            detail: `${t.subjectName} · Tenggat ${new Date(t.dueAt).toLocaleDateString('id-ID')}`,
            dateStr: t.createdAt,
            route: 'tasks',
          });
        } else if (sub.status === 'Revisi') {
          items.push({
            id: `notif_task_rev_${sub.id}`,
            badge: 'Perlu Revisi',
            tone: 'rose',
            title: t.title,
            detail: sub.feedback || 'Dikembalikan guru untuk perbaikan jawaban.',
            dateStr: sub.updatedAt,
            route: 'tasks',
          });
        } else if (sub.status === 'Sudah Dinilai') {
          items.push({
            id: `notif_task_grd_${sub.id}`,
            badge: `Nilai: ${sub.score}`,
            tone: 'emerald',
            title: t.title,
            detail: `Dinilai oleh ${sub.gradedBy || t.teacherName}`,
            dateStr: sub.gradedAt || sub.updatedAt,
            route: 'tasks',
          });
        }
      });
    } else if (effectiveRole === 'guru' && currentTeacher) {
      const myTasks = tasks.filter(
        (t) => t.teacherId === currentTeacher.id || t.teacherUid === currentTeacher.ownerUid
      );
      const myTaskIds = new Set(myTasks.map((t) => t.id));
      taskSubmissions
        .filter((s) => myTaskIds.has(s.taskId) && (s.status === 'Terkumpul' || s.status === 'Terlambat'))
        .forEach((sub) => {
          items.push({
            id: `notif_sub_${sub.id}`,
            badge: sub.status === 'Terlambat' ? 'Kumpul Terlambat' : 'Perlu Dinilai',
            tone: sub.status === 'Terlambat' ? 'amber' : 'sky',
            title: `${sub.studentName} mengumpulkan tugas`,
            detail: `${sub.taskTitle} (${sub.className})`,
            dateStr: sub.submittedAt,
            route: 'tasks',
          });
        });
    } else {
      // Admin / Kepala PKBM sees latest tasks & pending reviews summary
      tasks.slice(0, 3).forEach((t) => {
        items.push({
          id: `notif_adm_task_${t.id}`,
          badge: t.subjectName,
          tone: 'emerald',
          title: t.title,
          detail: `${t.className} · Guru: ${t.teacherName}`,
          dateStr: t.createdAt,
          route: 'tasks',
        });
      });
    }

    return items.sort((a, b) => b.dateStr.localeCompare(a.dateStr)).slice(0, 5);
  }, [effectiveRole, currentStudent, currentTeacher, assignments, subjects, tasks, taskSubmissions]);

  const allNotificationIds = useMemo(
    () => [...taskNotifications.map((n) => n.id), ...visibleAnnouncements.map((a) => a.id)],
    [taskNotifications, visibleAnnouncements]
  );

  const unreadCount = allNotificationIds.filter((id) => !readIds.includes(id)).length;

  const quickResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const results: Array<{ label: string; sub: string; route: PageRoute }> = [];
    const activeProgram = effectiveRole === 'murid' ? 'Semua' : selectedProgram;

    const teacherIdsForProgram = new Set<string>();
    const teacherUidsForProgram = new Set<string>();
    const teacherNamesForProgram = new Set<string>();
    if (activeProgram !== 'Semua') {
      assignments
        .filter((a) => a.paket === activeProgram)
        .forEach((a) => {
          if (a.teacherId) teacherIdsForProgram.add(a.teacherId);
          if (a.teacherUid) teacherUidsForProgram.add(a.teacherUid);
          if (a.teacherName) teacherNamesForProgram.add(a.teacherName.trim().toLowerCase());
        });
      classes
        .filter((c) => c.paket === activeProgram)
        .forEach((c) => {
          if (c.homeroomTeacherId) teacherIdsForProgram.add(c.homeroomTeacherId);
          if (c.homeroomTeacherName)
            teacherNamesForProgram.add(c.homeroomTeacherName.trim().toLowerCase());
        });
    }

    if (effectiveRole !== 'murid') {
      students
        .filter((s) => {
          if (activeProgram !== 'Semua' && s.paket !== activeProgram) return false;
          return s.fullName.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
        })
        .slice(0, 3)
        .forEach((s) =>
          results.push({ label: s.fullName, sub: `Murid · ${s.nis} · ${s.paket}`, route: 'students' })
        );
    }
    tasks
      .filter((t) => {
        if (effectiveRole === 'murid' && currentStudent && t.classId !== currentStudent.classId) {
          return false;
        }
        if (activeProgram !== 'Semua' && t.paket !== activeProgram) {
          return false;
        }
        return (
          t.title.toLowerCase().includes(q) ||
          t.subjectName.toLowerCase().includes(q) ||
          t.className.toLowerCase().includes(q)
        );
      })
      .slice(0, 2)
      .forEach((t) =>
        results.push({ label: t.title, sub: `Tugas · ${t.subjectName} · ${t.className}`, route: 'tasks' })
      );
    if (effectiveRole === 'admin' || effectiveRole === 'kepala_pkbm') {
      teachers
        .filter((t) => {
          if (
            activeProgram !== 'Semua' &&
            !teacherIdsForProgram.has(t.id) &&
            !(t.ownerUid && teacherUidsForProgram.has(t.ownerUid)) &&
            !teacherNamesForProgram.has(t.fullName.trim().toLowerCase())
          ) {
            return false;
          }
          return t.fullName.toLowerCase().includes(q) || t.specialization.toLowerCase().includes(q);
        })
        .slice(0, 2)
        .forEach((t) =>
          results.push({ label: t.fullName, sub: `Guru · ${t.specialization}`, route: 'teachers' })
        );
      subjects
        .filter((m) => {
          if (activeProgram !== 'Semua' && m.paket !== activeProgram) return false;
          return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
        })
        .slice(0, 2)
        .forEach((m) =>
          results.push({ label: m.name, sub: `Mapel · ${m.code} · ${m.paket}`, route: 'subjects' })
        );
    }
    return results;
  }, [
    globalSearch,
    effectiveRole,
    selectedProgram,
    students,
    teachers,
    subjects,
    classes,
    assignments,
    tasks,
    currentStudent,
  ]);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7]/85 dark:bg-[#0B1110]/85 backdrop-blur-md">
      <div className="h-16 md:h-[72px] px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-3 md:gap-6">
      {/* Left: Mobile Logo + Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="md:hidden w-9 h-9 rounded-xl overflow-hidden border border-emerald-500/25 bg-white shrink-0 p-0.5 flex items-center justify-center">
          <img
            src={resolveSchoolLogo(schoolSettings.logoUrl)}
            alt="Logo PKBM Annur Karisma"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="min-w-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRoute}
              variants={titleVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <h1 className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white truncate">
                {ROUTE_TITLES[activeRoute]}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">
                TA {schoolSettings.academicYear} · Semester {schoolSettings.semester}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Center: Global Search */}
      <div ref={searchRef} className="hidden md:block relative flex-1 max-w-md">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={globalSearch}
            onChange={(e) => {
              onGlobalSearchChange(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => setShowSearchResults(true)}
            placeholder="Cari murid, NIS, guru, atau mata pelajaran..."
            aria-label="Pencarian global SIAKAD"
            className="w-full h-11 pl-10 pr-9 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-shadow"
          />
          {globalSearch && (
            <button
              type="button"
              onClick={() => onGlobalSearchChange('')}
              aria-label="Bersihkan pencarian"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {showSearchResults && quickResults.length > 0 && (
            <motion.div
              variants={dropdownVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ transformOrigin: 'top center' }}
              className="absolute left-0 right-0 mt-2 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl p-2 z-50"
            >
              <p className="px-3 py-1 text-[11px] font-semibold text-slate-400">
                Hasil Cepat
              </p>
              {quickResults.map((res, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onNavigate(res.route);
                    setShowSearchResults(false);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors flex flex-col justify-center"
                >
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {res.label}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{res.sub}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Global Program / Rombel Selector (Desktop & Tablet) */}
        {effectiveRole !== 'murid' && (
          <div className="hidden sm:flex items-center">
            <div
              className={`relative flex items-center h-11 rounded-xl border transition-colors ${
                selectedProgram !== 'Semua'
                  ? 'border-emerald-500/45 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
              }`}
            >
              <GraduationCap className="w-4 h-4 ml-3 shrink-0 text-emerald-600 dark:text-emerald-400 pointer-events-none" />
              <select
                aria-label="Filter Program Rombel Global"
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value as 'Semua' | PaketType)}
                className="h-full pl-2 pr-7 bg-transparent text-xs font-bold focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Semua" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  Semua Program
                </option>
                <option value="Paket A" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  Paket A (Kls 6)
                </option>
                <option value="Paket B" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  Paket B (Kls 7–9)
                </option>
                <option value="Paket C" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  Paket C (Kls 10–12)
                </option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 right-2.5 absolute pointer-events-none opacity-65" />
            </div>
          </div>
        )}

        {/* Mobile Search Toggle */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen((prev) => !prev)}
          aria-label={mobileSearchOpen ? 'Tutup pencarian' : 'Buka pencarian'}
          className="md:hidden min-h-[44px] min-w-[44px] rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors"
        >
          {mobileSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>

        {/* Pasang Aplikasi HP (PWA) */}
        <PWAInstallButton variant="header" logoUrl={schoolSettings.logoUrl} />

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setShowNotif((prev) => !prev)}
            aria-label="Notifikasi dan pengumuman"
            className="relative min-h-[44px] min-w-[44px] rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotif && (
              <motion.div
                variants={dropdownVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ transformOrigin: 'top right' }}
                className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-[70px] sm:top-auto sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl p-4 z-50"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                    Notifikasi Tugas & Pengumuman
                  </span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setReadIds(allNotificationIds)}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Tandai semua dibaca
                    </button>
                  )}
                </div>

                <div className="mt-2 max-h-80 overflow-y-auto space-y-3 pr-1">
                  {taskNotifications.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Aktivitas Tugas
                      </p>
                      <div className="space-y-1.5">
                        {taskNotifications.map((tn) => (
                          <button
                            key={tn.id}
                            type="button"
                            onClick={() => {
                              setReadIds((prev) => Array.from(new Set([...prev, tn.id])));
                              setShowNotif(false);
                              onNavigate(tn.route);
                            }}
                            className="w-full text-left p-2.5 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-100 dark:border-slate-800 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`font-bold ${
                                  tn.tone === 'rose'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : tn.tone === 'amber'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : tn.tone === 'sky'
                                        ? 'text-sky-700 dark:text-sky-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {tn.badge}
                              </span>
                              <span className="text-slate-400">
                                {new Date(tn.dateStr).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                              {tn.title}
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                              {tn.detail}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Pengumuman Sekolah
                    </p>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visibleAnnouncements.slice(0, 4).map((ann) => (
                        <div key={ann.id} className="py-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {ann.category}
                            </span>
                            <span>{new Date(ann.publishedAt).toLocaleDateString('id-ID')}</span>
                          </div>
                          <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {ann.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                            {ann.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme Toggle with Rotating Sun/Moon */}
        <motion.button
          type="button"
          data-no-lift
          onClick={toggleTheme}
          whileTap={motionProfile.reducedMotion ? undefined : { scale: 0.93 }}
          aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          className="min-h-[44px] min-w-[44px] rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex items-center justify-center text-slate-700 dark:text-amber-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 overflow-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            {theme === 'dark' ? (
              <motion.span
                key="theme-sun"
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
                key="theme-moon"
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

        {/* User Profile */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="min-h-[44px] pl-1.5 pr-2.5 py-1 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex items-center gap-2.5 hover:bg-emerald-50/70 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <InitialAvatar name={profile?.name || 'AK'} src={profile?.avatarUrl} size="sm" />
            <div className="hidden lg:block text-left max-w-[140px]">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {profile?.name || 'Pengguna'}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                {ROLE_LABELS[effectiveRole]}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          <AnimatePresence>
            {showProfileMenu && (
              <motion.div
                variants={dropdownVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ transformOrigin: 'top right' }}
                className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl p-3 z-50"
              >
                <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <InitialAvatar name={profile?.name || 'AK'} src={profile?.avatarUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {profile?.name}
                    </p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                      @{profile?.username}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{ROLE_LABELS[effectiveRole]} · Aktif</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 space-y-1">
                  {effectiveRole !== 'murid' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowProfilePhotoModal(true);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-2.5 transition-colors"
                    >
                      <Camera className="w-4 h-4 shrink-0" />
                      <span>{profile?.avatarUrl ? 'Ganti Foto Profil' : 'Unggah Foto Profil'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar dari SIAKAD</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>

      {/* Mobile Global Program / Rombel Bar */}
      {effectiveRole !== 'murid' && (
        <div className="sm:hidden px-4 pb-2.5 pt-1.5 flex items-center justify-between gap-2 border-t border-emerald-950/5 dark:border-white/5">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Program Rombel:</span>
          </span>
          <div className="relative flex-1 max-w-[200px]">
            <select
              aria-label="Filter Program Rombel Global Mobile"
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value as 'Semua' | PaketType)}
              className={`w-full h-9 pl-3 pr-7 rounded-lg border text-xs font-bold appearance-none cursor-pointer ${
                selectedProgram !== 'Semua'
                  ? 'border-emerald-500/45 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
              }`}
            >
              <option value="Semua">Semua Program</option>
              <option value="Paket A">Paket A (Kelas 6)</option>
              <option value="Paket B">Paket B (Kelas 7–9)</option>
              <option value="Paket C">Paket C (Kelas 10–12)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 right-2.5 top-1/2 -translate-y-1/2 absolute pointer-events-none opacity-65" />
          </div>
        </div>
      )}

      {/* Expandable Mobile Global Search */}
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden border-t border-emerald-950/10 dark:border-white/10 px-4 py-3 bg-white/95 dark:bg-slate-900/95"
          >
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => onGlobalSearchChange(e.target.value)}
                placeholder="Cari murid, NIS, guru, atau mapel..."
                aria-label="Pencarian cepat SIAKAD seluler"
                className="w-full min-h-[44px] pl-10 pr-9 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => onGlobalSearchChange('')}
                  aria-label="Bersihkan pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {quickResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                {quickResults.map((res, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onNavigate(res.route);
                      setMobileSearchOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left bg-[#FAFAF7] dark:bg-slate-800/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex flex-col justify-center"
                  >
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {res.label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{res.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Unggah / Ganti Foto Profil untuk Guru, Kepala Sekolah, dan Admin */}
      <ProfilePhotoModal
        isOpen={showProfilePhotoModal}
        onClose={() => setShowProfilePhotoModal(false)}
      />
    </header>
  );
};
