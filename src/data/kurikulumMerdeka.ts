import {
  Classroom,
  PaketType,
  Subject,
  Teacher,
  TeachingAssignment,
} from '../types/siakad';

export type SubjectGroupKey =
  | 'bahasa_indonesia'
  | 'matematika'
  | 'bahasa_inggris'
  | 'ipa'
  | 'ipas'
  | 'ips'
  | 'ekonomi'
  | 'informatika_tik'
  | 'pai'
  | 'pancasila'
  | 'pjok'
  | 'seni_budaya'
  | 'sejarah'
  | 'sosiologi'
  | 'geografi'
  | 'p5_kwu'
  | 'pramuka'
  | 'menjahit';

export interface SubjectGroupDefinition {
  key: SubjectGroupKey;
  label: string;
  specializationLabel: string;
  keywords: string[];
  subjectIdByPaket: Partial<Record<PaketType, string>>;
}

export interface CanonicalPkbmTeacher {
  id: string;
  nip: string;
  fullName: string;
  gender: 'L' | 'P';
  email: string;
  phone: string;
  specialization: string;
  education: string;
  ownerUid: string;
  matchTokens: string[];
  subjectIdsByPaket: Record<PaketType, string[]>;
}

/**
 * Daftar lengkap Mata Pelajaran Kurikulum Merdeka Pendidikan Kesetaraan PKBM Annur Karisma
 * (Program Paket A Setara SD/MI, Paket B Setara SMP/MTs, Paket C Setara SMA/MA)
 * mencakup Mata Pelajaran Wajib, Pemberdayaan (P5 & Pramuka), serta Keterampilan (TIK, KWU, Menjahit).
 * ID lama mp_01 s.d. mp_10 dipertahankan agar seluruh data tugas, ujian, dan nilai eksisting tetap konsisten.
 */
export const KURIKULUM_MERDEKA_SUBJECTS: Omit<Subject, 'createdBy'>[] = [
  // ===================== PAKET A (SETARA SD / MI — FASE A, B, C) =====================
  { id: 'mp_pa_pai', code: 'PA-PAI', name: 'Pendidikan Agama Islam dan Budi Pekerti (PAI)', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 3, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_pkn', code: 'PA-PKN', name: 'Pendidikan Pancasila (PPKn)', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 3, kkm: 70, status: 'Aktif' },
  { id: 'mp_01', code: 'PA-BIN', name: 'Bahasa Indonesia', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 4, kkm: 70, status: 'Aktif' },
  { id: 'mp_02', code: 'PA-MTK', name: 'Matematika', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 4, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_ipas', code: 'PA-IPAS', name: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 4, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_big', code: 'PA-BIG', name: 'Bahasa Inggris', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_pjok', code: 'PA-PJOK', name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_seni', code: 'PA-SENI', name: 'Seni Budaya dan Prakarya (SBdP)', paket: 'Paket A', category: 'Wajib', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_pbd', code: 'PA-KWU', name: 'Kewirausahaan (KWU) & Pemberdayaan (P5)', paket: 'Paket A', category: 'Pemberdayaan', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_prm', code: 'PA-PRM', name: 'Pendidikan Kepramukaan (Pramuka)', paket: 'Paket A', category: 'Pemberdayaan', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_ktr', code: 'PA-TIK', name: 'Informatika (TIK) & Literasi Digital Dasar', paket: 'Paket A', category: 'Keterampilan', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },
  { id: 'mp_pa_jht', code: 'PA-JHT', name: 'Keterampilan Menjahit', paket: 'Paket A', category: 'Keterampilan', hoursPerWeek: 2, kkm: 70, status: 'Aktif' },

  // ===================== PAKET B (SETARA SMP / MTs — FASE D) =====================
  { id: 'mp_pb_pai', code: 'PB-PAI', name: 'Pendidikan Agama Islam dan Budi Pekerti (PAI)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 3, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_pkn', code: 'PB-PKN', name: 'Pendidikan Pancasila (PPKn)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 3, kkm: 72, status: 'Aktif' },
  { id: 'mp_03', code: 'PB-BIN', name: 'Bahasa Indonesia', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 4, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_mtk', code: 'PB-MTK', name: 'Matematika', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 4, kkm: 72, status: 'Aktif' },
  { id: 'mp_05', code: 'PB-IPA', name: 'Ilmu Pengetahuan Alam (IPA)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 4, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_ips', code: 'PB-IPS', name: 'Ilmu Pengetahuan Sosial (IPS)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 3, kkm: 72, status: 'Aktif' },
  { id: 'mp_04', code: 'PB-BIG', name: 'Bahasa Inggris', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 3, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_inf', code: 'PB-TIK', name: 'Informatika (TIK)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_pjok', code: 'PB-PJOK', name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_seni', code: 'PB-SENI', name: 'Seni Budaya dan Prakarya (SBdP)', paket: 'Paket B', category: 'Wajib', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_pbd', code: 'PB-EKO', name: 'Ekonomi Dasar & Pemberdayaan (P5)', paket: 'Paket B', category: 'Pemberdayaan', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_prm', code: 'PB-PRM', name: 'Pendidikan Kepramukaan (Pramuka)', paket: 'Paket B', category: 'Pemberdayaan', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_ktr', code: 'PB-KWU', name: 'Kewirausahaan (KWU) & Vokasi Dasar', paket: 'Paket B', category: 'Keterampilan', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },
  { id: 'mp_pb_jht', code: 'PB-JHT', name: 'Keterampilan Menjahit', paket: 'Paket B', category: 'Keterampilan', hoursPerWeek: 2, kkm: 72, status: 'Aktif' },

  // ===================== PAKET C (SETARA SMA / MA — FASE E & F) =====================
  { id: 'mp_pc_pai', code: 'PC-PAI', name: 'Pendidikan Agama Islam dan Budi Pekerti (PAI)', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 3, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_pkn', code: 'PC-PKN', name: 'Pendidikan Pancasila (PPKn)', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
  { id: 'mp_06', code: 'PC-BIN', name: 'Bahasa Indonesia', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 4, kkm: 75, status: 'Aktif' },
  { id: 'mp_07', code: 'PC-MTK', name: 'Matematika', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 4, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_big', code: 'PC-BIG', name: 'Bahasa Inggris', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 3, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_ipa', code: 'PC-IPA', name: 'Ilmu Pengetahuan Alam (IPA)', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 4, kkm: 75, status: 'Aktif' },
  { id: 'mp_08', code: 'PC-EKO', name: 'Ekonomi', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 3, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_sej', code: 'PC-SEJ', name: 'Sejarah', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_sos', code: 'PC-SOS', name: 'Sosiologi', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 3, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_geo', code: 'PC-GEO', name: 'Geografi', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 3, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_pjok', code: 'PC-PJOK', name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_seni', code: 'PC-SENI', name: 'Seni Budaya dan Prakarya (SBdP)', paket: 'Paket C', category: 'Wajib', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
  { id: 'mp_09', code: 'PC-KWU', name: 'Kewirausahaan (KWU) & Pemberdayaan (P5)', paket: 'Paket C', category: 'Pemberdayaan', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_prm', code: 'PC-PRM', name: 'Pendidikan Kepramukaan (Pramuka)', paket: 'Paket C', category: 'Pemberdayaan', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
  { id: 'mp_10', code: 'PC-TIK', name: 'Informatika (TIK) & Keterampilan Digital', paket: 'Paket C', category: 'Keterampilan', hoursPerWeek: 3, kkm: 75, status: 'Aktif' },
  { id: 'mp_pc_jht', code: 'PC-JHT', name: 'Keterampilan Menjahit', paket: 'Paket C', category: 'Keterampilan', hoursPerWeek: 2, kkm: 75, status: 'Aktif' },
];

/**
 * Daftar Resmi 7 Guru / Tutor PKBM Annur Karisma beserta pembagian mata pelajaran
 * yang sudah dibakukan ejaannya (EYD V & Kurikulum Merdeka Kesetaraan).
 */
export const CANONICAL_PKBM_TEACHERS: CanonicalPkbmTeacher[] = [
  {
    id: 'guru_01',
    nip: 'TUTOR-PKBM-001',
    fullName: 'Ahmad Reza Pahlevi',
    gender: 'L',
    email: 'ahmad.reza@pkbm-annurkarisma.sch.id',
    phone: '0812-3456-7801',
    specialization: 'Geografi, Informatika (TIK), Sosiologi',
    education: 'S1 Pendidikan / Tutor Kesetaraan',
    ownerUid: 'demo_guru_01',
    matchTokens: ['ahmad reza', 'reza pahlevi', 'pahlevi'],
    subjectIdsByPaket: {
      'Paket A': ['mp_pa_ktr'],
      'Paket B': ['mp_pb_inf'],
      'Paket C': ['mp_pc_geo', 'mp_10', 'mp_pc_sos'],
    },
  },
  {
    id: 'guru_02',
    nip: 'TUTOR-PKBM-002',
    fullName: 'Siti Wulansari, S.S.',
    gender: 'P',
    email: 'siti.wulansari@pkbm-annurkarisma.sch.id',
    phone: '0812-3456-7802',
    specialization: 'Bahasa Inggris',
    education: 'S1 Sastra Inggris (S.S.)',
    ownerUid: 'demo_guru_02',
    matchTokens: ['siti wulansari', 'wulansari'],
    subjectIdsByPaket: {
      'Paket A': ['mp_pa_big'],
      'Paket B': ['mp_04'],
      'Paket C': ['mp_pc_big'],
    },
  },
  {
    id: 'guru_03',
    nip: 'TUTOR-PKBM-003',
    fullName: 'Reny Febriyani, S.Sos.',
    gender: 'P',
    email: 'reny.febriyani@pkbm-annurkarisma.sch.id',
    phone: '0813-4567-8903',
    specialization: 'Bahasa Indonesia, Pendidikan Pancasila (PPKn)',
    education: 'S1 Ilmu Sosial (S.Sos.)',
    ownerUid: 'demo_guru_03',
    matchTokens: ['reny febriyani', 'reni febriyani', 'febriyani'],
    subjectIdsByPaket: {
      'Paket A': ['mp_01', 'mp_pa_pkn'],
      'Paket B': ['mp_03', 'mp_pb_pkn'],
      'Paket C': ['mp_06', 'mp_pc_pkn'],
    },
  },
  {
    id: 'guru_04',
    nip: 'TUTOR-PKBM-004',
    fullName: 'Ema Siti Samsiah',
    gender: 'P',
    email: 'ema.samsiah@pkbm-annurkarisma.sch.id',
    phone: '0856-7890-1204',
    specialization: 'Pendidikan Agama Islam (PAI), Kewirausahaan (KWU)',
    education: 'S1 Pendidikan Agama Islam',
    ownerUid: 'demo_guru_04',
    matchTokens: ['ema siti', 'samsiah', 'syamsiah', 'ema samsiah', 'ema syamsiah'],
    subjectIdsByPaket: {
      'Paket A': ['mp_pa_pai', 'mp_pa_pbd'],
      'Paket B': ['mp_pb_pai', 'mp_pb_ktr'],
      'Paket C': ['mp_pc_pai', 'mp_09'],
    },
  },
  {
    id: 'guru_05',
    nip: 'TUTOR-PKBM-005',
    fullName: 'Suherman',
    gender: 'L',
    email: 'suherman@pkbm-annurkarisma.sch.id',
    phone: '0819-0123-4505',
    specialization: 'Ilmu Pengetahuan Sosial (IPS), Sejarah, Pramuka',
    education: 'S1 Pendidikan / Pembina Pramuka',
    ownerUid: 'demo_guru_05',
    matchTokens: ['suherman'],
    subjectIdsByPaket: {
      'Paket A': ['mp_pa_prm'],
      'Paket B': ['mp_pb_ips', 'mp_pb_prm'],
      'Paket C': ['mp_pc_sej', 'mp_pc_prm'],
    },
  },
  {
    id: 'guru_06',
    nip: 'TUTOR-PKBM-006',
    fullName: 'Didah Dahlia, S.Pd.',
    gender: 'P',
    email: 'didah.dahlia@pkbm-annurkarisma.sch.id',
    phone: '0817-2345-6706',
    specialization: 'IPA, Seni Budaya (SBdP), Matematika, PJOK, Menjahit',
    education: 'S1 Pendidikan (S.Pd.)',
    ownerUid: 'demo_guru_06',
    matchTokens: ['didah dahlia', 'didah', 'dahlia'],
    subjectIdsByPaket: {
      'Paket A': ['mp_02', 'mp_pa_seni', 'mp_pa_pjok', 'mp_pa_jht'],
      'Paket B': ['mp_05', 'mp_pb_seni', 'mp_pb_mtk', 'mp_pb_pjok', 'mp_pb_jht'],
      'Paket C': ['mp_pc_ipa', 'mp_pc_seni', 'mp_07', 'mp_pc_pjok', 'mp_pc_jht'],
    },
  },
  {
    id: 'guru_07',
    nip: 'TUTOR-PKBM-007',
    fullName: 'Siti Khodijah AS',
    gender: 'P',
    email: 'siti.khodijah@pkbm-annurkarisma.sch.id',
    phone: '0812-8899-1107',
    specialization: 'Ilmu Pengetahuan Alam dan Sosial (IPAS), Ekonomi',
    education: 'S1 Pendidikan / Tutor Kesetaraan',
    ownerUid: 'demo_guru_07',
    matchTokens: ['siti khodijah', 'khodijah'],
    subjectIdsByPaket: {
      'Paket A': ['mp_pa_ipas'],
      'Paket B': ['mp_pb_pbd'],
      'Paket C': ['mp_08'],
    },
  },
];

export const LEGACY_DUMMY_TEACHER_NAMES = new Set<string>([
  'siti aminah, s.pd.',
  'siti aminah',
  'hendra wijaya, m.pd.',
  'hendra wijaya',
  'nurul hidayah, s.pd.',
  'nurul hidayah',
  'fajar ramadhan, s.e.',
  'fajar ramadhan',
  'dewi lestari, s.si.',
  'dewi lestari',
  'asep kurniawan, s.kom.',
  'asep kurniawan',
  'h. ridwan hakim, s.ag.',
  'ridwan hakim',
  'rina marlina, s.pd.',
  'rina marlina',
  'dedi supriadi, s.pd.',
  'dedi supriadi',
  'lia kartika, s.sn.',
  'lia kartika',
]);

export function normalizeTeacherLookupName(raw?: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLegacyDummyTeacherName(fullName?: string): boolean {
  const cleanLower = String(fullName || '').trim().toLowerCase();
  const normalized = normalizeTeacherLookupName(fullName);
  return LEGACY_DUMMY_TEACHER_NAMES.has(cleanLower) || LEGACY_DUMMY_TEACHER_NAMES.has(normalized);
}

export function findCanonicalTeacherByName(fullName?: string): CanonicalPkbmTeacher | null {
  const norm = normalizeTeacherLookupName(fullName);
  if (!norm) return null;
  for (const ct of CANONICAL_PKBM_TEACHERS) {
    if (normalizeTeacherLookupName(ct.fullName) === norm) {
      return ct;
    }
    if (ct.matchTokens.some((tok) => norm.includes(tok))) {
      return ct;
    }
  }
  return null;
}

/**
 * Rumpun Mata Pelajaran Kurikulum Merdeka yang memetakan kata kunci spesialisasi
 * ke mata pelajaran resmi di jenjang Paket A, Paket B, dan Paket C.
 */
export const SUBJECT_GROUP_DEFINITIONS: SubjectGroupDefinition[] = [
  {
    key: 'bahasa_indonesia',
    label: 'Bahasa Indonesia',
    specializationLabel: 'Bahasa Indonesia',
    keywords: ['bahasa indonesia', 'indonesia', 'literasi', 'karya ilmiah', '-bin'],
    subjectIdByPaket: { 'Paket A': 'mp_01', 'Paket B': 'mp_03', 'Paket C': 'mp_06' },
  },
  {
    key: 'matematika',
    label: 'Matematika',
    specializationLabel: 'Matematika',
    keywords: ['matematika', 'mtk', 'numerasi', '-mtk'],
    subjectIdByPaket: { 'Paket A': 'mp_02', 'Paket B': 'mp_pb_mtk', 'Paket C': 'mp_07' },
  },
  {
    key: 'bahasa_inggris',
    label: 'Bahasa Inggris',
    specializationLabel: 'Bahasa Inggris',
    keywords: ['bahasa inggris', 'inggris', 'english', '-big'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_big', 'Paket B': 'mp_04', 'Paket C': 'mp_pc_big' },
  },
  {
    key: 'ipas',
    label: 'IPAS',
    specializationLabel: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
    keywords: ['ipas', 'alam dan sosial', '-ipas'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_ipas' },
  },
  {
    key: 'ipa',
    label: 'IPA',
    specializationLabel: 'Ilmu Pengetahuan Alam (IPA)',
    keywords: ['ilmu pengetahuan alam', 'biologi', 'fisika', 'kimia', '-ipa', 'ipa'],
    subjectIdByPaket: { 'Paket B': 'mp_05', 'Paket C': 'mp_pc_ipa' },
  },
  {
    key: 'ips',
    label: 'IPS',
    specializationLabel: 'Ilmu Pengetahuan Sosial (IPS)',
    keywords: ['ilmu pengetahuan sosial', 'ips', '-ips'],
    subjectIdByPaket: { 'Paket B': 'mp_pb_ips' },
  },
  {
    key: 'ekonomi',
    label: 'Ekonomi',
    specializationLabel: 'Ekonomi',
    keywords: ['ekonomi', 'akuntansi', '-eko'],
    subjectIdByPaket: { 'Paket B': 'mp_pb_pbd', 'Paket C': 'mp_08' },
  },
  {
    key: 'informatika_tik',
    label: 'Informatika (TIK)',
    specializationLabel: 'Informatika (TIK)',
    keywords: ['informatika', 'tik', 'komputer', 'digital', '-inf', '-tik'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_ktr', 'Paket B': 'mp_pb_inf', 'Paket C': 'mp_10' },
  },
  {
    key: 'pai',
    label: 'Pendidikan Agama Islam (PAI)',
    specializationLabel: 'Pendidikan Agama Islam (PAI)',
    keywords: ['agama', 'pai', 'budi pekerti', 'islami', '-pai'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_pai', 'Paket B': 'mp_pb_pai', 'Paket C': 'mp_pc_pai' },
  },
  {
    key: 'pancasila',
    label: 'Pendidikan Pancasila (PPKn)',
    specializationLabel: 'Pendidikan Pancasila (PPKn)',
    keywords: ['pancasila', 'ppkn', 'pkn', 'kewarganegaraan', '-pkn'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_pkn', 'Paket B': 'mp_pb_pkn', 'Paket C': 'mp_pc_pkn' },
  },
  {
    key: 'pjok',
    label: 'PJOK',
    specializationLabel: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    keywords: ['pjok', 'jasmani', 'olahraga', 'penjas', '-pjok'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_pjok', 'Paket B': 'mp_pb_pjok', 'Paket C': 'mp_pc_pjok' },
  },
  {
    key: 'seni_budaya',
    label: 'Seni Budaya (SBdP)',
    specializationLabel: 'Seni Budaya dan Prakarya (SBdP)',
    keywords: ['seni', 'sbdp', 'sbd', 'prakarya', 'budaya', '-seni'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_seni', 'Paket B': 'mp_pb_seni', 'Paket C': 'mp_pc_seni' },
  },
  {
    key: 'sejarah',
    label: 'Sejarah',
    specializationLabel: 'Sejarah',
    keywords: ['sejarah', '-sej'],
    subjectIdByPaket: { 'Paket C': 'mp_pc_sej' },
  },
  {
    key: 'sosiologi',
    label: 'Sosiologi',
    specializationLabel: 'Sosiologi',
    keywords: ['sosiologi', '-sos'],
    subjectIdByPaket: { 'Paket C': 'mp_pc_sos' },
  },
  {
    key: 'geografi',
    label: 'Geografi',
    specializationLabel: 'Geografi',
    keywords: ['geografi', '-geo'],
    subjectIdByPaket: { 'Paket C': 'mp_pc_geo' },
  },
  {
    key: 'p5_kwu',
    label: 'Kewirausahaan (KWU)',
    specializationLabel: 'Kewirausahaan (KWU) & Pemberdayaan',
    keywords: ['kewirausahaan', 'kwu', 'pemberdayaan', 'p5', 'umkm', 'vokasi', '-kwu', '-pbd'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_pbd', 'Paket B': 'mp_pb_ktr', 'Paket C': 'mp_09' },
  },
  {
    key: 'pramuka',
    label: 'Pramuka',
    specializationLabel: 'Pendidikan Kepramukaan (Pramuka)',
    keywords: ['pramuka', 'kepramukaan', '-prm'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_prm', 'Paket B': 'mp_pb_prm', 'Paket C': 'mp_pc_prm' },
  },
  {
    key: 'menjahit',
    label: 'Keterampilan Menjahit',
    specializationLabel: 'Keterampilan Menjahit',
    keywords: ['menjahit', 'jahit', 'tata busana', '-jht'],
    subjectIdByPaket: { 'Paket A': 'mp_pa_jht', 'Paket B': 'mp_pb_jht', 'Paket C': 'mp_pc_jht' },
  },
];

export const SCHEDULE_SLOTS: Array<{ day: 'Sabtu' | 'Minggu'; time: string }> = [
  { day: 'Sabtu', time: '08:00 - 09:00' },
  { day: 'Sabtu', time: '09:00 - 10:00' },
  { day: 'Sabtu', time: '10:15 - 11:15' },
  { day: 'Sabtu', time: '11:15 - 12:15' },
  { day: 'Sabtu', time: '13:00 - 14:00' },
  { day: 'Sabtu', time: '14:00 - 15:00' },
  { day: 'Minggu', time: '08:00 - 09:00' },
  { day: 'Minggu', time: '09:00 - 10:00' },
  { day: 'Minggu', time: '10:15 - 11:15' },
  { day: 'Minggu', time: '11:15 - 12:15' },
  { day: 'Minggu', time: '13:00 - 14:00' },
  { day: 'Minggu', time: '14:00 - 15:00' },
];

function containsKeywordWord(normText: string, kw: string): boolean {
  if (kw.startsWith('-')) return normText.includes(kw);
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i');
  return re.test(normText);
}

/**
 * Mendeteksi SEMUA rumpun mata pelajaran yang tertulis di spesialisasi seorang guru
 * (mendukung guru yang mengampu beberapa mata pelajaran sekaligus, misalnya "Geografi, TIK, Sosiologi").
 */
export function detectSubjectGroupsFromText(text: string): SubjectGroupKey[] {
  const norm = String(text || '').trim().toLowerCase();
  if (!norm) return [];
  const found: SubjectGroupKey[] = [];
  for (const def of SUBJECT_GROUP_DEFINITIONS) {
    if (def.keywords.some((kw) => containsKeywordWord(norm, kw))) {
      found.push(def.key);
    }
  }
  return found;
}

export function detectSubjectGroupFromText(text: string): SubjectGroupKey | null {
  const list = detectSubjectGroupsFromText(text);
  return list[0] || null;
}

export function detectSubjectGroupFromSubject(
  sub: Pick<Subject, 'id' | 'code' | 'name'>
): SubjectGroupKey | null {
  for (const def of SUBJECT_GROUP_DEFINITIONS) {
    if (Object.values(def.subjectIdByPaket).includes(sub.id)) {
      return def.key;
    }
  }
  return detectSubjectGroupFromText(`${sub.code} ${sub.name}`);
}

export function getSubjectGroupDefinition(key: SubjectGroupKey): SubjectGroupDefinition {
  return (
    SUBJECT_GROUP_DEFINITIONS.find((d) => d.key === key) || SUBJECT_GROUP_DEFINITIONS[0]
  );
}

/**
 * Mencari mata pelajaran yang sesuai dengan rumpun tertentu pada jenjang Paket A / B / C.
 */
export function findSubjectForGroupInPaket(
  groupKey: SubjectGroupKey,
  paket: PaketType,
  allSubjects: Subject[]
): Subject | null {
  const def = getSubjectGroupDefinition(groupKey);
  const preferredId = def.subjectIdByPaket[paket];
  if (!preferredId) return null;

  const byId = allSubjects.find((s) => s.id === preferredId && s.status === 'Aktif');
  if (byId) return byId;

  const activeInPaket = allSubjects.filter((s) => s.paket === paket && s.status === 'Aktif');
  const byKeyword = activeInPaket.find((s) =>
    def.keywords.some((kw) => containsKeywordWord(`${s.code} ${s.name}`.toLowerCase(), kw))
  );
  if (byKeyword) return byKeyword;

  const byAnyId = allSubjects.find((s) => s.id === preferredId);
  if (byAnyId) return byAnyId;

  return null;
}

/**
 * Menentukan daftar mata pelajaran yang tepat untuk seorang guru pada Paket A / B / C
 * (memprioritaskan pemetaan resmi 7 Guru PKBM Annur Karisma, lalu deteksi multi-mapel dari specialization).
 */
export function resolveSubjectsForTeacherInPaket(
  teacher: Pick<Teacher, 'id' | 'fullName' | 'specialization'>,
  paket: PaketType,
  allSubjects: Subject[],
  fallbackGroupKey?: SubjectGroupKey
): Subject[] {
  const canonical = findCanonicalTeacherByName(teacher.fullName);
  if (canonical) {
    const ids = canonical.subjectIdsByPaket[paket] || [];
    const matched = ids
      .map((id) => allSubjects.find((s) => s.id === id))
      .filter((s): s is Subject => Boolean(s));
    if (matched.length > 0) return matched;
  }

  const detectedGroups = detectSubjectGroupsFromText(teacher.specialization);
  if (detectedGroups.length > 0) {
    const matched = detectedGroups
      .map((g) => findSubjectForGroupInPaket(g, paket, allSubjects))
      .filter((s): s is Subject => Boolean(s));
    const unique = Array.from(new Map(matched.map((s) => [s.id, s])).values());
    if (unique.length > 0) return unique;
  }

  if (fallbackGroupKey) {
    const fb = findSubjectForGroupInPaket(fallbackGroupKey, paket, allSubjects);
    if (fb) return [fb];
  }

  return [];
}

/**
 * Memetakan guru non-kanonik ke rumpun mata pelajaran Kurikulum Merdeka yang berbeda sebagai fallback.
 */
export function assignDistinctSubjectGroupsToTeachers(
  teachers: Array<Pick<Teacher, 'id' | 'fullName' | 'specialization' | 'status'>>
): Map<string, SubjectGroupKey> {
  const result = new Map<string, SubjectGroupKey>();
  const usedGroups = new Set<SubjectGroupKey>();
  const activeTeachers = teachers.filter((t) => t.status === 'Aktif');

  const unmatched: typeof activeTeachers = [];
  for (const t of activeTeachers) {
    const detected = detectSubjectGroupFromText(t.specialization);
    if (detected && !usedGroups.has(detected)) {
      result.set(t.id, detected);
      usedGroups.add(detected);
    } else {
      unmatched.push(t);
    }
  }

  const allKeys = SUBJECT_GROUP_DEFINITIONS.map((d) => d.key);
  let fallbackCursor = 0;
  for (const t of unmatched) {
    const nextFree = allKeys.find((k) => !usedGroups.has(k));
    if (nextFree) {
      result.set(t.id, nextFree);
      usedGroups.add(nextFree);
    } else {
      const cycled = allKeys[fallbackCursor % allKeys.length];
      result.set(t.id, cycled);
      fallbackCursor += 1;
    }
  }

  return result;
}

/**
 * Menyusun daftar penugasan sehingga setiap guru aktif mengajar seluruh mata pelajaran ampuhannya
 * di seluruh Paket (Paket A, B, C) dan seluruh Rombel / Kelas aktif.
 */
export function buildAssignmentsForAllClasses(
  teachers: Array<Pick<Teacher, 'id' | 'fullName' | 'ownerUid' | 'specialization' | 'status'>>,
  classes: Array<Pick<Classroom, 'id' | 'name' | 'paket' | 'status'>>,
  subjects: Array<Pick<Subject, 'id' | 'code' | 'name' | 'paket' | 'status'>>,
  academicYear = '2026/2027',
  semester: 'Ganjil' | 'Genap' = 'Ganjil'
): Omit<TeachingAssignment, 'createdBy' | 'accessUids'>[] {
  const activeTeachers = teachers.filter((t) => t.status === 'Aktif');
  const activeClasses = classes.filter((c) => c.status === 'Aktif');
  const subjectList = subjects as Subject[];
  const fallbackGroupByTeacher = assignDistinctSubjectGroupsToTeachers(activeTeachers);

  const generated: Omit<TeachingAssignment, 'createdBy' | 'accessUids'>[] = [];
  let seq = 1;

  activeTeachers.forEach((teacher, teacherIdx) => {
    const fallbackGroup = fallbackGroupByTeacher.get(teacher.id);

    activeClasses.forEach((cls, classIdx) => {
      const matchedSubs = resolveSubjectsForTeacherInPaket(
        teacher,
        cls.paket,
        subjectList,
        fallbackGroup
      );

      matchedSubs.forEach((matchedSub, subIdx) => {
        const slot = SCHEDULE_SLOTS[(teacherIdx + classIdx + subIdx) % SCHEDULE_SLOTS.length];
        generated.push({
          id: `tgs_${String(seq).padStart(3, '0')}`,
          teacherId: teacher.id,
          teacherName: teacher.fullName,
          teacherUid: teacher.ownerUid,
          subjectId: matchedSub.id,
          subjectName: matchedSub.name,
          classId: cls.id,
          className: cls.name,
          paket: cls.paket,
          academicYear,
          semester,
          scheduleDay: slot.day,
          scheduleTime: slot.time,
          status: 'Aktif',
        });
        seq += 1;
      });
    });
  });

  return generated;
}

/**
 * Menentukan daftar mata pelajaran yang relevan untuk seorang guru pada Paket/Kelas tertentu:
 * mengutamakan mata pelajaran khusus yang diampu guru tersebut di semua rombel.
 */
export function getTeacherSubjectsForClassOrPaket(
  teacher: Teacher | null,
  paket: PaketType,
  classId: string | undefined,
  allSubjects: Subject[],
  teacherAssignments: TeachingAssignment[]
): Subject[] {
  const activeInPaket = allSubjects.filter((s) => s.status === 'Aktif' && s.paket === paket);
  const pool = activeInPaket.length > 0 ? activeInPaket : allSubjects.filter((s) => s.status === 'Aktif');

  if (!teacher) return pool;

  // 1. Cek penugasan langsung di kelas tersebut
  if (classId) {
    const classSubIds = new Set(
      teacherAssignments.filter((a) => a.classId === classId).map((a) => a.subjectId)
    );
    const exactClassSubs = pool.filter((s) => classSubIds.has(s.id));
    if (exactClassSubs.length > 0) return exactClassSubs;
  }

  // 2. Cek penugasan guru pada Paket yang sama
  const paketSubIds = new Set(
    teacherAssignments.filter((a) => a.paket === paket).map((a) => a.subjectId)
  );
  const paketAssignedSubs = pool.filter((s) => paketSubIds.has(s.id));
  if (paketAssignedSubs.length > 0) return paketAssignedSubs;

  // 3. Cek pemetaan resmi / spesialisasi multi-mapel guru pada paket tersebut
  const resolvedFromProfile = resolveSubjectsForTeacherInPaket(teacher, paket, allSubjects);
  if (resolvedFromProfile.length > 0) return resolvedFromProfile;

  // 4. Fallback dari rumpun mapel pada penugasan paket lain
  const detectedGroups = new Set<SubjectGroupKey>();
  teacherAssignments.forEach((a) => {
    const subObj = allSubjects.find((s) => s.id === a.subjectId);
    const g = subObj
      ? detectSubjectGroupFromSubject(subObj)
      : detectSubjectGroupFromText(a.subjectName);
    if (g) detectedGroups.add(g);
  });

  if (detectedGroups.size > 0) {
    const matched = Array.from(detectedGroups)
      .map((g) => findSubjectForGroupInPaket(g, paket, allSubjects))
      .filter((s): s is Subject => Boolean(s));
    const uniqueMatched = Array.from(new Map(matched.map((s) => [s.id, s])).values());
    if (uniqueMatched.length > 0) return uniqueMatched;
  }

  return pool;
}
