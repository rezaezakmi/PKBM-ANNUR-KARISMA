import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  FileEdit,
  Keyboard,
  Loader2,
  Radar,
  Save,
  SlidersHorizontal,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_GRADE_WEIGHTS } from '../../data/seedData';
import { GradePredicate, GradeWeights } from '../../types/siakad';
import {
  clampScore,
  computeFinalScore,
  computePredicate,
  computeTotalWeight,
  getPredicateMeta,
  normalizeWeights,
  WEIGHT_COMPONENTS,
  WEIGHT_PRESETS,
} from './gradeHelpers';
import { postAiJson } from '../../utils/aiFetch';
import { getTeacherSubjectsForClassOrPaket } from '../../data/kurikulumMerdeka';
import { sortClassesByJenjang } from '../../utils/excelUtils';

interface DraftGradeRow {
  studentId: string;
  studentUid: string;
  studentName: string;
  studentNis: string;
  tugas: number;
  uh: number;
  asts: number;
  asat: number;
  praktik: number;
  sikap: number;
  achievementDescription: string;
  homeroomNote: string;
}

interface GradeSpreadsheetPanelProps {
  selectedClassId: string;
  onSelectClassId: (id: string) => void;
  semester: 'Ganjil' | 'Genap';
  onChangeSemester: (sem: 'Ganjil' | 'Genap') => void;
  onInspectStudentRadar: (studentId: string) => void;
  onOpenStudentRapor: (studentId: string) => void;
}

const SCORE_COLUMNS: Array<keyof GradeWeights> = ['tugas', 'uh', 'asts', 'asat', 'praktik', 'sikap'];

export const GradeSpreadsheetPanel: React.FC<GradeSpreadsheetPanelProps> = ({
  selectedClassId,
  onSelectClassId,
  semester,
  onChangeSemester,
  onInspectStudentRadar,
  onOpenStudentRapor,
}) => {
  const { profile, effectiveRole } = useAuth();
  const {
    schoolSettings,
    classes,
    subjects,
    students,
    teachers,
    assignments,
    gradeWeights,
    gradeRecords,
    taskSubmissions,
    examSubmissions,
    exams,
    saveGradeWeights,
    saveGradeRecordsBatch,
  } = useData();
  const { showToast } = useToast();

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

  const activeClass = useMemo(
    () => availableClasses.find((c) => c.id === selectedClassId) || availableClasses[0] || null,
    [availableClasses, selectedClassId]
  );

  // Mata pelajaran pada kelas terpilih (utamakan mapel Kurikulum Merdeka yang diampu guru)
  const availableSubjects = useMemo(() => {
    if (!activeClass) return [];
    const byPaket = subjects.filter((s) => s.status === 'Aktif' && s.paket === activeClass.paket);
    if (effectiveRole === 'guru' && currentTeacher) {
      const teacherSubs = getTeacherSubjectsForClassOrPaket(
        currentTeacher,
        activeClass.paket,
        activeClass.id,
        subjects,
        teacherAssignments
      );
      if (teacherSubs.length > 0) return teacherSubs;
    }
    return byPaket;
  }, [activeClass, subjects, effectiveRole, currentTeacher, teacherAssignments]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  useEffect(() => {
    if (!availableSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(availableSubjects[0]?.id || '');
    }
  }, [availableSubjects, selectedSubjectId]);

  const activeSubject = useMemo(
    () => availableSubjects.find((s) => s.id === selectedSubjectId) || availableSubjects[0] || null,
    [availableSubjects, selectedSubjectId]
  );

  const studentsInClass = useMemo(
    () =>
      students
        .filter((s) => s.classId === activeClass?.id && s.status === 'Aktif')
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students, activeClass]
  );

  // Bobot nilai aktif untuk (classId, subjectId)
  const storedWeightConfig = useMemo(() => {
    if (!activeClass || !activeSubject) return null;
    return gradeWeights.find(
      (w) => w.classId === activeClass.id && w.subjectId === activeSubject.id
    );
  }, [gradeWeights, activeClass, activeSubject]);

  const [weights, setWeights] = useState<GradeWeights>(DEFAULT_GRADE_WEIGHTS);
  const [showWeightsPanel, setShowWeightsPanel] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);

  useEffect(() => {
    if (storedWeightConfig) {
      setWeights({
        tugas: storedWeightConfig.tugas,
        uh: storedWeightConfig.uh,
        asts: storedWeightConfig.asts,
        asat: storedWeightConfig.asat,
        praktik: storedWeightConfig.praktik,
        sikap: storedWeightConfig.sikap,
      });
    } else {
      setWeights(DEFAULT_GRADE_WEIGHTS);
    }
  }, [storedWeightConfig]);

  const totalWeightPct = computeTotalWeight(weights);

  // Baris draft spreadsheet
  const [rows, setRows] = useState<DraftGradeRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingStudentId, setGeneratingStudentId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<DraftGradeRow | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sinkronisasi rows dari gradeRecords saat kelas/mapel/semester berubah
  useEffect(() => {
    if (!activeClass || !activeSubject) {
      setRows([]);
      return;
    }
    const nextRows: DraftGradeRow[] = studentsInClass.map((st) => {
      const existing = gradeRecords.find(
        (g) =>
          g.studentId === st.id &&
          g.subjectId === activeSubject.id &&
          g.semester === semester
      );
      return {
        studentId: st.id,
        studentUid: st.ownerUid || `demo_${st.id}`,
        studentName: st.fullName,
        studentNis: st.nis,
        tugas: existing?.tugas ?? 80,
        uh: existing?.uh ?? 80,
        asts: existing?.asts ?? 80,
        asat: existing?.asat ?? 80,
        praktik: existing?.praktik ?? 82,
        sikap: existing?.sikap ?? 86,
        achievementDescription: existing?.achievementDescription ?? '',
        homeroomNote: existing?.homeroomNote ?? '',
      };
    });
    setRows(nextRows);
    setIsDirty(false);
  }, [activeClass, activeSubject, semester, studentsInClass, gradeRecords]);

  const kkm = activeSubject?.kkm ?? 75;

  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const finalScore = computeFinalScore(
        {
          tugas: row.tugas,
          uh: row.uh,
          asts: row.asts,
          asat: row.asat,
          praktik: row.praktik,
          sikap: row.sikap,
        },
        weights
      );
      const isPassed = finalScore >= kkm;
      const predicate: GradePredicate = computePredicate(finalScore, kkm);
      return { ...row, finalScore, isPassed, predicate };
    });
  }, [rows, weights, kkm]);

  const summaryStats = useMemo(() => {
    if (computedRows.length === 0) {
      return { avg: 0, passedCount: 0, belowKkmCount: 0 };
    }
    const sum = computedRows.reduce((acc, r) => acc + r.finalScore, 0);
    const passedCount = computedRows.filter((r) => r.isPassed).length;
    return {
      avg: Math.round(sum / computedRows.length),
      passedCount,
      belowKkmCount: computedRows.length - passedCount,
    };
  }, [computedRows]);

  const updateCell = (studentId: string, field: keyof GradeWeights, rawValue: string) => {
    const num = rawValue === '' ? 0 : clampScore(Number(rawValue));
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, [field]: num } : r))
    );
    setIsDirty(true);
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (e.key === 'ArrowRight') {
      if (colIdx < SCORE_COLUMNS.length - 1) {
        targetCol = colIdx + 1;
      } else if (rowIdx < rows.length - 1) {
        targetRow = rowIdx + 1;
        targetCol = 0;
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      if (colIdx > 0) {
        targetCol = colIdx - 1;
      } else if (rowIdx > 0) {
        targetRow = rowIdx - 1;
        targetCol = SCORE_COLUMNS.length - 1;
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      if (rowIdx < rows.length - 1) {
        targetRow = rowIdx + 1;
      } else if (colIdx < SCORE_COLUMNS.length - 1) {
        targetRow = 0;
        targetCol = colIdx + 1;
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (rowIdx > 0) {
        targetRow = rowIdx - 1;
      }
      e.preventDefault();
    } else {
      return;
    }

    const nextInput = inputRefs.current[`${targetRow}_${targetCol}`];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const handleSaveWeights = async () => {
    if (!activeClass || !activeSubject) return;
    const normalized = totalWeightPct === 100 ? weights : normalizeWeights(weights);
    setWeights(normalized);
    setSavingWeights(true);
    try {
      await saveGradeWeights({
        classId: activeClass.id,
        subjectId: activeSubject.id,
        ...normalized,
      });
      showToast(
        'Bobot nilai disimpan',
        'success',
        `Komposisi bobot ${activeSubject.name} (${activeClass.name}) telah diperbarui ke 100%.`
      );
    } catch (err) {
      showToast(
        'Gagal menyimpan bobot',
        'error',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan bobot.'
      );
    } finally {
      setSavingWeights(false);
    }
  };

  const handlePullFromTasksAndExams = () => {
    if (!activeClass || !activeSubject || rows.length === 0) return;

    let updatedCount = 0;
    const relevantExams = exams.filter(
      (ex) => ex.mapel === activeSubject.name && ex.paket === activeClass.paket
    );
    const examMap = new Map(relevantExams.map((ex) => [ex.id, ex]));

    setRows((prev) =>
      prev.map((row) => {
        // Rata-rata Tugas yang sudah dinilai untuk murid, kelas, dan mapel ini
        const gradedTasks = taskSubmissions.filter(
          (ts) =>
            ts.studentId === row.studentId &&
            ts.classId === activeClass.id &&
            ts.subjectId === activeSubject.id &&
            ts.status === 'Sudah Dinilai'
        );
        const nextTugas =
          gradedTasks.length > 0
            ? clampScore(
                gradedTasks.reduce((acc, item) => acc + Number(item.score || 0), 0) /
                  gradedTasks.length
              )
            : row.tugas;

        // Nilai ujian online yang sesuai mapel
        const studentExamSubs = examSubmissions.filter(
          (es) =>
            (es.studentNis === row.studentNis || es.studentUid === row.studentUid) &&
            examMap.has(es.examId)
        );
        let nextUh = row.uh;
        let nextAsts = row.asts;
        let nextAsat = row.asat;

        const uhSubs = studentExamSubs.filter((s) => examMap.get(s.examId)?.examType === 'UH');
        if (uhSubs.length > 0) {
          nextUh = clampScore(
            uhSubs.reduce((acc, s) => acc + Number(s.finalScore || 0), 0) / uhSubs.length
          );
        }

        const astsSubs = studentExamSubs.filter(
          (s) => examMap.get(s.examId)?.examType === 'ASTS'
        );
        if (astsSubs.length > 0) {
          nextAsts = clampScore(
            astsSubs.reduce((acc, s) => acc + Number(s.finalScore || 0), 0) / astsSubs.length
          );
        }

        const asatSubs = studentExamSubs.filter((s) => {
          const t = examMap.get(s.examId)?.examType;
          return t === 'ASAT' || t === 'PAS';
        });
        if (asatSubs.length > 0) {
          nextAsat = clampScore(
            asatSubs.reduce((acc, s) => acc + Number(s.finalScore || 0), 0) / asatSubs.length
          );
        }

        if (
          nextTugas !== row.tugas ||
          nextUh !== row.uh ||
          nextAsts !== row.asts ||
          nextAsat !== row.asat
        ) {
          updatedCount += 1;
        }

        return {
          ...row,
          tugas: nextTugas,
          uh: nextUh,
          asts: nextAsts,
          asat: nextAsat,
        };
      })
    );

    if (updatedCount > 0) {
      setIsDirty(true);
      showToast(
        'Nilai ditarik otomatis',
        'success',
        `${updatedCount} warga belajar diperbarui dari nilai Tugas & Ujian Online yang sudah dinilai.`
      );
    } else {
      showToast(
        'Belum ada nilai baru untuk ditarik',
        'info',
        'Belum ditemukan pengumpulan Tugas atau Ujian Online berstatus "Sudah Dinilai" pada mapel ini.'
      );
    }
  };

  const handleGenerateDescriptions = async (targetStudentId?: string) => {
    if (!activeClass || !activeSubject) return;
    const targets = targetStudentId
      ? computedRows.filter((r) => r.studentId === targetStudentId)
      : computedRows;

    if (targets.length === 0) {
      showToast('Tidak ada data murid', 'warning');
      return;
    }

    if (targetStudentId) {
      setGeneratingStudentId(targetStudentId);
    } else {
      setGeneratingAi(true);
    }

    try {
      const result = await postAiJson<{
        descriptions?: Array<{ studentId: string; description: string }>;
        message?: string;
      }>(
        '/api/penilaian/deskripsi-capaian',
        {
          schoolName: schoolSettings.schoolName,
          paket: activeClass.paket,
          kelas: activeClass.name,
          mapel: activeSubject.name,
          kkm,
          semester,
          academicYear: schoolSettings.academicYear,
          students: targets.map((t) => ({
            studentId: t.studentId,
            studentName: t.studentName,
            tugas: t.tugas,
            uh: t.uh,
            asts: t.asts,
            asat: t.asat,
            praktik: t.praktik,
            sikap: t.sikap,
            finalScore: t.finalScore,
            isPassed: t.isPassed,
          })),
        },
        { timeoutMs: 95_000, retries: 1 }
      );

      if (!result.ok || !result.data || !Array.isArray(result.data.descriptions)) {
        throw new Error(
          result.errorMessage || 'Gagal menyusun deskripsi capaian dengan Gemini AI.'
        );
      }

      const descriptions = result.data.descriptions;

      const descMap = new Map(
        descriptions.map((d) => [d.studentId, d.description.trim()])
      );

      setRows((prev) =>
        prev.map((row) =>
          descMap.has(row.studentId)
            ? { ...row, achievementDescription: descMap.get(row.studentId) || row.achievementDescription }
            : row
        )
      );
      setIsDirty(true);

      if (editingRow && descMap.has(editingRow.studentId)) {
        setEditingRow((prev) =>
          prev
            ? {
                ...prev,
                achievementDescription:
                  descMap.get(prev.studentId) || prev.achievementDescription,
              }
            : null
        );
      }

      showToast(
        'Deskripsi capaian disusun AI',
        'success',
        `${descriptions.length} deskripsi rapor berhasil dibuat. Anda tetap dapat menyunting teks sebelum menyimpan.`
      );
    } catch (err) {
      showToast(
        'Gagal membuat deskripsi AI',
        'error',
        err instanceof Error ? err.message : 'Layanan Gemini AI sedang tidak tersedia.'
      );
    } finally {
      setGeneratingAi(false);
      setGeneratingStudentId(null);
    }
  };

  const handleSaveAllGrades = async () => {
    if (!activeClass || !activeSubject || computedRows.length === 0) return;

    const matchingAssignment = assignments.find(
      (a) => a.classId === activeClass.id && a.subjectId === activeSubject.id
    );
    const teacherId =
      currentTeacher?.id || matchingAssignment?.teacherId || teachers[0]?.id || 'guru_01';
    const teacherName =
      currentTeacher?.fullName ||
      matchingAssignment?.teacherName ||
      profile?.name ||
      teachers[0]?.fullName ||
      'Tutor Pengampu';

    setSavingGrades(true);
    try {
      await saveGradeRecordsBatch(
        computedRows.map((row) => ({
          studentId: row.studentId,
          studentUid: row.studentUid,
          studentName: row.studentName,
          studentNis: row.studentNis,
          classId: activeClass.id,
          className: activeClass.name,
          paket: activeClass.paket,
          subjectId: activeSubject.id,
          subjectName: activeSubject.name,
          kkm,
          teacherId,
          teacherName,
          academicYear: schoolSettings.academicYear,
          semester,
          tugas: row.tugas,
          uh: row.uh,
          asts: row.asts,
          asat: row.asat,
          praktik: row.praktik,
          sikap: row.sikap,
          finalScore: row.finalScore,
          predicate: row.predicate,
          isPassed: row.isPassed,
          achievementDescription: row.achievementDescription,
          homeroomNote: row.homeroomNote,
        }))
      );
      setIsDirty(false);
      showToast(
        'Nilai berhasil disimpan',
        'success',
        `${computedRows.length} nilai ${activeSubject.name} Semester ${semester} tersimpan ke database.`
      );
    } catch (err) {
      showToast(
        'Gagal menyimpan nilai',
        'error',
        err instanceof Error ? err.message : 'Periksa izin akses atau koneksi Anda.'
      );
    } finally {
      setSavingGrades(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter & Controls Card */}
      <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Rombongan Belajar / Kelas
            </label>
            <select
              value={activeClass?.id || ''}
              onChange={(e) => onSelectClassId(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
            >
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.paket})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Mata Pelajaran (KKTP {kkm})
            </label>
            <select
              value={activeSubject?.id || ''}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
            >
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (KKTP {s.kkm})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Semester
            </label>
            <select
              value={semester}
              onChange={(e) => onChangeSemester(e.target.value as 'Ganjil' | 'Genap')}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={() => setShowWeightsPanel((v) => !v)}
              className={`w-full min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                showWeightsPanel
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0" />
              <span>Bobot Nilai</span>
            </button>
          </div>
        </div>

        {/* Summary & Actions Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold border border-emerald-200/70 dark:border-emerald-800/70">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tuntas KKTP: <strong className="tabular-nums">{summaryStats.passedCount}</strong>/{computedRows.length}
            </span>
            {summaryStats.belowKkmCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 font-semibold border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                Di Bawah KKTP ({kkm}): <strong className="tabular-nums">{summaryStats.belowKkmCount}</strong>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
              <Keyboard className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              Navigasi sel: Panah / Enter / Tab
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePullFromTasksAndExams}
              disabled={rows.length === 0}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <DownloadCloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>Tarik Nilai Tugas &amp; Ujian</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateDescriptions()}
              disabled={generatingAi || rows.length === 0}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              {generatingAi ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Wand2 className="w-4 h-4 shrink-0" />
              )}
              <span>{generatingAi ? 'Menyusun Deskripsi AI...' : 'Buat Deskripsi AI'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAllGrades}
              disabled={savingGrades || rows.length === 0}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap transition-all"
            >
              {savingGrades ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Save className="w-4 h-4 shrink-0" />
              )}
              <span>{savingGrades ? 'Menyimpan...' : isDirty ? 'Simpan Perubahan*' : 'Simpan Semua Nilai'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Weight Sliders Panel */}
      {showWeightsPanel && (
        <section className="rounded-2xl border border-emerald-700/20 dark:border-emerald-500/30 bg-white dark:bg-slate-900 p-5 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Pengaturan Bobot Penilaian ({activeSubject?.name})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Geser persentase tiap komponen penilaian. Nilai Akhir akan otomatis dihitung ulang.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {WEIGHT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setWeights(preset.weights)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {WEIGHT_COMPONENTS.map((comp) => (
              <div
                key={comp.key}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/60 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {comp.label}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-xs font-mono font-bold tabular-nums">
                    {weights[comp.key]}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={weights[comp.key]}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [comp.key]: Number(e.target.value) }))
                  }
                  aria-label={`Bobot ${comp.label}`}
                  className="w-full accent-emerald-700 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{comp.description}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  totalWeightPct === 100
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                }`}
              >
                Total Bobot: <span className="font-mono tabular-nums">{totalWeightPct}%</span>
                {totalWeightPct !== 100 && ' (Disarankan 100%)'}
              </span>
              {totalWeightPct !== 100 && (
                <button
                  type="button"
                  onClick={() => setWeights((prev) => normalizeWeights(prev))}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs font-semibold hover:bg-amber-200 transition-colors whitespace-nowrap"
                >
                  Seimbangkan ke 100%
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveWeights}
              disabled={savingWeights}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
            >
              {savingWeights ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Simpan Pengaturan Bobot</span>
            </button>
          </div>
        </section>
      )}

      {/* Spreadsheet Input Table */}
      {computedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-emerald-950/20 dark:border-white/15 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="font-display font-bold text-base text-slate-900 dark:text-white">
            Belum ada warga belajar aktif di kelas ini
          </p>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pilih rombel lain atau tambahkan murid pada menu Data Murid terlebih dahulu.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mobile & Portrait Tablet Card View */}
          <div className="md:hidden space-y-3">
            {computedRows.map((row, rowIdx) => {
              const predMeta = getPredicateMeta(row.predicate, row.isPassed);
              return (
                <article
                  key={row.studentId}
                  className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-slate-400 tabular-nums">
                        #{rowIdx + 1} · NIS {row.studentNis}
                      </p>
                      <h4 className="font-display font-bold text-base text-slate-900 dark:text-white truncate">
                        {row.studentName}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold whitespace-nowrap ${predMeta.badgeClass}`}
                      >
                        {row.predicate} · {predMeta.short}
                      </span>
                      <div
                        className={`min-w-[48px] min-h-[40px] px-2.5 rounded-xl font-display font-extrabold text-base font-mono tabular-nums border flex items-center justify-center ${
                          row.isPassed
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                        }`}
                      >
                        {row.finalScore}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {WEIGHT_COMPONENTS.map((col) => {
                      const val = row[col.key];
                      const isLow = val < kkm;
                      return (
                        <label
                          key={col.key}
                          className="block rounded-xl border border-slate-100 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/50 p-2"
                        >
                          <span className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            <span>{col.shortLabel}</span>
                            <span className="font-mono text-emerald-700 dark:text-emerald-400">
                              {weights[col.key]}%
                            </span>
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => updateCell(row.studentId, col.key, e.target.value)}
                            aria-label={`${col.label} untuk ${row.studentName}`}
                            className={`w-full min-h-[44px] px-2 text-center font-mono font-bold text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors tabular-nums ${
                              isLow
                                ? 'bg-rose-50 text-rose-800 border-rose-300 focus:ring-rose-400 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                                : 'bg-white text-slate-900 border-slate-200 focus:ring-emerald-500 focus:border-emerald-600 dark:bg-slate-900 dark:text-white dark:border-slate-700'
                            }`}
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {row.achievementDescription || (
                        <span className="italic text-slate-400">
                          Belum ada deskripsi capaian kompetensi.
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateDescriptions(row.studentId)}
                        disabled={generatingStudentId === row.studentId}
                        className="min-h-[44px] px-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                      >
                        {generatingStudentId === row.studentId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                        <span>AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRow(row)}
                        className="min-h-[44px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Sunting</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectStudentRadar(row.studentId)}
                        className="min-h-[44px] px-2 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                      >
                        <Radar className="w-3.5 h-3.5" />
                        <span>Radar</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop & Tablet Landscape Keyboard-Navigable Spreadsheet */}
          <section className="hidden md:block rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1040px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-3 w-11 text-center">No</th>
                  <th className="py-3 px-3 w-52">Warga Belajar</th>
                  {WEIGHT_COMPONENTS.map((col) => (
                    <th key={col.key} className="py-3 px-2 w-24 text-center">
                      <div>{col.shortLabel}</div>
                      <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                        ({weights[col.key]}%)
                      </div>
                    </th>
                  ))}
                  <th className="py-3 px-3 w-24 text-center">Nilai Akhir</th>
                  <th className="py-3 px-3 w-36 text-center">Status KKTP ({kkm})</th>
                  <th className="py-3 px-3 min-w-[260px]">Deskripsi Capaian &amp; Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {computedRows.map((row, rowIdx) => {
                  const predMeta = getPredicateMeta(row.predicate, row.isPassed);
                  return (
                    <tr
                      key={row.studentId}
                      className="hover:bg-emerald-50/35 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-center text-xs font-mono text-slate-500 tabular-nums">
                        {rowIdx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[195px]">
                          {row.studentName}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          NIS {row.studentNis}
                        </p>
                      </td>

                      {SCORE_COLUMNS.map((colKey, colIdx) => {
                        const val = row[colKey];
                        const isLow = val < kkm;
                        return (
                          <td key={colKey} className="py-2 px-1.5 text-center">
                            <input
                              ref={(el) => {
                                inputRefs.current[`${rowIdx}_${colIdx}`] = el;
                              }}
                              type="number"
                              min={0}
                              max={100}
                              value={val}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => updateCell(row.studentId, colKey, e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx)}
                              aria-label={`${colKey} untuk ${row.studentName}`}
                              className={`w-full min-h-[42px] px-1.5 text-center font-mono font-bold text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors tabular-nums ${
                                isLow
                                  ? 'bg-rose-50 text-rose-800 border-rose-300 focus:ring-rose-400 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                                  : 'bg-[#FAFAF7] text-slate-900 border-slate-200 focus:ring-emerald-500 focus:border-emerald-600 dark:bg-slate-800 dark:text-white dark:border-slate-700'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Nilai Akhir */}
                      <td className="py-2.5 px-3 text-center">
                        <div
                          className={`inline-flex items-center justify-center min-w-[54px] min-h-[40px] px-2.5 rounded-xl font-display font-extrabold text-base font-mono tabular-nums border ${
                            row.isPassed
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                          }`}
                        >
                          {row.finalScore}
                        </div>
                      </td>

                      {/* Predikat & Ketuntasan */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold whitespace-nowrap ${predMeta.badgeClass}`}
                        >
                          <span>{row.predicate}</span>
                          <span aria-hidden="true">·</span>
                          <span>{predMeta.short}</span>
                        </span>
                      </td>

                      {/* Deskripsi Capaian & Aksi Cepat */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 flex-1">
                            {row.achievementDescription || (
                              <span className="italic text-slate-400">
                                Belum ada deskripsi capaian — klik tombol AI atau Sunting.
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleGenerateDescriptions(row.studentId)}
                              disabled={generatingStudentId === row.studentId}
                              title="Buat deskripsi AI untuk murid ini"
                              className="min-h-[36px] min-w-[36px] px-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 text-[11px] font-bold inline-flex items-center justify-center"
                            >
                              {generatingStudentId === row.studentId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Wand2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRow(row)}
                              title="Sunting deskripsi & catatan"
                              className="min-h-[36px] min-w-[36px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onInspectStudentRadar(row.studentId)}
                              title="Lihat Grafik Radar Murid"
                              className="min-h-[36px] min-w-[36px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 inline-flex items-center justify-center"
                            >
                              <Radar className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Sel berwarna <strong className="text-rose-700 dark:text-rose-300">merah lembut</strong> menandakan nilai komponen atau Nilai Akhir berada di bawah KKTP ({kkm}).
            </span>
            <span>
              Rata-rata kelas saat ini: <strong className="font-mono text-slate-900 dark:text-white">{summaryStats.avg}</strong>
            </span>
          </div>
        </section>
        </div>
      )}

      {/* Modal Edit Deskripsi Capaian & Catatan Wali Kelas */}
      {editingRow && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setEditingRow(null)}
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  Sunting Deskripsi Rapor
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {editingRow.studentName} (NIS {editingRow.studentNis}) · {activeSubject?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Deskripsi Capaian Kompetensi ({activeSubject?.name})
                  </label>
                  <button
                    type="button"
                    onClick={() => handleGenerateDescriptions(editingRow.studentId)}
                    disabled={generatingStudentId === editingRow.studentId}
                    className="min-h-[32px] px-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    {generatingStudentId === editingRow.studentId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    <span>Buat Ulang via Gemini</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={editingRow.achievementDescription}
                  onChange={(e) =>
                    setEditingRow((prev) =>
                      prev ? { ...prev, achievementDescription: e.target.value } : null
                    )
                  }
                  placeholder="Tuliskan deskripsi capaian pembelajaran warga belajar..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Catatan Wali Kelas (Opsional, tampil di Rapor)
                </label>
                <textarea
                  rows={2}
                  value={editingRow.homeroomNote}
                  onChange={(e) =>
                    setEditingRow((prev) =>
                      prev ? { ...prev, homeroomNote: e.target.value } : null
                    )
                  }
                  placeholder="Catatan pembinaan, motivasi, atau saran untuk warga belajar..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const sid = editingRow.studentId;
                  setEditingRow(null);
                  onOpenStudentRapor(sid);
                }}
                className="min-h-[42px] px-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                Pratinjau Rapor Murid Ini
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows((prev) =>
                      prev.map((r) =>
                        r.studentId === editingRow.studentId
                          ? {
                              ...r,
                              achievementDescription: editingRow.achievementDescription,
                              homeroomNote: editingRow.homeroomNote,
                            }
                          : r
                      )
                    );
                    setIsDirty(true);
                    setEditingRow(null);
                    showToast(
                      'Deskripsi diperbarui di tabel',
                      'info',
                      'Klik "Simpan Perubahan" untuk menyimpan ke database.'
                    );
                  }}
                  className="min-h-[42px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold"
                >
                  Terapkan ke Tabel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
