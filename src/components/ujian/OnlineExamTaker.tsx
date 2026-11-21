import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ExamPackage,
  ExamPaketVariant,
  ExamQuestion,
  ExamSubmission,
  PaketType,
  StudentQuestionAnswer,
} from '../../types/siakad';
import {
  EXAM_TYPE_LABELS,
  gradeObjectiveQuestions,
  QUESTION_SHAPE_LABELS,
  resolveExamQuestionsForVariant,
  shuffleArray,
} from '../../utils/examUtils';

interface OnlineExamTakerProps {
  exam: ExamPackage;
  variant: ExamPaketVariant;
  studentName: string;
  studentNis: string;
  paket: PaketType;
  className: string;
  isPreviewMode?: boolean;
  onSubmitResult: (
    payload: Omit<ExamSubmission, 'id' | 'studentUid' | 'submittedAt' | 'updatedAt'>
  ) => Promise<void>;
  onCancel: () => void;
}

function isQuestionAnswered(q: ExamQuestion, ans?: StudentQuestionAnswer): boolean {
  if (!ans) return false;
  switch (q.type) {
    case 'PG':
      return typeof ans.selectedIndex === 'number';
    case 'PG_KOMPLEKS':
      return Array.isArray(ans.selectedIndices) && ans.selectedIndices.length > 0;
    case 'BENAR_SALAH':
      return typeof ans.booleanValue === 'boolean';
    case 'MENJODOHKAN': {
      const pairsCount = q.matchingPairs?.length || 0;
      const map = ans.matchingMap || {};
      return pairsCount > 0 && Object.values(map).filter((v) => v && v.trim() !== '').length > 0;
    }
    case 'ISIAN':
    case 'URAIAN':
      return Boolean(ans.textValue && ans.textValue.trim().length > 0);
    default:
      return false;
  }
}

export const OnlineExamTaker: React.FC<OnlineExamTakerProps> = ({
  exam,
  variant,
  studentName,
  studentNis,
  paket,
  className,
  isPreviewMode = false,
  onSubmitResult,
  onCancel,
}) => {
  const letters = ['A', 'B', 'C', 'D', 'E'];

  const orderedQuestions = useMemo(
    () => resolveExamQuestionsForVariant(exam, variant),
    [exam, variant]
  );

  // Shuffled right options for MENJODOHKAN questions so students don't see 1-to-1 straight pairs
  const shuffledMatchingOptionsByQuestion = useMemo(() => {
    const map: Record<string, string[]> = {};
    orderedQuestions.forEach((q) => {
      if (q.type === 'MENJODOHKAN' && q.matchingPairs) {
        map[q.id] = shuffleArray(q.matchingPairs.map((p) => p.right));
      }
    });
    return map;
  }, [orderedQuestions]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentQuestionAnswer>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(60, exam.durationMinutes * 60));
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<{
    autoScore: number;
    maxObjectiveScore: number;
    maxTotalScore: number;
    hasEssay: boolean;
    finalScoreWithoutEssay: number;
  } | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const hasSubmittedRef = useRef(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFinalizeSubmit = useCallback(async () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setShowConfirmSubmit(false);

    const result = gradeObjectiveQuestions(orderedQuestions, answersRef.current);

    try {
      if (!isPreviewMode) {
        await onSubmitResult({
          examId: exam.id,
          examTitle: exam.title,
          paketVariant: variant,
          studentName,
          studentNis,
          paket,
          className,
          answers: answersRef.current,
          essayGrades: {},
          autoScore: result.autoScore,
          essayScore: 0,
          maxScore: result.maxTotalScore,
          finalScore: result.hasEssay ? 0 : result.finalScoreWithoutEssay,
          status: result.hasEssay ? 'Menunggu Nilai Uraian' : 'Selesai Dinilai',
          accessUids: exam.accessUids || [],
        });
      }
      setSubmittedSummary(result);
    } catch (err) {
      hasSubmittedRef.current = false;
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim jawaban ujian. Periksa koneksi lalu coba kirim ulang.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    orderedQuestions,
    isPreviewMode,
    onSubmitResult,
    exam.id,
    exam.title,
    exam.accessUids,
    variant,
    studentName,
    studentNis,
    paket,
    className,
  ]);

  useEffect(() => {
    if (submittedSummary) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          void handleFinalizeSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [submittedSummary, handleFinalizeSubmit]);

  const formatClock = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  };

  const activeQuestion = orderedQuestions[currentIdx];

  const answeredCount = useMemo(
    () => orderedQuestions.filter((q) => isQuestionAnswered(q, answers[q.id])).length,
    [orderedQuestions, answers]
  );

  const toggleFlag = (qId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const updateAnswer = (qId: string, patch: Partial<StudentQuestionAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || {}),
        ...patch,
      },
    }));
  };

  if (submittedSummary) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-lg space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-700 to-amber-500 text-white flex items-center justify-center mx-auto shadow-md">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {isPreviewMode ? 'Pratinjau Ujian Online Selesai' : 'Ujian Berhasil Dikumpulkan'}
            </p>
            <h2 className="mt-1 font-display font-extrabold text-2xl text-slate-900 dark:text-white">
              {exam.title} (Paket {variant})
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {studentName} · NIS {studentNis} · {className}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 p-4">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Skor Soal Objektif
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl text-emerald-900 dark:text-white tabular-nums">
                {submittedSummary.autoScore}{' '}
                <span className="text-sm font-semibold text-slate-500">
                  / {submittedSummary.maxObjectiveScore}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-4">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Status Penilaian
              </p>
              <p className="mt-1 font-display font-bold text-sm text-amber-950 dark:text-amber-100">
                {submittedSummary.hasEssay
                  ? 'Menunggu Koreksi Uraian oleh Guru'
                  : 'Selesai Dinilai Otomatis'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/60 p-4">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {submittedSummary.hasEssay ? 'Skor Sementara (Maks)' : 'Nilai Akhir'}
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
                {submittedSummary.hasEssay
                  ? `${submittedSummary.autoScore} / ${submittedSummary.maxTotalScore}`
                  : submittedSummary.finalScoreWithoutEssay}
              </p>
            </div>
          </div>

          {submittedSummary.hasEssay && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-200 text-left flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>
                Soal pilihan ganda, benar-salah, menjodohkan, dan isian telah dinilai otomatis. Soal{' '}
                <strong>Uraian</strong> akan diperiksa dan diberi nilai oleh guru/tutor pengampu.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="min-h-[46px] px-6 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white font-bold text-sm shadow-md hover:brightness-105"
          >
            Kembali ke Daftar Ujian
          </button>
        </div>
      </div>
    );
  }

  if (!activeQuestion) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Naskah soal belum memiliki butir pertanyaan.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 min-h-[44px] px-5 rounded-xl bg-emerald-700 text-white text-sm font-bold"
        >
          Kembali
        </button>
      </div>
    );
  }

  const currentAnswer = answers[activeQuestion.id] || {};
  const isFlagged = flaggedIds.has(activeQuestion.id);
  const lowTime = secondsLeft <= 300;

  return (
    <div className="space-y-5">
      {/* Top Sticky Exam Bar */}
      <header className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold">
              PAKET {variant}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {EXAM_TYPE_LABELS[exam.examType] || exam.examType}
            </span>
            {isPreviewMode && (
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">
                Mode Pratinjau Guru
              </span>
            )}
          </div>
          <h2 className="mt-1 font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white truncate">
            {exam.title} · {exam.mapel}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Peserta: <strong className="text-slate-700 dark:text-slate-200">{studentName}</strong> ({studentNis})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`min-h-[44px] px-4 py-2 rounded-xl border font-mono font-extrabold text-base flex items-center gap-2 tabular-nums ${
              lowTime
                ? 'border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:border-rose-700 dark:text-rose-200 ring-2 ring-rose-500/20'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>{formatClock(secondsLeft)}</span>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {submitError && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs sm:text-sm text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleFinalizeSubmit()}
            className="min-h-[34px] px-3 rounded-lg bg-rose-700 text-white text-xs font-bold whitespace-nowrap"
          >
            Kirim Ulang
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Active Question Area */}
        <section className="lg:col-span-8 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-xl bg-emerald-700 text-white font-display font-extrabold text-sm tabular-nums">
                Soal {currentIdx + 1} / {orderedQuestions.length}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                {QUESTION_SHAPE_LABELS[activeQuestion.type]}
              </span>
            </div>

            <button
              type="button"
              onClick={() => toggleFlag(activeQuestion.id)}
              className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                isFlagged
                  ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-slate-800'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{isFlagged ? 'Ditandai Ragu-ragu' : 'Tandai Ragu-ragu'}</span>
            </button>
          </div>

          {/* Prompt */}
          <p className="text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-line">
            {activeQuestion.prompt}
          </p>

          {/* Answer Input Area per Shape */}
          <div className="space-y-2.5 pt-2">
            {activeQuestion.type === 'PG' && (
              <>
                {(activeQuestion.options || []).map((opt, idx) => {
                  const selected = currentAnswer.selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => updateAnswer(activeQuestion.id, { selectedIndex: idx })}
                      className={`w-full min-h-[50px] p-3.5 rounded-xl border text-left text-sm flex items-start gap-3 transition-all ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-950 dark:text-white ring-2 ring-emerald-500/25 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 hover:border-emerald-500/50'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-emerald-700 text-white'
                            : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {letters[idx] || idx + 1}
                      </span>
                      <span className="pt-0.5">{opt}</span>
                    </button>
                  );
                })}
              </>
            )}

            {activeQuestion.type === 'PG_KOMPLEKS' && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Pilih lebih dari satu jawaban yang benar:
                </p>
                {(activeQuestion.options || []).map((opt, idx) => {
                  const selectedList = currentAnswer.selectedIndices || [];
                  const selected = selectedList.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? selectedList.filter((i) => i !== idx)
                          : [...selectedList, idx].sort((a, b) => a - b);
                        updateAnswer(activeQuestion.id, { selectedIndices: next });
                      }}
                      className={`w-full min-h-[50px] p-3.5 rounded-xl border text-left text-sm flex items-start gap-3 transition-all ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-950 dark:text-white ring-2 ring-emerald-500/25 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 hover:border-emerald-500/50'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                          selected
                            ? 'bg-emerald-700 border-emerald-700 text-white'
                            : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {selected ? '✓' : ''}
                      </span>
                      <span>
                        <strong className="font-mono mr-1.5">{letters[idx]}.</strong>
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeQuestion.type === 'BENAR_SALAH' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {[
                  { value: true, label: 'Benar' },
                  { value: false, label: 'Salah' },
                ].map((choice) => {
                  const selected = currentAnswer.booleanValue === choice.value;
                  return (
                    <button
                      key={String(choice.value)}
                      type="button"
                      onClick={() => updateAnswer(activeQuestion.id, { booleanValue: choice.value })}
                      className={`min-h-[56px] p-4 rounded-xl border font-display font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/25'
                          : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{choice.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeQuestion.type === 'MENJODOHKAN' && activeQuestion.matchingPairs && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Pasangkan setiap pernyataan di sebelah kiri dengan pilihan yang tepat di kanan:
                </p>
                {activeQuestion.matchingPairs.map((pair, pIdx) => {
                  const rightPool = shuffledMatchingOptionsByQuestion[activeQuestion.id] || [];
                  const chosen = currentAnswer.matchingMap?.[pIdx] || '';
                  return (
                    <div
                      key={pIdx}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center"
                    >
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mr-2">
                          {pIdx + 1}.
                        </span>
                        {pair.left}
                      </div>
                      <select
                        value={chosen}
                        onChange={(e) =>
                          updateAnswer(activeQuestion.id, {
                            matchingMap: {
                              ...(currentAnswer.matchingMap || {}),
                              [pIdx]: e.target.value,
                            },
                          })
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                      >
                        <option value="">-- Pilih Pasangan --</option>
                        {rightPool.map((rightOpt, rIdx) => (
                          <option key={rIdx} value={rightOpt}>
                            {rightOpt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {activeQuestion.type === 'ISIAN' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Ketik Jawaban Singkat Anda:
                </label>
                <input
                  type="text"
                  value={currentAnswer.textValue || ''}
                  onChange={(e) => updateAnswer(activeQuestion.id, { textValue: e.target.value })}
                  placeholder="Tuliskan kata atau angka jawaban dengan tepat..."
                  className="w-full min-h-[48px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            )}

            {activeQuestion.type === 'URAIAN' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Tuliskan Uraian / Penjelasan Lengkap Anda:
                </label>
                <textarea
                  rows={6}
                  value={currentAnswer.textValue || ''}
                  onChange={(e) => updateAnswer(activeQuestion.id, { textValue: e.target.value })}
                  placeholder="Jelaskan langkah, alasan, dan kesimpulan jawaban Anda secara terstruktur..."
                  className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white leading-relaxed"
                />
              </div>
            )}
          </div>

          {/* Prev / Next Footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            {currentIdx < orderedQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(orderedQuestions.length - 1, i + 1))}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold inline-flex items-center gap-1.5"
              >
                <span>Soal Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(true)}
                className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-md"
              >
                <Send className="w-4 h-4" />
                <span>Selesai &amp; Kumpulkan</span>
              </button>
            )}
          </div>
        </section>

        {/* Right: Penanda Soal Navigation Palette */}
        <aside className="lg:col-span-4 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Navigasi &amp; Penanda Soal</span>
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {answeredCount}/{orderedQuestions.length}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {orderedQuestions.map((q, idx) => {
              const answered = isQuestionAnswered(q, answers[q.id]);
              const flagged = flaggedIds.has(q.id);
              const isCurrent = idx === currentIdx;

              let tileClass =
                'bg-[#FAFAF7] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
              if (flagged) {
                tileClass =
                  'bg-amber-400 text-slate-950 border-amber-500 font-extrabold';
              } else if (answered) {
                tileClass =
                  'bg-emerald-600 text-white border-emerald-700 font-bold';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  aria-label={`Buka soal nomor ${idx + 1}`}
                  className={`min-h-[44px] rounded-xl border text-xs font-mono transition-all flex items-center justify-center ${tileClass} ${
                    isCurrent ? 'ring-2 ring-offset-2 ring-emerald-700 dark:ring-offset-slate-900 scale-105' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-600 shrink-0" />
              <span>Dijawab</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-400 shrink-0" />
              <span>Ragu-ragu</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700 shrink-0" />
              <span>Kosong</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowConfirmSubmit(true)}
            className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white font-bold text-sm shadow-md hover:brightness-105 inline-flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>Kumpulkan Jawaban Ujian</span>
          </button>
        </aside>
      </div>

      {showConfirmSubmit && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setShowConfirmSubmit(false)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Kumpulkan Jawaban Sekarang?
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Anda telah menjawab <strong>{answeredCount}</strong> dari{' '}
                <strong>{orderedQuestions.length}</strong> soal
                {flaggedIds.size > 0
                  ? ` dan masih menandai ${flaggedIds.size} soal ragu-ragu`
                  : ''}
                . Jawaban tidak dapat diubah setelah dikumpulkan.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleFinalizeSubmit()}
                className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
