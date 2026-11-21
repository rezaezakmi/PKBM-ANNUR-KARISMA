import {
  AttendanceSession,
  GradePredicate,
  GradeWeights,
  Student,
} from '../../types/siakad';

export interface WeightComponentMeta {
  key: keyof GradeWeights;
  label: string;
  shortLabel: string;
  description: string;
}

export const WEIGHT_COMPONENTS: WeightComponentMeta[] = [
  {
    key: 'tugas',
    label: 'Tugas Terstruktur',
    shortLabel: 'Tugas',
    description: 'Penilaian tugas mandiri, proyek, dan LKPD',
  },
  {
    key: 'uh',
    label: 'Ulangan Harian',
    shortLabel: 'UH',
    description: 'Asesmen formatif per lingkup materi',
  },
  {
    key: 'asts',
    label: 'Asesmen Sumatif Tengah Semester',
    shortLabel: 'ASTS',
    description: 'Evaluasi capaian pembelajaran tengah semester',
  },
  {
    key: 'asat',
    label: 'Asesmen Sumatif Akhir Tahun',
    shortLabel: 'ASAT',
    description: 'Ujian akhir semester / kenaikan paket',
  },
  {
    key: 'praktik',
    label: 'Keterampilan & Praktik',
    shortLabel: 'Praktik',
    description: 'Unjuk kerja, portofolio, dan kecakapan hidup',
  },
  {
    key: 'sikap',
    label: 'Sikap & Profil Lulusan',
    shortLabel: 'Sikap',
    description: 'Kedisiplinan, kemandirian, dan kolaborasi',
  },
];

export const WEIGHT_PRESETS: Array<{ label: string; weights: GradeWeights }> = [
  {
    label: 'Standar PKBM',
    weights: { tugas: 20, uh: 15, asts: 20, asat: 25, praktik: 10, sikap: 10 },
  },
  {
    label: 'Berbasis Proyek & Praktik',
    weights: { tugas: 25, uh: 10, asts: 15, asat: 20, praktik: 20, sikap: 10 },
  },
  {
    label: 'Fokus Asesmen Ujian',
    weights: { tugas: 15, uh: 15, asts: 25, asat: 30, praktik: 5, sikap: 10 },
  },
];

export function clampScore(val: number): number {
  if (Number.isNaN(val)) return 0;
  return Math.max(0, Math.min(100, Math.round(val)));
}

export function computeTotalWeight(weights: GradeWeights): number {
  return (
    Number(weights.tugas || 0) +
    Number(weights.uh || 0) +
    Number(weights.asts || 0) +
    Number(weights.asat || 0) +
    Number(weights.praktik || 0) +
    Number(weights.sikap || 0)
  );
}

/**
 * Menormalkan bobot agar jumlah tepatnya 100 (integer) tanpa mengubah proporsi antar komponen.
 */
export function normalizeWeights(weights: GradeWeights): GradeWeights {
  const keys: Array<keyof GradeWeights> = ['tugas', 'uh', 'asts', 'asat', 'praktik', 'sikap'];
  const total = computeTotalWeight(weights);
  if (total <= 0) {
    return { tugas: 20, uh: 15, asts: 20, asat: 25, praktik: 10, sikap: 10 };
  }
  const raw = keys.map((k) => (Number(weights[k] || 0) / total) * 100);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = 100 - floored.reduce((acc, v) => acc + v, 0);

  const remaindersIdx = raw
    .map((v, idx) => ({ idx, frac: v - floored[idx] }))
    .sort((a, b) => b.frac - a.frac);

  let ptr = 0;
  while (remainder > 0 && ptr < remaindersIdx.length) {
    floored[remaindersIdx[ptr].idx] += 1;
    remainder -= 1;
    ptr += 1;
  }

  return {
    tugas: floored[0],
    uh: floored[1],
    asts: floored[2],
    asat: floored[3],
    praktik: floored[4],
    sikap: floored[5],
  };
}

export function computeFinalScore(scores: GradeWeights, weights: GradeWeights): number {
  const totalW = computeTotalWeight(weights);
  if (totalW <= 0) return 0;
  const weightedSum =
    Number(scores.tugas || 0) * Number(weights.tugas || 0) +
    Number(scores.uh || 0) * Number(weights.uh || 0) +
    Number(scores.asts || 0) * Number(weights.asts || 0) +
    Number(scores.asat || 0) * Number(weights.asat || 0) +
    Number(scores.praktik || 0) * Number(weights.praktik || 0) +
    Number(scores.sikap || 0) * Number(weights.sikap || 0);
  return clampScore(weightedSum / totalW);
}

export function computePredicate(finalScore: number, kkm: number): GradePredicate {
  if (finalScore >= 90) return 'A';
  if (finalScore >= 80) return 'B';
  if (finalScore >= kkm) return 'C';
  return 'D';
}

export function getPredicateMeta(predicate: GradePredicate, isPassed: boolean) {
  if (!isPassed || predicate === 'D') {
    return {
      label: 'Perlu Pendampingan',
      short: 'Belum Tuntas',
      badgeClass:
        'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
    };
  }
  switch (predicate) {
    case 'A':
      return {
        label: 'Sangat Baik',
        short: 'Tuntas',
        badgeClass:
          'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
      };
    case 'B':
      return {
        label: 'Baik',
        short: 'Tuntas',
        badgeClass:
          'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800',
      };
    default:
      return {
        label: 'Cukup Baik',
        short: 'Tuntas',
        badgeClass:
          'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
      };
  }
}

export function shortenSubjectName(name: string): string {
  const map: Record<string, string> = {
    'Bahasa Indonesia & Karya Ilmiah': 'B. Indonesia',
    'Matematika Wajib & Terapan': 'Matematika',
    'Ekonomi & Akuntansi': 'Ekonomi',
    'Kewirausahaan & Manajemen UMKM': 'Kewirausahaan',
    'Desain Grafis & Literasi Digital': 'Lit. Digital',
    'Bahasa Indonesia Dasar': 'B. Indonesia',
    'Matematika Dasar': 'Matematika',
    'Pendidikan Pancasila': 'PPKn',
    'Ilmu Pengetahuan Alam': 'IPA',
    'Matematika Terapan': 'Matematika',
  };
  if (map[name]) return map[name];
  if (name.length <= 15) return name;
  return `${name.slice(0, 14).trim()}…`;
}

export interface StudentAttendanceRecap {
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
  pct: number;
}

export function computeStudentAttendanceSummary(
  student: Student | null | undefined,
  sessions: AttendanceSession[],
  semester?: 'Ganjil' | 'Genap'
): StudentAttendanceRecap {
  if (!student) {
    return { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0, pct: 100 };
  }
  let hadir = 0;
  let sakit = 0;
  let izin = 0;
  let alpa = 0;

  sessions.forEach((sess) => {
    if (semester && sess.semester !== semester) return;
    const rec = sess.records.find(
      (r) => r.studentId === student.id || r.studentNis === student.nis
    );
    if (!rec) return;
    if (rec.status === 'Hadir') hadir += 1;
    else if (rec.status === 'Sakit') sakit += 1;
    else if (rec.status === 'Izin') izin += 1;
    else if (rec.status === 'Alpa') alpa += 1;
  });

  const total = hadir + sakit + izin + alpa;
  const pct = total > 0 ? Math.round((hadir / total) * 100) : 100;
  return { hadir, sakit, izin, alpa, total, pct };
}
