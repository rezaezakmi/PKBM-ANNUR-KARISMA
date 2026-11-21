import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  GraduationCap,
  MonitorPlay,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PaketType, TeacherTask } from '../../types/siakad';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CardGridSkeleton } from '../ui/SkeletonLoader';
import { getStaggerItemProps, useAdaptiveMotion } from '../../config/animations';
import { StudentTasksView } from './StudentTasksView';
import { TaskFormModal } from './TaskFormModal';
import { TaskGradingView } from './TaskGradingView';
import {
  formatIndonesianDateTime,
  getCountdownInfo,
  getSubjectBadgeTone,
} from './taskHelpers';
import { sortClassesByJenjang } from '../../utils/excelUtils';

export const TugasView: React.FC = () => {
  const { profile, effectiveRole } = useAuth();
  const {
    students,
    teachers,
    subjects,
    classes,
    onlineClasses,
    assignments,
    attendanceSessions,
    examSubmissions,
    tasks,
    taskSubmissions,
    loading,
    uploadTaskFile,
    saveTask,
    deleteTask,
    submitStudentTask,
    reviewTaskSubmission,
  } = useData();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [paketFilter, setPaketFilter] = useState<'Semua' | PaketType>('Semua');
  const [classFilter, setClassFilter] = useState<string>('Semua');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TeacherTask | null>(null);
  const [gradingTaskId, setGradingTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  // Live countdown ticker (every 15 seconds normally, every 1 second for crisp minute/second urgency)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentStudent = useMemo(() => {
    if (effectiveRole !== 'murid') return null;
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

  const visibleTeacherTasks = useMemo(() => {
    let list = tasks;
    if (effectiveRole === 'guru' && currentTeacher) {
      const teacherAsgs = assignments.filter(
        (a) => a.teacherId === currentTeacher.id || a.teacherUid === currentTeacher.ownerUid
      );
      list = tasks.filter(
        (t) =>
          t.teacherId === currentTeacher.id ||
          t.teacherUid === currentTeacher.ownerUid ||
          t.ownerUid === profile?.uid ||
          teacherAsgs.some((a) => a.classId === t.classId && a.subjectId === t.subjectId)
      );
    }

    const q = searchQuery.trim().toLowerCase();
    return list
      .filter((t) => {
        const isOnlineTask = t.deliveryMode === 'online' || Boolean(t.onlineClassId);
        const matchPaket = paketFilter === 'Semua' || t.paket === paketFilter;
        let matchClass = true;
        if (classFilter === 'ONLINE_ALL') {
          matchClass = isOnlineTask;
        } else if (classFilter.startsWith('ONLINE_PAKET:')) {
          const targetPaket = classFilter.slice('ONLINE_PAKET:'.length);
          matchClass = isOnlineTask && t.paket === targetPaket;
        } else if (classFilter.startsWith('ONLINE_ROOM:')) {
          const roomId = classFilter.slice('ONLINE_ROOM:'.length);
          matchClass = t.onlineClassId === roomId;
        } else if (classFilter !== 'Semua') {
          matchClass = t.classId === classFilter && !isOnlineTask;
        }
        const matchQuery =
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.subjectName.toLowerCase().includes(q) ||
          t.className.toLowerCase().includes(q) ||
          (t.onlineClassTitle || '').toLowerCase().includes(q);
        return matchPaket && matchClass && matchQuery;
      })
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [
    tasks,
    effectiveRole,
    currentTeacher,
    assignments,
    profile?.uid,
    searchQuery,
    paketFilter,
    classFilter,
  ]);

  const gradingTask = useMemo(
    () => (gradingTaskId ? tasks.find((t) => t.id === gradingTaskId) || null : null),
    [tasks, gradingTaskId]
  );

  // Summary counts for teacher board
  const boardStats = useMemo(() => {
    const ids = new Set(visibleTeacherTasks.map((t) => t.id));
    const relevantSubs = taskSubmissions.filter((s) => ids.has(s.taskId));
    const needReview = relevantSubs.filter(
      (s) => s.status === 'Terkumpul' || s.status === 'Terlambat'
    ).length;
    const graded = relevantSubs.filter((s) => s.status === 'Sudah Dinilai').length;
    const revision = relevantSubs.filter((s) => s.status === 'Revisi').length;
    return {
      totalTasks: visibleTeacherTasks.length,
      needReview,
      graded,
      revision,
    };
  }, [visibleTeacherTasks, taskSubmissions]);

  if (loading) {
    return <CardGridSkeleton count={6} />;
  }

  // STUDENT VIEW
  if (effectiveRole === 'murid') {
    if (!currentStudent) {
      return (
        <EmptyState
          icon={GraduationCap}
          title="Data Warga Belajar Tidak Ditemukan"
          description="Akun Anda belum terhubung dengan data induk murid di SIAKAD. Hubungi operator PKBM untuk melengkapi penautan NIS."
        />
      );
    }

    return (
      <StudentTasksView
        currentStudent={currentStudent}
        tasks={tasks}
        taskSubmissions={taskSubmissions}
        assignments={assignments}
        subjects={subjects}
        attendanceSessions={attendanceSessions}
        examSubmissions={examSubmissions}
        nowMs={nowMs}
        onUploadFile={uploadTaskFile}
        onSubmitTask={submitStudentTask}
      />
    );
  }

  // TEACHER / STAFF GRADING VIEW
  if (gradingTask) {
    const isOnlineGrading = gradingTask.deliveryMode === 'online' || Boolean(gradingTask.onlineClassId);
    const submittedStudentIds = new Set(
      taskSubmissions.filter((sub) => sub.taskId === gradingTask.id).map((sub) => sub.studentId)
    );
    const classStudents = students.filter((s) => {
      if (submittedStudentIds.has(s.id)) return true;
      if (s.status !== 'Aktif') return false;
      if (isOnlineGrading) {
        return s.paket === gradingTask.paket || s.classId === gradingTask.classId;
      }
      return s.classId === gradingTask.classId;
    });
    return (
      <TaskGradingView
        task={gradingTask}
        classStudents={classStudents}
        submissions={taskSubmissions}
        reviewerName={currentTeacher?.fullName || profile?.name || 'Guru PKBM'}
        nowMs={nowMs}
        onReview={reviewTaskSubmission}
        onBack={() => setGradingTaskId(null)}
      />
    );
  }

  // TEACHER / STAFF TASK BOARD — guru mengajar di seluruh Paket (A, B, C) & semua rombel aktif
  const availableFilterClasses = sortClassesByJenjang(
    classes.filter((c) => {
      if (c.status !== 'Aktif') return false;
      if (paketFilter !== 'Semua' && c.paket !== paketFilter) return false;
      return true;
    })
  );

  const availableFilterOnlineClasses = onlineClasses.filter(
    (oc) => oc.isPublished !== false && (paketFilter === 'Semua' || oc.paket === paketFilter)
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white">
              Papan Tugas Pembelajaran
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Kelola penugasan kelas, pantau tenggat waktu pengumpulan, beri nilai, dan kirim catatan revisi kepada warga belajar.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setShowFormModal(true);
            }}
            className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Tugas Baru</span>
          </button>
        </div>

        {/* Summary Strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[#FAFAF7] dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Total Tugas Aktif
            </p>
            <p className="mt-1 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
              {boardStats.totalTasks}
            </p>
          </div>
          <div className="rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 p-3.5">
            <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
              Menunggu Penilaian
            </p>
            <p className="mt-1 font-display font-extrabold text-2xl text-sky-800 dark:text-sky-200 tabular-nums">
              {boardStats.needReview}
            </p>
          </div>
          <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800/60 p-3.5">
            <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              Dalam Revisi Murid
            </p>
            <p className="mt-1 font-display font-extrabold text-2xl text-rose-800 dark:text-rose-200 tabular-nums">
              {boardStats.revision}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 p-3.5">
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Sudah Dinilai
            </p>
            <p className="mt-1 font-display font-extrabold text-2xl text-emerald-800 dark:text-emerald-200 tabular-nums">
              {boardStats.graded}
            </p>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul tugas, mata pelajaran, atau rombel..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <select
          value={paketFilter}
          onChange={(e) => {
            setPaketFilter(e.target.value as 'Semua' | PaketType);
            setClassFilter('Semua');
          }}
          aria-label="Filter berdasarkan Paket"
          className="min-h-[44px] px-3.5 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100"
        >
          <option value="Semua">Semua Paket</option>
          <option value="Paket A">Paket A</option>
          <option value="Paket B">Paket B</option>
          <option value="Paket C">Paket C</option>
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          aria-label="Filter berdasarkan Kelas atau Kelas Online"
          className="min-h-[44px] px-3.5 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100"
        >
          <option value="Semua">Semua Kelas (Reguler & Online)</option>
          <optgroup label="Kelas Online (Sesuai Jenjang)">
            <option value="ONLINE_ALL">Semua Kelas Online</option>
            {(paketFilter === 'Semua' || paketFilter === 'Paket A') && (
              <option value="ONLINE_PAKET:Paket A">Kelas Online — Paket A</option>
            )}
            {(paketFilter === 'Semua' || paketFilter === 'Paket B') && (
              <option value="ONLINE_PAKET:Paket B">Kelas Online — Paket B</option>
            )}
            {(paketFilter === 'Semua' || paketFilter === 'Paket C') && (
              <option value="ONLINE_PAKET:Paket C">Kelas Online — Paket C</option>
            )}
            {availableFilterOnlineClasses.map((oc) => (
              <option key={oc.id} value={`ONLINE_ROOM:${oc.id}`}>
                [Online · {oc.paket}] {oc.title}
              </option>
            ))}
          </optgroup>
          {availableFilterClasses.length > 0 && (
            <optgroup label="Kelas Reguler / Rombel">
              {availableFilterClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </section>

      {/* Task Board Cards */}
      {visibleTeacherTasks.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Belum Ada Tugas Pembelajaran"
          description="Buat tugas pertama untuk kelas ampuan Anda agar warga belajar dapat mengumpulkan jawaban dan mendapatkan umpan balik langsung."
          actionLabel="Buat Tugas Pertama"
          onAction={() => {
            setEditingTask(null);
            setShowFormModal(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleTeacherTasks.map((task, idx) => {
            const subjectTone = getSubjectBadgeTone(task.subjectName);
            const countdown = getCountdownInfo(task.dueAt, nowMs);
            const isOnlineTask = task.deliveryMode === 'online' || Boolean(task.onlineClassId);

            const classStudentTotal = Math.max(
              1,
              students.filter((s) => {
                if (s.status !== 'Aktif') return false;
                if (isOnlineTask) {
                  return s.paket === task.paket || s.classId === task.classId;
                }
                return s.classId === task.classId;
              }).length
            );
            const subs = taskSubmissions.filter((s) => s.taskId === task.id);
            const pendingCount = subs.filter(
              (s) => s.status === 'Terkumpul' || s.status === 'Terlambat'
            ).length;
            const gradedCount = subs.filter((s) => s.status === 'Sudah Dinilai').length;
            const progressPct = Math.min(100, Math.round((subs.length / classStudentTotal) * 100));

            return (
              <motion.article
                key={task.id}
                {...getStaggerItemProps(idx, motionProfile)}
                className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col justify-between"
              >
                <div>
                  {/* Subtle colored top accent bar matching subject */}
                  <div className={`h-1.5 w-full bg-gradient-to-r ${subjectTone.accentBar}`} />

                  <div className="p-5 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold ${subjectTone.badgeBg} ${subjectTone.badgeText} ${subjectTone.badgeBorder}`}
                      >
                        {task.subjectName}
                      </span>
                      {isOnlineTask ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/70 text-xs font-bold text-teal-800 dark:text-teal-300">
                          <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                          Kelas Online · {task.paket}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {task.className}
                        </span>
                      )}
                    </div>

                    {isOnlineTask && task.onlineClassTitle && (
                      <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 truncate">
                        Ruang: {task.onlineClassTitle}
                      </p>
                    )}

                    <div>
                      <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-snug">
                        {task.title}
                      </h3>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                        {task.description}
                      </p>
                    </div>

                    {/* Countdown + Due Date */}
                    <div
                      className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-2 text-xs ${
                        countdown.isOverdue
                          ? 'bg-rose-50/70 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800/70 dark:text-rose-200'
                          : countdown.isUrgent
                            ? 'bg-amber-50/70 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/70 dark:text-amber-200'
                            : 'bg-emerald-50/70 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/70 dark:text-emerald-200'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 font-bold tabular-nums">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {countdown.label}
                      </span>
                      <span className="text-[11px] opacity-85 tabular-nums truncate">
                        {formatIndonesianDateTime(task.dueAt)}
                      </span>
                    </div>

                    {/* Submission Progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400 inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          Pengumpulan ({subs.length}/{classStudentTotal} murid)
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                          {progressPct}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {task.attachments.length} lampiran · Maks {task.maxScore}
                        </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {gradedCount} dinilai
                          {pendingCount > 0 ? ` · ${pendingCount} baru` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-[#FAFAF7]/70 dark:bg-slate-800/30 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setGradingTaskId(task.id)}
                    className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold shadow-sm hover:brightness-105 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      Nilai Tugas{pendingCount > 0 ? ` (${pendingCount})` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(task);
                      setShowFormModal(true);
                    }}
                    aria-label={`Edit tugas ${task.title}`}
                    className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-700 flex items-center justify-center shrink-0"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTaskId(task.id)}
                    aria-label={`Hapus tugas ${task.title}`}
                    className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-rose-400 hover:text-rose-600 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Task Modal */}
      <TaskFormModal
        open={showFormModal}
        editingTask={editingTask}
        effectiveRole={effectiveRole}
        currentTeacher={currentTeacher}
        teacherNameFallback={profile?.name || 'Guru PKBM'}
        teacherUidFallback={profile?.uid || 'demo_guru_01'}
        classes={classes}
        onlineClasses={onlineClasses}
        subjects={subjects}
        assignments={assignments}
        onUploadFile={uploadTaskFile}
        onSave={async (payload, announce) => {
          const isEditing = Boolean(payload.id);
          await saveTask(payload, { announce });
          showToast(
            isEditing
              ? 'Perubahan tugas berhasil disimpan.'
              : announce
                ? 'Tugas baru diterbitkan dan notifikasi lonceng dikirim ke murid.'
                : 'Tugas baru berhasil diterbitkan.',
            'success'
          );
        }}
        onClose={() => {
          setShowFormModal(false);
          setEditingTask(null);
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTaskId)}
        title="Hapus Tugas Pembelajaran?"
        description="Tugas yang dihapus tidak akan tampil lagi di papan tugas maupun beranda warga belajar."
        onCancel={() => setDeleteTaskId(null)}
        onConfirm={async () => {
          if (deleteTaskId) {
            await deleteTask(deleteTaskId);
            showToast('Tugas berhasil dihapus.', 'success');
            setDeleteTaskId(null);
          }
        }}
      />
    </div>
  );
};
