export type UserRole = 'admin' | 'kepala_pkbm' | 'guru' | 'murid';

export type PaketType = 'Paket A' | 'Paket B' | 'Paket C';

export type PageRoute =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'subjects'
  | 'classes'
  | 'assignments'
  | 'online-classes'
  | 'attendance'
  | 'tasks'
  | 'grades'
  | 'generator'
  | 'exam-generator'
  | 'online-exams'
  | 'accounts'
  | 'school-settings'
  | 'documents';

export interface UserProfile {
  uid: string;
  docId?: string;
  username: string;
  internalEmail: string;
  email?: string;
  name: string;
  role: UserRole;
  status: 'Aktif' | 'Nonaktif';
  authVersion?: number;
  nis?: string;
  nip?: string;
  linkedEntityId?: string;
  classLabel?: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SessionIssuedCredential {
  uid: string;
  name: string;
  username: string;
  password: string;
  role: UserRole;
  classLabel?: string;
  issuedAt: string;
}

export interface SchoolSettings {
  schoolName: string;
  npsn: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  slogan?: string;
  headmasterName: string;
  headmasterNip?: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  logoUrl?: string;
  letterheadUrl?: string;
  headmasterSignatureUrl?: string;
  teacherSignatureUrl?: string;
  stampUrl?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Student {
  id: string;
  nis: string;
  nisn?: string;
  fullName: string;
  gender: 'L' | 'P';
  paket: PaketType;
  classId: string;
  className: string;
  email?: string;
  phone?: string;
  address?: string;
  guardianName?: string;
  status: 'Aktif' | 'Cuti' | 'Lulus' | 'Nonaktif';
  ownerUid: string;
  accessUids: string[];
  createdBy: string;
}

export interface Teacher {
  id: string;
  nip: string;
  fullName: string;
  gender: 'L' | 'P';
  email?: string;
  phone?: string;
  specialization: string;
  education?: string;
  status: 'Aktif' | 'Cuti' | 'Nonaktif';
  ownerUid: string;
  accessUids: string[];
  createdBy: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  paket: PaketType;
  category: 'Wajib' | 'Pemberdayaan' | 'Keterampilan';
  hoursPerWeek: number;
  kkm: number;
  status: 'Aktif' | 'Arsip';
  createdBy: string;
}

export interface Classroom {
  id: string;
  name: string;
  paket: PaketType;
  gradeLevel: string;
  homeroomTeacherId?: string;
  homeroomTeacherName: string;
  academicYear: string;
  capacity: number;
  studentCount: number;
  status: 'Aktif' | 'Arsip';
  createdBy: string;
}

export interface TeachingAssignment {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherUid: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  paket: PaketType;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  scheduleDay: string;
  scheduleTime: string;
  status: 'Aktif' | 'Selesai';
  accessUids: string[];
  createdBy: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'Akademik' | 'Ujian' | 'Administrasi' | 'Kegiatan';
  targetRole: 'Semua' | 'Guru' | 'Murid';
  authorName: string;
  authorId: string;
  isPinned: boolean;
  publishedAt: string;
}

export interface AttendanceMonthlyPoint {
  month: string;
  paketA: number;
  paketB: number;
  paketC: number;
  rataRata: number;
}

export type TeachingDocType =
  | 'CP'
  | 'TP_ATP'
  | 'KKTP'
  | 'PROTA'
  | 'PROSEM'
  | 'KALDIK'
  | 'MODUL_AJAR';

export interface TeachingDocument {
  id: string;
  docType: TeachingDocType;
  title: string;
  paket: PaketType;
  fase: string;
  kelas: string;
  mapel: string;
  materi: string;
  jumlahPertemuan: number;
  alokasiWaktu: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  contentHtml: string;
  authorName: string;
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export type ExamType = 'ASTS' | 'ASAT' | 'PAS' | 'UH';

export type CognitiveLevel = 'LOTS' | 'MOTS' | 'HOTS';

export type QuestionShape =
  | 'PG'
  | 'PG_KOMPLEKS'
  | 'BENAR_SALAH'
  | 'MENJODOHKAN'
  | 'ISIAN'
  | 'URAIAN';

export interface MatchingPair {
  left: string;
  right: string;
}

export interface ExamQuestion {
  id: string;
  type: QuestionShape;
  level: CognitiveLevel;
  competency: string;
  indicator: string;
  materi: string;
  prompt: string;
  options?: string[];
  correctOptionIndex?: number;
  correctOptionIndices?: number[];
  correctBoolean?: boolean;
  matchingPairs?: MatchingPair[];
  shortAnswers?: string[];
  essayAnswerKey?: string;
  scoringRubric: string;
  maxScore: number;
  explanation?: string;
}

export interface QuestionBankItem {
  id: string;
  mapel: string;
  paket: PaketType;
  materi: string;
  questionType: QuestionShape;
  cognitiveLevel: CognitiveLevel;
  question: ExamQuestion;
  visibility: 'Sekolah' | 'Pribadi';
  authorName: string;
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export type ExamPaketVariant = 'A' | 'B' | 'C';

export interface ExamPackage {
  id: string;
  title: string;
  examType: ExamType;
  paket: PaketType;
  kelas: string;
  mapel: string;
  materi: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  durationMinutes: number;
  hasPaketB: boolean;
  paketBOrder?: string[];
  paketBOptionMaps?: Record<string, number[]>;
  paketCOrder?: string[];
  paketCOptionMaps?: Record<string, number[]>;
  isOnlinePublished: boolean;
  questions: ExamQuestion[];
  authorName: string;
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudentQuestionAnswer {
  selectedIndex?: number;
  selectedIndices?: number[];
  booleanValue?: boolean;
  matchingMap?: Record<number, string>;
  textValue?: string;
}

export interface EssayGradeEntry {
  score: number;
  feedback: string;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  paketVariant: ExamPaketVariant;
  studentUid: string;
  studentName: string;
  studentNis: string;
  paket: PaketType;
  className: string;
  answers: Record<string, StudentQuestionAnswer>;
  essayGrades: Record<string, EssayGradeEntry>;
  autoScore: number;
  essayScore: number;
  maxScore: number;
  finalScore: number;
  status: 'Menunggu Nilai Uraian' | 'Selesai Dinilai';
  accessUids: string[];
  submittedAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit' | 'Alpa';

export interface AttendanceStudentRecord {
  studentId: string;
  studentNis: string;
  studentName: string;
  status: AttendanceStatus;
  note?: string;
}

export interface AttendanceSession {
  id: string;
  date: string;
  monthKey: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  paket: PaketType;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  records: AttendanceStudentRecord[];
  summaryHadir: number;
  summaryIzin: number;
  summarySakit: number;
  summaryAlpa: number;
  studentUids: string[];
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface TeacherTask {
  id: string;
  title: string;
  description: string;
  paket: PaketType;
  classId: string;
  className: string;
  deliveryMode?: 'regular' | 'online';
  onlineClassId?: string;
  onlineClassTitle?: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  teacherUid: string;
  dueAt: string;
  maxScore: number;
  attachments: TaskAttachment[];
  targetStudentUids: string[];
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export type TaskSubmissionStatus = 'Terkumpul' | 'Terlambat' | 'Revisi' | 'Sudah Dinilai';

export interface TaskSubmission {
  id: string;
  taskId: string;
  taskTitle: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  studentId: string;
  studentUid: string;
  studentName: string;
  studentNis: string;
  answerText: string;
  attachments: TaskAttachment[];
  status: TaskSubmissionStatus;
  isLate: boolean;
  score: number;
  feedback: string;
  gradedBy: string;
  gradedAt: string;
  accessUids: string[];
  submittedAt: string;
  updatedAt: string;
}

export interface GradeWeights {
  tugas: number;
  uh: number;
  asts: number;
  asat: number;
  praktik: number;
  sikap: number;
}

export interface GradeWeightConfig extends GradeWeights {
  id: string;
  classId: string;
  subjectId: string;
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export type GradePredicate = 'A' | 'B' | 'C' | 'D';

export interface GradeRecord {
  id: string;
  studentId: string;
  studentUid: string;
  studentName: string;
  studentNis: string;
  classId: string;
  className: string;
  paket: PaketType;
  subjectId: string;
  subjectName: string;
  kkm: number;
  teacherId: string;
  teacherName: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  tugas: number;
  uh: number;
  asts: number;
  asat: number;
  praktik: number;
  sikap: number;
  finalScore: number;
  predicate: GradePredicate;
  isPassed: boolean;
  achievementDescription: string;
  homeroomNote: string;
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export type OnlineClassModality = 'Live Interaktif' | 'Tutorial Daring' | 'Belajar Mandiri';
export type OnlineMeetingPlatform = 'Google Meet' | 'Zoom Meeting' | 'YouTube Live' | 'Ruang Belajar Mandiri';
export type OnlineClassStatus = 'Terjadwal' | 'Live' | 'Selesai';
export type OnlineMaterialType = 'Ringkasan Materi' | 'Video Pembelajaran' | 'Slide / PDF' | 'LKPD / Latihan';

export interface OnlineClassMaterial {
  id: string;
  title: string;
  type: OnlineMaterialType;
  durationMinutes: number;
  summary: string;
  contentText: string;
  resourceUrl?: string;
}

export interface OnlineClassSession {
  id: string;
  title: string;
  paket: PaketType;
  fase: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  teacherUid: string;
  modality: OnlineClassModality;
  platform: OnlineMeetingPlatform;
  meetingUrl: string;
  meetingCode: string;
  recordingUrl: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: OnlineClassStatus;
  description: string;
  learningObjectives: string[];
  materials: OnlineClassMaterial[];
  isPublished: boolean;
  ownerUid: string;
  accessUids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OnlineClassProgress {
  id: string;
  sessionId: string;
  paket: PaketType;
  classId: string;
  studentId: string;
  studentUid: string;
  studentName: string;
  studentNis: string;
  joinedLive: boolean;
  joinedAt: string;
  completedMaterialIds: string[];
  progressPercent: number;
  personalNote: string;
  updatedAt: string;
}

export interface OnlineClassComment {
  id: string;
  sessionId: string;
  paket: PaketType;
  authorUid: string;
  authorName: string;
  authorRole: UserRole;
  message: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GallerySlotId = 'slot_1' | 'slot_2' | 'slot_3' | 'slot_4' | 'slot_5';

export interface ActivityGalleryPhoto {
  id: GallerySlotId;
  slotIndex: 1 | 2 | 3 | 4 | 5;
  title: string;
  caption: string;
  paketLabel: string;
  imageUrl: string;
  isCustom?: boolean;
  updatedBy?: string;
  updatedAt?: string;
}



