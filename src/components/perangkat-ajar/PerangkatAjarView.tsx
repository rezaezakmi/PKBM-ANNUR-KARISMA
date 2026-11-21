import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Award,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileCheck2,
  FolderOpen,
  GitBranch,
  GraduationCap,
  Layers,
  LucideIcon,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PaketType, TeachingDocType, TeachingDocument } from '../../types/siakad';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { AnimatedSaveCheck } from '../ui/MotionPrimitives';
import {
  ERROR_SHAKE_VARIANTS,
  getStaggerItemProps,
  useAdaptiveMotion,
} from '../../config/animations';
import { RichTextA4Editor, replaceSectionInHtml } from './RichTextA4Editor';
import { postAiJson } from '../../utils/aiFetch';

interface DocTypeOption {
  id: TeachingDocType;
  label: string;
  shortTitle: string;
  desc: string;
  icon: LucideIcon;
  badgeColor: string;
}

const DOC_TYPE_OPTIONS: DocTypeOption[] = [
  {
    id: 'MODUL_AJAR',
    label: 'Modul Ajar / RPP',
    shortTitle: 'MODUL AJAR KURIKULUM MERDEKA',
    desc: 'Lengkap 17 komponen: Memahami–Mengaplikasi–Merefleksi, Asesmen, LKPD, & Glosarium.',
    icon: BookOpenCheck,
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    id: 'CP',
    label: 'Capaian Pembelajaran (CP)',
    shortTitle: 'DOKUMEN CAPAIAN PEMBELAJARAN (CP)',
    desc: 'Rasional, tujuan, karakteristik elemen, dan rumusan CP per Fase kesetaraan.',
    icon: Compass,
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  },
  {
    id: 'TP_ATP',
    label: 'TP / ATP',
    shortTitle: 'TUJUAN PEMBELAJARAN & ALUR TUJUAN PEMBELAJARAN',
    desc: 'Pemetaan CP ke Tujuan Pembelajaran operasional dan alur pertemuan terstruktur.',
    icon: GitBranch,
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
    id: 'KKTP',
    label: 'KKTP',
    shortTitle: 'KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN',
    desc: 'Rubrik 4 tingkat (Baru Berkembang s.d. Mahir) beserta interval nilai & tindak lanjut.',
    icon: Award,
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    id: 'PROTA',
    label: 'PROTA',
    shortTitle: 'PROGRAM TAHUNAN (PROTA) KESETARAAN',
    desc: 'Rekapitulasi minggu efektif dan matriks distribusi materi selama 1 tahun ajaran.',
    icon: CalendarRange,
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
    id: 'PROSEM',
    label: 'PROSEM',
    shortTitle: 'PROGRAM SEMESTER (PROSEM) KESETARAAN',
    desc: 'Perhitungan jam efektif semester dan jadwal mingguan distribusi pembelajaran.',
    icon: CalendarClock,
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  },
  {
    id: 'KALDIK',
    label: 'Kalender Pendidikan',
    shortTitle: 'KALENDER PENDIDIKAN PKBM',
    desc: 'Agenda tutorial tatap muka, ujian kesetaraan, asesmen modul, dan hari efektif.',
    icon: CalendarDays,
    badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  },
];

const FASE_BY_PAKET: Record<PaketType, string[]> = {
  'Paket A': ['Fase A (Kelas 1-2)', 'Fase B (Kelas 3-4)', 'Fase C (Kelas 5-6)'],
  'Paket B': ['Fase D (Kelas 7-9)'],
  'Paket C': ['Fase E (Kelas 10)', 'Fase F (Kelas 11-12)'],
};

const DEFAULT_ALOKASI_BY_PAKET: Record<PaketType, string> = {
  'Paket A': '2 x 35 Menit',
  'Paket B': '2 x 40 Menit',
  'Paket C': '2 x 45 Menit',
};

const PENDEKATAN_OPTIONS = [
  {
    id: 'Mindful Learning',
    desc: 'Kesadaran penuh, fokus hadir, dan refleksi niat belajar',
  },
  {
    id: 'Meaningful Learning',
    desc: 'Kontekstual dengan dunia kerja, usaha, & kehidupan warga belajar',
  },
  {
    id: 'Joyful Learning',
    desc: 'Aktivitas kolaboratif, antusias, dan bebas tekanan',
  },
];

const EIGHT_DIMENSI_PROFIL = [
  'Keimanan dan Ketakwaan',
  'Kewargaan',
  'Penalaran Kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
];

const SAMPLE_TOPICS_BY_PAKET: Record<PaketType, string[]> = {
  'Paket A': [
    'Teks Narasi & Cerita Rakyat Nusantara',
    'Operasi Hitung Pecahan dalam Belanja Harian',
    'Menjaga Kebersihan & Kesehatan Lingkungan Rumah',
  ],
  'Paket B': [
    'Aritmatika Sosial: Laba, Rugi, & Diskon UMKM',
    'Teks Prosedur Membuat Produk Kerajinan Lokal',
    'Sistem Pencernaan & Pola Makan Bergizi',
  ],
  'Paket C': [
    'Menulis Teks Argumentasi Berbasis Data Sosial Ekonomi',
    'Perencanaan Usaha Mikro & Pembukuan Sederhana',
    'Statistika Deskriptif untuk Survei Masyarakat',
  ],
};

const WIZARD_STEPS = [
  { id: 1, label: 'Pilih Kelas' },
  { id: 2, label: 'Materi' },
  { id: 3, label: 'Pengaturan' },
  { id: 4, label: 'Generate' },
];

const GENERATION_STAGES = [
  { progress: 22, label: 'Menganalisis Capaian Pembelajaran & Fase Kesetaraan...' },
  { progress: 48, label: 'Menyusun tujuan pembelajaran & 8 Dimensi Profil Lulusan...' },
  { progress: 74, label: 'Merancang kegiatan Memahami–Mengaplikasi–Merefleksi...' },
  { progress: 92, label: 'Menyusun asesmen, pengayaan, LKPD, & bahan bacaan...' },
];

export const PerangkatAjarView: React.FC = () => {
  const { profile } = useAuth();
  const {
    schoolSettings,
    classes,
    subjects,
    teachers,
    teachingDocuments,
    saveTeachingDocument,
    deleteTeachingDocument,
  } = useData();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  // Wizard Step
  const [step, setStep] = useState<number>(1);
  const [activeDocId, setActiveDocId] = useState<string | undefined>(undefined);

  // Step 1 Inputs
  const [docType, setDocType] = useState<TeachingDocType>('MODUL_AJAR');
  const [paket, setPaket] = useState<PaketType>('Paket C');
  const [fase, setFase] = useState<string>(FASE_BY_PAKET['Paket C'][1]);
  const [kelas, setKelas] = useState<string>('Paket C - Kelas 12 CIPANAS');
  const [mapel, setMapel] = useState<string>('Bahasa Indonesia & Karya Ilmiah');

  // Step 2 Inputs
  const [materi, setMateri] = useState<string>('Menulis Teks Argumentasi Berbasis Data Sosial Ekonomi Lokal');
  const [deskripsiTambahan, setDeskripsiTambahan] = useState<string>('');
  const [jumlahPertemuan, setJumlahPertemuan] = useState<number>(2);
  const [alokasiWaktu, setAlokasiWaktu] = useState<string>('2 x 45 Menit');
  const [pendekatan, setPendekatan] = useState<string[]>([
    'Mindful Learning',
    'Meaningful Learning',
    'Joyful Learning',
  ]);
  const [dimensiProfil, setDimensiProfil] = useState<string[]>([
    'Keimanan dan Ketakwaan',
    'Penalaran Kritis',
    'Kreativitas',
    'Kolaborasi',
    'Kemandirian',
    'Komunikasi',
  ]);

  // Step 3 Inputs
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

  const [documentTitle, setDocumentTitle] = useState<string>(
    'MODUL AJAR: Bahasa Indonesia & Karya Ilmiah'
  );
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [documentNumber, setDocumentNumber] = useState<string>('421.9/MOD-01/PKBM-AK/XI/2026');
  const [academicYear, setAcademicYear] = useState<string>(schoolSettings.academicYear);
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(schoolSettings.semester);
  const [teacherName, setTeacherName] = useState<string>(
    matchedTeacher?.fullName || profile?.name || 'Reny Febriyani, S.Sos.'
  );
  const [teacherNip, setTeacherNip] = useState<string>(matchedTeacher?.nip || '');
  const [city, setCity] = useState<string>('Cianjur');
  const [showTeacherSignature, setShowTeacherSignature] = useState<boolean>(true);

  // Editor & Generation State
  const [contentHtml, setContentHtml] = useState<string>(
    teachingDocuments[0]?.contentHtml || ''
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStageIdx, setGenerationStageIdx] = useState(0);
  const [isRegeneratingSection, setIsRegeneratingSection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // History Filters
  const [historySearch, setHistorySearch] = useState('');
  const [filterMapel, setFilterMapel] = useState('Semua');
  const [filterKelas, setFilterKelas] = useState('Semua');
  const [filterDate, setFilterDate] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const activeDocMeta = useMemo(
    () => DOC_TYPE_OPTIONS.find((d) => d.id === docType) || DOC_TYPE_OPTIONS[0],
    [docType]
  );

  const classesForPaket = useMemo(
    () => classes.filter((c) => c.paket === paket),
    [classes, paket]
  );

  const subjectsForPaket = useMemo(
    () => subjects.filter((s) => s.paket === paket),
    [subjects, paket]
  );

  // Sync default Fase, Kelas, Mapel, Alokasi when Paket changes
  const handlePaketChange = (nextPaket: PaketType) => {
    setPaket(nextPaket);
    const availableFases = FASE_BY_PAKET[nextPaket];
    setFase(availableFases[availableFases.length - 1]);
    setAlokasiWaktu(DEFAULT_ALOKASI_BY_PAKET[nextPaket]);

    const firstClass = classes.find((c) => c.paket === nextPaket);
    if (firstClass) setKelas(firstClass.name);

    const firstSubject = subjects.find((s) => s.paket === nextPaket);
    if (firstSubject) setMapel(firstSubject.name);
  };

  // Auto-update document title unless manually edited
  useEffect(() => {
    if (titleManuallyEdited) return;
    const prefix = activeDocMeta.label.replace(/\s*\(.*?\)/g, '');
    setDocumentTitle(`${prefix}: ${mapel}${materi ? ` — ${materi}` : ''}`);
  }, [activeDocMeta.label, mapel, materi, titleManuallyEdited]);

  // Animated progress stage ticker while Gemini API responds
  useEffect(() => {
    if (!isGenerating) return;
    setGenerationStageIdx(0);
    const interval = setInterval(() => {
      setGenerationStageIdx((prev) =>
        prev < GENERATION_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 2400);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const toggleApproach = (item: string) => {
    setPendekatan((prev) =>
      prev.includes(item)
        ? prev.length > 1
          ? prev.filter((x) => x !== item)
          : prev
        : [...prev, item]
    );
  };

  const toggleDimensi = (item: string) => {
    setDimensiProfil((prev) =>
      prev.includes(item)
        ? prev.length > 1
          ? prev.filter((x) => x !== item)
          : prev
        : [...prev, item]
    );
  };

  const scrollToEditorOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      requestAnimationFrame(() => {
        editorContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const handleGenerate = async () => {
    if (!mapel.trim() || !materi.trim()) {
      showToast('Mata pelajaran dan topik materi wajib diisi', 'warning');
      setStep(2);
      return;
    }
    setApiError(null);
    setIsGenerating(true);
    scrollToEditorOnMobile();

    try {
      const result = await postAiJson<{ html?: string; message?: string }>(
        '/api/perangkat-ajar/generate',
        {
          docType,
          paket,
          fase,
          kelas,
          mapel,
          materi,
          deskripsiTambahan,
          jumlahPertemuan,
          alokasiWaktu,
          academicYear,
          semester,
          schoolName: schoolSettings.schoolName,
          teacherName,
          pendekatan,
          dimensiProfil,
        },
        { timeoutMs: 95_000, retries: 1 }
      );

      if (!result.ok || !result.data) {
        const msg =
          result.errorMessage ||
          'Gagal menyusun perangkat ajar dari layanan AI. Silakan coba kembali.';
        setApiError(msg);
        showToast(msg, 'error');
        return;
      }

      if (!result.data.html) {
        setApiError('Dokumen yang dihasilkan kosong. Silakan ulangi proses generate.');
        showToast('Hasil dokumen kosong', 'warning');
        return;
      }

      setActiveDocId(undefined);
      setContentHtml(result.data.html);
      showToast(
        `${activeDocMeta.label} berhasil disusun!`,
        'success',
        'Anda dapat menyunting langsung, me-regenerate bagian tertentu, lalu menyimpan atau mencetak.'
      );
      scrollToEditorOnMobile();
    } catch {
      const msg =
        'Tidak dapat terhubung ke server Generator AI. Periksa koneksi internet Anda lalu coba kembali.';
      setApiError(msg);
      showToast(msg, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateSection = async (
    sectionIndex: number,
    sectionTitle: string,
    currentSectionHtml: string,
    customInstruction: string
  ) => {
    setApiError(null);
    setIsRegeneratingSection(true);
    try {
      const result = await postAiJson<{ html?: string; message?: string }>(
        '/api/perangkat-ajar/regenerate-section',
        {
          docType,
          paket,
          mapel,
          materi,
          sectionTitle,
          currentSectionHtml,
          customInstruction,
        },
        { timeoutMs: 70_000, retries: 1 }
      );
      if (!result.ok || !result.data?.html) {
        const msg =
          result.errorMessage || 'Gagal menyusun ulang bagian dokumen. Silakan coba kembali.';
        setApiError(msg);
        showToast(msg, 'error');
        return;
      }

      const updatedHtml = replaceSectionInHtml(contentHtml, sectionIndex, result.data.html);
      setContentHtml(updatedHtml);
      showToast(`Bagian "${sectionTitle}" berhasil diperbarui`, 'success');
    } catch {
      const msg = 'Koneksi ke server terputus saat menyusun ulang bagian dokumen.';
      setApiError(msg);
      showToast(msg, 'error');
    } finally {
      setIsRegeneratingSection(false);
    }
  };

  const handleSaveDocument = async () => {
    if (!contentHtml.trim()) {
      showToast('Belum ada isi dokumen untuk disimpan', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveTeachingDocument({
        id: activeDocId,
        docType,
        title: documentTitle.trim() || `${activeDocMeta.label}: ${mapel}`,
        paket,
        fase,
        kelas,
        mapel,
        materi,
        jumlahPertemuan,
        alokasiWaktu,
        academicYear,
        semester,
        contentHtml,
        authorName: teacherName || profile?.name || 'Tutor Pengampu',
      });
      setActiveDocId(saved.id);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 1800);
      showToast('Perangkat ajar berhasil disimpan ke riwayat', 'success');
    } catch {
      showToast('Gagal menyimpan perangkat ajar', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadFromHistory = (docItem: TeachingDocument, shouldPrint = false) => {
    setActiveDocId(docItem.id);
    setDocType(docItem.docType);
    setPaket(docItem.paket);
    setFase(docItem.fase);
    setKelas(docItem.kelas);
    setMapel(docItem.mapel);
    setMateri(docItem.materi);
    setJumlahPertemuan(docItem.jumlahPertemuan);
    setAlokasiWaktu(docItem.alokasiWaktu);
    setAcademicYear(docItem.academicYear);
    setSemester(docItem.semester);
    setTeacherName(docItem.authorName);
    setTitleManuallyEdited(true);
    setDocumentTitle(docItem.title);
    setContentHtml(docItem.contentHtml);

    editorContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`Membuka "${docItem.title}" di editor`, 'info');

    if (shouldPrint) {
      setTimeout(() => window.print(), 320);
    }
  };

  // History filter options derived from saved documents
  const uniqueHistoryMapels = useMemo(
    () => Array.from(new Set(teachingDocuments.map((d) => d.mapel))).sort(),
    [teachingDocuments]
  );
  const uniqueHistoryKelas = useMemo(
    () => Array.from(new Set(teachingDocuments.map((d) => d.kelas))).sort(),
    [teachingDocuments]
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return teachingDocuments
      .filter((docItem) => {
        if (filterMapel !== 'Semua' && docItem.mapel !== filterMapel) return false;
        if (filterKelas !== 'Semua' && docItem.kelas !== filterKelas) return false;
        if (filterDate) {
          const itemDate = new Date(docItem.updatedAt || docItem.createdAt)
            .toISOString()
            .slice(0, 10);
          if (itemDate !== filterDate) return false;
        }
        if (q) {
          const haystack =
            `${docItem.title} ${docItem.mapel} ${docItem.materi} ${docItem.kelas} ${docItem.authorName}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
  }, [teachingDocuments, filterMapel, filterKelas, filterDate, historySearch]);

  const currentStage = GENERATION_STAGES[generationStageIdx] || GENERATION_STAGES[0];

  return (
    <div className="space-y-8">
      {/* Header Banner (Hidden when printing) */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="no-print rounded-2xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-600 p-5 sm:p-7 text-white shadow-lg shadow-emerald-950/15"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-200 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>Kurikulum Merdeka Kesetaraan · Pembelajaran Mendalam</span>
            </p>
            <h2 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight">
              Generator Perangkat Ajar AI
            </h2>
            <p className="text-xs sm:text-sm text-emerald-50/90 max-w-3xl">
              Susun CP, TP/ATP, KKTP, PROTA, PROSEM, Kalender Pendidikan, hingga Modul Ajar lengkap
              berbasis Mindful, Meaningful, Joyful Learning &amp; 8 Dimensi Profil Lulusan siap cetak
              A4 dengan kop surat dan stempel resmi.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs font-semibold bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2.5">
            <GraduationCap className="w-4 h-4 text-amber-200" />
            <span>
              {teachingDocuments.length} Perangkat Tersimpan
            </span>
          </div>
        </div>
      </motion.section>

      {/* Main Two-Panel Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: 4-Step Wizard (Hidden when printing) */}
        <section
          aria-label="Wizard Penyusunan Perangkat Ajar"
          className="no-print xl:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
        >
          {/* Stepper Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-[#FAFAF7]/70 dark:bg-slate-800/40">
            <nav aria-label="Tahapan Generator" className="grid grid-cols-4 gap-2">
              {WIZARD_STEPS.map((st) => {
                const isActive = step === st.id;
                const isDone = step > st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStep(st.id)}
                    className={`min-h-[48px] px-2 py-2 rounded-xl text-left transition-all border ${
                      isActive
                        ? 'bg-gradient-to-br from-emerald-700 to-emerald-600 text-white border-transparent shadow-sm'
                        : isDone
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50'
                          : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-white text-emerald-800'
                            : isDone
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isDone ? <Check className="w-3 h-3" /> : st.id}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold truncate">
                        {st.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Step Content */}
          <div className="p-5 sm:p-6 space-y-5">
            {/* STEP 1: PILIH KELAS & JENIS DOKUMEN */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mb-2.5">
                    1. Pilih Jenis Perangkat Ajar
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {DOC_TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = docType === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setDocType(opt.id);
                            setTitleManuallyEdited(false);
                          }}
                          className={`min-h-[76px] p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                            selected
                              ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 ring-2 ring-emerald-600/20 shadow-sm'
                              : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 hover:border-emerald-500/40'
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              selected
                                ? 'bg-gradient-to-br from-emerald-700 to-amber-600 text-white'
                                : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                              {opt.label}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {opt.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Paket & Fase */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Program Paket
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Paket A', 'Paket B', 'Paket C'] as PaketType[]).map((pk) => (
                        <button
                          key={pk}
                          type="button"
                          onClick={() => handlePaketChange(pk)}
                          className={`min-h-[44px] px-2 rounded-xl text-xs font-bold border transition-colors ${
                            paket === pk
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-[#FAFAF7] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {pk}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Fase Kurikulum Merdeka
                    </label>
                    <select
                      value={fase}
                      onChange={(e) => setFase(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      {FASE_BY_PAKET[paket].map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Kelas & Mata Pelajaran */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Kelas / Rombel
                    </label>
                    <select
                      value={classesForPaket.some((c) => c.name === kelas) ? kelas : '__custom'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom') setKelas(e.target.value);
                      }}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      {classesForPaket.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__custom">Ketik manual di bawah...</option>
                    </select>
                    <input
                      type="text"
                      value={kelas}
                      onChange={(e) => setKelas(e.target.value)}
                      placeholder="Contoh: Paket C - Kelas 12 CIPANAS"
                      className="mt-1.5 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Mata Pelajaran
                    </label>
                    <select
                      value={subjectsForPaket.some((s) => s.name === mapel) ? mapel : '__custom'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom') setMapel(e.target.value);
                      }}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      {subjectsForPaket.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                      <option value="__custom">Mapel lainnya (ketik manual)...</option>
                    </select>
                    <input
                      type="text"
                      value={mapel}
                      onChange={(e) => setMapel(e.target.value)}
                      placeholder="Nama mata pelajaran..."
                      className="mt-1.5 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: MATERI, PEMBELAJARAN MENDALAM & 8 DIMENSI PROFIL LULUSAN */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Topik / Materi Pokok *
                  </label>
                  <input
                    type="text"
                    value={materi}
                    onChange={(e) => setMateri(e.target.value)}
                    placeholder="Contoh: Menulis Teks Argumentasi Berbasis Data Sosial Lokal"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SAMPLE_TOPICS_BY_PAKET[paket].map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => setMateri(topic)}
                        className="px-2.5 py-1 rounded-lg border border-emerald-700/20 bg-emerald-50 dark:bg-emerald-950/30 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors text-left"
                      >
                        + {topic}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Jumlah Pertemuan
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={jumlahPertemuan}
                      onChange={(e) =>
                        setJumlahPertemuan(Math.max(1, Math.min(16, Number(e.target.value) || 1)))
                      }
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Alokasi Waktu / Pertemuan
                    </label>
                    <input
                      type="text"
                      value={alokasiWaktu}
                      onChange={(e) => setAlokasiWaktu(e.target.value)}
                      placeholder="2 x 45 Menit"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Catatan Konteks / Karakteristik Warga Belajar (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={deskripsiTambahan}
                    onChange={(e) => setDeskripsiTambahan(e.target.value)}
                    placeholder="Mis. Mayoritas warga belajar bekerja/wirausaha, gunakan contoh kasus praktis dan tugas proyek fleksibel."
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {/* Pendekatan Pembelajaran Mendalam */}
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                    Pendekatan Pembelajaran Mendalam (Memahami · Mengaplikasi · Merefleksi)
                  </p>
                  <div className="space-y-2">
                    {PENDEKATAN_OPTIONS.map((item) => {
                      const active = pendekatan.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                            active
                              ? 'border-emerald-600/40 bg-emerald-50/70 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleApproach(item.id)}
                            className="mt-0.5 w-4 h-4 rounded accent-emerald-700"
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              {item.id}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {item.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 8 Dimensi Profil Lulusan */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      8 Dimensi Profil Lulusan
                    </p>
                    <button
                      type="button"
                      onClick={() => setDimensiProfil([...EIGHT_DIMENSI_PROFIL])}
                      className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Pilih Semua (8)
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {EIGHT_DIMENSI_PROFIL.map((dim) => {
                      const active = dimensiProfil.includes(dim);
                      return (
                        <button
                          key={dim}
                          type="button"
                          onClick={() => toggleDimensi(dim)}
                          className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition-colors ${
                            active
                              ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-emerald-700 text-white'
                                : 'border border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                          </span>
                          <span className="truncate">{dim}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: PENGATURAN DOKUMEN & PENGESAHAN */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Judul Dokumen pada Lembar Cetak
                    </label>
                    {titleManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => setTitleManuallyEdited(false)}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        Reset Otomatis
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={documentTitle}
                    onChange={(e) => {
                      setTitleManuallyEdited(true);
                      setDocumentTitle(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nomor Dokumen
                    </label>
                    <input
                      type="text"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Kota Penerbitan
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tahun Ajaran
                    </label>
                    <input
                      type="text"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Semester
                    </label>
                    <select
                      value={semester}
                      onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nama Guru / Penyusun
                    </label>
                    <input
                      type="text"
                      value={teacherName}
                      onChange={(e) => setTeacherName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      NIP / NUPTK Penyusun
                    </label>
                    <input
                      type="text"
                      value={teacherNip}
                      onChange={(e) => setTeacherNip(e.target.value)}
                      placeholder="Opsional"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTeacherSignature}
                    onChange={(e) => setShowTeacherSignature(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-700"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Sertakan Tanda Tangan Guru &amp; Kepala PKBM + Cap
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mengambil kop surat, logo, TTD, dan cap stempel dari Pengaturan Sekolah.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* STEP 4: RINGKASAN & GENERATE */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800/50 p-4 space-y-2.5 text-xs">
                  <p className="font-display font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Ringkasan Konfigurasi Perangkat Ajar</span>
                  </p>
                  <div className="grid grid-cols-3 gap-y-2 pt-1">
                    <span className="text-slate-500 dark:text-slate-400">Jenis</span>
                    <span className="col-span-2 font-bold text-slate-900 dark:text-white">
                      {activeDocMeta.label}
                    </span>

                    <span className="text-slate-500 dark:text-slate-400">Paket / Fase</span>
                    <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">
                      {paket} · {fase}
                    </span>

                    <span className="text-slate-500 dark:text-slate-400">Kelas</span>
                    <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">
                      {kelas}
                    </span>

                    <span className="text-slate-500 dark:text-slate-400">Mapel</span>
                    <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">
                      {mapel}
                    </span>

                    <span className="text-slate-500 dark:text-slate-400">Materi</span>
                    <span className="col-span-2 font-semibold text-emerald-800 dark:text-emerald-300">
                      {materi}
                    </span>

                    <span className="text-slate-500 dark:text-slate-400">Waktu</span>
                    <span className="col-span-2 text-slate-800 dark:text-slate-200">
                      {jumlahPertemuan} pertemuan ({alokasiWaktu})
                    </span>

                    <span className="text-slate-500 dark:text-slate-400">Profil Lulusan</span>
                    <span className="col-span-2 text-slate-700 dark:text-slate-300">
                      {dimensiProfil.join(', ')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white font-display font-extrabold text-sm sm:text-base shadow-lg shadow-emerald-950/15 hover:brightness-105 active:scale-[0.99] disabled:opacity-60 transition-all flex items-center justify-center gap-2.5"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Menyusun Perangkat Ajar...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5" />
                      <span>
                        {contentHtml.trim()
                          ? 'Generate Ulang Perangkat Ajar'
                          : 'Generate Perangkat Ajar'}
                      </span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                  Hasil muncul di panel pratinjau sebagai dokumen A4 yang dapat disunting langsung.
                </p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {apiError && (
                <motion.div
                  key={apiError}
                  variants={ERROR_SHAKE_VARIANTS}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  role="alert"
                  className="rounded-2xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs sm:text-sm text-rose-800 dark:text-rose-200 flex items-start gap-3"
                >
                  <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-2 flex-1">
                    <p className="font-bold">Kendala Pembuatan Perangkat Ajar</p>
                    <p className="text-xs leading-relaxed">{apiError}</p>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Coba Generate Lagi</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step Navigation Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1 || isGenerating}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>

              {step < 4 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:brightness-105 disabled:opacity-60"
                  >
                    {isGenerating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isGenerating ? 'Menyusun...' : 'Generate AI'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.min(4, s + 1))}
                    disabled={isGenerating}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <span>Lanjut</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveDocument}
                  disabled={!contentHtml.trim() || isGenerating || isSaving}
                  className="btn-ripple min-h-[44px] px-4 rounded-xl border border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-40 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5"
                >
                  {saveSuccess ? (
                    <AnimatedSaveCheck visible={saveSuccess} />
                  ) : (
                    <FileCheck2 className="w-4 h-4" />
                  )}
                  <span>
                    {saveSuccess ? 'Tersimpan!' : isSaving ? 'Menyimpan...' : 'Simpan ke Riwayat'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT PANEL: A4 PAPER PREVIEW & RICH TEXT EDITOR */}
        <section
          ref={editorContainerRef}
          aria-label="Pratinjau dan Editor Kertas A4"
          className="xl:col-span-7 scroll-mt-20"
        >
          <RichTextA4Editor
            schoolSettings={schoolSettings}
            documentTitle={documentTitle}
            documentNumber={documentNumber}
            city={city}
            contentHtml={contentHtml}
            onContentChange={setContentHtml}
            isGenerating={isGenerating}
            generationStage={currentStage.label}
            generationProgress={currentStage.progress}
            isRegeneratingSection={isRegeneratingSection}
            onRegenerateSection={handleRegenerateSection}
            onSave={handleSaveDocument}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
            showTeacherSignature={showTeacherSignature}
            teacherName={teacherName}
            teacherNip={teacherNip}
          />
        </section>
      </div>

      {/* SAVED DOCUMENTS HISTORY CARDS (Hidden when printing) */}
      <section
        aria-label="Riwayat Perangkat Ajar Tersimpan"
        className="no-print rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 dark:text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <span>Riwayat Perangkat Ajar Tersimpan</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Buka kembali perangkat ajar yang sudah disimpan untuk disunting atau dicetak.
            </p>
          </div>
          {(historySearch || filterMapel !== 'Semua' || filterKelas !== 'Semua' || filterDate) && (
            <button
              type="button"
              onClick={() => {
                setHistorySearch('');
                setFilterMapel('Semua');
                setFilterKelas('Semua');
                setFilterDate('');
              }}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 self-start md:self-auto"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Filter Bar: Pencarian, Mapel, Kelas, Tanggal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Cari judul atau materi..."
              className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={filterMapel}
            onChange={(e) => setFilterMapel(e.target.value)}
            aria-label="Filter Mata Pelajaran"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="Semua">Semua Mata Pelajaran</option>
            {uniqueHistoryMapels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            aria-label="Filter Kelas"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="Semua">Semua Kelas / Rombel</option>
            {uniqueHistoryKelas.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filter Tanggal Simpan"
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          />
        </div>

        {/* History Cards Grid */}
        {filteredHistory.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title="Belum Ada Perangkat Ajar yang Sesuai"
            description="Coba ubah kata kunci filter Anda, atau susun perangkat ajar baru menggunakan Wizard AI di atas."
            actionLabel="Susun Perangkat Baru"
            onAction={() => {
              setStep(1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredHistory.map((item, idx) => {
              const typeMeta =
                DOC_TYPE_OPTIONS.find((o) => o.id === item.docType) || DOC_TYPE_OPTIONS[0];
              const TypeIcon = typeMeta.icon;
              const isSelectedInEditor = activeDocId === item.id;
              return (
                <motion.article
                  key={item.id}
                  {...getStaggerItemProps(idx, motionProfile)}
                  className={`card-hover-lift rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                    isSelectedInEditor
                      ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-md'
                      : 'border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800/40 hover:border-emerald-600/40'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${typeMeta.badgeColor}`}
                      >
                        <TypeIcon className="w-3.5 h-3.5" />
                        <span>{typeMeta.label}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                        {item.paket}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white line-clamp-2 leading-snug">
                        {item.title}
                      </h4>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {item.materi}
                      </p>
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                      <p className="truncate">
                        <strong className="text-slate-700 dark:text-slate-300">Mapel:</strong>{' '}
                        {item.mapel}
                      </p>
                      <p className="truncate">
                        <strong className="text-slate-700 dark:text-slate-300">Kelas:</strong>{' '}
                        {item.kelas} ({item.fase})
                      </p>
                      <p className="flex items-center justify-between gap-2">
                        <span>{item.authorName}</span>
                        <span className="font-mono">
                          {new Date(item.updatedAt || item.createdAt).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleLoadFromHistory(item, false)}
                      className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors"
                    >
                      Buka di Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadFromHistory(item, true)}
                      title="Cetak Dokumen"
                      aria-label={`Cetak ${item.title}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center justify-center"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(item.id)}
                      title="Hapus Perangkat"
                      aria-label={`Hapus ${item.title}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Hapus Perangkat Ajar?"
        description="Perangkat ajar yang dihapus dari riwayat tidak dapat dipulihkan kembali."
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={async () => {
          if (deleteTargetId) {
            await deleteTeachingDocument(deleteTargetId);
            if (activeDocId === deleteTargetId) {
              setActiveDocId(undefined);
            }
            showToast('Perangkat ajar berhasil dihapus dari riwayat', 'success');
            setDeleteTargetId(null);
          }
        }}
      />
    </div>
  );
};
