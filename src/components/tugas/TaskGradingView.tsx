import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MessageSquare,
  RotateCcw,
  Search,
  UserCheck,
} from 'lucide-react';
import { Student, TaskSubmission, TeacherTask } from '../../types/siakad';
import { useToast } from '../../context/ToastContext';
import { InitialAvatar } from '../ui/InitialAvatar';
import { EmptyState } from '../ui/EmptyState';
import {
  DisplaySubmissionStatus,
  downloadAttachment,
  formatFileSize,
  formatIndonesianDateTime,
  getCountdownInfo,
  getSubjectBadgeTone,
  getSubmissionStatusMeta,
} from './taskHelpers';

interface TaskGradingViewProps {
  task: TeacherTask;
  classStudents: Student[];
  submissions: TaskSubmission[];
  reviewerName: string;
  nowMs: number;
  onReview: (
    submissionId: string,
    payload: {
      status: 'Sudah Dinilai' | 'Revisi';
      score: number;
      feedback: string;
      gradedBy: string;
    }
  ) => Promise<void>;
  onBack: () => void;
}

type FilterKey = 'Semua' | 'Perlu Dinilai' | DisplaySubmissionStatus;

interface StudentSubmissionRow {
  student: Student;
  submission: TaskSubmission | null;
  status: DisplaySubmissionStatus;
}

export const TaskGradingView: React.FC<TaskGradingViewProps> = ({
  task,
  classStudents,
  submissions,
  reviewerName,
  nowMs,
  onReview,
  onBack,
}) => {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<FilterKey>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [scoreInput, setScoreInput] = useState<string>('0');
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const taskSubmissions = useMemo(
    () => submissions.filter((s) => s.taskId === task.id),
    [submissions, task.id]
  );

  // Merge class students with submissions (also include any submitter not currently in classStudents)
  const rows: StudentSubmissionRow[] = useMemo(() => {
    const mapByStudentId = new Map<string, TaskSubmission>();
    taskSubmissions.forEach((sub) => {
      mapByStudentId.set(sub.studentId, sub);
    });

    const combined: StudentSubmissionRow[] = classStudents.map((st) => {
      const sub = mapByStudentId.get(st.id) || null;
      return {
        student: st,
        submission: sub,
        status: sub ? sub.status : 'Belum',
      };
    });

    // Include submissions whose student isn't in classStudents (edge case)
    taskSubmissions.forEach((sub) => {
      if (!classStudents.some((st) => st.id === sub.studentId)) {
        combined.push({
          student: {
            id: sub.studentId,
            nis: sub.studentNis,
            fullName: sub.studentName,
            gender: 'L',
            paket: task.paket,
            classId: task.classId,
            className: task.className,
            status: 'Aktif',
            ownerUid: sub.studentUid,
            accessUids: sub.accessUids,
            createdBy: task.ownerUid,
          },
          submission: sub,
          status: sub.status,
        });
      }
    });

    // Sort: submitted & pending grading first, then Revisi, then Sudah Dinilai, then Belum
    const priority: Record<DisplaySubmissionStatus, number> = {
      Terkumpul: 1,
      Terlambat: 2,
      Revisi: 3,
      'Sudah Dinilai': 4,
      Belum: 5,
    };

    return combined.sort((a, b) => {
      const diff = priority[a.status] - priority[b.status];
      if (diff !== 0) return diff;
      return a.student.fullName.localeCompare(b.student.fullName, 'id');
    });
  }, [classStudents, taskSubmissions, task]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === 'Semua'
          ? true
          : filter === 'Perlu Dinilai'
            ? row.status === 'Terkumpul' || row.status === 'Terlambat'
            : row.status === filter;
      const matchesQuery =
        !q ||
        row.student.fullName.toLowerCase().includes(q) ||
        row.student.nis.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [rows, filter, searchQuery]);

  // Auto-select first row
  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!filteredRows.some((r) => r.student.id === selectedStudentId)) {
      setSelectedStudentId(filteredRows[0].student.id);
    }
  }, [filteredRows, selectedStudentId]);

  const activeRow = useMemo(
    () => rows.find((r) => r.student.id === selectedStudentId) || null,
    [rows, selectedStudentId]
  );

  // Sync grading inputs when selected student changes
  useEffect(() => {
    if (!activeRow?.submission) {
      setScoreInput('0');
      setFeedbackInput('');
      return;
    }
    setScoreInput(
      activeRow.submission.score > 0
        ? String(activeRow.submission.score)
        : String(Math.round(task.maxScore * 0.85))
    );
    setFeedbackInput(activeRow.submission.feedback || '');
  }, [activeRow?.student.id, activeRow?.submission?.id, activeRow?.submission?.updatedAt, task.maxScore]);

  const stats = useMemo(() => {
    const collected = rows.filter((r) => r.submission !== null).length;
    const pendingReview = rows.filter(
      (r) => r.status === 'Terkumpul' || r.status === 'Terlambat'
    ).length;
    const graded = rows.filter((r) => r.status === 'Sudah Dinilai').length;
    const revision = rows.filter((r) => r.status === 'Revisi').length;
    return { total: rows.length, collected, pendingReview, graded, revision };
  }, [rows]);

  const subjectTone = getSubjectBadgeTone(task.subjectName);
  const countdown = getCountdownInfo(task.dueAt, nowMs);

  const handleSaveGrade = async () => {
    if (!activeRow?.submission) return;
    const parsedScore = Number(scoreInput);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > task.maxScore) {
      showToast(`Nilai harus berada di rentang 0 sampai ${task.maxScore}.`, 'warning');
      return;
    }
    setSaving(true);
    try {
      await onReview(activeRow.submission.id, {
        status: 'Sudah Dinilai',
        score: parsedScore,
        feedback: feedbackInput.trim() || 'Jawaban telah diperiksa dan dinilai.',
        gradedBy: reviewerName,
      });
      showToast(
        `Nilai ${parsedScore} untuk ${activeRow.student.fullName} berhasil disimpan.`,
        'success'
      );
    } catch {
      showToast('Gagal menyimpan penilaian tugas.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReturnForRevision = async () => {
    if (!activeRow?.submission) return;
    if (feedbackInput.trim().length < 4) {
      showToast(
        'Tuliskan catatan komentar perbaikan agar murid mengetahui bagian yang harus direvisi.',
        'warning'
      );
      return;
    }
    setSaving(true);
    try {
      await onReview(activeRow.submission.id, {
        status: 'Revisi',
        score: 0,
        feedback: feedbackInput.trim(),
        gradedBy: reviewerName,
      });
      showToast(
        `Tugas ${activeRow.student.fullName} dikembalikan untuk revisi.`,
        'info'
      );
    } catch {
      showToast('Gagal mengembalikan tugas untuk revisi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filterChips: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'Semua', label: 'Semua', count: rows.length },
    { key: 'Perlu Dinilai', label: 'Perlu Dinilai', count: stats.pendingReview },
    { key: 'Revisi', label: 'Revisi', count: stats.revision },
    { key: 'Sudah Dinilai', label: 'Sudah Dinilai', count: stats.graded },
    {
      key: 'Belum',
      label: 'Belum Kumpul',
      count: rows.filter((r) => r.status === 'Belum').length,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Papan Tugas</span>
            </button>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold ${subjectTone.badgeBg} ${subjectTone.badgeText} ${subjectTone.badgeBorder}`}
              >
                {task.subjectName}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                {task.className} ({task.paket})
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums ${
                  countdown.isOverdue
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {countdown.label}
              </span>
            </div>
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white">
              Penilaian: {task.title}
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-2.5 shrink-0 w-full sm:w-auto">
            <div className="rounded-xl bg-[#FAFAF7] dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5 text-center">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Terkumpul</p>
              <p className="font-display font-extrabold text-lg text-slate-900 dark:text-white tabular-nums">
                {stats.collected}/{stats.total}
              </p>
            </div>
            <div className="rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 px-3.5 py-2.5 text-center">
              <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">Perlu Dinilai</p>
              <p className="font-display font-extrabold text-lg text-sky-800 dark:text-sky-200 tabular-nums">
                {stats.pendingReview}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 px-3.5 py-2.5 text-center">
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Sudah Dinilai</p>
              <p className="font-display font-extrabold text-lg text-emerald-800 dark:text-emerald-200 tabular-nums">
                {stats.graded}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Panel Grading Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANEL: Student Submission List */}
        <section
          aria-label="Daftar pengumpulan murid"
          className="lg:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3.5"
        >
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama murid atau NIS..."
              className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  filter === chip.key
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{chip.label}</span>
                <span className="tabular-nums opacity-85">({chip.count})</span>
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto pr-1">
            {filteredRows.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Tidak ada warga belajar pada filter ini.
              </div>
            ) : (
              filteredRows.map((row) => {
                const statusMeta = getSubmissionStatusMeta(row.status);
                const isSelected = row.student.id === selectedStudentId;
                return (
                  <button
                    key={row.student.id}
                    type="button"
                    onClick={() => setSelectedStudentId(row.student.id)}
                    className={`w-full py-3 px-3 rounded-xl text-left transition-colors flex items-center justify-between gap-3 my-1 ${
                      isSelected
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/50 ring-1 ring-emerald-600/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <InitialAvatar name={row.student.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {row.student.fullName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          NIS {row.student.nis}
                          {row.submission
                            ? ` · ${formatIndonesianDateTime(row.submission.updatedAt)}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${statusMeta.classes}`}
                      >
                        {statusMeta.label}
                      </span>
                      {row.submission && row.status === 'Sudah Dinilai' && (
                        <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          Nilai: {row.submission.score}/{task.maxScore}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT PANEL: Answer Preview + Grading Form */}
        <section
          aria-label="Pratinjau jawaban dan form penilaian"
          className="lg:col-span-7 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm"
        >
          {!activeRow ? (
            <EmptyState
              icon={UserCheck}
              title="Pilih Murid untuk Dinilai"
              description="Klik nama warga belajar di panel sebelah kiri untuk melihat jawaban, lampiran berkas, dan memberikan nilai atau catatan revisi."
            />
          ) : (
            <div className="space-y-5">
              {/* Student Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <InitialAvatar name={activeRow.student.fullName} size="md" />
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                      {activeRow.student.fullName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      NIS {activeRow.student.nis} · {activeRow.student.className}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold ${
                    getSubmissionStatusMeta(activeRow.status).classes
                  }`}
                >
                  {getSubmissionStatusMeta(activeRow.status).label}
                </span>
              </div>

              {!activeRow.submission ? (
                <div className="rounded-2xl border border-dashed border-amber-300 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center">
                  <Clock className="w-8 h-8 mx-auto text-amber-600 dark:text-amber-400" />
                  <p className="mt-2 font-display font-bold text-base text-slate-900 dark:text-white">
                    Murid Belum Mengumpulkan Tugas
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    Jawaban dari {activeRow.student.fullName} belum diterima. Anda dapat menilai atau mengembalikan tugas setelah murid mengirim jawaban.
                  </p>
                </div>
              ) : (
                <>
                  {/* Submission Content Preview */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Kolom Catatan & Jawaban Murid
                      </span>
                      <span className="tabular-nums">
                        Dikirim: {formatIndonesianDateTime(activeRow.submission.submittedAt)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/60 p-4 text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed min-h-[110px]">
                      {activeRow.submission.answerText.trim()
                        ? activeRow.submission.answerText
                        : '(Murid tidak menulis teks jawaban dan hanya melampirkan berkas)'}
                    </div>

                    {activeRow.submission.attachments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Lampiran Jawaban ({activeRow.submission.attachments.length} berkas)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {activeRow.submission.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-800"
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
                              <button
                                type="button"
                                onClick={() => downloadAttachment(att)}
                                className="min-h-[36px] px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Grading Form */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                      <div className="sm:col-span-5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          Nilai (Maksimal {task.maxScore})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={task.maxScore}
                          value={scoreInput}
                          onChange={(e) => setScoreInput(e.target.value)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                      <div className="sm:col-span-7 flex flex-wrap gap-1.5">
                        {[0.75, 0.85, 0.92, 1].map((ratio) => {
                          const presetVal = Math.round(task.maxScore * ratio);
                          return (
                            <button
                              key={ratio}
                              type="button"
                              onClick={() => setScoreInput(String(presetVal))}
                              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-500 tabular-nums"
                            >
                              {presetVal}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 inline-flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        <span>Komentar & Umpan Balik Guru</span>
                      </label>
                      <textarea
                        rows={3}
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        placeholder="Berikan apresiasi, catatan perbaikan, atau arahan belajar untuk murid..."
                        className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleReturnForRevision}
                        className="min-h-[44px] px-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-800 dark:text-rose-200 text-sm font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-60 whitespace-nowrap"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Kembalikan untuk revisi</span>
                      </button>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleSaveGrade}
                        className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center gap-2 transition-all disabled:opacity-60 whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{saving ? 'Menyimpan...' : 'Simpan Nilai'}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
