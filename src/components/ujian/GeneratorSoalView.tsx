import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignLeft,
  ArrowLeftRight,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  ClipboardCheck,
  Clock,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileDown,
  FilePlus2,
  FileText,
  GraduationCap,
  Layers,
  ListChecks,
  Loader2,
  Play,
  Plus,
  Printer,
  Save,
  Shuffle,
  SlidersHorizontal,
  Table2,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  CognitiveLevel,
  EssayGradeEntry,
  ExamPackage,
  ExamPaketVariant,
  ExamQuestion,
  ExamSubmission,
  ExamType,
  PaketType,
  QuestionShape,
} from '../../types/siakad';
import {
  buildExamVariantMappings,
  EXAM_TYPE_LABELS,
  exportExamToWord,
  formatAnswerKeyText,
  QUESTION_SHAPE_LABELS,
  resolveExamQuestionsForVariant,
} from '../../utils/examUtils';
import { postAiJson } from '../../utils/aiFetch';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ExamPdfMode, generateExamPdf } from '../../utils/examPdfUtils';
import { BankSoalPanel } from './BankSoalPanel';
import { ExamPrintSheet, ExamPrintTab } from './ExamPrintSheet';
import { OnlineExamTaker } from './OnlineExamTaker';
import { QuestionCardEditor } from './QuestionCardEditor';

type MainWorkspaceTab = 'editor' | 'bank' | 'grading';

const EXAM_TYPES: Array<{ id: ExamType; label: string; desc: string }> = [
  { id: 'UH', label: 'Ulangan Harian', desc: 'Evaluasi per bab/modul' },
  { id: 'ASTS', label: 'ASTS', desc: 'Sumatif Tengah Semester' },
  { id: 'ASAT', label: 'ASAT', desc: 'Sumatif Akhir Tahun' },
  { id: 'PAS', label: 'PAS', desc: 'Penilaian Akhir Semester' },
];

const LEVEL_CHIP_CONFIG: Array<{
  id: CognitiveLevel;
  label: string;
  desc: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    id: 'LOTS',
    label: 'LOTS',
    desc: 'Pemahaman Dasar',
    activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
    inactiveClass:
      'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
  },
  {
    id: 'MOTS',
    label: 'MOTS',
    desc: 'Aplikasi Konsep',
    activeClass: 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm',
    inactiveClass:
      'bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
  },
  {
    id: 'HOTS',
    label: 'HOTS',
    desc: 'Analisis Kritis',
    activeClass: 'bg-rose-600 text-white border-rose-700 shadow-sm',
    inactiveClass:
      'bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/50',
  },
];

const SHAPE_CARD_CONFIG: Array<{
  id: QuestionShape;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'PG', label: 'Pilihan Ganda', shortDesc: '1 jawaban benar', icon: CircleDot },
  { id: 'PG_KOMPLEKS', label: 'PG Kompleks', shortDesc: 'Multi-jawaban', icon: CheckSquare },
  { id: 'BENAR_SALAH', label: 'Benar - Salah', shortDesc: 'Validasi pernyataan', icon: ToggleLeft },
  { id: 'MENJODOHKAN', label: 'Menjodohkan', shortDesc: 'Pasangkan premis', icon: ArrowLeftRight },
  { id: 'ISIAN', label: 'Isian Singkat', shortDesc: 'Kata/angka pasti', icon: TextCursorInput },
  { id: 'URAIAN', label: 'Uraian', shortDesc: 'Jawaban esai rubrik', icon: AlignLeft },
];

export const GeneratorSoalView: React.FC = () => {
  const { profile } = useAuth();
  const {
    schoolSettings,
    subjects,
    classes,
    teachers,
    questionBank,
    exams,
    examSubmissions,
    saveQuestionBankItem,
    deleteQuestionBankItem,
    saveExamPackage,
    deleteExamPackage,
    gradeExamSubmission,
  } = useData();
  const { showToast } = useToast();

  const matchedTeacher = useMemo(
    () =>
      teachers.find(
        (t) =>
          t.id === profile?.linkedEntityId ||
          t.ownerUid === profile?.uid ||
          (Boolean(profile?.nip) && t.nip === profile?.nip) ||
          (Boolean(profile?.email) && t.email === profile?.email)
      ) || teachers[0],
    [teachers, profile]
  );

  // Main workspace navigation tab
  const [workspaceTab, setWorkspaceTab] = useState<MainWorkspaceTab>('editor');

  // Active exam state initialized from first seeded/saved exam
  const [activeExamId, setActiveExamId] = useState<string | undefined>(exams[0]?.id);
  const [title, setTitle] = useState<string>(
    exams[0]?.title || 'PAS Bahasa Indonesia: Teks Argumentasi & Fakta Sosial'
  );
  const [examType, setExamType] = useState<ExamType>(exams[0]?.examType || 'PAS');
  const [paket, setPaket] = useState<PaketType>(exams[0]?.paket || 'Paket C');
  const [kelas, setKelas] = useState<string>(exams[0]?.kelas || 'Paket C - Kelas 12 CIPANAS');
  const [mapel, setMapel] = useState<string>(
    exams[0]?.mapel || 'Bahasa Indonesia & Karya Ilmiah'
  );
  const [materi, setMateri] = useState<string>(
    exams[0]?.materi || 'Teks Argumentasi, Paragraf Deduktif-Induktif, dan Data Fakta Sosial'
  );
  const [academicYear, setAcademicYear] = useState<string>(
    exams[0]?.academicYear || schoolSettings.academicYear
  );
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(
    exams[0]?.semester || schoolSettings.semester
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(exams[0]?.durationMinutes || 60);
  const [hasPaketB, setHasPaketB] = useState<boolean>(exams[0]?.hasPaketB ?? true);
  const [paketBOrder, setPaketBOrder] = useState<string[]>(exams[0]?.paketBOrder || []);
  const [paketBOptionMaps, setPaketBOptionMaps] = useState<Record<string, number[]>>(
    exams[0]?.paketBOptionMaps || {}
  );
  const [paketCOrder, setPaketCOrder] = useState<string[]>(exams[0]?.paketCOrder || []);
  const [paketCOptionMaps, setPaketCOptionMaps] = useState<Record<string, number[]>>(
    exams[0]?.paketCOptionMaps || {}
  );
  const [isOnlinePublished, setIsOnlinePublished] = useState<boolean>(
    exams[0]?.isOnlinePublished ?? true
  );
  const [questions, setQuestions] = useState<ExamQuestion[]>(exams[0]?.questions || []);

  // Generator AI controls
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [selectedLevels, setSelectedLevels] = useState<CognitiveLevel[]>(['LOTS', 'MOTS', 'HOTS']);
  const [selectedShapes, setSelectedShapes] = useState<QuestionShape[]>([
    'PG',
    'PG_KOMPLEKS',
    'BENAR_SALAH',
    'URAIAN',
  ]);
  const [extraNotes, setExtraNotes] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Result display controls
  const [resultTab, setResultTab] = useState<ExamPrintTab>('naskah_soal');
  const [activeVariant, setActiveVariant] = useState<ExamPaketVariant>('A');
  const [naskahViewMode, setNaskahViewMode] = useState<'cards' | 'a4'>('cards');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [exportingPdfMode, setExportingPdfMode] = useState<ExamPdfMode | null>(null);
  const [deleteExamTarget, setDeleteExamTarget] = useState<string | null>(null);
  const hasHydratedInitialExamRef = useRef(Boolean(exams[0]));
  const resultSectionRef = useRef<HTMLElement | null>(null);

  // Hydrate first saved exam once Firestore finishes loading if workspace started empty
  useEffect(() => {
    if (hasHydratedInitialExamRef.current) return;
    if (exams.length === 0) return;
    hasHydratedInitialExamRef.current = true;
    if (!activeExamId && questions.length === 0) {
      const first = exams[0];
      setActiveExamId(first.id);
      setTitle(first.title);
      setExamType(first.examType);
      setPaket(first.paket);
      setKelas(first.kelas);
      setMapel(first.mapel);
      setMateri(first.materi);
      setAcademicYear(first.academicYear);
      setSemester(first.semester);
      setDurationMinutes(first.durationMinutes);
      setHasPaketB(first.hasPaketB);
      setPaketBOrder(first.paketBOrder || []);
      setPaketBOptionMaps(first.paketBOptionMaps || {});
      setPaketCOrder(first.paketCOrder || []);
      setPaketCOptionMaps(first.paketCOptionMaps || {});
      setIsOnlinePublished(first.isOnlinePublished);
      setQuestions(first.questions || []);
    }
  }, [exams, activeExamId, questions.length]);

  // Preview Online Exam state
  const [previewingExam, setPreviewingExam] = useState<boolean>(false);

  // Grading modal state
  const [gradingSubmission, setGradingSubmission] = useState<ExamSubmission | null>(null);
  const [essayDraft, setEssayDraft] = useState<Record<string, EssayGradeEntry>>({});
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [submissionFilter, setSubmissionFilter] = useState<'Semua' | 'Menunggu Nilai Uraian' | 'Selesai Dinilai'>('Semua');

  const paketClasses = useMemo(
    () => classes.filter((c) => c.paket === paket),
    [classes, paket]
  );
  const paketSubjects = useMemo(
    () => subjects.filter((s) => s.paket === paket),
    [subjects, paket]
  );

  const pendingEssayCount = useMemo(
    () => examSubmissions.filter((s) => s.status === 'Menunggu Nilai Uraian').length,
    [examSubmissions]
  );

  const activeExamDraft: ExamPackage = useMemo(
    () => ({
      id: activeExamId || 'draft_exam',
      title,
      examType,
      paket,
      kelas,
      mapel,
      materi,
      academicYear,
      semester,
      durationMinutes,
      hasPaketB,
      paketBOrder,
      paketBOptionMaps,
      paketCOrder,
      paketCOptionMaps,
      isOnlinePublished,
      questions,
      authorName: matchedTeacher?.fullName || profile?.name || 'Tutor PKBM',
      ownerUid: profile?.uid || 'demo_guru_01',
      accessUids: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [
      activeExamId,
      title,
      examType,
      paket,
      kelas,
      mapel,
      materi,
      academicYear,
      semester,
      durationMinutes,
      hasPaketB,
      paketBOrder,
      paketBOptionMaps,
      paketCOrder,
      paketCOptionMaps,
      isOnlinePublished,
      questions,
      matchedTeacher,
      profile,
    ]
  );

  const displayedQuestions = useMemo(
    () =>
      resolveExamQuestionsForVariant(
        activeExamDraft,
        hasPaketB ? activeVariant : 'A'
      ),
    [activeExamDraft, hasPaketB, activeVariant]
  );

  const totalMaxScore = useMemo(
    () => displayedQuestions.reduce((acc, q) => acc + (q.maxScore || 2), 0),
    [displayedQuestions]
  );

  const activeQuestionIds = useMemo(
    () => new Set(questions.map((q) => q.id)),
    [questions]
  );

  const loadExamIntoWorkspace = (exam: ExamPackage) => {
    setActiveExamId(exam.id);
    setTitle(exam.title);
    setExamType(exam.examType);
    setPaket(exam.paket);
    setKelas(exam.kelas);
    setMapel(exam.mapel);
    setMateri(exam.materi);
    setAcademicYear(exam.academicYear);
    setSemester(exam.semester);
    setDurationMinutes(exam.durationMinutes);
    setHasPaketB(exam.hasPaketB);
    setPaketBOrder(exam.paketBOrder || []);
    setPaketBOptionMaps(exam.paketBOptionMaps || {});
    setPaketCOrder(exam.paketCOrder || []);
    setPaketCOptionMaps(exam.paketCOptionMaps || {});
    setIsOnlinePublished(exam.isOnlinePublished);
    setQuestions(exam.questions);
    setActiveVariant('A');
    setApiError(null);
  };

  const handleStartBlankExam = () => {
    setActiveExamId(undefined);
    setTitle(`${examType} ${mapel}: ${materi.slice(0, 42)}`);
    setQuestions([]);
    setPaketBOrder([]);
    setPaketBOptionMaps({});
    setPaketCOrder([]);
    setPaketCOptionMaps({});
    setActiveVariant('A');
    setApiError(null);
    showToast('Lembar naskah ujian baru siap disusun', 'info');
  };

  const toggleLevel = (lvl: CognitiveLevel) => {
    setSelectedLevels((prev) => {
      if (prev.includes(lvl)) {
        if (prev.length === 1) {
          showToast('Minimal pilih 1 tingkat kesulitan soal', 'warning');
          return prev;
        }
        return prev.filter((x) => x !== lvl);
      }
      return [...prev, lvl];
    });
  };

  const toggleShape = (shape: QuestionShape) => {
    setSelectedShapes((prev) => {
      if (prev.includes(shape)) {
        if (prev.length === 1) {
          showToast('Minimal pilih 1 bentuk soal', 'warning');
          return prev;
        }
        return prev.filter((x) => x !== shape);
      }
      return [...prev, shape];
    });
  };

  const refreshPaketBShuffle = (targetQuestions: ExamQuestion[]) => {
    const mapping = buildExamVariantMappings(targetQuestions);
    setPaketBOrder(mapping.paketBOrder);
    setPaketBOptionMaps(mapping.paketBOptionMaps);
    setPaketCOrder(mapping.paketCOrder);
    setPaketCOptionMaps(mapping.paketCOptionMaps);
  };

  const scrollToResultOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      requestAnimationFrame(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const handleGenerateQuestions = async () => {
    if (!mapel.trim() || !materi.trim()) {
      showToast('Isi mata pelajaran dan materi pokok terlebih dahulu', 'warning');
      return;
    }
    setApiError(null);
    setIsGenerating(true);
    scrollToResultOnMobile();
    try {
      const result = await postAiJson<{ questions?: ExamQuestion[]; message?: string }>(
        '/api/ujian/generate',
        {
          examType,
          paket,
          kelas,
          mapel,
          materi,
          questionCount,
          difficultyLevels: selectedLevels,
          questionShapes: selectedShapes,
          academicYear,
          semester,
          extraNotes,
        },
        { timeoutMs: 95_000, retries: 1 }
      );
      if (!result.ok || !result.data) {
        const msg =
          result.errorMessage ||
          'Gagal menyusun soal ujian dengan AI. Periksa koneksi atau coba beberapa saat lagi.';
        setApiError(msg);
        showToast(msg, 'error');
        return;
      }
      const generated: ExamQuestion[] = Array.isArray(result.data.questions)
        ? result.data.questions
        : [];
      if (generated.length === 0) {
        const msg = 'AI tidak mengembalikan butir soal. Silakan klik Generate ulang.';
        setApiError(msg);
        showToast(msg, 'warning');
        return;
      }
      setQuestions(generated);
      refreshPaketBShuffle(generated);
      if (!activeExamId) {
        setTitle(`${examType} ${mapel} — ${materi.slice(0, 48)}`);
      }
      setActiveVariant('A');
      setResultTab('naskah_soal');
      setNaskahViewMode('cards');
      showToast(`${generated.length} butir soal berhasil disusun oleh AI`, 'success');
      scrollToResultOnMobile();
    } catch {
      const msg = 'Koneksi ke server AI terputus. Silakan coba lagi.';
      setApiError(msg);
      showToast(msg, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateSingleQuestion = async (question: ExamQuestion) => {
    setRegeneratingQuestionId(question.id);
    try {
      const result = await postAiJson<{ question?: ExamQuestion; message?: string }>(
        '/api/ujian/regenerate-question',
        {
          paket,
          mapel,
          materi: question.materi || materi,
          questionType: question.type,
          cognitiveLevel: question.level,
          previousPrompt: question.prompt,
        },
        { timeoutMs: 65_000, retries: 1 }
      );
      if (!result.ok || !result.data?.question) {
        showToast(result.errorMessage || 'Gagal mengganti butir soal', 'error');
        return;
      }
      const replacement: ExamQuestion = result.data.question;
      const next = questions.map((q) => (q.id === question.id ? replacement : q));
      setQuestions(next);
      refreshPaketBShuffle(next);
      showToast('Butir soal berhasil diganti oleh AI', 'success');
    } catch {
      showToast('Gagal menghubungi layanan AI untuk mengganti soal', 'error');
    } finally {
      setRegeneratingQuestionId(null);
    }
  };

  const handleUpdateQuestion = (updated: ExamQuestion) => {
    const next = questions.map((q) => (q.id === updated.id ? updated : q));
    setQuestions(next);
    showToast('Perubahan soal diterapkan', 'success');
  };

  const handleDeleteQuestion = (qId: string) => {
    const next = questions.filter((q) => q.id !== qId);
    setQuestions(next);
    setPaketBOrder((prev) => prev.filter((id) => id !== qId));
    setPaketCOrder((prev) => prev.filter((id) => id !== qId));
    showToast('Butir soal dihapus dari naskah ujian', 'info');
  };

  const handleMoveQuestion = (index: number, dir: -1 | 1) => {
    if (activeVariant !== 'A') {
      showToast('Pengurutan manual hanya berlaku di tab Paket A', 'info');
      return;
    }
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
  };

  const handleDropQuestion = (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx || activeVariant !== 'A') {
      setDragIndex(null);
      return;
    }
    const next = [...questions];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIdx, 0, moved);
    setQuestions(next);
    setDragIndex(null);
  };

  const handleAddManualQuestion = () => {
    const newQ: ExamQuestion = {
      id: `q_man_${Date.now().toString(36)}`,
      type: 'PG',
      level: 'MOTS',
      competency: `Menguasai materi ${materi}`,
      indicator: `Menentukan jawaban tepat terkait ${materi}`,
      materi,
      prompt: 'Tuliskan teks pertanyaan di sini (klik Edit untuk mengubah)...',
      options: ['Opsi A', 'Opsi B', 'Opsi C', 'Opsi D'],
      correctOptionIndex: 0,
      scoringRubric: 'Skor penuh 2 jika benar, 0 jika salah.',
      maxScore: 2,
      explanation: 'Pembahasan singkat kunci jawaban.',
    };
    const next = [...questions, newQ];
    setQuestions(next);
    refreshPaketBShuffle(next);
    setActiveVariant('A');
    showToast('Butir soal kosong ditambahkan di akhir naskah', 'success');
  };

  const handleSaveToBank = async (q: ExamQuestion) => {
    try {
      await saveQuestionBankItem({
        mapel,
        paket,
        materi: q.materi || materi,
        questionType: q.type,
        cognitiveLevel: q.level,
        question: q,
        visibility: 'Sekolah',
        authorName: matchedTeacher?.fullName || profile?.name || 'Tutor PKBM',
      });
      showToast('Butir soal disimpan ke Bank Soal Sekolah', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan butir soal ke Bank Soal',
        'error'
      );
    }
  };

  const handleAddFromBank = (bankQuestion: ExamQuestion) => {
    const clone: ExamQuestion = {
      ...JSON.parse(JSON.stringify(bankQuestion)),
      id: `q_bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    };
    const next = [...questions, clone];
    setQuestions(next);
    refreshPaketBShuffle(next);
    showToast('Soal dari Bank Soal ditambahkan ke naskah ujian aktif', 'success');
  };

  const handleDownloadExamPdf = async (mode: ExamPdfMode) => {
    if (displayedQuestions.length === 0) {
      showToast('Belum ada butir soal untuk diunduh sebagai PDF', 'warning');
      return;
    }
    setExportingPdfMode(mode);
    try {
      const fileName = await generateExamPdf({
        schoolSettings,
        exam: activeExamDraft,
        variant: hasPaketB ? activeVariant : 'A',
        questions: displayedQuestions,
        mode,
        teacherNip: matchedTeacher?.nip || '',
      });
      showToast(
        mode === 'semua'
          ? 'PDF Paket Lengkap (4-in-1) dengan Kop PKBM berhasil diunduh'
          : 'Dokumen PDF dengan Kop PKBM berhasil diunduh',
        'success',
        fileName
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat berkas PDF ujian',
        'error'
      );
    } finally {
      setExportingPdfMode(null);
    }
  };

  const handleSaveExam = async () => {
    if (questions.length === 0) {
      showToast('Tambahkan atau generate minimal 1 soal sebelum menyimpan ujian', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveExamPackage({
        id: activeExamId,
        title: title.trim() || `${examType} ${mapel}`,
        examType,
        paket,
        kelas,
        mapel,
        materi,
        academicYear,
        semester,
        durationMinutes: Math.max(10, Number(durationMinutes) || 60),
        hasPaketB,
        paketBOrder: paketBOrder.length > 0 ? paketBOrder : questions.map((q) => q.id),
        paketBOptionMaps,
        paketCOrder: paketCOrder.length > 0 ? paketCOrder : questions.map((q) => q.id),
        paketCOptionMaps,
        isOnlinePublished,
        questions,
        authorName: matchedTeacher?.fullName || profile?.name || 'Tutor PKBM',
      });
      setActiveExamId(saved.id);
      showToast('Paket ujian berhasil disimpan ke SIAKAD', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan paket ujian ke database',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenGrading = (sub: ExamSubmission) => {
    setGradingSubmission(sub);
    setEssayDraft(sub.essayGrades || {});
  };

  const gradingExamRef = useMemo(() => {
    if (!gradingSubmission) return null;
    return exams.find((e) => e.id === gradingSubmission.examId) || null;
  }, [gradingSubmission, exams]);

  const gradingEssayQuestions = useMemo(() => {
    if (!gradingExamRef) return [];
    return gradingExamRef.questions.filter((q) => q.type === 'URAIAN');
  }, [gradingExamRef]);

  const handleCommitGrading = async () => {
    if (!gradingSubmission) return;
    setIsSavingGrade(true);
    try {
      await gradeExamSubmission(
        gradingSubmission.id,
        essayDraft,
        gradingSubmission.autoScore,
        gradingSubmission.maxScore
      );
      showToast(
        `Nilai akhir untuk ${gradingSubmission.studentName} berhasil disimpan`,
        'success'
      );
      setGradingSubmission(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan nilai uraian murid',
        'error'
      );
    } finally {
      setIsSavingGrade(false);
    }
  };

  const filteredSubmissions = useMemo(() => {
    if (submissionFilter === 'Semua') return examSubmissions;
    return examSubmissions.filter((s) => s.status === submissionFilter);
  }, [examSubmissions, submissionFilter]);

  if (previewingExam) {
    return (
      <OnlineExamTaker
        exam={activeExamDraft}
        variant={hasPaketB ? activeVariant : 'A'}
        studentName={profile?.name || 'Pratinjau Peserta'}
        studentNis="PRATINJAU"
        paket={paket}
        className={kelas}
        isPreviewMode={true}
        onSubmitResult={async () => {}}
        onCancel={() => setPreviewingExam(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Workspace Header & Sub-Navigation (Hidden on Print) */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
            Generator Soal Ujian &amp; Bank Soal
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Susun kisi-kisi, naskah A/B, kunci jawaban, rubrik skor A4, dan kelola ujian online PKBM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-[#FAFAF7] dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setWorkspaceTab('editor')}
            className={`min-h-[42px] px-3.5 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all ${
              workspaceTab === 'editor'
                ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            <span>Susun &amp; Editor Soal</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspaceTab('bank')}
            className={`min-h-[42px] px-3.5 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all ${
              workspaceTab === 'bank'
                ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Bank Soal</span>
            <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[11px] font-mono">
              {questionBank.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspaceTab('grading')}
            className={`min-h-[42px] px-3.5 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all ${
              workspaceTab === 'grading'
                ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Nilai Ujian Online</span>
            {pendingEssayCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[11px] font-mono font-extrabold">
                {pendingEssayCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: SUSUN & EDITOR SOAL */}
      {workspaceTab === 'editor' && (
        <>
          {/* Saved Exams Selector Strip */}
          <div className="no-print rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Naskah Tersimpan:
              </span>
              <select
                value={activeExamId || ''}
                onChange={(e) => {
                  const found = exams.find((x) => x.id === e.target.value);
                  if (found) loadExamIntoWorkspace(found);
                }}
                aria-label="Pilih naskah ujian tersimpan"
                className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white flex-1 max-w-md"
              >
                {!activeExamId && <option value="">-- Draf Baru (Belum Disimpan) --</option>}
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    [{ex.examType}] {ex.title} ({ex.questions.length} Soal)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartBlankExam}
                className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <FilePlus2 className="w-4 h-4 text-emerald-700" />
                <span>Naskah Baru</span>
              </button>
              {activeExamId && (
                <button
                  type="button"
                  onClick={() => setDeleteExamTarget(activeExamId)}
                  className="min-h-[42px] px-3 rounded-xl border border-rose-200 dark:border-rose-900/40 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Hapus Naskah</span>
                </button>
              )}
            </div>
          </div>

          <div className="no-print grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* LEFT PANEL: Form Pengaturan Ujian */}
            <aside className="xl:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-700 to-amber-500 text-white flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Pengaturan Generator Soal
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tentukan jenis ujian, tingkat kognitif, &amp; bentuk soal
                  </p>
                </div>
              </div>

              {/* Jenis Ujian */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Jenis Evaluasi / Ujian
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-2">
                  {EXAM_TYPES.map((et) => {
                    const active = examType === et.id;
                    return (
                      <button
                        key={et.id}
                        type="button"
                        onClick={() => setExamType(et.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 hover:border-emerald-500/40'
                        }`}
                      >
                        <p className="font-display font-extrabold text-xs text-slate-900 dark:text-white">
                          {et.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {et.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paket, Kelas, Mapel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Program Paket
                  </label>
                  <select
                    value={paket}
                    onChange={(e) => {
                      const nextPaket = e.target.value as PaketType;
                      setPaket(nextPaket);
                      const firstCls = classes.find((c) => c.paket === nextPaket);
                      const firstSub = subjects.find((s) => s.paket === nextPaket);
                      if (firstCls) setKelas(firstCls.name);
                      if (firstSub) setMapel(firstSub.name);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Paket A">Paket A (Setara SD)</option>
                    <option value="Paket B">Paket B (Setara SMP)</option>
                    <option value="Paket C">Paket C (Setara SMA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kelas / Rombel
                  </label>
                  <select
                    value={kelas}
                    onChange={(e) => setKelas(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {paketClasses.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    {!paketClasses.some((c) => c.name === kelas) && (
                      <option value={kelas}>{kelas}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mata Pelajaran
                </label>
                <div className="space-y-2">
                  <select
                    value={paketSubjects.some((s) => s.name === mapel) ? mapel : '__custom'}
                    onChange={(e) => {
                      if (e.target.value !== '__custom') setMapel(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {paketSubjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                    <option value="__custom">Ketik Mata Pelajaran Kustom...</option>
                  </select>
                  {!paketSubjects.some((s) => s.name === mapel) && (
                    <input
                      type="text"
                      value={mapel}
                      onChange={(e) => setMapel(e.target.value)}
                      placeholder="Nama mata pelajaran"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Judul Naskah Ujian
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Materi Pokok / Topik Uji
                </label>
                <textarea
                  rows={2}
                  value={materi}
                  onChange={(e) => setMateri(e.target.value)}
                  placeholder="Contoh: Teks Argumentasi, Paragraf Deduktif, & Data Sosial"
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {/* SLIDER JUMLAH SOAL */}
              <div className="p-4 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Jumlah Soal AI
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-700 text-white font-mono text-xs font-extrabold tabular-nums">
                    {questionCount} Butir
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  aria-label="Slider jumlah soal"
                  className="w-full accent-emerald-700 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>5 soal</span>
                  <span>20 soal</span>
                  <span>40 soal</span>
                </div>
              </div>

              {/* TINGKAT KESULITAN (LOTS/MOTS/HOTS CHIPS BERWARNA) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Tingkat Kesulitan Kognitif (Pilih satu atau lebih)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LEVEL_CHIP_CONFIG.map((lvl) => {
                    const active = selectedLevels.includes(lvl.id);
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => toggleLevel(lvl.id)}
                        className={`min-h-[52px] px-3 py-2 rounded-xl border text-center transition-all ${
                          active ? lvl.activeClass : lvl.inactiveClass
                        }`}
                      >
                        <p className="font-display font-extrabold text-xs">{lvl.label}</p>
                        <p className="text-[10px] opacity-90 truncate">{lvl.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BENTUK SOAL (MULTI-SELECT ICON CARDS) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Bentuk Soal (Multi-pilih)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2.5">
                  {SHAPE_CARD_CONFIG.map((shape) => {
                    const Icon = shape.icon;
                    const active = selectedShapes.includes(shape.id);
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() => toggleShape(shape.id)}
                        className={`min-h-[60px] p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/45 text-emerald-950 dark:text-white ring-2 ring-emerald-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-emerald-500/40'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            active
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate">{shape.label}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {shape.shortDesc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PENGATURAN PAKET A/B/C & UJIAN ONLINE */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Paket Soal A / B / C (Pengacakan)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Acak urutan soal &amp; opsi PG untuk 3 variasi naskah (A, B, C)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasPaketB}
                    onChange={(e) => {
                      setHasPaketB(e.target.checked);
                      if (
                        e.target.checked &&
                        (paketBOrder.length === 0 || paketCOrder.length === 0) &&
                        questions.length > 0
                      ) {
                        refreshPaketBShuffle(questions);
                      }
                    }}
                    className="w-5 h-5 accent-emerald-700 cursor-pointer"
                  />
                </div>

                {hasPaketB && questions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      refreshPaketBShuffle(questions);
                      showToast('Urutan & opsi Paket B dan Paket C berhasil diacak ulang', 'success');
                    }}
                    className="w-full min-h-[38px] px-3 rounded-lg border border-emerald-700/30 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-emerald-50"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Acak Ulang Paket B &amp; C</span>
                  </button>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Publikasikan Ujian Online
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tampil di menu Ujian Online murid dengan timer
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isOnlinePublished}
                    onChange={(e) => setIsOnlinePublished(e.target.checked)}
                    className="w-5 h-5 accent-emerald-700 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Durasi Ujian (Menit)</span>
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                    className="w-24 min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-center text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Tambahan untuk AI (Opsional)
                </label>
                <input
                  type="text"
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="Misal: Sertakan studi kasus UMKM desa pada soal HOTS"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {apiError && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{apiError}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateQuestions}
                className="w-full min-h-[50px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white font-display font-bold text-sm shadow-lg shadow-emerald-900/15 hover:brightness-105 active:scale-[0.99] disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-all"
              >
                <Wand2 className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>
                  {isGenerating ? 'Menyusun Soal & Kisi-kisi AI...' : `Generate ${questionCount} Soal AI`}
                </span>
              </button>
            </aside>

            {/* RIGHT PANEL: 4-Tab Result & Interactive Card Editor */}
            <section ref={resultSectionRef} className="xl:col-span-7 space-y-4 scroll-mt-20">
              {/* Toolbar */}
              <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {hasPaketB && (
                    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 p-1">
                      {(['A', 'B', 'C'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setActiveVariant(v)}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-extrabold transition-colors ${
                            activeVariant === v
                              ? 'bg-emerald-700 text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300'
                          }`}
                        >
                          Paket {v}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {displayedQuestions.length} Soal · {totalMaxScore} Poin
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving || questions.length === 0}
                    onClick={handleSaveExam}
                    className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Menyimpan...' : 'Simpan Ujian'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={questions.length === 0}
                    onClick={() => setPreviewingExam(true)}
                    className="min-h-[40px] px-3 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Uji Coba Online</span>
                  </button>

                  <button
                    type="button"
                    disabled={questions.length === 0}
                    onClick={() => {
                      exportExamToWord({
                        schoolSettings,
                        exam: activeExamDraft,
                        variant: hasPaketB ? activeVariant : 'A',
                        questions: displayedQuestions,
                        activeTab: resultTab,
                        teacherNip: matchedTeacher?.nip || '',
                      });
                      showToast('Berkas Word (.doc) dengan Kop PKBM berhasil diunduh', 'success');
                    }}
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Word</span>
                  </button>

                  <button
                    type="button"
                    disabled={questions.length === 0 || exportingPdfMode !== null}
                    onClick={() => handleDownloadExamPdf(resultTab)}
                    title="Unduh PDF tab aktif lengkap dengan Kop Surat PKBM"
                    className="min-h-[40px] px-3.5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:brightness-105 disabled:opacity-50"
                  >
                    {exportingPdfMode === resultTab ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5" />
                    )}
                    <span>{exportingPdfMode === resultTab ? 'Menyusun PDF...' : 'Unduh PDF'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={questions.length === 0 || exportingPdfMode !== null}
                    onClick={() => handleDownloadExamPdf('semua')}
                    title="Unduh 1 berkas PDF lengkap berisi Naskah Soal, Kisi-kisi, Kunci Jawaban, & Pedoman Penskoran berkop PKBM"
                    className="min-h-[40px] px-3 rounded-xl border border-emerald-700/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    {exportingPdfMode === 'semua' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileCheck2 className="w-3.5 h-3.5" />
                    )}
                    <span>{exportingPdfMode === 'semua' ? 'Menyusun...' : 'PDF Lengkap 4-in-1'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={questions.length === 0}
                    onClick={() => window.print()}
                    title="Cetak langsung lembar A4 berkop PKBM melalui printer"
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak</span>
                  </button>
                </div>
              </div>

              {/* 4 Result Tabs */}
              <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-2 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'kisi_kisi', label: 'Kisi-kisi', icon: Table2 },
                    { id: 'naskah_soal', label: 'Naskah Soal', icon: FileText },
                    { id: 'kunci_jawaban', label: 'Kunci Jawaban', icon: CheckCircle2 },
                    { id: 'pedoman_penskoran', label: 'Pedoman Penskoran', icon: ListChecks },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = resultTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setResultTab(tab.id)}
                      className={`min-h-[42px] px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                        active
                          ? 'bg-emerald-700 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-[#FAFAF7] dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Generation Skeleton */}
              {isGenerating ? (
                <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                      AI sedang menyusun {questionCount} soal beserta kisi-kisi &amp; rubrik...
                    </p>
                    <span className="text-xs font-mono text-amber-600">Mohon tunggu</span>
                  </div>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-32 rounded-2xl skeleton-shimmer border border-slate-200/50 dark:border-slate-800"
                    />
                  ))}
                </div>
              ) : displayedQuestions.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Belum Ada Butir Soal di Naskah Ini"
                  description="Atur parameter di panel kiri lalu klik Generate Soal AI, atau tambahkan butir soal secara manual maupun dari Bank Soal."
                  actionLabel="Tambah Soal Manual"
                  onAction={handleAddManualQuestion}
                />
              ) : (
                <>
                  {/* View Mode Toggle for ALL 4 TABS: Editor/Tabel vs Live A4 Preview with Kop Surat PKBM */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                      <button
                        type="button"
                        onClick={() => setNaskahViewMode('cards')}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap ${
                          naskahViewMode === 'cards'
                            ? 'bg-emerald-700 text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>
                          {resultTab === 'naskah_soal' ? 'Editor Kartu Interaktif' : 'Tampilan Tabel'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNaskahViewMode('a4')}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap ${
                          naskahViewMode === 'a4'
                            ? 'bg-emerald-700 text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Pratinjau A4 (Kop PKBM)</span>
                      </button>
                    </div>

                    {resultTab === 'naskah_soal' && naskahViewMode === 'cards' && (
                      <button
                        type="button"
                        onClick={handleAddManualQuestion}
                        className="min-h-[38px] px-3.5 rounded-xl border border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Soal Manual</span>
                      </button>
                    )}
                  </div>

                  {naskahViewMode === 'a4' ? (
                    <div className="overflow-x-auto pb-4">
                      <ExamPrintSheet
                        schoolSettings={schoolSettings}
                        exam={activeExamDraft}
                        variant={hasPaketB ? activeVariant : 'A'}
                        questions={displayedQuestions}
                        activeTab={resultTab}
                        teacherNip={matchedTeacher?.nip || ''}
                      />
                    </div>
                  ) : (
                    <>
                      {/* SUB-CONTENT BY RESULT TAB (Interactive / Table Mode) */}
                      {resultTab === 'naskah_soal' && (
                        <div className="space-y-3.5">
                          {activeVariant !== 'A' && (
                            <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                              <span>
                                Anda sedang meninjau <strong>Paket {activeVariant} (Tershuffle)</strong>. Untuk
                                mengurutkan/mengedit soal induk, beralih ke Paket A.
                              </span>
                            </div>
                          )}
                          {displayedQuestions.map((q, idx) => (
                            <QuestionCardEditor
                              key={q.id}
                              question={q}
                              index={idx}
                              totalCount={displayedQuestions.length}
                              isDragging={dragIndex === idx}
                              isRegenerating={regeneratingQuestionId === q.id}
                              onDragStart={() => setDragIndex(idx)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleDropQuestion(idx)}
                              onDragEnd={() => setDragIndex(null)}
                              onMove={(dir) => handleMoveQuestion(idx, dir)}
                              onUpdate={handleUpdateQuestion}
                              onRegenerate={() => handleRegenerateSingleQuestion(q)}
                              onSaveToBank={() => handleSaveToBank(q)}
                              onDelete={() => handleDeleteQuestion(q.id)}
                            />
                          ))}
                        </div>
                      )}

                      {resultTab === 'kisi_kisi' && (
                    <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-[#FAFAF7] dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 w-12 text-center">
                              No
                            </th>
                            <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                              Kompetensi / TP
                            </th>
                            <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                              Materi &amp; Indikator Soal
                            </th>
                            <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 text-center">
                              Level
                            </th>
                            <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                              Bentuk
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {displayedQuestions.map((q, idx) => (
                            <tr key={q.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/40">
                              <td className="px-4 py-3 text-center font-mono font-bold">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                                {q.competency}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-emerald-800 dark:text-emerald-400 text-xs">
                                  {q.materi}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                  {q.indicator}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-center font-bold">{q.level}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {QUESTION_SHAPE_LABELS[q.type]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {resultTab === 'kunci_jawaban' && (
                    <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-[#FAFAF7] dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3 font-bold w-12 text-center">No</th>
                            <th className="px-4 py-3 font-bold w-32">Bentuk</th>
                            <th className="px-4 py-3 font-bold">Kunci Jawaban</th>
                            <th className="px-4 py-3 font-bold">Pembahasan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {displayedQuestions.map((q, idx) => (
                            <tr key={q.id}>
                              <td className="px-4 py-3 text-center font-mono font-bold">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold">
                                {QUESTION_SHAPE_LABELS[q.type]}
                              </td>
                              <td className="px-4 py-3 font-bold text-emerald-800 dark:text-emerald-300">
                                {formatAnswerKeyText(q)}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                {q.explanation || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {resultTab === 'pedoman_penskoran' && (
                    <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-[#FAFAF7] dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3 font-bold w-12 text-center">No</th>
                            <th className="px-4 py-3 font-bold w-28">Bentuk</th>
                            <th className="px-4 py-3 font-bold">Rubrik / Kriteria Penskoran</th>
                            <th className="px-4 py-3 font-bold w-24 text-center">Skor Maks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {displayedQuestions.map((q, idx) => (
                            <tr key={q.id}>
                              <td className="px-4 py-3 text-center font-mono font-bold">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3 text-xs font-semibold">
                                {QUESTION_SHAPE_LABELS[q.type]}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                                {q.scoringRubric}
                              </td>
                              <td className="px-4 py-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                {q.maxScore}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-emerald-50/70 dark:bg-emerald-950/40 font-bold">
                            <td colSpan={3} className="px-4 py-3 text-right">
                              Total Skor Maksimal (Nilai Akhir = Perolehan ÷ {totalMaxScore} × 100)
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-emerald-900 dark:text-emerald-200">
                              {totalMaxScore}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                    </>
                  )}
                </>
              )}
            </section>
          </div>

          {/* HIDDEN PRINT SHEET: Always mounted outside .no-print so window.print() outputs crisp A4 with Kop Surat PKBM regardless of view mode */}
          {displayedQuestions.length > 0 && (
            <div className="hidden print:block">
              <ExamPrintSheet
                schoolSettings={schoolSettings}
                exam={activeExamDraft}
                variant={hasPaketB ? activeVariant : 'A'}
                questions={displayedQuestions}
                activeTab={resultTab}
                teacherNip={matchedTeacher?.nip || ''}
              />
            </div>
          )}
        </>
      )}

      {/* TAB 2: BANK SOAL */}
      {workspaceTab === 'bank' && (
        <div className="no-print">
          <BankSoalPanel
            items={questionBank}
            activeQuestionIds={activeQuestionIds}
            onAddToExam={handleAddFromBank}
            onDeleteItem={async (id) => {
              await deleteQuestionBankItem(id);
              showToast('Butir soal dihapus dari Bank Soal', 'success');
            }}
          />
        </div>
      )}

      {/* TAB 3: UJIAN ONLINE & PENILAIAN URAIAN */}
      {workspaceTab === 'grading' && (
        <div className="no-print space-y-5">
          <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <span>Rekap Jawaban Ujian Online &amp; Penilaian Uraian</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Soal pilihan ganda, benar-salah, menjodohkan, dan isian dinilai otomatis. Periksa
                jawaban Uraian di bawah ini.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-[#FAFAF7] dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {(['Semua', 'Menunggu Nilai Uraian', 'Selesai Dinilai'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSubmissionFilter(st)}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-colors ${
                    submissionFilter === st
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Belum Ada Pengumpulan Ujian Online"
              description="Publikasikan naskah ujian untuk murid agar jawaban online mereka tampil di sini untuk dinilai."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSubmissions.map((sub) => (
                <article
                  key={sub.id}
                  className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                          sub.status === 'Menunggu Nilai Uraian'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}
                      >
                        {sub.status}
                      </span>
                      <h4 className="mt-2 font-display font-bold text-base text-slate-900 dark:text-white">
                        {sub.studentName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        NIS {sub.studentNis} · {sub.className} · Paket Soal {sub.paketVariant}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Nilai Akhir</p>
                      <p className="font-display font-extrabold text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {sub.status === 'Selesai Dinilai' ? sub.finalScore : '—'}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Ujian: {sub.examTitle}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-[#FAFAF7] dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-500">Skor Objektif</p>
                      <p className="font-mono font-bold text-slate-900 dark:text-white">
                        {sub.autoScore}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Skor Uraian</p>
                      <p className="font-mono font-bold text-slate-900 dark:text-white">
                        {sub.essayScore}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Skor Maks</p>
                      <p className="font-mono font-bold text-slate-900 dark:text-white">
                        {sub.maxScore}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenGrading(sub)}
                    className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-105"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>
                      {sub.status === 'Menunggu Nilai Uraian'
                        ? 'Periksa & Nilai Uraian'
                        : 'Lihat / Ubah Nilai Uraian'}
                    </span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL PENILAIAN URAIAN */}
      {gradingSubmission && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setGradingSubmission(null)}
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  Koreksi Jawaban Uraian
                </p>
                <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
                  {gradingSubmission.studentName} ({gradingSubmission.studentNis})
                </h3>
                <p className="text-xs text-slate-500">
                  {gradingSubmission.examTitle} · Skor Objektif Otomatis:{' '}
                  <strong className="font-mono">{gradingSubmission.autoScore}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGradingSubmission(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {gradingEssayQuestions.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Ujian ini tidak memiliki butir soal uraian. Klik simpan untuk mengesahkan skor
                objektif otomatis sebagai nilai akhir.
              </p>
            ) : (
              <div className="space-y-4">
                {gradingEssayQuestions.map((q, idx) => {
                  const studentText = gradingSubmission.answers[q.id]?.textValue || '(Tidak dijawab)';
                  const entry = essayDraft[q.id] || { score: 0, feedback: '' };
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                          Soal Uraian #{idx + 1}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          Skor Maks: {q.maxScore}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-slate-900 dark:text-white whitespace-pre-line">
                        {q.prompt}
                      </p>

                      <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <p className="text-[11px] font-bold text-slate-500 mb-1">
                          Jawaban Warga Belajar:
                        </p>
                        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line">
                          {studentText}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-xs space-y-1">
                        <p className="font-bold text-emerald-900 dark:text-emerald-300">
                          Kunci &amp; Rubrik Guru:
                        </p>
                        <p className="text-slate-700 dark:text-slate-300">
                          {q.essayAnswerKey || q.scoringRubric}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Beri Skor (0 - {q.maxScore})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={q.maxScore}
                            step={0.5}
                            value={entry.score}
                            onChange={(e) => {
                              const val = Math.min(
                                q.maxScore,
                                Math.max(0, Number(e.target.value) || 0)
                              );
                              setEssayDraft({
                                ...essayDraft,
                                [q.id]: { ...entry, score: val },
                              });
                            }}
                            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono font-bold"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Catatan Umpan Balik Guru
                          </label>
                          <input
                            type="text"
                            value={entry.feedback}
                            onChange={(e) =>
                              setEssayDraft({
                                ...essayDraft,
                                [q.id]: { ...entry, feedback: e.target.value },
                              })
                            }
                            placeholder="Contoh: Analisis tepat, tambahkan contoh data lokal."
                            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGradingSubmission(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingGrade}
                onClick={handleCommitGrading}
                className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-sm font-bold inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingGrade ? 'Menyimpan...' : 'Simpan Nilai Akhir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteExamTarget)}
        title="Hapus Naskah Ujian?"
        description="Seluruh konfigurasi paket soal pada naskah ini akan dihapus permanen. Butir soal yang sudah disalin ke Bank Soal tetap tersimpan."
        onCancel={() => setDeleteExamTarget(null)}
        onConfirm={async () => {
          if (deleteExamTarget) {
            await deleteExamPackage(deleteExamTarget);
            const remaining = exams.filter((e) => e.id !== deleteExamTarget);
            if (remaining[0]) loadExamIntoWorkspace(remaining[0]);
            else handleStartBlankExam();
            showToast('Naskah ujian berhasil dihapus', 'success');
            setDeleteExamTarget(null);
          }
        }}
      />
    </div>
  );
};
