import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Camera,
  ClipboardList,
  FileQuestion,
  FileText,
  GraduationCap,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Pin,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { ATTENDANCE_MONTHLY_SERIES } from '../../data/seedData';
import { ROLE_LABELS } from '../../config/navigation';
import { Announcement, PageRoute, PaketType } from '../../types/siakad';
import { resolveStudentPlacement } from '../../utils/excelUtils';
import { CountUpNumber } from '../ui/CountUpNumber';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { InitialAvatar } from '../ui/InitialAvatar';
import { MotionModal } from '../ui/MotionPrimitives';
import { DashboardSkeleton } from '../ui/SkeletonLoader';
import { ProfilePhotoModal } from '../profile/ProfilePhotoModal';
import { ActivityPhotoShowcase } from '../gallery/ActivityPhotoShowcase';
import { ActivityPhotoManagerModal } from '../gallery/ActivityPhotoManagerModal';
import {
  ANIMATION_DURATIONS,
  ANIMATION_EASE,
  getStaggerItemProps,
  scaledDuration,
  useAdaptiveMotion,
} from '../../config/animations';
import { JenjangFilterDropdown } from './JenjangFilterDropdown';
import { StudentPaketRecapSection } from './StudentPaketRecapSection';
import { StudentAssistantChatbot } from './StudentAssistantChatbot';

interface DashboardViewProps {
  onNavigate: (route: PageRoute) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { profile, effectiveRole } = useAuth();
  const {
    schoolSettings,
    students,
    teachers,
    subjects,
    classes,
    assignments,
    announcements,
    attendanceSessions,
    activityGalleryPhotos,
    loading,
    selectedProgram,
    setSelectedProgram,
    addAnnouncement,
    deleteAnnouncement,
  } = useData();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();

  const [showAddAnn, setShowAddAnn] = useState(false);
  const [showProfilePhotoModal, setShowProfilePhotoModal] = useState(false);
  const [showGalleryManager, setShowGalleryManager] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annCategory, setAnnCategory] = useState<Announcement['category']>('Akademik');
  const [annTarget, setAnnTarget] = useState<Announcement['targetRole']>('Semua');
  const [annPinned, setAnnPinned] = useState(false);
  const [deleteAnnId, setDeleteAnnId] = useState<string | null>(null);
  const assistantInputRef = useRef<HTMLInputElement | null>(null);

  const handleFocusAssistant = () => {
    const el = document.getElementById('dashboard-student-assistant');
    if (el) {
      el.scrollIntoView({ behavior: motionProfile.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
    setTimeout(() => {
      assistantInputRef.current?.focus();
    }, 220);
  };

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }, []);

  // Strict Role Scoping
  const currentStudent = useMemo(() => {
    if (effectiveRole !== 'murid') return null;
    return (
      students.find((s) => s.id === profile?.linkedEntityId || s.nis === profile?.nis) ||
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

  const scopedAssignments = useMemo(() => {
    if (effectiveRole === 'guru' && currentTeacher) {
      return assignments.filter(
        (a) => a.teacherId === currentTeacher.id || a.teacherUid === currentTeacher.ownerUid
      );
    }
    if (effectiveRole === 'murid' && currentStudent) {
      return assignments.filter((a) => a.classId === currentStudent.classId);
    }
    return assignments;
  }, [effectiveRole, assignments, currentTeacher, currentStudent]);

  const scopedStudents = useMemo(() => {
    if (effectiveRole === 'murid') {
      return currentStudent ? [currentStudent] : [];
    }
    if (effectiveRole === 'guru') {
      const classIds = new Set(scopedAssignments.map((a) => a.classId));
      return students.filter((s) => classIds.has(s.classId));
    }
    return students;
  }, [effectiveRole, students, currentStudent, scopedAssignments]);

  const visibleAnnouncements = useMemo(() => {
    return announcements
      .filter((a) => {
        if (effectiveRole === 'murid') return a.targetRole === 'Semua' || a.targetRole === 'Murid';
        if (effectiveRole === 'guru') return a.targetRole === 'Semua' || a.targetRole === 'Guru';
        return true;
      })
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  }, [announcements, effectiveRole]);

  const paketStudentCounts = useMemo(() => {
    const counts = {
      all: students.length,
      'Paket A': 0,
      'Paket B': 0,
      'Paket C': 0,
    };
    students.forEach((s) => {
      const placed = resolveStudentPlacement(s, classes);
      counts[placed.paket] += 1;
    });
    return counts;
  }, [students, classes]);

  const paketChartData = useMemo(() => {
    return [
      { paket: 'Paket A' as PaketType, jumlah: paketStudentCounts['Paket A'], fill: '#10B981' },
      { paket: 'Paket B' as PaketType, jumlah: paketStudentCounts['Paket B'], fill: '#0F766E' },
      { paket: 'Paket C' as PaketType, jumlah: paketStudentCounts['Paket C'], fill: '#D4A017' },
    ];
  }, [paketStudentCounts]);

  const activeAttendanceLine = useMemo(() => {
    if (selectedProgram === 'Paket A') {
      return { dataKey: 'paketA', label: 'Paket A', color: '#10B981', dotClass: 'bg-emerald-500' };
    }
    if (selectedProgram === 'Paket B') {
      return { dataKey: 'paketB', label: 'Paket B', color: '#0F766E', dotClass: 'bg-teal-700' };
    }
    return { dataKey: 'paketC', label: 'Paket C', color: '#D4A017', dotClass: 'bg-amber-500' };
  }, [selectedProgram]);

  const studentAttendanceRate = useMemo(() => {
    if (effectiveRole !== 'murid' || !currentStudent) return 95;
    let total = 0;
    let hadir = 0;
    attendanceSessions.forEach((sess) => {
      const rec = sess.records.find(
        (r) => r.studentId === currentStudent.id || r.studentNis === currentStudent.nis
      );
      if (rec) {
        total += 1;
        if (rec.status === 'Hadir') hadir += 1;
      }
    });
    return total > 0 ? Math.round((hadir / total) * 100) : 100;
  }, [effectiveRole, currentStudent, attendanceSessions]);

  const statCards = useMemo(() => {
    if (effectiveRole === 'murid') {
      const mySubjectsCount = subjects.filter(
        (sub) => sub.paket === (currentStudent?.paket || 'Paket C')
      ).length;
      return [
        {
          label: 'Mata Pelajaran Paket',
          value: mySubjectsCount,
          sub: currentStudent?.paket || 'Paket C',
          icon: BookOpen,
          gradient: 'from-emerald-700 to-emerald-500',
        },
        {
          label: 'Jadwal Kelas Aktif',
          value: scopedAssignments.length,
          sub: currentStudent?.className || 'Rombel Aktif',
          icon: ClipboardList,
          gradient: 'from-emerald-800 to-teal-600',
        },
        {
          label: 'Kehadiran Tercatat',
          value: studentAttendanceRate,
          suffix: '%',
          sub: 'Semester ' + schoolSettings.semester,
          icon: CalendarCheck2,
          gradient: 'from-teal-700 to-amber-600',
        },
        {
          label: 'Pengumuman Baru',
          value: visibleAnnouncements.length,
          sub: 'Informasi Sekolah',
          icon: Megaphone,
          gradient: 'from-amber-600 to-amber-500',
        },
      ];
    }

    const isFiltered = selectedProgram !== 'Semua';
    const filteredClasses = isFiltered
      ? classes.filter((c) => c.paket === selectedProgram)
      : classes;
    const filteredStudents = isFiltered
      ? students.filter((s) => resolveStudentPlacement(s, classes).paket === selectedProgram)
      : students;
    const filteredSubjects = isFiltered
      ? subjects.filter((sub) => sub.paket === selectedProgram)
      : subjects;
    const filteredAssignments = isFiltered
      ? assignments.filter((a) => a.paket === selectedProgram)
      : assignments;

    if (effectiveRole === 'guru') {
      const guruAssignments = isFiltered
        ? scopedAssignments.filter((a) => a.paket === selectedProgram)
        : scopedAssignments;
      const guruStudents = isFiltered
        ? scopedStudents.filter((s) => resolveStudentPlacement(s, classes).paket === selectedProgram)
        : scopedStudents;
      const myClassesCount = new Set(guruAssignments.map((a) => a.classId)).size;
      const mySubjectsCount = new Set(guruAssignments.map((a) => a.subjectId)).size;
      return [
        {
          label: isFiltered ? `Kelas Diampu (${selectedProgram})` : 'Kelas Diampu',
          value: myClassesCount,
          sub: isFiltered ? `Rombel ${selectedProgram}` : 'Rombel Aktif',
          icon: Users,
          gradient: 'from-emerald-700 to-emerald-500',
        },
        {
          label: isFiltered ? `Murid Ampuan (${selectedProgram})` : 'Murid Ampuan',
          value: guruStudents.length,
          sub: isFiltered ? `${guruStudents.filter((s) => s.status === 'Aktif').length} Aktif` : 'Warga Belajar',
          icon: GraduationCap,
          gradient: 'from-emerald-800 to-teal-600',
        },
        {
          label: isFiltered ? `Mapel (${selectedProgram})` : 'Mapel Diampu',
          value: mySubjectsCount,
          sub: 'Modul Kesetaraan',
          icon: BookOpen,
          gradient: 'from-teal-700 to-amber-600',
        },
        {
          label: 'Penugasan Aktif',
          value: guruAssignments.filter((a) => a.status === 'Aktif').length,
          sub: isFiltered ? `${selectedProgram} · Sem. ${schoolSettings.semester}` : 'Semester ' + schoolSettings.semester,
          icon: ClipboardList,
          gradient: 'from-amber-600 to-amber-500',
        },
      ];
    }

    const activeTeachersForScope = isFiltered
      ? (() => {
          const teacherIds = new Set<string>();
          filteredAssignments.forEach((a) => {
            if (a.teacherId) teacherIds.add(a.teacherId);
          });
          filteredClasses.forEach((c) => {
            if (c.homeroomTeacherId) teacherIds.add(c.homeroomTeacherId);
          });
          return teacherIds.size;
        })()
      : teachers.filter((t) => t.status === 'Aktif').length;

    return [
      {
        label: isFiltered ? `Guru / Tutor (${selectedProgram})` : 'Total Guru / Tutor',
        value: isFiltered ? activeTeachersForScope : teachers.length,
        sub: isFiltered
          ? `Dari ${teachers.length} Total Tutor PKBM`
          : `${activeTeachersForScope} Aktif Mengajar`,
        icon: Users,
        gradient: 'from-emerald-700 to-emerald-500',
      },
      {
        label: isFiltered ? `Total Murid ${selectedProgram}` : 'Total Murid',
        value: filteredStudents.length,
        sub: `${filteredStudents.filter((s) => s.status === 'Aktif').length} Aktif · ${
          students.length > 0 ? Math.round((filteredStudents.length / students.length) * 100) : 0
        }% Total Lembaga`,
        icon: GraduationCap,
        gradient: 'from-emerald-800 to-teal-600',
      },
      {
        label: isFiltered ? `Mapel ${selectedProgram}` : 'Total Mata Pelajaran',
        value: filteredSubjects.length,
        sub: `${filteredClasses.length} Rombel ${isFiltered ? selectedProgram : 'Terdaftar'}`,
        icon: BookOpen,
        gradient: 'from-teal-700 to-amber-600',
      },
      {
        label: isFiltered ? `Penugasan ${selectedProgram}` : 'Penugasan Aktif',
        value: filteredAssignments.filter((a) => a.status === 'Aktif').length,
        sub: `TA ${schoolSettings.academicYear} (${schoolSettings.semester})`,
        icon: ClipboardList,
        gradient: 'from-amber-600 to-amber-500',
      },
    ];
  }, [
    effectiveRole,
    selectedProgram,
    teachers,
    students,
    subjects,
    classes,
    assignments,
    scopedAssignments,
    scopedStudents,
    currentStudent,
    studentAttendanceRate,
    visibleAnnouncements,
    schoolSettings,
  ]);

  const quickShortcuts = useMemo(() => {
    if (effectiveRole === 'murid') {
      return [
        { label: 'Nilai & Rapor Saya', desc: 'Grafik radar nilai per mapel & unduh rapor A4', route: 'grades' as PageRoute, icon: Award },
        { label: 'Tugas & Beranda Belajar', desc: 'Kirim jawaban tugas & lihat nilai terbaru', route: 'tasks' as PageRoute, icon: ClipboardList },
        { label: 'Presensi & Kehadiran Saya', desc: 'Cek kalender kehadiran & persentase', route: 'attendance' as PageRoute, icon: CalendarCheck2 },
        { label: 'Ujian Online', desc: 'Kerjakan ASTS, PAS & UH dengan timer', route: 'online-exams' as PageRoute, icon: FileQuestion },
        { label: 'Lihat Profil & NIS', desc: 'Cek biodata induk Anda', route: 'students' as PageRoute, icon: GraduationCap },
        { label: 'Jadwal Belajar', desc: 'Daftar mapel & tutor kelas', route: 'assignments' as PageRoute, icon: BookOpen },
        { label: 'Unduh Surat Aktif', desc: 'Pratinjau & cetak A4 resmi', route: 'documents' as PageRoute, icon: FileText },
      ];
    }
    if (effectiveRole === 'guru') {
      return [
        { label: 'Penilaian & Rapor Akademik', desc: 'Spreadsheet nilai, bobot, deskripsi AI & rapor A4', route: 'grades' as PageRoute, icon: Award },
        { label: 'Papan Tugas & Penilaian', desc: 'Buat tugas, nilai jawaban & kembalikan revisi', route: 'tasks' as PageRoute, icon: ClipboardList },
        { label: 'Input Presensi & Rekap', desc: 'Catat hadir/izin/sakit/alpa & cetak rekap', route: 'attendance' as PageRoute, icon: CalendarCheck2 },
        { label: 'Generator Soal Ujian', desc: 'Susun kisi-kisi, Paket A/B, & Bank Soal', route: 'exam-generator' as PageRoute, icon: FileQuestion },
        { label: 'Generator Perangkat Ajar', desc: 'Susun Modul Ajar, ATP & KKTP AI', route: 'generator' as PageRoute, icon: NotebookPen },
        { label: 'Kelas & Mapel Saya', desc: 'Kelola jadwal pengajaran', route: 'assignments' as PageRoute, icon: BookOpen },
      ];
    }
    return [
      { label: 'Penilaian & Rapor Akademik', desc: 'Spreadsheet nilai, radar mapel & cetak rapor A4', route: 'grades' as PageRoute, icon: Award },
      { label: 'Papan Tugas & Penilaian', desc: 'Pantau tugas kelas, pengumpulan & nilai', route: 'tasks' as PageRoute, icon: ClipboardList },
      { label: 'Presensi & Rekap Kehadiran', desc: 'Input presensi harian, heatmap & cetak A4', route: 'attendance' as PageRoute, icon: CalendarCheck2 },
      { label: 'Generator Soal Ujian', desc: 'Kisi-kisi, Naskah A/B, Rubrik & Ujian Online', route: 'exam-generator' as PageRoute, icon: FileQuestion },
      { label: 'Generator Perangkat Ajar', desc: 'Modul Ajar, PROTA & CP Kurikulum Merdeka', route: 'generator' as PageRoute, icon: NotebookPen },
      { label: 'Kelola Data Murid', desc: 'Tambah, cari, & import Excel', route: 'students' as PageRoute, icon: GraduationCap },
      { label: 'Cetak Dokumen A4', desc: 'Surat keterangan & absensi resmi', route: 'documents' as PageRoute, icon: FileText },
      { label: 'Pengaturan Kop & TTD', desc: 'Logo, kop, TTD & tahun ajaran', route: 'school-settings' as PageRoute, icon: Settings },
    ];
  }, [effectiveRole]);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) {
      showToast('Judul dan isi pengumuman wajib diisi', 'warning');
      return;
    }
    await addAnnouncement({
      title: annTitle.trim(),
      content: annContent.trim(),
      category: annCategory,
      targetRole: annTarget,
      isPinned: annPinned,
    });
    setAnnTitle('');
    setAnnContent('');
    setAnnPinned(false);
    setShowAddAnn(false);
    showToast('Pengumuman berhasil diterbitkan', 'success');
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-600 p-6 sm:p-8 text-white shadow-lg shadow-emerald-950/15"
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            {/* Avatar Profil + Tombol Unggah Foto Cepat untuk Guru, Kepala Sekolah, dan Admin */}
            <div className="relative shrink-0 mt-0.5">
              <InitialAvatar
                name={effectiveRole === 'murid' && currentStudent ? currentStudent.fullName : profile?.name || 'AK'}
                src={profile?.avatarUrl}
                size="xl"
                className="ring-2 ring-white/40 shadow-lg"
              />
              {effectiveRole !== 'murid' && (
                <button
                  type="button"
                  onClick={() => setShowProfilePhotoModal(true)}
                  title="Unggah / ganti foto profil"
                  aria-label="Unggah atau ganti foto profil"
                  className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-white text-emerald-800 hover:bg-amber-50 shadow-md border border-emerald-900/10 flex items-center justify-center transition-transform active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-amber-200 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <CalendarDays className="w-4 h-4 shrink-0" />
                <span>{formattedDate}</span>
                <span aria-hidden="true">·</span>
                <span>Tahun Ajaran {schoolSettings.academicYear} ({schoolSettings.semester})</span>
              </p>
              <h2 className="mt-1.5 font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-balance">
                Selamat datang, {effectiveRole === 'murid' && currentStudent ? currentStudent.fullName : profile?.name}
              </h2>
              <p className="mt-1.5 text-sm text-emerald-50/90 max-w-2xl">
                {effectiveRole === 'murid'
                  ? `Anda masuk sebagai Warga Belajar ${currentStudent?.paket || 'Paket C'} (${currentStudent?.className || ''}). Pantau jadwal belajar dan pengumuman terbaru di sini.`
                  : effectiveRole === 'guru'
                    ? `Anda masuk sebagai ${ROLE_LABELS[effectiveRole]}. Kelola jadwal modul dan pantau perkembangan warga belajar di kelas ampuan Anda.`
                    : `Ringkasan operasional ${schoolSettings.schoolName} (NPSN ${schoolSettings.npsn}) untuk Program Pendidikan Kesetaraan Paket A, B, dan C.`}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex flex-wrap items-center gap-2.5">
            {effectiveRole !== 'murid' && (
              <button
                type="button"
                onClick={() => setShowProfilePhotoModal(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-semibold text-sm active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>Foto Profil</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleFocusAssistant}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-semibold text-sm active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Tanya Asisten AI</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white text-emerald-900 font-bold text-sm shadow-md hover:bg-amber-50 active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Cetak Dokumen A4</span>
            </button>
          </div>
        </div>
      </motion.section>

      {/* Galeri Animasi 5 Foto Kegiatan Belajar Mengajar di Laman Depan Dasbor */}
      <ActivityPhotoShowcase
        photos={activityGalleryPhotos}
        variant="dashboard"
        canManage={effectiveRole !== 'murid'}
        onManagePhotos={() => setShowGalleryManager(true)}
      />

      {/* Ringkasan Dashboard Header & Dropdown Filter Jenjang */}
      {effectiveRole !== 'murid' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white tracking-tight">
              Ringkasan Statistik Lembaga
            </h3>
            <AnimatePresence mode="wait">
              <motion.p
                key={`summary-sub-${selectedProgram}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                {selectedProgram === 'Semua'
                  ? 'Menampilkan data seluruh jenjang kesetaraan Paket A, Paket B, dan Paket C'
                  : `Menampilkan data terfilter khusus untuk jenjang ${selectedProgram}`}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedProgram !== 'Semua' && (
              <button
                type="button"
                onClick={() => setSelectedProgram('Semua')}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Reset</span>
              </button>
            )}
            <JenjangFilterDropdown
              value={selectedProgram}
              onChange={setSelectedProgram}
              counts={paketStudentCounts}
              align="right"
              ariaLabel="Filter ringkasan dashboard per jenjang"
            />
          </div>
        </div>
      )}

      {/* 4 Gradient Stat Cards with 0.08s Stagger & Smooth Jenjang Filter Transition */}
      <AnimatePresence mode="wait">
        <motion.section
          key={`kpi-grid-${effectiveRole}-${selectedProgram}`}
          aria-label="Ringkasan statistik"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: scaledDuration(0.18, 0.22), ease: ANIMATION_EASE.smoothOut }}
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        >
          {statCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
                animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{
                  duration: scaledDuration(0.3 * motionProfile.durationMultiplier, 0.36),
                  delay: motionProfile.reducedMotion
                    ? 0
                    : idx * ANIMATION_DURATIONS.statStagger * motionProfile.durationMultiplier,
                  ease: ANIMATION_EASE.smoothOut,
                }}
                className={`card-hover-lift group rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white shadow-md shadow-emerald-950/10`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-white/85">{card.label}</p>
                    <p className="mt-2 font-display font-extrabold text-3xl tracking-tight tabular-nums">
                      <CountUpNumber value={card.value} suffix={card.suffix} />
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="mt-3 text-xs font-medium text-white/85 truncate">{card.sub}</p>
              </motion.div>
            );
          })}
        </motion.section>
      </AnimatePresence>

      {/* Asisten Siswa AI (posisi utama untuk Murid tepat di bawah ringkasan statistik) */}
      {effectiveRole === 'murid' && (
        <StudentAssistantChatbot
          schoolSettings={schoolSettings}
          effectiveRole={effectiveRole}
          userName={currentStudent?.fullName || profile?.name || 'Warga Belajar'}
          currentStudent={currentStudent}
          assignments={assignments}
          scopedAssignments={scopedAssignments}
          subjects={subjects}
          classes={classes}
          announcements={visibleAnnouncements}
          onNavigate={onNavigate}
          inputRef={assistantInputRef}
        />
      )}

      {/* Rekapitulasi Data Siswa Berdasarkan Paket (A, B, C) & Rincian Rombel */}
      {effectiveRole !== 'murid' && (
        <StudentPaketRecapSection
          students={students}
          classes={classes}
          schoolSettings={schoolSettings}
          effectiveRole={effectiveRole}
          selectedProgram={selectedProgram}
          onProgramChange={setSelectedProgram}
          onDrillDown={(paket, route) => {
            setSelectedProgram(paket);
            onNavigate(route);
          }}
          onExportSuccess={() =>
            showToast('Rekapitulasi siswa Paket A, B, dan C berhasil diunduh ke Excel', 'success')
          }
          onPdfExportSuccess={(fileName) =>
            showToast(`Laporan PDF (${fileName}) berhasil diunduh`, 'success')
          }
          onPdfExportError={(message) =>
            showToast(`Gagal mencetak PDF: ${message}`, 'error')
          }
        />
      )}

      {/* Ringkasan Total Guru, Total Murid & Sesi Presensi Lembaga (selalu tampil di Dashboard untuk semua peran) */}
      {(effectiveRole === 'guru' || effectiveRole === 'murid') && (
        <section
          aria-label="Ringkasan data guru dan murid PKBM"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Total Guru / Tutor PKBM
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums">
                <CountUpNumber value={teachers.length} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Total Murid / Warga Belajar
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl text-amber-600 dark:text-amber-400 tabular-nums">
                <CountUpNumber value={students.length} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm flex items-center justify-between gap-3 text-left hover:border-emerald-600 transition-colors"
          >
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Sesi Presensi Tercatat
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
                <CountUpNumber value={attendanceSessions.length} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 to-amber-600 text-white flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
          </button>
        </section>
      )}

      {/* Charts Section (Hidden for Murid? Show Personal Schedule + Announcements cleanly, or show school stats for staff/guru) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart: Murid per Paket */}
        <section className="lg:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Sebaran Murid per Paket
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Jumlah warga belajar aktif Paket A, B, dan C
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paketChartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
                <XAxis
                  dataKey="paket"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(4,120,87,0.15)',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="jumlah"
                  name="Jumlah Murid"
                  radius={[10, 10, 0, 0]}
                  maxBarSize={56}
                  isAnimationActive={!motionProfile.reducedMotion}
                  animationDuration={ANIMATION_DURATIONS.chartMs}
                  animationEasing="ease-out"
                >
                  {paketChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.fill}
                      fillOpacity={
                        selectedProgram === 'Semua' || entry.paket === selectedProgram ? 1 : 0.24
                      }
                      style={{ cursor: effectiveRole !== 'murid' ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (effectiveRole !== 'murid') {
                          setSelectedProgram(
                            selectedProgram === entry.paket ? 'Semua' : entry.paket
                          );
                        }
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Line Chart: Kehadiran Bulanan */}
        <section className="lg:col-span-7 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Tren Kehadiran Bulanan (%)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Persentase kehadiran tatap muka & tutorial modul 6 bulan terakhir
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                Rata-rata Lembaga
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${activeAttendanceLine.dotClass}`} />
                {activeAttendanceLine.label}
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ATTENDANCE_MONTHLY_SERIES} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[75, 100]}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(4,120,87,0.15)',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rataRata"
                  name="Rata-rata (%)"
                  stroke="#047857"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#047857' }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={!motionProfile.reducedMotion}
                  animationDuration={ANIMATION_DURATIONS.chartMs}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey={activeAttendanceLine.dataKey}
                  name={`${activeAttendanceLine.label} (%)`}
                  stroke={activeAttendanceLine.color}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: activeAttendanceLine.color }}
                  isAnimationActive={!motionProfile.reducedMotion}
                  animationDuration={ANIMATION_DURATIONS.chartMs}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Asisten Siswa AI (tersedia juga di Dashboard untuk Admin, Kepala PKBM, & Guru) */}
      {effectiveRole !== 'murid' && (
        <StudentAssistantChatbot
          schoolSettings={schoolSettings}
          effectiveRole={effectiveRole}
          userName={profile?.name || 'Pengelola PKBM'}
          currentStudent={currentStudent}
          assignments={assignments}
          scopedAssignments={scopedAssignments}
          subjects={subjects}
          classes={classes}
          announcements={visibleAnnouncements}
          onNavigate={onNavigate}
          inputRef={assistantInputRef}
        />
      )}

      {/* Announcements & Quick Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Announcements List */}
        <section className="lg:col-span-7 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Papan Pengumuman Sekolah
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informasi akademik, jadwal asesmen, dan kegiatan PKBM
              </p>
            </div>
            {(effectiveRole === 'admin' || effectiveRole === 'kepala_pkbm') && (
              <button
                type="button"
                onClick={() => setShowAddAnn(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Pengumuman</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleAnnouncements.map((ann, idx) => (
              <motion.article
                key={ann.id}
                {...getStaggerItemProps(idx, motionProfile)}
                className="py-4 first:pt-1 last:pb-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {ann.isPinned && (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                          <Pin className="w-3.5 h-3.5" />
                          Disematkan
                        </span>
                      )}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {ann.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Untuk {ann.targetRole}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(ann.publishedAt).toLocaleDateString('id-ID')}</span>
                    </div>
                    <h4 className="mt-1 font-display font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                      {ann.title}
                    </h4>
                    <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {ann.content}
                    </p>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Oleh {ann.authorName}
                    </p>
                  </div>

                  {(effectiveRole === 'admin' || effectiveRole === 'kepala_pkbm') && (
                    <button
                      type="button"
                      onClick={() => setDeleteAnnId(ann.id)}
                      aria-label={`Hapus pengumuman ${ann.title}`}
                      className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        {/* Quick Shortcuts */}
        <section className="lg:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              Pintasan Cepat
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Akses fitur utama sesuai kewenangan peran Anda
            </p>

            <div className="space-y-2.5">
              {quickShortcuts.map((sc) => {
                const Icon = sc.icon;
                return (
                  <button
                    key={sc.label}
                    type="button"
                    onClick={() => onNavigate(sc.route)}
                    className="w-full min-h-[56px] p-3.5 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800/50 hover:border-emerald-600 dark:hover:border-emerald-500 hover:-translate-y-0.5 transition-all flex items-center gap-3.5 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 to-amber-600 text-white flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {sc.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {sc.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Kepala PKBM: {schoolSettings.headmasterName}</span>
          </div>
        </section>
      </div>

      {/* Add Announcement Modal (Responsive MotionModal) */}
      <MotionModal
        open={showAddAnn}
        onClose={() => setShowAddAnn(false)}
        maxWidthClass="max-w-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
            Terbitkan Pengumuman Baru
          </h3>
          <button
            type="button"
            onClick={() => setShowAddAnn(false)}
            aria-label="Tutup modal pengumuman"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleCreateAnnouncement} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Judul Pengumuman
            </label>
            <input
              type="text"
              required
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Contoh: Jadwal Penilaian Akhir Semester"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kategori
              </label>
              <select
                value={annCategory}
                onChange={(e) => setAnnCategory(e.target.value as Announcement['category'])}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                <option value="Akademik">Akademik</option>
                <option value="Ujian">Ujian</option>
                <option value="Administrasi">Administrasi</option>
                <option value="Kegiatan">Kegiatan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sasaran Peran
              </label>
              <select
                value={annTarget}
                onChange={(e) => setAnnTarget(e.target.value as Announcement['targetRole'])}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                <option value="Semua">Semua Pengguna</option>
                <option value="Guru">Khusus Guru/Tutor</option>
                <option value="Murid">Khusus Murid</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Isi Pengumuman
            </label>
            <textarea
              rows={4}
              required
              value={annContent}
              onChange={(e) => setAnnContent(e.target.value)}
              placeholder="Tuliskan informasi lengkap untuk warga belajar dan tutor..."
              className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={annPinned}
              onChange={(e) => setAnnPinned(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-700"
            />
            <span>Sematkan di bagian paling atas</span>
          </label>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setShowAddAnn(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-sm font-bold"
            >
              Terbitkan
            </button>
          </div>
        </form>
      </MotionModal>

      <ConfirmDialog
        open={Boolean(deleteAnnId)}
        title="Hapus Pengumuman?"
        description="Pengumuman yang dihapus tidak akan tampil lagi pada dasbor seluruh pengguna."
        onCancel={() => setDeleteAnnId(null)}
        onConfirm={async () => {
          if (deleteAnnId) {
            await deleteAnnouncement(deleteAnnId);
            showToast('Pengumuman berhasil dihapus', 'success');
            setDeleteAnnId(null);
          }
        }}
      />

      <ProfilePhotoModal
        isOpen={showProfilePhotoModal}
        onClose={() => setShowProfilePhotoModal(false)}
      />

      <ActivityPhotoManagerModal
        isOpen={showGalleryManager}
        onClose={() => setShowGalleryManager(false)}
      />
    </div>
  );
};
