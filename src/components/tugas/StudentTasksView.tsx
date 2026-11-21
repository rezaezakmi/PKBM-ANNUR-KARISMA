import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Award,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileText,
  Filter,
  MessageSquare,
  MonitorPlay,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  AttendanceSession,
  ExamSubmission,
  Student,
  Subject,
  TaskAttachment,
  TaskSubmission,
  TeacherTask,
  TeachingAssignment,
} from '../../types/siakad';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../ui/EmptyState';
import { CountUpNumber } from '../ui/CountUpNumber';
import { getStaggerItemProps, useAdaptiveMotion } from '../../config/animations';
import {
  DisplaySubmissionStatus,
  downloadAttachment,
  formatFileSize,
  formatIndonesianDateTime,
  getCountdownInfo,
  getGreetingByHour,
  getIndonesianWeekday,
  getSubjectBadgeTone,
  getSubmissionStatusMeta,
} from './taskHelpers';

interface StudentTasksViewProps {
  currentStudent: Student;
  tasks: TeacherTask[];
  taskSubmissions: TaskSubmission[];
  assignments: TeachingAssignment[];
  subjects: Subject[];
  attendanceSessions: AttendanceSession[];
  examSubmissions: ExamSubmission[];
  nowMs: number;
  onUploadFile: (
    file: File,
    folder: string,
    onProgress?: (pct: number) => void
  ) => Promise<TaskAttachment>;
  onSubmitTask: (
    item: Omit<
      TaskSubmission,
      | 'id'
      | 'studentUid'
      | 'status'
      | 'isLate'
      | 'score'
      | 'feedback'
      | 'gradedBy'
      | 'gradedAt'
      | 'submittedAt'
      | 'updatedAt'
    >,
    dueAt: string
  ) => Promise<TaskSubmission>;
}

type StatusFilter = 'Semua' | DisplaySubmissionStatus;

export const StudentTasksView: React.FC<StudentTasksViewProps> = ({
  currentStudent,
  tasks,
  taskSubmissions,
  assignments,
  subjects,
  attendanceSessions,
  examSubmissions,
  nowMs,
  onUploadFile,
  onSubmitTask,
}) => {
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Semua');
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [activeTask, setActiveTask] = useState<TeacherTask | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerAttachments, setAnswerAttachments] = useState<TaskAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Strict class + subject + teacher matching rule:
  // "Tugas hanya muncul bagi murid di kelas dan mapel yang sesuai dengan guru pembuatnya."
  const classAssignments = useMemo(
    () => assignments.filter((a) => a.classId === currentStudent.classId && a.status === 'Aktif'),
    [assignments, currentStudent.classId]
  );

  const myTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        // Tasks sent to Kelas Online match all students in that Paket jenjang (or matching classId)
        const isOnlineTask = t.deliveryMode === 'online' || Boolean(t.onlineClassId);
        if (isOnlineTask) {
          return t.paket === currentStudent.paket || t.classId === currentStudent.classId;
        }
        if (t.classId !== currentStudent.classId) return false;
        const subjectAsgs = classAssignments.filter((a) => a.subjectId === t.subjectId);
        if (subjectAsgs.length > 0) {
          return subjectAsgs.some(
            (a) => a.teacherId === t.teacherId || a.teacherUid === t.teacherUid
          );
        }
        // If no explicit assignment record exists yet for this class+subject, require matching Paket (or allow if subject missing)
        const subj = subjects.find((s) => s.id === t.subjectId);
        return subj ? subj.paket === currentStudent.paket : true;
      })
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [tasks, currentStudent.classId, currentStudent.paket, classAssignments, subjects]);

  const submissionByTaskId = useMemo(() => {
    const map = new Map<string, TaskSubmission>();
    taskSubmissions.forEach((sub) => {
      if (
        sub.studentId === currentStudent.id ||
        sub.studentUid === currentStudent.ownerUid ||
        sub.studentNis === currentStudent.nis
      ) {
        map.set(sub.taskId, sub);
      }
    });
    return map;
  }, [taskSubmissions, currentStudent]);

  // Urgent tasks to submit soon (Belum or Perlu Revisi)
  const urgentTasks = useMemo(() => {
    return myTasks
      .filter((t) => {
        const sub = submissionByTaskId.get(t.id);
        return !sub || sub.status === 'Revisi';
      })
      .slice(0, 4);
  }, [myTasks, submissionByTaskId]);

  // Student Attendance Percentage
  const attendanceStats = useMemo(() => {
    let total = 0;
    let hadir = 0;
    attendanceSessions.forEach((sess) => {
      if (sess.classId !== currentStudent.classId) return;
      const rec = sess.records.find(
        (r) => r.studentId === currentStudent.id || r.studentNis === currentStudent.nis
      );
      if (rec) {
        total += 1;
        if (rec.status === 'Hadir') hadir += 1;
      }
    });
    const pct = total > 0 ? Math.round((hadir / total) * 100) : 100;
    return { total, hadir, pct };
  }, [attendanceSessions, currentStudent]);

  // Today's Schedule
  const todayWeekday = useMemo(() => getIndonesianWeekday(new Date()), []);
  const todaySchedule = useMemo(
    () =>
      classAssignments.filter(
        (a) => a.scheduleDay.toLowerCase() === todayWeekday.toLowerCase()
      ),
    [classAssignments, todayWeekday]
  );

  // Latest Graded Scores (combining graded tasks and graded exams)
  const recentGrades = useMemo(() => {
    const taskGrades = Array.from(submissionByTaskId.values())
      .filter((s) => s.status === 'Sudah Dinilai')
      .map((s) => ({
        id: s.id,
        title: s.taskTitle,
        subject: s.subjectName,
        score: s.score,
        type: 'Tugas' as const,
        date: s.gradedAt || s.updatedAt,
        feedback: s.feedback,
      }));

    const examGrades = examSubmissions
      .filter(
        (es) =>
          (es.studentUid === currentStudent.ownerUid ||
            es.studentNis === currentStudent.nis) &&
          es.status === 'Selesai Dinilai'
      )
      .map((es) => ({
        id: es.id,
        title: es.examTitle,
        subject: 'Ujian Online',
        score: es.finalScore,
        type: 'Ujian' as const,
        date: es.updatedAt,
        feedback: '',
      }));

    return [...taskGrades, ...examGrades]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4);
  }, [submissionByTaskId, examSubmissions, currentStudent]);

  const averageScore = useMemo(() => {
    if (recentGrades.length === 0) return 0;
    const sum = recentGrades.reduce((acc, g) => acc + g.score, 0);
    return Math.round(sum / recentGrades.length);
  }, [recentGrades]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      Semua: myTasks.length,
      Belum: 0,
      Revisi: 0,
      Terkumpul: 0,
      Terlambat: 0,
      'Sudah Dinilai': 0,
    };
    myTasks.forEach((t) => {
      const st: DisplaySubmissionStatus = submissionByTaskId.get(t.id)?.status || 'Belum';
      counts[st] += 1;
    });
    return counts;
  }, [myTasks, submissionByTaskId]);

  const filteredTasks = useMemo(() => {
    return myTasks.filter((t) => {
      if (statusFilter === 'Semua') return true;
      const st: DisplaySubmissionStatus = submissionByTaskId.get(t.id)?.status || 'Belum';
      return st === statusFilter;
    });
  }, [myTasks, statusFilter, submissionByTaskId]);

  const openTaskPanel = (task: TeacherTask) => {
    const existing = submissionByTaskId.get(task.id);
    setActiveTask(task);
    setAnswerText(existing?.answerText || '');
    setAnswerAttachments(existing?.attachments || []);
    setUploadProgress(null);
    setModalError('');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setModalError('');
    const list = Array.from(files).slice(0, 4);
    for (const file of list) {
      if (file.size > 5 * 1024 * 1024) {
        const msg = `Ukuran berkas "${file.name}" melebihi batas 5 MB.`;
        setModalError(msg);
        showToast(msg, 'warning');
        continue;
      }
      try {
        setUploadProgress(8);
        const uploaded = await onUploadFile(file, 'jawaban_murid', (pct) => setUploadProgress(pct));
        setAnswerAttachments((prev) => [...prev, uploaded]);
        showToast(`Berkas "${file.name}" siap dikirim.`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal mengunggah lampiran jawaban.';
        setModalError(msg);
        showToast(msg, 'error');
      } finally {
        setUploadProgress(null);
      }
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask) return;
    setModalError('');
    if (!answerText.trim() && answerAttachments.length === 0) {
      const msg = 'Isi kolom catatan/jawaban atau unggah minimal satu berkas lampiran.';
      setModalError(msg);
      showToast(msg, 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const mergedAccess = Array.from(
        new Set(
          [
            ...(activeTask.accessUids || []),
            activeTask.teacherUid,
            activeTask.ownerUid,
          ].filter(Boolean)
        )
      );

      const saved = await onSubmitTask(
        {
          taskId: activeTask.id,
          taskTitle: activeTask.title,
          classId: activeTask.classId,
          className: activeTask.className,
          subjectId: activeTask.subjectId,
          subjectName: activeTask.subjectName,
          studentId: currentStudent.id,
          studentName: currentStudent.fullName,
          studentNis: currentStudent.nis || currentStudent.id,
          answerText: answerText.trim(),
          attachments: answerAttachments,
          accessUids: mergedAccess,
        },
        activeTask.dueAt
      );

      showToast(
        saved.status === 'Terlambat'
          ? 'Jawaban berhasil dikirim (tercatat terlambat melewati tenggat).'
          : 'Jawaban dan lampiran tugas berhasil dikirim ke guru.',
        saved.status === 'Terlambat' ? 'warning' : 'success'
      );
      setActiveTask(null);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Gagal mengirim jawaban tugas. Coba beberapa saat lagi.';
      setModalError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const greeting = getGreetingByHour(new Date());
  const firstName = currentStudent.fullName.split(' ')[0];

  return (
    <div className="space-y-6">
      {/* BERANDA MURID YANG RAMAH & PENUH WARNA */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-600 to-amber-500 p-6 sm:p-7 text-white shadow-lg shadow-emerald-950/15"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-100">
              <span>{currentStudent.paket}</span>
              <span aria-hidden="true">·</span>
              <span>{currentStudent.className}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">NIS {currentStudent.nis}</span>
            </div>
            <h2 className="mt-1.5 font-display font-extrabold text-2xl sm:text-3xl tracking-tight">
              {greeting}, {firstName}!
            </h2>
            <p className="mt-1.5 text-sm text-emerald-50/95 max-w-2xl leading-relaxed">
              {urgentTasks.length > 0
                ? `Semangat belajar hari ini! Ada ${urgentTasks.length} tugas yang perlu segera kamu selesaikan atau perbaiki.`
                : 'Hebat! Semua tugasmu saat ini sudah terkumpul. Tetap pantau jadwal belajar dan pengumuman terbaru.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <div className="rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2.5">
              <p className="text-[11px] font-medium text-emerald-50/90">Kehadiran Kamu</p>
              <p className="font-display font-extrabold text-2xl tabular-nums">
                <CountUpNumber value={attendanceStats.pct} suffix="%" />
              </p>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2.5">
              <p className="text-[11px] font-medium text-emerald-50/90">Perlu Dikerjakan</p>
              <p className="font-display font-extrabold text-2xl tabular-nums">
                <CountUpNumber value={statusCounts.Belum + statusCounts.Revisi} />
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 4 Colorful Mini Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-gradient-to-br from-amber-50 to-orange-50/70 dark:from-amber-950/40 dark:to-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Belum / Revisi</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
            {statusCounts.Belum + statusCounts.Revisi}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
            {statusCounts.Revisi > 0 ? `${statusCounts.Revisi} perlu revisi` : 'Segera kumpulkan'}
          </p>
        </div>

        <div className="rounded-2xl border border-sky-200/80 dark:border-sky-800/60 bg-gradient-to-br from-sky-50 to-cyan-50/70 dark:from-sky-950/40 dark:to-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-sky-800 dark:text-sky-300">Jadwal Hari Ini</span>
            <CalendarClock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="mt-2 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
            {todaySchedule.length}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
            Hari {todayWeekday} ({classAssignments.length} total mapel)
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 to-teal-50/70 dark:from-emerald-950/40 dark:to-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Kehadiran</span>
            <CalendarCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
            {attendanceStats.pct}%
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
            {attendanceStats.total > 0
              ? `${attendanceStats.hadir} dari ${attendanceStats.total} pertemuan`
              : 'Belum ada sesi tercatat'}
          </p>
        </div>

        <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/60 bg-gradient-to-br from-violet-50 to-purple-50/70 dark:from-violet-950/40 dark:to-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-violet-800 dark:text-violet-300">Rata-rata Nilai</span>
            <Award className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="mt-2 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
            {recentGrades.length > 0 ? averageScore : '-'}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
            {recentGrades.length} penilaian terbaru
          </p>
        </div>
      </section>

      {/* Highlight Row: Tugas Mendesak + Jadwal Hari Ini + Nilai Terbaru */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Tugas Harus Segera Dikumpulkan */}
        <section className="lg:col-span-7 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Tugas yang Harus Segera Dikumpulkan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Prioritas tenggat terdekat untuk {currentStudent.className}
              </p>
            </div>
          </div>

          {urgentTasks.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 flex items-center gap-3.5">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Semua Tugas Sudah Terkumpul!
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Tidak ada tugas tertunda atau revisi yang harus segera dikirimkan.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentTasks.map((t) => {
                const sub = submissionByTaskId.get(t.id);
                const statusMeta = getSubmissionStatusMeta(sub?.status || 'Belum');
                const countdown = getCountdownInfo(t.dueAt, nowMs);
                const tone = getSubjectBadgeTone(t.subjectName);
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-[#FAFAF7] dark:bg-slate-800/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-emerald-500 transition-colors"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold ${tone.badgeBg} ${tone.badgeText} ${tone.badgeBorder}`}
                        >
                          {t.subjectName}
                        </span>
                        {(t.deliveryMode === 'online' || Boolean(t.onlineClassId)) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/50 text-[11px] font-bold text-teal-800 dark:text-teal-300">
                            <MonitorPlay className="w-3 h-3" />
                            Kelas Online
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold ${statusMeta.classes}`}
                        >
                          {statusMeta.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                            countdown.isOverdue
                              ? 'text-rose-600 dark:text-rose-400'
                              : countdown.isUrgent
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {countdown.label}
                        </span>
                      </div>
                      <h4 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                        {t.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Tutor: {t.teacherName} · Tenggat {formatIndonesianDateTime(t.dueAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openTaskPanel(t)}
                      className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold shadow-sm hover:brightness-105 shrink-0 whitespace-nowrap"
                    >
                      {sub?.status === 'Revisi' ? 'Perbaiki Revisi' : 'Kerjakan Tugas'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Jadwal Hari Ini & Nilai Terbaru */}
        <div className="lg:col-span-5 space-y-5">
          {/* Jadwal Hari Ini */}
          <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {showFullSchedule ? 'Jadwal Mingguan Kelas' : `Jadwal Hari ${todayWeekday}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{currentStudent.className}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullSchedule((v) => !v)}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
              >
                {showFullSchedule ? 'Hari Ini Saja' : 'Lihat Mingguan'}
              </button>
            </div>

            {(showFullSchedule ? classAssignments : todaySchedule).length === 0 ? (
              <div className="rounded-xl bg-[#FAFAF7] dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700 p-4 text-xs text-slate-600 dark:text-slate-400">
                Jadwal belajar PKBM dilaksanakan pada hari <span className="font-semibold text-emerald-700 dark:text-emerald-400">Sabtu – Minggu</span>. Tidak ada jadwal tatap muka pada hari {todayWeekday}. Klik &ldquo;Lihat Mingguan&rdquo; untuk melihat seluruh jadwal kelas.
              </div>
            ) : (
              <div className="space-y-2">
                {(showFullSchedule ? classAssignments : todaySchedule).map((asg) => {
                  const tone = getSubjectBadgeTone(asg.subjectName);
                  return (
                    <div
                      key={asg.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {asg.subjectName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {asg.teacherName}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold shrink-0 tabular-nums ${tone.badgeBg} ${tone.badgeText} ${tone.badgeBorder}`}
                      >
                        {showFullSchedule ? `${asg.scheduleDay} · ` : ''}
                        {asg.scheduleTime}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Nilai Terbaru */}
          <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mb-3">
              Nilai Terbaru
            </h3>
            {recentGrades.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada nilai tugas atau ujian yang diterbitkan oleh guru.
              </p>
            ) : (
              <div className="space-y-2">
                {recentGrades.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {g.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {g.type} · {g.subject}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 font-display font-extrabold text-sm tabular-nums shrink-0">
                      {g.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* DAFTAR TUGAS DENGAN STATUS BERWARNA */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
              Daftar Tugas Kelas {currentStudent.className}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Menampilkan tugas mata pelajaran yang diampu oleh tutor kelas Anda
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
              <Filter className="w-3.5 h-3.5" />
              Status:
            </span>
            {(
              ['Semua', 'Belum', 'Revisi', 'Terkumpul', 'Terlambat', 'Sudah Dinilai'] as StatusFilter[]
            ).map((key) => {
              const label =
                key === 'Semua'
                  ? 'Semua'
                  : key === 'Belum'
                    ? 'Belum'
                    : key === 'Revisi'
                      ? 'Revisi'
                      : key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                    statusFilter === key
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500'
                  }`}
                >
                  {label} ({statusCounts[key]})
                </button>
              );
            })}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Belum Ada Tugas di Kategori Ini"
            description={
              myTasks.length === 0
                ? `Belum ada tugas aktif dari tutor untuk kelas ${currentStudent.className}.`
                : 'Tidak ada tugas yang cocok dengan filter status saat ini.'
            }
            actionLabel={statusFilter !== 'Semua' ? 'Tampilkan Semua Tugas' : undefined}
            onAction={statusFilter !== 'Semua' ? () => setStatusFilter('Semua') : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTasks.map((task, idx) => {
              const sub = submissionByTaskId.get(task.id);
              const displayStatus: DisplaySubmissionStatus = sub ? sub.status : 'Belum';
              const statusMeta = getSubmissionStatusMeta(displayStatus);
              const tone = getSubjectBadgeTone(task.subjectName);
              const countdown = getCountdownInfo(task.dueAt, nowMs);

              return (
                <motion.article
                  key={task.id}
                  {...getStaggerItemProps(idx, motionProfile)}
                  className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold ${tone.badgeBg} ${tone.badgeText} ${tone.badgeBorder}`}
                      >
                        {task.subjectName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${statusMeta.classes}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                        {statusMeta.label}
                      </span>
                    </div>

                    {(task.deliveryMode === 'online' || Boolean(task.onlineClassId)) && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-400">
                        <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          Kelas Online · {task.onlineClassTitle || task.paket}
                        </span>
                      </div>
                    )}

                    <div>
                      <h4 className="font-display font-bold text-base text-slate-900 dark:text-white leading-snug">
                        {task.title}
                      </h4>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                        {task.description}
                      </p>
                    </div>

                    {sub?.status === 'Revisi' && sub.feedback && (
                      <div className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/70 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-200">
                        <p className="font-bold inline-flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Catatan Revisi Guru:
                        </p>
                        <p className="mt-1 leading-relaxed">{sub.feedback}</p>
                      </div>
                    )}

                    {sub?.status === 'Sudah Dinilai' && (
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                            Nilai Akhir Anda
                          </p>
                          {sub.feedback && (
                            <p className="text-xs text-slate-700 dark:text-slate-300 truncate mt-0.5">
                              &ldquo;{sub.feedback}&rdquo;
                            </p>
                          )}
                        </div>
                        <span className="font-display font-extrabold text-xl text-emerald-700 dark:text-emerald-300 tabular-nums shrink-0">
                          {sub.score}/{task.maxScore}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400 truncate">
                        <BookOpen className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                        {task.teacherName}
                      </span>
                      <span
                        className={`font-bold tabular-nums shrink-0 ${
                          countdown.isOverdue
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {countdown.shortLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openTaskPanel(task)}
                      className={`w-full min-h-[42px] px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                        displayStatus === 'Belum' || displayStatus === 'Revisi'
                          ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm hover:brightness-105'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {displayStatus === 'Belum'
                        ? 'Kerjakan & Unggah Jawaban'
                        : displayStatus === 'Revisi'
                          ? 'Perbaiki & Kirim Ulang'
                          : displayStatus === 'Sudah Dinilai'
                            ? 'Lihat Detail & Nilai'
                            : 'Lihat / Perbarui Jawaban'}
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* SUBMISSION MODAL / DRAWER WITH DRAG & DROP + PROGRESS BAR */}
      {activeTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-task-modal-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setActiveTask(null)}
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-5">
            {(() => {
              const currentSub = submissionByTaskId.get(activeTask.id);
              const isLocked = currentSub?.status === 'Sudah Dinilai';
              const tone = getSubjectBadgeTone(activeTask.subjectName);
              const countdown = getCountdownInfo(activeTask.dueAt, nowMs);

              return (
                <>
                  <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-xs font-bold ${tone.badgeBg} ${tone.badgeText} ${tone.badgeBorder}`}
                        >
                          {activeTask.subjectName}
                        </span>
                        {(activeTask.deliveryMode === 'online' || Boolean(activeTask.onlineClassId)) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/50 text-xs font-bold text-teal-800 dark:text-teal-300">
                            <MonitorPlay className="w-3.5 h-3.5" />
                            Kelas Online · {activeTask.paket}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {activeTask.teacherName}
                        </span>
                      </div>
                      <h3
                        id="student-task-modal-title"
                        className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white"
                      >
                        {activeTask.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        Tenggat: {formatIndonesianDateTime(activeTask.dueAt)} ({countdown.label}) · Nilai Maks: {activeTask.maxScore}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTask(null)}
                      aria-label="Tutup detail tugas"
                      className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Instruksi Tugas & Lampiran Guru */}
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[#FAFAF7] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {activeTask.description}
                    </div>

                    {activeTask.attachments.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Lampiran Materi dari Guru:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {activeTask.attachments.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => downloadAttachment(att)}
                              className="min-h-[38px] px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-2 hover:bg-emerald-100"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{att.name}</span>
                              <span className="opacity-70">({formatFileSize(att.sizeBytes)})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Feedback Banner if Graded or Revision */}
                  {currentSub && (currentSub.status === 'Revisi' || currentSub.status === 'Sudah Dinilai') && (
                    <div
                      className={`rounded-xl border p-4 text-xs space-y-1 ${
                        currentSub.status === 'Revisi'
                          ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                          : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold inline-flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4" />
                          {currentSub.status === 'Revisi'
                            ? 'Tugas Dikembalikan untuk Revisi'
                            : 'Tugas Telah Dinilai'}
                        </span>
                        {currentSub.status === 'Sudah Dinilai' && (
                          <span className="font-display font-extrabold text-base tabular-nums">
                            Nilai: {currentSub.score}/{activeTask.maxScore}
                          </span>
                        )}
                      </div>
                      {currentSub.feedback && <p className="leading-relaxed">{currentSub.feedback}</p>}
                    </div>
                  )}

                  {/* Form Kolom Catatan Jawaban & Upload Drag-and-Drop */}
                  <form onSubmit={handleSubmitAnswer} className="space-y-4">
                    {modalError && (
                      <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{modalError}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Kolom Catatan & Jawaban Tugas
                      </label>
                      <textarea
                        rows={4}
                        disabled={isLocked}
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="Tuliskan jawaban atau catatan hasil pekerjaan Anda di kolom ini (dapat dikirim dengan atau tanpa upload file)..."
                        className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>

                    {!isLocked && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          Upload File Jawaban (Opsional — Gambar maks. 5 MB, Dokumen PDF/DOCX maks. 500 KB)
                        </label>
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragActive(true);
                          }}
                          onDragLeave={() => setDragActive(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragActive(false);
                            handleFiles(e.dataTransfer.files);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-all ${
                            dragActive
                              ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 scale-[1.01]'
                              : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-[#FAFAF7] dark:bg-slate-800/40'
                          }`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              handleFiles(e.target.files);
                              e.target.value = '';
                            }}
                          />
                          <UploadCloud className="w-8 h-8 mx-auto text-emerald-600 dark:text-emerald-400" />
                          <p className="mt-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                            Seret & lepas file jawaban di sini, atau klik untuk memilih
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Mendukung PDF, Word, Foto hasil tulisan tangan, atau dokumen presentasi
                          </p>
                        </div>

                        {/* Indikator Progres Upload */}
                        {uploadProgress !== null && (
                          <div className="mt-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30">
                            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1.5">
                              <span>Mengunggah berkas jawaban...</span>
                              <span className="tabular-nums">{uploadProgress}%</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-white dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-200"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {answerAttachments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Berkas Jawaban Terlampir ({answerAttachments.length})
                        </p>
                        {answerAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                                  {att.name}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {formatFileSize(att.sizeBytes)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => downloadAttachment(att)}
                                className="min-h-[34px] px-2.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                Unduh
                              </button>
                              {!isLocked && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAnswerAttachments((prev) => prev.filter((item) => item.id !== att.id))
                                  }
                                  aria-label={`Hapus lampiran ${att.name}`}
                                  className="min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setActiveTask(null)}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                      >
                        Tutup
                      </button>
                      {!isLocked && (
                        <button
                          type="submit"
                          disabled={submitting || uploadProgress !== null}
                          className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-60 inline-flex items-center gap-2 whitespace-nowrap"
                        >
                          <Send className="w-4 h-4" />
                          <span>
                            {submitting
                              ? 'Mengirim...'
                              : currentSub?.status === 'Revisi'
                                ? 'Kirim Perbaikan Revisi'
                                : currentSub
                                  ? 'Perbarui Jawaban'
                                  : 'Kirim Jawaban'}
                          </span>
                        </button>
                      )}
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
