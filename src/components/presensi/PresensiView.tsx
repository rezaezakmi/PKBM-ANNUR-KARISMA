import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCheck2,
  FileDown,
  Filter,
  Printer,
  Save,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { AttendanceSession, AttendanceStatus, AttendanceStudentRecord } from '../../types/siakad';
import {
  ANIMATION_DURATIONS,
  ANIMATION_EASE,
  ANIMATION_SPRINGS,
  getStaggerItemProps,
  scaledDuration,
  useAdaptiveMotion,
} from '../../config/animations';
import { generateAttendanceRecapPdf } from '../../utils/academicPdfUtils';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CountUpNumber } from '../ui/CountUpNumber';
import { EmptyState } from '../ui/EmptyState';
import { InitialAvatar } from '../ui/InitialAvatar';
import { AnimatedSaveCheck } from '../ui/MotionPrimitives';
import { AttendancePrintSheet, AttendanceRecapRow } from './AttendancePrintSheet';
import { getTeacherSubjectsForClassOrPaket } from '../../data/kurikulumMerdeka';
import { sortClassesByJenjang } from '../../utils/excelUtils';

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
  activeClass: string;
  idleClass: string;
  dotClass: string;
  colorHex: string;
}> = [
  {
    value: 'Hadir',
    label: 'Hadir',
    activeClass:
      'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-900/15',
    idleClass:
      'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300',
    dotClass: 'bg-emerald-500',
    colorHex: '#059669',
  },
  {
    value: 'Izin',
    label: 'Izin',
    activeClass: 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-900/15',
    idleClass:
      'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-400 hover:text-sky-700 dark:hover:text-sky-300',
    dotClass: 'bg-sky-500',
    colorHex: '#0284c7',
  },
  {
    value: 'Sakit',
    label: 'Sakit',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-900/15',
    idleClass:
      'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-300',
    dotClass: 'bg-amber-500',
    colorHex: '#d97706',
  },
  {
    value: 'Alpa',
    label: 'Alpa',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-900/15',
    idleClass:
      'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-rose-400 hover:text-rose-700 dark:hover:text-rose-300',
    dotClass: 'bg-rose-500',
    colorHex: '#e11d48',
  },
];

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatMonthLabel(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const mIdx = Number(mStr) - 1;
  if (!yStr || Number.isNaN(mIdx) || mIdx < 0 || mIdx > 11) return monthKey;
  return `${MONTH_NAMES_ID[mIdx]} ${yStr}`;
}

function formatDateIndo(dateStr: string): string {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function getTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PresensiView: React.FC = () => {
  const { profile, effectiveRole } = useAuth();
  const {
    schoolSettings,
    students,
    teachers,
    subjects,
    classes,
    assignments,
    attendanceSessions,
    saveAttendanceSession,
    deleteAttendanceSession,
  } = useData();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();

  const isStudent = effectiveRole === 'murid';

  const currentStudent = useMemo(() => {
    if (!isStudent) return null;
    return (
      students.find(
        (s) =>
          s.id === profile?.linkedEntityId ||
          s.nis === profile?.nis ||
          s.ownerUid === profile?.uid
      ) ||
      students[0] ||
      null
    );
  }, [isStudent, students, profile]);

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

  const teacherAssignments = useMemo(() => {
    if (effectiveRole !== 'guru' || !currentTeacher) return assignments;
    return assignments.filter(
      (a) => a.teacherId === currentTeacher.id || a.teacherUid === currentTeacher.ownerUid
    );
  }, [effectiveRole, currentTeacher, assignments]);

  // Guru mengajar di seluruh Paket (A, B, C) & semua kelas/rombel aktif
  const availableClasses = useMemo(() => {
    const active = classes.filter((c) => c.status === 'Aktif');
    return sortClassesByJenjang(active.length > 0 ? active : classes);
  }, [classes]);

  // Tab switcher (Input Presensi vs Rekap & Analisis)
  const [activeTab, setActiveTab] = useState<'input' | 'rekap'>(isStudent ? 'rekap' : 'input');

  useEffect(() => {
    if (isStudent) {
      setActiveTab('rekap');
    }
  }, [isStudent]);

  // ===================== INPUT PRESENSI STATE =====================
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIso);
  const [draftRecords, setDraftRecords] = useState<AttendanceStudentRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Initialize default class
  useEffect(() => {
    if (availableClasses.length > 0 && !availableClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId]);

  const selectedClass = useMemo(
    () => availableClasses.find((c) => c.id === selectedClassId) || availableClasses[0],
    [availableClasses, selectedClassId]
  );

  // Available subjects filtered by selected class & distinct teacher subject
  const availableSubjects = useMemo(() => {
    const activeSubjects = subjects.filter((s) => s.status === 'Aktif');
    if (!selectedClass) return activeSubjects;

    if (effectiveRole === 'guru' && currentTeacher) {
      const teacherSubs = getTeacherSubjectsForClassOrPaket(
        currentTeacher,
        selectedClass.paket,
        selectedClass.id,
        subjects,
        teacherAssignments
      );
      if (teacherSubs.length > 0) return teacherSubs;
    }

    const paketMatches = activeSubjects.filter((s) => s.paket === selectedClass.paket);
    return paketMatches.length > 0 ? paketMatches : activeSubjects;
  }, [subjects, selectedClass, effectiveRole, currentTeacher, teacherAssignments]);

  useEffect(() => {
    if (availableSubjects.length > 0 && !availableSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(availableSubjects[0].id);
    }
  }, [availableSubjects, selectedSubjectId]);

  const selectedSubject = useMemo(
    () => availableSubjects.find((s) => s.id === selectedSubjectId) || availableSubjects[0],
    [availableSubjects, selectedSubjectId]
  );

  // Students in selected class
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students
      .filter((s) => s.classId === selectedClass.id && s.status === 'Aktif')
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
  }, [students, selectedClass]);

  // Existing session matching (classId, subjectId, date)
  const existingInputSession = useMemo(() => {
    if (!selectedClass || !selectedSubject || !selectedDate) return undefined;
    return attendanceSessions.find(
      (s) =>
        s.classId === selectedClass.id &&
        s.subjectId === selectedSubject.id &&
        s.date === selectedDate
    );
  }, [attendanceSessions, selectedClass, selectedSubject, selectedDate]);

  // Sync draft records when class/subject/date/existing session changes
  useEffect(() => {
    if (classStudents.length === 0) {
      setDraftRecords([]);
      return;
    }
    const existingMap = new Map<string, AttendanceStudentRecord>();
    existingInputSession?.records.forEach((rec) => {
      existingMap.set(rec.studentId, rec);
    });

    const nextDraft: AttendanceStudentRecord[] = classStudents.map((st) => {
      const prev = existingMap.get(st.id);
      if (prev) {
        return {
          studentId: st.id,
          studentNis: st.nis,
          studentName: st.fullName,
          status: prev.status,
          note: prev.note || '',
        };
      }
      return {
        studentId: st.id,
        studentNis: st.nis,
        studentName: st.fullName,
        status: 'Hadir',
        note: '',
      };
    });
    setDraftRecords(nextDraft);
  }, [classStudents, existingInputSession]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setDraftRecords((prev) =>
      prev.map((rec) => (rec.studentId === studentId ? { ...rec, status } : rec))
    );
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setDraftRecords((prev) =>
      prev.map((rec) => (rec.studentId === studentId ? { ...rec, note } : rec))
    );
  };

  const handlePresentAll = () => {
    setDraftRecords((prev) => prev.map((rec) => ({ ...rec, status: 'Hadir' })));
    showToast(`Seluruh ${draftRecords.length} warga belajar ditandai Hadir`, 'success');
  };

  const draftSummary = useMemo(() => {
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;
    draftRecords.forEach((r) => {
      if (r.status === 'Hadir') hadir++;
      else if (r.status === 'Izin') izin++;
      else if (r.status === 'Sakit') sakit++;
      else if (r.status === 'Alpa') alpa++;
    });
    return { hadir, izin, sakit, alpa, total: draftRecords.length };
  }, [draftRecords]);

  const handleSaveSession = async () => {
    if (!selectedClass || !selectedSubject) {
      showToast('Pilih kelas dan mata pelajaran terlebih dahulu', 'warning');
      return;
    }
    if (draftRecords.length === 0) {
      showToast('Tidak ada warga belajar aktif di kelas ini', 'warning');
      return;
    }
    setSaving(true);
    try {
      const matchedAssignment = assignments.find(
        (a) => a.classId === selectedClass.id && a.subjectId === selectedSubject.id
      );
      const teacherId =
        currentTeacher?.id || matchedAssignment?.teacherId || profile?.linkedEntityId || 'guru_01';
      const teacherName =
        currentTeacher?.fullName ||
        matchedAssignment?.teacherName ||
        profile?.name ||
        'Tutor PKBM';

      const studentUids = classStudents
        .map((st) => st.ownerUid)
        .filter((uid): uid is string => Boolean(uid));

      await saveAttendanceSession({
        date: selectedDate,
        academicYear: schoolSettings.academicYear,
        semester: schoolSettings.semester,
        paket: selectedClass.paket,
        classId: selectedClass.id,
        className: selectedClass.name,
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        teacherId,
        teacherName,
        records: draftRecords.map((r) => ({
          studentId: r.studentId,
          studentNis: r.studentNis,
          studentName: r.studentName,
          status: r.status,
          ...(r.note?.trim() ? { note: r.note.trim() } : {}),
        })),
        studentUids,
      });
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 1800);
      showToast(
        existingInputSession
          ? `Presensi ${selectedClass.name} (${selectedDate}) berhasil diperbarui`
          : `Presensi ${selectedClass.name} (${selectedDate}) berhasil disimpan`,
        'success'
      );
    } catch (error) {
      console.error(error);
      showToast('Gagal menyimpan data presensi. Coba ulangi kembali.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ===================== REKAP & ANALISIS STATE =====================
  const latestSessionMonth = useMemo(() => {
    if (attendanceSessions.length === 0) return getTodayIso().slice(0, 7);
    const sorted = [...attendanceSessions].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    return sorted[0].monthKey;
  }, [attendanceSessions]);

  const [recapScope, setRecapScope] = useState<'Bulanan' | 'Semester'>('Bulanan');
  const [recapMonth, setRecapMonth] = useState<string>(latestSessionMonth);
  const [recapClassId, setRecapClassId] = useState<string>('ALL');
  const [recapSubjectId, setRecapSubjectId] = useState<string>('ALL');
  const [minThreshold, setMinThreshold] = useState<number>(75);
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<AttendanceSession | null>(null);

  // Keep default recapMonth synced if sessions arrive asynchronously
  useEffect(() => {
    if (!attendanceSessions.some((s) => s.monthKey === recapMonth) && latestSessionMonth) {
      setRecapMonth(latestSessionMonth);
    }
  }, [attendanceSessions, latestSessionMonth, recapMonth]);

  // Role-scoped sessions for Rekap
  const roleScopedSessions = useMemo(() => {
    if (isStudent && currentStudent) {
      return attendanceSessions
        .map((s) => {
          const ownRecords = s.records.filter(
            (r) => r.studentId === currentStudent.id || r.studentNis === currentStudent.nis
          );
          if (ownRecords.length === 0) return null;
          return {
            ...s,
            records: ownRecords,
            summaryHadir: ownRecords.filter((r) => r.status === 'Hadir').length,
            summaryIzin: ownRecords.filter((r) => r.status === 'Izin').length,
            summarySakit: ownRecords.filter((r) => r.status === 'Sakit').length,
            summaryAlpa: ownRecords.filter((r) => r.status === 'Alpa').length,
          };
        })
        .filter((s): s is AttendanceSession => Boolean(s));
    }

    if (effectiveRole === 'guru' && currentTeacher) {
      return attendanceSessions;
    }

    return attendanceSessions;
  }, [attendanceSessions, isStudent, currentStudent, effectiveRole, currentTeacher]);

  // Sessions matching Class + Subject + Semester/Month filters (for table & donut)
  const filteredRecapSessions = useMemo(() => {
    return roleScopedSessions.filter((s) => {
      if (recapScope === 'Bulanan' && s.monthKey !== recapMonth) return false;
      if (recapClassId !== 'ALL' && s.classId !== recapClassId) return false;
      if (recapSubjectId !== 'ALL' && s.subjectId !== recapSubjectId) return false;
      return true;
    });
  }, [roleScopedSessions, recapScope, recapMonth, recapClassId, recapSubjectId]);

  // Sessions for Heatmap (always monthly for recapMonth, filtered by class/subject)
  const heatmapMonthSessions = useMemo(() => {
    return roleScopedSessions.filter((s) => {
      if (s.monthKey !== recapMonth) return false;
      if (recapClassId !== 'ALL' && s.classId !== recapClassId) return false;
      if (recapSubjectId !== 'ALL' && s.subjectId !== recapSubjectId) return false;
      return true;
    });
  }, [roleScopedSessions, recapMonth, recapClassId, recapSubjectId]);

  // Aggregated Donut Data
  const recapTotals = useMemo(() => {
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;
    filteredRecapSessions.forEach((s) => {
      s.records.forEach((r) => {
        if (r.status === 'Hadir') hadir++;
        else if (r.status === 'Izin') izin++;
        else if (r.status === 'Sakit') sakit++;
        else if (r.status === 'Alpa') alpa++;
      });
    });
    const total = hadir + izin + sakit + alpa;
    const rate = total > 0 ? Math.round((hadir / total) * 1000) / 10 : 0;
    return {
      hadir,
      izin,
      sakit,
      alpa,
      total,
      rate,
      chartData: [
        { name: 'Hadir', value: hadir, color: '#059669' },
        { name: 'Izin', value: izin, color: '#0284c7' },
        { name: 'Sakit', value: sakit, color: '#d97706' },
        { name: 'Alpa', value: alpa, color: '#e11d48' },
      ].filter((d) => d.value > 0),
    };
  }, [filteredRecapSessions]);

  // Student Recap Rows (Bulanan / Semester table)
  const recapRows = useMemo<AttendanceRecapRow[]>(() => {
    const map = new Map<string, AttendanceRecapRow>();

    // Pre-populate students if a specific class is selected (or student role)
    if (isStudent && currentStudent) {
      map.set(currentStudent.id, {
        studentId: currentStudent.id,
        studentNis: currentStudent.nis,
        studentName: currentStudent.fullName,
        className: currentStudent.className,
        meetings: 0,
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        percentage: 100,
        belowThreshold: false,
      });
    } else if (recapClassId !== 'ALL') {
      const cls = classes.find((c) => c.id === recapClassId);
      students
        .filter((st) => st.classId === recapClassId && st.status === 'Aktif')
        .forEach((st) => {
          map.set(st.id, {
            studentId: st.id,
            studentNis: st.nis,
            studentName: st.fullName,
            className: cls?.name || st.className,
            meetings: 0,
            hadir: 0,
            izin: 0,
            sakit: 0,
            alpa: 0,
            percentage: 0,
            belowThreshold: false,
          });
        });
    }

    filteredRecapSessions.forEach((sess) => {
      sess.records.forEach((rec) => {
        const current = map.get(rec.studentId) || {
          studentId: rec.studentId,
          studentNis: rec.studentNis,
          studentName: rec.studentName,
          className: sess.className,
          meetings: 0,
          hadir: 0,
          izin: 0,
          sakit: 0,
          alpa: 0,
          percentage: 0,
          belowThreshold: false,
        };
        current.meetings += 1;
        if (rec.status === 'Hadir') current.hadir += 1;
        else if (rec.status === 'Izin') current.izin += 1;
        else if (rec.status === 'Sakit') current.sakit += 1;
        else if (rec.status === 'Alpa') current.alpa += 1;
        map.set(rec.studentId, current);
      });
    });

    return Array.from(map.values())
      .filter((r) => r.meetings > 0 || recapClassId !== 'ALL')
      .map((row) => {
        const pct = row.meetings > 0 ? Math.round((row.hadir / row.meetings) * 1000) / 10 : 0;
        return {
          ...row,
          percentage: pct,
          belowThreshold: row.meetings > 0 && pct < minThreshold,
        };
      })
      .sort((a, b) => a.percentage - b.percentage || a.studentName.localeCompare(b.studentName, 'id'));
  }, [filteredRecapSessions, isStudent, currentStudent, recapClassId, classes, students, minThreshold]);

  // Calendar Heatmap cells for recapMonth
  const heatmapCalendar = useMemo(() => {
    const [yearStr, monthStr] = recapMonth.split('-');
    const year = Number(yearStr) || new Date().getFullYear();
    const month = Number(monthStr) || new Date().getMonth() + 1;
    const firstDay = new Date(year, month - 1, 1);
    const totalDays = new Date(year, month, 0).getDate();
    // Convert JS Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const byDate = new Map<
      string,
      {
        sessions: AttendanceSession[];
        hadir: number;
        total: number;
        rate: number;
      }
    >();

    heatmapMonthSessions.forEach((sess) => {
      const existing = byDate.get(sess.date) || { sessions: [], hadir: 0, total: 0, rate: 0 };
      const sHadir = sess.records.filter((r) => r.status === 'Hadir').length;
      const sTotal = sess.records.length;
      existing.sessions.push(sess);
      existing.hadir += sHadir;
      existing.total += sTotal;
      existing.rate = existing.total > 0 ? Math.round((existing.hadir / existing.total) * 100) : 0;
      byDate.set(sess.date, existing);
    });

    const cells: Array<{
      key: string;
      day: number | null;
      dateStr?: string;
      info?: {
        sessions: AttendanceSession[];
        hadir: number;
        total: number;
        rate: number;
      };
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ key: `pad_${i}`, day: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        key: dateStr,
        day: d,
        dateStr,
        info: byDate.get(dateStr),
      });
    }
    return { cells, byDate };
  }, [recapMonth, heatmapMonthSessions]);

  const shiftMonth = (delta: number) => {
    const [yStr, mStr] = recapMonth.split('-');
    const d = new Date(Number(yStr), Number(mStr) - 1 + delta, 1);
    const nextKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setRecapMonth(nextKey);
    setSelectedHeatmapDate(null);
  };

  const selectedDaySessions = useMemo(() => {
    if (!selectedHeatmapDate) return [];
    return heatmapCalendar.byDate.get(selectedHeatmapDate)?.sessions || [];
  }, [selectedHeatmapDate, heatmapCalendar]);

  const handleExportCsv = () => {
    if (recapRows.length === 0) {
      showToast('Tidak ada data rekap untuk diunduh', 'warning');
      return;
    }
    const headers = ['No', 'NIS', 'Nama Warga Belajar', 'Kelas', 'Pertemuan', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persentase (%)', 'Status'];
    const lines = recapRows.map((r, idx) =>
      [
        idx + 1,
        `"${r.studentNis}"`,
        `"${r.studentName}"`,
        `"${r.className}"`,
        r.meetings,
        r.hadir,
        r.izin,
        r.sakit,
        r.alpa,
        r.percentage,
        r.belowThreshold ? `"Di Bawah ${minThreshold}%"` : '"Memenuhi"',
      ].join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Presensi_${recapScope}_${recapMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Rekap presensi CSV berhasil diunduh', 'success');
  };

  const printLabels = useMemo(() => {
    const cls = classes.find((c) => c.id === recapClassId);
    const sub = subjects.find((s) => s.id === recapSubjectId);
    const teacherFromSess = filteredRecapSessions[0]?.teacherName;
    return {
      periodLabel:
        recapScope === 'Bulanan'
          ? formatMonthLabel(recapMonth)
          : `Semester ${schoolSettings.semester} (${schoolSettings.academicYear})`,
      classLabel: cls ? cls.name : isStudent && currentStudent ? currentStudent.className : 'Semua Kelas Aktif',
      subjectLabel: sub ? sub.name : 'Semua Mata Pelajaran',
      teacherName:
        teacherFromSess ||
        currentTeacher?.fullName ||
        cls?.homeroomTeacherName ||
        'Reny Febriyani, S.Sos.',
    };
  }, [
    classes,
    subjects,
    recapClassId,
    recapSubjectId,
    recapScope,
    recapMonth,
    schoolSettings,
    filteredRecapSessions,
    isStudent,
    currentStudent,
    currentTeacher,
  ]);

  const warningCount = recapRows.filter((r) => r.belowThreshold).length;

  const handleDownloadAttendancePdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const fileName = await generateAttendanceRecapPdf({
        schoolSettings,
        recapScope,
        periodLabel: printLabels.periodLabel,
        classLabel: printLabels.classLabel,
        subjectLabel: printLabels.subjectLabel,
        teacherName: printLabels.teacherName,
        totalSessions: filteredRecapSessions.length,
        minThreshold,
        rows: recapRows,
      });
      showToast('Rekap presensi PDF berkop PKBM berhasil diunduh', 'success', fileName);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat dokumen PDF rekap presensi',
        'error'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Workspace */}
      <div className="no-print space-y-6">
        {/* Page Header + Segmented View Switcher */}
        <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
                <CalendarCheck2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
                  {isStudent ? 'Presensi & Kehadiran Saya' : 'Presensi Warga Belajar'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  {isStudent
                    ? `Pantau riwayat kehadiran tatap muka & tutorial ${currentStudent?.fullName || ''} (${currentStudent?.className || 'PKBM'})`
                    : 'Catat kehadiran harian per kelas dan mata pelajaran, analisis kalender heatmap, dan cetak rekap resmi A4.'}
                </p>
              </div>
            </div>

            {!isStudent && (
              <div
                role="tablist"
                aria-label="Mode Presensi"
                className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 self-start lg:self-auto"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'input'}
                  onClick={() => setActiveTab('input')}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all whitespace-nowrap ${
                    activeTab === 'input'
                      ? 'bg-gradient-to-r from-emerald-700 to-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Input Presensi</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'rekap'}
                  onClick={() => setActiveTab('rekap')}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all whitespace-nowrap ${
                    activeTab === 'rekap'
                      ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Rekap & Analisis</span>
                  {warningCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 text-white tabular-nums">
                      {warningCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ===================== TAB 1: INPUT PRESENSI ===================== */}
        {!isStudent && activeTab === 'input' && (
          <div className="space-y-5">
            {/* Selector Kelas, Mapel, Tanggal */}
            <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="presensi-kelas"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                  >
                    1. Pilih Kelas / Rombel
                  </label>
                  <select
                    id="presensi-kelas"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.paket})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="presensi-mapel"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                  >
                    2. Mata Pelajaran / Modul
                  </label>
                  <select
                    id="presensi-mapel"
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {availableSubjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} ({sub.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="presensi-tanggal"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                  >
                    3. Tanggal Pertemuan
                  </label>
                  <input
                    id="presensi-tanggal"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Session Status & Hadirkan Semua Action Bar */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatDateIndo(selectedDate)}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  {existingInputSession ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300/60 dark:border-amber-700/50 text-amber-800 dark:text-amber-300 font-semibold">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      Sudah Tercatat (Mode Perbarui)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300/60 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300 font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      Sesi Baru (Default Hadir)
                    </span>
                  )}
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                    ({classStudents.length} Warga Belajar Aktif)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handlePresentAll}
                  disabled={draftRecords.length === 0}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Hadirkan Semua</span>
                </button>
              </div>
            </section>

            {/* Student Cards Grid */}
            {draftRecords.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Belum Ada Warga Belajar di Kelas Ini"
                description="Tambahkan data murid aktif ke rombel ini melalui menu Data Master Murid agar dapat dicatat kehadirannya."
              />
            ) : (
              <section aria-label="Daftar presensi warga belajar" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftRecords.map((rec, index) => {
                  const activeOption = STATUS_OPTIONS.find((opt) => opt.value === rec.status);
                  return (
                    <motion.article
                      key={rec.studentId}
                      {...getStaggerItemProps(index, motionProfile)}
                      className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm flex flex-col justify-between gap-4"
                    >
                      {/* Top row: Avatar + Identity + Current Status Label */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <InitialAvatar name={rec.studentName} size="md" />
                          <div className="min-w-0">
                            <p className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                              {rec.studentName}
                            </p>
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                              NIS: {rec.studentNis} · No. {index + 1}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 transition-colors ${
                            rec.status === 'Hadir'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                              : rec.status === 'Izin'
                                ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800'
                                : rec.status === 'Sakit'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${activeOption?.dotClass}`} />
                          {rec.status}
                        </span>
                      </div>

                      {/* Animated Segmented Status Buttons */}
                      <div
                        role="radiogroup"
                        aria-label={`Status kehadiran ${rec.studentName}`}
                        className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80"
                      >
                        {STATUS_OPTIONS.map((opt) => {
                          const isSelected = rec.status === opt.value;
                          const pillBg =
                            opt.value === 'Hadir'
                              ? 'bg-emerald-600 shadow-emerald-900/20'
                              : opt.value === 'Izin'
                                ? 'bg-sky-600 shadow-sky-900/20'
                                : opt.value === 'Sakit'
                                  ? 'bg-amber-500 shadow-amber-900/20'
                                  : 'bg-rose-600 shadow-rose-900/20';
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              onClick={() => handleStatusChange(rec.studentId, opt.value)}
                              className={`relative min-h-[42px] px-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                                isSelected
                                  ? 'text-white'
                                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              {isSelected && (
                                <motion.span
                                  layoutId={`attendance-segment-${rec.studentId}`}
                                  transition={
                                    motionProfile.reducedMotion
                                      ? { duration: 0.12 }
                                      : ANIMATION_SPRINGS.navPill
                                  }
                                  className={`absolute inset-0 rounded-xl shadow-sm ${pillBg}`}
                                />
                              )}
                              <span className="relative z-10">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Optional Note Input */}
                      <div>
                        <input
                          type="text"
                          value={rec.note || ''}
                          onChange={(e) => handleNoteChange(rec.studentId, e.target.value)}
                          placeholder={
                            rec.status === 'Hadir'
                              ? 'Catatan opsional (misal: aktif diskusi)...'
                              : `Keterangan ${rec.status.toLowerCase()} (opsional)...`
                          }
                          className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-[#FAFAF7] dark:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                    </motion.article>
                  );
                })}
              </section>
            )}

            {/* Floating Live Summary Bar with Animated CountUp Numbers */}
            {draftRecords.length > 0 && (
              <div className="sticky bottom-20 md:bottom-4 z-30">
                <div className="rounded-2xl border border-emerald-950/15 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-3 shadow-xl shadow-emerald-950/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden sm:inline">
                      Ringkasan Langsung:
                    </span>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                        Hadir:
                      </span>
                      <span className="text-sm font-extrabold font-mono text-emerald-700 dark:text-emerald-300 tabular-nums">
                        <CountUpNumber value={draftSummary.hadir} durationMs={320} />
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                      <span className="text-xs font-semibold text-sky-900 dark:text-sky-200">
                        Izin:
                      </span>
                      <span className="text-sm font-extrabold font-mono text-sky-700 dark:text-sky-300 tabular-nums">
                        <CountUpNumber value={draftSummary.izin} durationMs={320} />
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Sakit:
                      </span>
                      <span className="text-sm font-extrabold font-mono text-amber-700 dark:text-amber-300 tabular-nums">
                        <CountUpNumber value={draftSummary.sakit} durationMs={320} />
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                      <span className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                        Alpa:
                      </span>
                      <span className="text-sm font-extrabold font-mono text-rose-700 dark:text-rose-300 tabular-nums">
                        <CountUpNumber value={draftSummary.alpa} durationMs={320} />
                      </span>
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                    Kehadiran:{' '}
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      <CountUpNumber
                        value={
                          draftSummary.total > 0
                            ? Math.round((draftSummary.hadir / draftSummary.total) * 100)
                            : 0
                        }
                        suffix="%"
                        durationMs={320}
                      />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tombol Simpan Besar di Bawah */}
            {draftRecords.length > 0 && (
              <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    {selectedClass?.name} — {selectedSubject?.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tanggal {formatDateIndo(selectedDate)} · Total {draftSummary.total} warga belajar siap dicatat ke sistem.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveSession}
                  disabled={saving}
                  className="btn-ripple w-full sm:w-auto min-h-[52px] px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white font-display font-extrabold text-sm sm:text-base shadow-lg shadow-emerald-900/20 hover:brightness-105 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2.5 disabled:opacity-60 whitespace-nowrap"
                >
                  {saveSuccess ? (
                    <AnimatedSaveCheck visible={saveSuccess} />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  <span>
                    {saving
                      ? 'Menyimpan Presensi...'
                      : saveSuccess
                        ? 'Presensi Tersimpan!'
                        : existingInputSession
                          ? 'Perbarui Presensi Pertemuan'
                          : 'Simpan Presensi Sekarang'}
                  </span>
                </button>
              </section>
            )}
          </div>
        )}

        {/* ===================== TAB 2: REKAP & ANALISIS ===================== */}
        {(isStudent || activeTab === 'rekap') && (
          <div className="space-y-6">
            {/* Filter & Action Toolbar */}
            <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setRecapScope('Bulanan')}
                    className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      recapScope === 'Bulanan'
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Rekap Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecapScope('Semester')}
                    className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      recapScope === 'Semester'
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Rekap Semester ({schoolSettings.semester})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Unduh Excel/CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintPreview(true)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center gap-2 transition-all whitespace-nowrap"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Pratinjau & Cetak A4</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Bulan Kalender
                  </label>
                  <input
                    type="month"
                    value={recapMonth}
                    onChange={(e) => {
                      if (e.target.value) {
                        setRecapMonth(e.target.value);
                        setSelectedHeatmapDate(null);
                      }
                    }}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                {!isStudent && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Filter Kelas / Rombel
                    </label>
                    <select
                      value={recapClassId}
                      onChange={(e) => setRecapClassId(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="ALL">Semua Kelas</option>
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Filter Mata Pelajaran
                  </label>
                  <select
                    value={recapSubjectId}
                    onChange={(e) => setRecapSubjectId(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="ALL">Semua Mata Pelajaran</option>
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} ({sub.paket})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Batas Minimal Kehadiran (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={95}
                      step={5}
                      value={minThreshold}
                      onChange={(e) =>
                        setMinThreshold(Math.max(50, Math.min(95, Number(e.target.value) || 75)))
                      }
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-bold font-mono text-slate-900 dark:text-white"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick KPI Summary Strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Hadir</p>
                <p className="mt-1 font-display font-extrabold text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums">
                  <CountUpNumber value={recapTotals.hadir} />
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dari {recapTotals.total} catatan
                </p>
              </div>
              <div className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Izin & Sakit</p>
                <p className="mt-1 font-display font-extrabold text-2xl text-amber-600 dark:text-amber-400 tabular-nums">
                  <CountUpNumber value={recapTotals.izin + recapTotals.sakit} />
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {recapTotals.izin} Izin · {recapTotals.sakit} Sakit
                </p>
              </div>
              <div className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Alpa</p>
                <p className="mt-1 font-display font-extrabold text-2xl text-rose-600 dark:text-rose-400 tabular-nums">
                  <CountUpNumber value={recapTotals.alpa} />
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Tanpa keterangan</p>
              </div>
              <div className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Di Bawah {minThreshold}%
                </p>
                <p
                  className={`mt-1 font-display font-extrabold text-2xl tabular-nums ${
                    warningCount > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  <CountUpNumber value={warningCount} />
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {warningCount > 0 ? 'Perlu tindak lanjut' : 'Semua aman memenuhi'}
                </p>
              </div>
            </section>

            {/* Kalender Heatmap + Grafik Donat Persentase */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kalender Heatmap Kehadiran */}
              <section className="lg:col-span-7 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                      Kalender Heatmap Kehadiran
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Klik tanggal berwarna untuk melihat detail sesi dan riwayat pertemuan
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1.5 bg-[#FAFAF7] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => shiftMonth(-1)}
                      aria-label="Bulan sebelumnya"
                      className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {formatMonthLabel(recapMonth)}
                    </span>
                    <button
                      type="button"
                      onClick={() => shiftMonth(1)}
                      aria-label="Bulan berikutnya"
                      className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Day Names Header */}
                <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-400 uppercase mb-2">
                  {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar Cells */}
                <div className="grid grid-cols-7 gap-1.5">
                  {heatmapCalendar.cells.map((cell) => {
                    if (!cell.day || !cell.dateStr) {
                      return <div key={cell.key} className="h-12 sm:h-14 rounded-xl bg-transparent" />;
                    }
                    const info = cell.info;
                    const isSelected = selectedHeatmapDate === cell.dateStr;

                    let toneClass =
                      'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200/70 dark:border-slate-800';
                    if (info) {
                      if (info.rate >= 90) {
                        toneClass =
                          'bg-emerald-700 text-white border-emerald-800 shadow-sm hover:bg-emerald-800';
                      } else if (info.rate >= minThreshold) {
                        toneClass =
                          'bg-emerald-500/85 text-white border-emerald-600 shadow-sm hover:bg-emerald-600';
                      } else if (info.rate >= 50) {
                        toneClass =
                          'bg-amber-400 text-amber-950 border-amber-500 shadow-sm hover:bg-amber-500';
                      } else {
                        toneClass =
                          'bg-rose-600 text-white border-rose-700 shadow-sm hover:bg-rose-700';
                      }
                    }

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        disabled={!info}
                        onClick={() =>
                          setSelectedHeatmapDate(isSelected ? null : cell.dateStr || null)
                        }
                        title={
                          info
                            ? `${cell.dateStr}: ${info.rate}% Hadir (${info.hadir}/${info.total})`
                            : `${cell.dateStr}: Tidak ada sesi`
                        }
                        className={`h-12 sm:h-14 rounded-xl border flex flex-col items-center justify-center transition-all ${toneClass} ${
                          isSelected ? 'ring-2 ring-offset-2 ring-amber-500 scale-[1.03]' : ''
                        } ${info ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className="text-xs sm:text-sm font-bold tabular-nums leading-none">
                          {cell.day}
                        </span>
                        {info && (
                          <span className="mt-1 text-[10px] font-mono font-bold tabular-nums opacity-95 leading-none">
                            {info.rate}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
                      Kosong
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-rose-600" />
                      &lt;50%
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-amber-400" />
                      50–{minThreshold - 1}%
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-emerald-500" />
                      {minThreshold}–89%
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-emerald-700" />
                      90–100%
                    </span>
                  </div>
                  <span className="tabular-nums font-medium">
                    {heatmapMonthSessions.length} sesi pada bulan ini
                  </span>
                </div>

                {/* Clicked Day Session Breakdown */}
                {selectedHeatmapDate && selectedDaySessions.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/70 border border-emerald-950/10 dark:border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-800 dark:text-white">
                        Detail Pertemuan: {formatDateIndo(selectedHeatmapDate)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedHeatmapDate(null)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {selectedDaySessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {sess.className} · {sess.subjectName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Tutor: {sess.teacherName} · H:{sess.summaryHadir} I:{sess.summaryIzin} S:
                            {sess.summarySakit} A:{sess.summaryAlpa}
                          </p>
                        </div>
                        {!isStudent && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClassId(sess.classId);
                                setSelectedSubjectId(sess.subjectId);
                                setSelectedDate(sess.date);
                                setActiveTab('input');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-100"
                            >
                              Edit Sesi
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteSessionTarget(sess)}
                              aria-label="Hapus sesi presensi"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Grafik Donat Persentase Kehadiran */}
              <section className="lg:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                    Grafik Persentase Kehadiran
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Proporsi Hadir, Izin, Sakit, dan Alpa ({printLabels.periodLabel})
                  </p>
                </div>

                {recapTotals.total === 0 ? (
                  <div className="my-8 text-center text-xs text-slate-400">
                    Belum ada data presensi pada rentang filter ini.
                  </div>
                ) : (
                  <div className="relative h-60 w-full my-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={recapTotals.chartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={88}
                          paddingAngle={3}
                          isAnimationActive={!motionProfile.reducedMotion}
                          animationDuration={ANIMATION_DURATIONS.chartMs}
                          animationEasing="ease-out"
                        >
                          {recapTotals.chartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid rgba(4,120,87,0.18)',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 dark:text-white tabular-nums">
                        {recapTotals.rate}%
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Tingkat Hadir
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {[
                    { label: 'Hadir', count: recapTotals.hadir, color: 'bg-emerald-600' },
                    { label: 'Izin', count: recapTotals.izin, color: 'bg-sky-600' },
                    { label: 'Sakit', count: recapTotals.sakit, color: 'bg-amber-500' },
                    { label: 'Alpa', count: recapTotals.alpa, color: 'bg-rose-600' },
                  ].map((item) => {
                    const pct =
                      recapTotals.total > 0 ? Math.round((item.count / recapTotals.total) * 100) : 0;
                    return (
                      <div
                        key={item.label}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/60 text-xs"
                      >
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                          <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                          {item.label}
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Tabel Rekap Bulanan & Semester + Badge Peringatan Merah */}
            <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                    Tabel Rekap Kehadiran {recapScope}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Menampilkan akumulasi {filteredRecapSessions.length} sesi pertemuan · Batas minimal{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {minThreshold}%
                    </span>
                  </p>
                </div>

                {warningCount > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{warningCount} Warga Belajar Di Bawah Batas Kehadiran</span>
                  </div>
                )}
              </div>

              {recapRows.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Filter}
                    title="Belum Ada Data Rekap Pada Filter Ini"
                    description="Ubah pilihan bulan, kelas, atau mata pelajaran, atau catat presensi baru terlebih dahulu."
                    actionLabel={!isStudent ? 'Catat Presensi Sekarang' : undefined}
                    onAction={!isStudent ? () => setActiveTab('input') : undefined}
                  />
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FAFAF7] dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                          <th className="py-3.5 px-5">Warga Belajar</th>
                          <th className="py-3.5 px-4">Kelas</th>
                          <th className="py-3.5 px-3 text-center">Sesi</th>
                          <th className="py-3.5 px-3 text-center text-emerald-700 dark:text-emerald-400">
                            Hadir
                          </th>
                          <th className="py-3.5 px-3 text-center text-sky-700 dark:text-sky-400">
                            Izin
                          </th>
                          <th className="py-3.5 px-3 text-center text-amber-700 dark:text-amber-400">
                            Sakit
                          </th>
                          <th className="py-3.5 px-3 text-center text-rose-700 dark:text-rose-400">
                            Alpa
                          </th>
                          <th className="py-3.5 px-4 w-44">Persentase</th>
                          <th className="py-3.5 px-5 text-right">Status Kehadiran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                        {recapRows.map((row) => (
                          <tr
                            key={row.studentId}
                            className={`transition-colors ${
                              row.belowThreshold
                                ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70'
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-3">
                                <InitialAvatar name={row.studentName} size="sm" />
                                <div>
                                  <p className="font-bold text-slate-900 dark:text-white">
                                    {row.studentName}
                                  </p>
                                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                                    NIS {row.studentNis}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                              {row.className}
                            </td>
                            <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                              {row.meetings}
                            </td>
                            <td className="py-3.5 px-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                              {row.hadir}
                            </td>
                            <td className="py-3.5 px-3 text-center font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                              {row.izin}
                            </td>
                            <td className="py-3.5 px-3 text-center font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                              {row.sakit}
                            </td>
                            <td className="py-3.5 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                              {row.alpa}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      row.belowThreshold ? 'bg-rose-600' : 'bg-emerald-600'
                                    }`}
                                    style={{ width: `${Math.min(100, row.percentage)}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-xs font-mono font-bold tabular-nums w-11 text-right ${
                                    row.belowThreshold
                                      ? 'text-rose-700 dark:text-rose-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {row.percentage}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              {row.belowThreshold ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-bold whitespace-nowrap">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Di Bawah {minThreshold}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap">
                                  <Check className="w-3.5 h-3.5" />
                                  Memenuhi Syarat
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {recapRows.map((row) => (
                      <div key={row.studentId} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <InitialAvatar name={row.studentName} size="sm" />
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                {row.studentName}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500">
                                NIS {row.studentNis} · {row.className}
                              </p>
                            </div>
                          </div>
                          {row.belowThreshold ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[11px] font-bold shrink-0">
                              <AlertTriangle className="w-3 h-3" />
                              {row.percentage}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold shrink-0">
                              {row.percentage}%
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                          <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                            <p className="text-[10px] text-slate-400">Sesi</p>
                            <p className="font-mono font-bold">{row.meetings}</p>
                          </div>
                          <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                            <p className="text-[10px]">Hadir</p>
                            <p className="font-mono font-bold">{row.hadir}</p>
                          </div>
                          <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300">
                            <p className="text-[10px]">Izin</p>
                            <p className="font-mono font-bold">{row.izin}</p>
                          </div>
                          <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                            <p className="text-[10px]">Sakit</p>
                            <p className="font-mono font-bold">{row.sakit}</p>
                          </div>
                          <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                            <p className="text-[10px]">Alpa</p>
                            <p className="font-mono font-bold">{row.alpa}</p>
                          </div>
                        </div>
                        {row.belowThreshold && (
                          <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            Kehadiran di bawah batas minimal {minThreshold}% — perlu pembinaan.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Student Detailed History Log (especially helpful for Murid) */}
            {isStudent && filteredRecapSessions.length > 0 && (
              <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mb-3">
                  Riwayat Pertemuan Saya
                </h3>
                <div className="space-y-2.5">
                  {[...filteredRecapSessions]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((sess) => {
                      const rec = sess.records[0];
                      if (!rec) return null;
                      return (
                        <div
                          key={sess.id}
                          className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {sess.subjectName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateIndo(sess.date)} · Tutor: {sess.teacherName}
                              {rec.note ? ` · Catatan: ${rec.note}` : ''}
                            </p>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-bold ${
                              rec.status === 'Hadir'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : rec.status === 'Izin'
                                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                  : rec.status === 'Sakit'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Modal Pratinjau Cetak A4 */}
      <AnimatePresence>
        {showPrintPreview && (
          <div
            role="dialog"
            aria-modal="true"
            className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: scaledDuration(0.2) }}
              onClick={() => setShowPrintPreview(false)}
              className={`fixed inset-0 bg-slate-950/65 ${
                motionProfile.enableBlur ? 'backdrop-blur-sm' : ''
              }`}
            />
            <motion.div
              initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }}
              animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
              transition={{
                duration: scaledDuration(ANIMATION_DURATIONS.modal),
                ease: ANIMATION_EASE.smoothOut,
              }}
              className="relative z-10 w-full max-w-4xl max-h-[92vh] rounded-2xl border border-emerald-950/15 dark:border-white/15 bg-slate-100 dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Pratinjau Cetak A4 — Rekap Presensi {recapScope}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sudah dilengkapi kop surat resmi PKBM, logo, TTD Kepala PKBM &amp; Tutor, serta cap stempel.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={handleDownloadAttendancePdf}
                    className="btn-ripple min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm whitespace-nowrap disabled:opacity-60"
                  >
                    <FileDown className={`w-4 h-4 ${exportingPdf ? 'animate-bounce' : ''}`} />
                    <span>{exportingPdf ? 'Menyusun PDF...' : 'Unduh PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      showToast('Membuka dialog cetak A4...', 'info');
                      setTimeout(() => window.print(), 120);
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Cetak A4</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintPreview(false)}
                    aria-label="Tutup pratinjau"
                    className="min-h-[42px] min-w-[42px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <AttendancePrintSheet
                  schoolSettings={schoolSettings}
                  recapScope={recapScope}
                  periodLabel={printLabels.periodLabel}
                  classLabel={printLabels.classLabel}
                  subjectLabel={printLabels.subjectLabel}
                  teacherName={printLabels.teacherName}
                  totalSessions={filteredRecapSessions.length}
                  minThreshold={minThreshold}
                  rows={recapRows}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden A4 Sheet dedicated for window.print() */}
      <div className="hidden print:block">
        <AttendancePrintSheet
          schoolSettings={schoolSettings}
          recapScope={recapScope}
          periodLabel={printLabels.periodLabel}
          classLabel={printLabels.classLabel}
          subjectLabel={printLabels.subjectLabel}
          teacherName={printLabels.teacherName}
          totalSessions={filteredRecapSessions.length}
          minThreshold={minThreshold}
          rows={recapRows}
        />
      </div>

      {/* Confirm Delete Session */}
      <ConfirmDialog
        open={Boolean(deleteSessionTarget)}
        title="Hapus Catatan Sesi Presensi?"
        description={
          deleteSessionTarget
            ? `Catatan presensi ${deleteSessionTarget.className} (${deleteSessionTarget.subjectName}) tanggal ${deleteSessionTarget.date} akan dihapus permanen.`
            : ''
        }
        onCancel={() => setDeleteSessionTarget(null)}
        onConfirm={async () => {
          if (deleteSessionTarget) {
            await deleteAttendanceSession(deleteSessionTarget.id);
            showToast('Sesi presensi berhasil dihapus', 'success');
            setDeleteSessionTarget(null);
            setSelectedHeatmapDate(null);
          }
        }}
      />
    </div>
  );
};
