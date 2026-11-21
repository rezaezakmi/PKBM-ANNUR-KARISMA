import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { ExamPackage, ExamPaketVariant, ExamSubmission } from '../../types/siakad';
import { EXAM_TYPE_LABELS } from '../../utils/examUtils';
import { EmptyState } from '../ui/EmptyState';
import { OnlineExamTaker } from './OnlineExamTaker';

export const StudentOnlineExamsView: React.FC = () => {
  const { profile } = useAuth();
  const { students, exams, examSubmissions, submitStudentExam } = useData();
  const { showToast } = useToast();

  const currentStudent = useMemo(
    () =>
      students.find(
        (s) =>
          s.id === profile?.linkedEntityId ||
          s.nis === profile?.nis ||
          s.ownerUid === profile?.uid
      ) || students[0],
    [students, profile]
  );

  const [filterScope, setFilterScope] = useState<'paket' | 'semua'>('paket');
  const [activeAttempt, setActiveAttempt] = useState<{
    exam: ExamPackage;
    variant: ExamPaketVariant;
  } | null>(null);
  const [detailSubmission, setDetailSubmission] = useState<ExamSubmission | null>(null);

  const publishedExams = useMemo(() => {
    const active = exams.filter((e) => e.isOnlinePublished && e.questions.length > 0);
    if (filterScope === 'paket' && currentStudent?.paket) {
      const matched = active.filter((e) => e.paket === currentStudent.paket);
      if (matched.length > 0) return matched;
    }
    return active;
  }, [exams, filterScope, currentStudent]);

  const mySubmissionsByExam = useMemo(() => {
    const map = new Map<string, ExamSubmission>();
    examSubmissions.forEach((sub) => {
      if (
        sub.studentUid === profile?.uid ||
        sub.studentNis === (currentStudent?.nis || profile?.nis)
      ) {
        map.set(sub.examId, sub);
      }
    });
    return map;
  }, [examSubmissions, profile, currentStudent]);

  const handleStartExam = (exam: ExamPackage) => {
    const variants: ExamPaketVariant[] = ['A', 'B', 'C'];
    const assignedVariant: ExamPaketVariant = exam.hasPaketB
      ? variants[Math.floor(Math.random() * variants.length)]
      : 'A';
    setActiveAttempt({ exam, variant: assignedVariant });
  };

  if (activeAttempt) {
    return (
      <OnlineExamTaker
        exam={activeAttempt.exam}
        variant={activeAttempt.variant}
        studentName={currentStudent?.fullName || profile?.name || 'Warga Belajar'}
        studentNis={currentStudent?.nis || profile?.nis || '2026000'}
        paket={currentStudent?.paket || activeAttempt.exam.paket}
        className={currentStudent?.className || activeAttempt.exam.kelas}
        onSubmitResult={async (payload) => {
          await submitStudentExam(payload);
          showToast('Jawaban ujian berhasil dikumpulkan & disimpan', 'success');
        }}
        onCancel={() => setActiveAttempt(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-2xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-600 p-6 sm:p-7 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Ruang Asesmen Daring PKBM Annur Karisma</span>
          </p>
          <h2 className="mt-1.5 font-display font-extrabold text-2xl sm:text-3xl tracking-tight">
            Ujian Online Warga Belajar
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-emerald-50/90">
            {currentStudent?.fullName || profile?.name} · {currentStudent?.paket || 'Paket C'} (
            {currentStudent?.className || 'Rombel Aktif'}) · NIS{' '}
            {currentStudent?.nis || profile?.nis || '-'}
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 p-1 self-start">
          <button
            type="button"
            onClick={() => setFilterScope('paket')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
              filterScope === 'paket' ? 'bg-white text-emerald-900' : 'text-white'
            }`}
          >
            Paket Saya ({currentStudent?.paket || 'Paket C'})
          </button>
          <button
            type="button"
            onClick={() => setFilterScope('semua')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
              filterScope === 'semua' ? 'bg-white text-emerald-900' : 'text-white'
            }`}
          >
            Semua Ujian
          </button>
        </div>
      </section>

      {/* Exam List */}
      {publishedExams.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Belum Ada Ujian Online Aktif"
          description="Saat ini belum ada jadwal ujian online yang dipublikasikan oleh tutor untuk program paket Anda."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {publishedExams.map((exam) => {
            const sub = mySubmissionsByExam.get(exam.id);
            return (
              <article
                key={exam.id}
                className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between gap-4 hover:-translate-y-0.5 transition-transform"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold">
                      {exam.examType}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-bold">
                      {exam.paket}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white leading-snug">
                      {exam.title}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{exam.mapel}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      Materi: {exam.materi}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-700" />
                      <span className="font-mono font-semibold">{exam.durationMinutes} Menit</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
                      <span className="font-mono font-semibold">
                        {exam.questions.length} Butir Soal
                      </span>
                    </div>
                  </div>
                </div>

                {sub ? (
                  <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          sub.status === 'Selesai Dinilai'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{sub.status}</span>
                      </span>
                      <span className="font-display font-extrabold text-lg text-slate-900 dark:text-white tabular-nums">
                        {sub.status === 'Selesai Dinilai'
                          ? `${sub.finalScore}`
                          : `Obj: ${sub.autoScore}`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDetailSubmission(sub)}
                      className="w-full min-h-[44px] rounded-xl border border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-emerald-100"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Lihat Rincian Hasil &amp; Nilai</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartExam(exam)}
                    className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white font-bold text-sm shadow-md hover:brightness-105 inline-flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Mulai Kerjakan Ujian</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Nilai Modal */}
      {detailSubmission && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setDetailSubmission(null)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  Hasil Ujian Online (Paket {detailSubmission.paketVariant})
                </p>
                <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
                  {detailSubmission.examTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailSubmission(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-[#FAFAF7] dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <p className="text-[11px] text-slate-500">Objektif</p>
                <p className="font-mono font-bold text-lg text-slate-900 dark:text-white">
                  {detailSubmission.autoScore}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#FAFAF7] dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <p className="text-[11px] text-slate-500">Uraian</p>
                <p className="font-mono font-bold text-lg text-slate-900 dark:text-white">
                  {detailSubmission.status === 'Selesai Dinilai'
                    ? detailSubmission.essayScore
                    : 'Menunggu'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                  Nilai Akhir
                </p>
                <p className="font-display font-extrabold text-xl text-emerald-800 dark:text-emerald-200">
                  {detailSubmission.status === 'Selesai Dinilai'
                    ? detailSubmission.finalScore
                    : 'Proses'}
                </p>
              </div>
            </div>

            {Object.keys(detailSubmission.essayGrades || {}).length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span>Umpan Balik Guru untuk Soal Uraian:</span>
                </p>
                {Object.entries(detailSubmission.essayGrades).map(([qId, entry], idx) => (
                  <div
                    key={qId}
                    className="p-3 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                  >
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">
                      Uraian #{idx + 1} · Skor: {entry.score}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {entry.feedback || 'Tidak ada catatan tambahan.'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              {EXAM_TYPE_LABELS[
                exams.find((e) => e.id === detailSubmission.examId)?.examType || 'PAS'
              ] || 'Evaluasi Pembelajaran'}{' '}
              · Dikumpulkan pada{' '}
              {new Date(detailSubmission.submittedAt).toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
