import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { DEFAULT_PKBM_LOGO, isLegacyDummyLogo, resolveSchoolLogo } from '../assets/branding';
import { db, handleFirestoreError, normalizeUsername, OperationType, storage } from '../lib/firebase';
import { loadStoredCredentials, saveStoredCredentials } from '../utils/credentialStore';
import {
  extractGradeHint,
  formatStudentAccountClassLabel,
  getStudentsForClassroom,
  ImportStudentsBatchFailure,
  ImportStudentsBatchResult,
  resolveStudentPlacement,
  sortClassesByJenjang,
  stripPaketPrefixFromClassName,
} from '../utils/excelUtils';
import {
  CIPANAS_CLASSES,
  CIPANAS_STUDENTS,
  LEGACY_CLASS_ID_TO_CIPANAS,
  LEGACY_DEMO_STUDENT_IDS,
  LEGACY_PLACEHOLDER_CLASS_IDS,
  LEGACY_PLACEHOLDER_CLASS_NAMES,
} from '../data/cipanasMasterData';
import {
  CANONICAL_PKBM_TEACHERS,
  KURIKULUM_MERDEKA_SUBJECTS,
  SCHEDULE_SLOTS,
  assignDistinctSubjectGroupsToTeachers,
  detectSubjectGroupFromText,
  findCanonicalTeacherByName,
  getSubjectGroupDefinition,
  isLegacyDummyTeacherName,
  resolveSubjectsForTeacherInPaket,
} from '../data/kurikulumMerdeka';
import {
  DEFAULT_SCHOOL_SETTINGS,
  DEFAULT_STAMP_SVG,
  DEFAULT_TEACHER_SIG_SVG,
  SEED_ANNOUNCEMENTS,
  SEED_ASSIGNMENTS,
  SEED_ATTENDANCE_SESSIONS,
  SEED_CLASSES,
  SEED_EXAMS,
  SEED_EXAM_SUBMISSIONS,
  SEED_GRADE_RECORDS,
  SEED_GRADE_WEIGHTS,
  SEED_ONLINE_CLASSES,
  SEED_ONLINE_CLASS_COMMENTS,
  SEED_ONLINE_CLASS_PROGRESS,
  SEED_QUESTION_BANK,
  SEED_STUDENTS,
  SEED_SUBJECTS,
  SEED_TASKS,
  SEED_TASK_SUBMISSIONS,
  SEED_TEACHERS,
  SEED_TEACHING_DOCUMENTS,
} from '../data/seedData';
import {
  ActivityGalleryPhoto,
  Announcement,
  AttendanceSession,
  Classroom,
  EssayGradeEntry,
  ExamPackage,
  ExamQuestion,
  ExamSubmission,
  GallerySlotId,
  GradeRecord,
  GradeWeightConfig,
  OnlineClassComment,
  OnlineClassProgress,
  OnlineClassSession,
  OnlineClassStatus,
  PaketType,
  QuestionBankItem,
  SchoolSettings,
  SessionIssuedCredential,
  Student,
  Subject,
  TaskAttachment,
  TaskSubmission,
  Teacher,
  TeacherTask,
  TeachingAssignment,
  TeachingDocument,
  UserProfile,
} from '../types/siakad';
import {
  DEFAULT_ACTIVITY_GALLERY_PHOTOS,
  mergeGalleryPhotosWithDefaults,
  readCachedPublicGalleryPhotos,
  writeCachedPublicGalleryPhotos,
} from '../data/activityGalleryDefaults';
import { useAuth } from './AuthContext';

const LOCAL_DATA_KEY = 'siakad_pkbm_local_cache_v1';
const GLOBAL_PROGRAM_KEY = 'siakad_global_program_filter_v1';

function readInitialGlobalProgram(): 'Semua' | PaketType {
  try {
    const saved = localStorage.getItem(GLOBAL_PROGRAM_KEY);
    if (saved === 'Paket A' || saved === 'Paket B' || saved === 'Paket C' || saved === 'Semua') {
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'Semua';
}

interface LocalCachePayload {
  schoolSettings: SchoolSettings;
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  classes: Classroom[];
  assignments: TeachingAssignment[];
  announcements: Announcement[];
  teachingDocuments?: TeachingDocument[];
  questionBank?: QuestionBankItem[];
  exams?: ExamPackage[];
  examSubmissions?: ExamSubmission[];
  attendanceSessions?: AttendanceSession[];
  tasks?: TeacherTask[];
  taskSubmissions?: TaskSubmission[];
  gradeWeights?: GradeWeightConfig[];
  gradeRecords?: GradeRecord[];
  onlineClasses?: OnlineClassSession[];
  onlineClassProgress?: OnlineClassProgress[];
  onlineClassComments?: OnlineClassComment[];
}

function buildSeedState(ownerUid = 'demo_admin_01'): LocalCachePayload {
  return {
    schoolSettings: DEFAULT_SCHOOL_SETTINGS,
    classes: SEED_CLASSES.map((c) => ({ ...c, createdBy: ownerUid })),
    teachers: SEED_TEACHERS.map((t) => ({ ...t, accessUids: [ownerUid], createdBy: ownerUid })),
    subjects: SEED_SUBJECTS.map((s) => ({ ...s, createdBy: ownerUid })),
    students: SEED_STUDENTS.map((s) => ({ ...s, accessUids: [ownerUid], createdBy: ownerUid })),
    assignments: SEED_ASSIGNMENTS.map((a) => ({ ...a, accessUids: [ownerUid], createdBy: ownerUid })),
    announcements: SEED_ANNOUNCEMENTS,
    teachingDocuments: SEED_TEACHING_DOCUMENTS.map((d) => ({ ...d, accessUids: [ownerUid] })),
    questionBank: SEED_QUESTION_BANK.map((q) => ({ ...q, accessUids: [ownerUid] })),
    exams: SEED_EXAMS.map((e) => ({ ...e, accessUids: [ownerUid] })),
    examSubmissions: SEED_EXAM_SUBMISSIONS.map((sub) => ({ ...sub, accessUids: [ownerUid] })),
    attendanceSessions: SEED_ATTENDANCE_SESSIONS.map((att) => ({ ...att, accessUids: [ownerUid] })),
    tasks: SEED_TASKS.map((t) => ({ ...t, accessUids: [ownerUid, t.teacherUid] })),
    taskSubmissions: SEED_TASK_SUBMISSIONS.map((ts) => ({ ...ts, accessUids: [ownerUid] })),
    gradeWeights: SEED_GRADE_WEIGHTS.map((gw) => ({ ...gw, accessUids: [ownerUid, gw.ownerUid] })),
    gradeRecords: SEED_GRADE_RECORDS.map((gr) => ({ ...gr, accessUids: [ownerUid, gr.ownerUid] })),
    onlineClasses: SEED_ONLINE_CLASSES.map((oc) => ({ ...oc, accessUids: [ownerUid, oc.teacherUid] })),
    onlineClassProgress: SEED_ONLINE_CLASS_PROGRESS,
    onlineClassComments: SEED_ONLINE_CLASS_COMMENTS,
  };
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface DataContextValue {
  schoolSettings: SchoolSettings;
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  classes: Classroom[];
  assignments: TeachingAssignment[];
  announcements: Announcement[];
  teachingDocuments: TeachingDocument[];
  questionBank: QuestionBankItem[];
  exams: ExamPackage[];
  examSubmissions: ExamSubmission[];
  attendanceSessions: AttendanceSession[];
  tasks: TeacherTask[];
  taskSubmissions: TaskSubmission[];
  gradeWeights: GradeWeightConfig[];
  gradeRecords: GradeRecord[];
  onlineClasses: OnlineClassSession[];
  onlineClassProgress: OnlineClassProgress[];
  onlineClassComments: OnlineClassComment[];
  accounts: UserProfile[];
  issuedCredentialsMap: Record<string, SessionIssuedCredential>;
  loading: boolean;
  selectedProgram: 'Semua' | PaketType;
  setSelectedProgram: (program: 'Semua' | PaketType) => void;
  updateSchoolSettings: (next: SchoolSettings) => Promise<void>;
  uploadSchoolAsset: (file: File, key: string) => Promise<string>;
  uploadTaskFile: (
    file: File,
    folder: string,
    onProgress?: (pct: number) => void
  ) => Promise<TaskAttachment>;
  saveStudent: (item: Omit<Student, 'id' | 'createdBy' | 'accessUids' | 'ownerUid'> & { id?: string; ownerUid?: string }) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  importStudentsBatch: (
    rows: Array<Partial<Student> & { rowNumber?: number }>,
    onProgress?: (done: number, total: number) => void
  ) => Promise<ImportStudentsBatchResult>;
  bulkAssignStudentsClass: (
    studentIds: string[],
    targetClass: Classroom
  ) => Promise<{ updatedCount: number; syncedAccountsCount: number }>;
  syncStudentAccountClassLabels: () => Promise<number>;
  syncClassroomsAndStudents: () => Promise<{
    fixedStudents: number;
    updatedClasses: number;
    syncedAccounts: number;
  }>;
  applyCanonicalCipanasSpreadsheetData: () => Promise<{
    totalClasses: number;
    totalStudents: number;
    createdStudents: number;
    updatedStudents: number;
    removedLegacyStudents: number;
    removedLegacyClasses: number;
    syncedAccounts: number;
  }>;
  saveTeacher: (item: Omit<Teacher, 'id' | 'createdBy' | 'accessUids' | 'ownerUid'> & { id?: string; ownerUid?: string }) => Promise<Teacher>;
  deleteTeacher: (id: string) => Promise<void>;
  saveSubject: (item: Omit<Subject, 'id' | 'createdBy'> & { id?: string }) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;
  syncKurikulumMerdekaSubjects: () => Promise<{
    addedCount: number;
    updatedCount: number;
    totalCount: number;
  }>;
  saveClassroom: (item: Omit<Classroom, 'id' | 'createdBy'> & { id?: string }) => Promise<void>;
  deleteClassroom: (id: string) => Promise<void>;
  saveAssignment: (item: Omit<TeachingAssignment, 'id' | 'createdBy' | 'accessUids'> & { id?: string }) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  autoDistributeTeachersAllClasses: () => Promise<{
    teacherCount: number;
    classCount: number;
    createdCount: number;
    updatedCount: number;
    removedDuplicateCount: number;
  }>;
  addAnnouncement: (item: Omit<Announcement, 'id' | 'authorName' | 'authorId' | 'publishedAt'>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  saveTeachingDocument: (
    item: Omit<TeachingDocument, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<TeachingDocument>;
  deleteTeachingDocument: (id: string) => Promise<void>;
  saveQuestionBankItem: (
    item: Omit<QuestionBankItem, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<QuestionBankItem>;
  deleteQuestionBankItem: (id: string) => Promise<void>;
  saveExamPackage: (
    item: Omit<ExamPackage, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<ExamPackage>;
  deleteExamPackage: (id: string) => Promise<void>;
  submitStudentExam: (
    item: Omit<ExamSubmission, 'id' | 'studentUid' | 'submittedAt' | 'updatedAt'>
  ) => Promise<ExamSubmission>;
  gradeExamSubmission: (
    submissionId: string,
    essayGrades: Record<string, EssayGradeEntry>,
    autoScore: number,
    maxScore: number
  ) => Promise<void>;
  saveAttendanceSession: (
    item: Omit<
      AttendanceSession,
      | 'id'
      | 'monthKey'
      | 'summaryHadir'
      | 'summaryIzin'
      | 'summarySakit'
      | 'summaryAlpa'
      | 'ownerUid'
      | 'accessUids'
      | 'createdAt'
      | 'updatedAt'
    > & { id?: string }
  ) => Promise<AttendanceSession>;
  deleteAttendanceSession: (id: string) => Promise<void>;
  saveTask: (
    item: Omit<TeacherTask, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'> & { id?: string },
    options?: { announce?: boolean }
  ) => Promise<TeacherTask>;
  deleteTask: (id: string) => Promise<void>;
  submitStudentTask: (
    item: Omit<
      TaskSubmission,
      | 'id'
      | 'studentUid'
      | 'status'
      | 'isLate'
      | 'score'
      | 'feedback'
      | 'gradedBy'
      | 'gradedAt'
      | 'submittedAt'
      | 'updatedAt'
    >,
    dueAt: string
  ) => Promise<TaskSubmission>;
  reviewTaskSubmission: (
    submissionId: string,
    payload: {
      status: 'Sudah Dinilai' | 'Revisi';
      score: number;
      feedback: string;
      gradedBy: string;
    }
  ) => Promise<void>;
  saveGradeWeights: (
    item: Omit<GradeWeightConfig, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<GradeWeightConfig>;
  saveGradeRecordsBatch: (
    records: Array<Omit<GradeRecord, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'>>
  ) => Promise<GradeRecord[]>;
  saveOnlineClass: (
    item: Omit<OnlineClassSession, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<OnlineClassSession>;
  updateOnlineClassStatus: (sessionId: string, status: OnlineClassStatus) => Promise<void>;
  deleteOnlineClass: (sessionId: string) => Promise<void>;
  saveOnlineClassProgress: (
    session: OnlineClassSession,
    patch: {
      joinedLive?: boolean;
      completedMaterialIds?: string[];
      personalNote?: string;
      studentId?: string;
      studentName?: string;
      studentNis?: string;
    }
  ) => Promise<OnlineClassProgress>;
  addOnlineClassComment: (
    session: OnlineClassSession,
    message: string,
    isPinned?: boolean
  ) => Promise<OnlineClassComment>;
  togglePinOnlineClassComment: (commentId: string, nextPinned: boolean) => Promise<void>;
  deleteOnlineClassComment: (commentId: string) => Promise<void>;
  activityGalleryPhotos: ActivityGalleryPhoto[];
  saveActivityGalleryPhoto: (
    slotId: GallerySlotId,
    payload: {
      title: string;
      caption: string;
      paketLabel: string;
      imageUrl: string;
    }
  ) => Promise<void>;
  resetActivityGalleryPhoto: (slotId: GallerySlotId) => Promise<void>;
  updateUserProfileAvatar: (uid: string, avatarUrl: string) => Promise<void>;
  resetDemoData: () => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function compressImageToDataUrl(
  file: File,
  maxDim = 640,
  maxBytes = 135000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (file.type === 'image/svg+xml' && result.length <= maxBytes) {
        resolve(result);
        return;
      }
      if (result.length <= maxBytes && (file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/jpeg')) {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const supportsWebp = (() => {
          try {
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 2;
            testCanvas.height = 2;
            return testCanvas.toDataURL('image/webp').startsWith('data:image/webp');
          } catch {
            return false;
          }
        })();

        const isAlphaCapable =
          file.type === 'image/png' ||
          file.type === 'image/webp' ||
          file.type === 'image/svg+xml' ||
          file.type === 'image/gif';

        const encodeCanvas = (targetMaxDim: number, mime: string, quality: number): string => {
          const naturalMax = Math.max(img.width || 1, img.height || 1);
          const scale = Math.min(1, targetMaxDim / naturalMax);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((img.width || targetMaxDim) * scale));
          canvas.height = Math.max(1, Math.round((img.height || targetMaxDim) * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return result;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL(mime, quality);
        };

        // 1. If PNG/alpha-capable fits natively or at targetMaxDim as PNG, try lossless PNG first
        if (file.type === 'image/png') {
          const pngAttempt = encodeCanvas(maxDim, 'image/png', 1);
          if (pngAttempt.length <= maxBytes) {
            resolve(pngAttempt);
            return;
          }
        }

        // 2. Use WebP (preserves full alpha transparency at 5-8x smaller size) or JPEG fallback
        const preferredMime = supportsWebp
          ? 'image/webp'
          : isAlphaCapable
            ? 'image/png'
            : 'image/jpeg';

        let currentDim = maxDim;
        const qualities = preferredMime === 'image/png' ? [1] : [0.88, 0.76, 0.64, 0.5];
        let bestOutput = '';

        for (let step = 0; step < 4; step++) {
          for (const q of qualities) {
            const candidate = encodeCanvas(currentDim, preferredMime, q);
            bestOutput = candidate;
            if (candidate.length <= maxBytes) {
              resolve(candidate);
              return;
            }
          }
          currentDim = Math.max(160, Math.round(currentDim * 0.72));
        }

        // Last resort JPEG if alpha PNG still exceeded size on browsers without WebP
        if (preferredMime === 'image/png') {
          const jpgFallback = encodeCanvas(420, 'image/jpeg', 0.74);
          if (jpgFallback.length <= maxBytes) {
            resolve(jpgFallback);
            return;
          }
        }

        resolve(bestOutput || result);
      };
      img.onerror = () => {
        if (result.length <= maxBytes) {
          resolve(result);
        } else {
          reject(new Error('Format gambar tidak dapat diproses atau ukurannya terlalu besar.'));
        }
      };
      img.src = result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

function applyBrandingSideEffects(branding: {
  logoUrl?: string;
  schoolName?: string;
  slogan?: string;
}) {
  const effectiveLogo = resolveSchoolLogo(branding.logoUrl);
  try {
    localStorage.setItem(
      'siakad_public_branding_v1',
      JSON.stringify({
        logoUrl: effectiveLogo,
        schoolName: branding.schoolName || 'PKBM ANNUR KARISMA',
        slogan: branding.slogan || '',
      })
    );
  } catch {
    // Ignore storage quota errors
  }

  try {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = effectiveLogo;
  } catch {
    // Ignore DOM favicon update error
  }
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authMode, firebaseUser, profile, isBootstrappedAdmin } = useAuth();
  const initialSeed = buildSeedState();

  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>(initialSeed.schoolSettings);
  const [students, setStudents] = useState<Student[]>(initialSeed.students);
  const [teachers, setTeachers] = useState<Teacher[]>(initialSeed.teachers);
  const [subjects, setSubjects] = useState<Subject[]>(initialSeed.subjects);
  const [classes, setClasses] = useState<Classroom[]>(initialSeed.classes);
  const [assignments, setAssignments] = useState<TeachingAssignment[]>(initialSeed.assignments);
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialSeed.announcements);
  const [teachingDocuments, setTeachingDocuments] = useState<TeachingDocument[]>(
    initialSeed.teachingDocuments || []
  );
  const [questionBank, setQuestionBank] = useState<QuestionBankItem[]>(
    initialSeed.questionBank || []
  );
  const [exams, setExams] = useState<ExamPackage[]>(initialSeed.exams || []);
  const [examSubmissions, setExamSubmissions] = useState<ExamSubmission[]>(
    initialSeed.examSubmissions || []
  );
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>(
    initialSeed.attendanceSessions || []
  );
  const [tasks, setTasks] = useState<TeacherTask[]>(initialSeed.tasks || []);
  const [taskSubmissions, setTaskSubmissions] = useState<TaskSubmission[]>(
    initialSeed.taskSubmissions || []
  );
  const [gradeWeights, setGradeWeights] = useState<GradeWeightConfig[]>(
    initialSeed.gradeWeights || []
  );
  const [gradeRecords, setGradeRecords] = useState<GradeRecord[]>(
    initialSeed.gradeRecords || []
  );
  const [onlineClasses, setOnlineClasses] = useState<OnlineClassSession[]>(
    initialSeed.onlineClasses || []
  );
  const [onlineClassProgress, setOnlineClassProgress] = useState<OnlineClassProgress[]>(
    initialSeed.onlineClassProgress || []
  );
  const [onlineClassComments, setOnlineClassComments] = useState<OnlineClassComment[]>(
    initialSeed.onlineClassComments || []
  );
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [activityGalleryPhotos, setActivityGalleryPhotos] = useState<ActivityGalleryPhoto[]>(
    readCachedPublicGalleryPhotos
  );
  const [issuedCredentialsMap, setIssuedCredentialsMap] = useState<
    Record<string, SessionIssuedCredential>
  >(() => loadStoredCredentials());
  const [loading, setLoading] = useState(true);
  const [rawSelectedProgram, setRawSelectedProgram] = useState<'Semua' | PaketType>(
    readInitialGlobalProgram
  );
  const seededRef = useRef(false);
  const seededOnlineClassesRef = useRef(false);
  const autoReconciledCipanasRef = useRef(false);
  const autoReconciledTeachersRef = useRef(false);
  const storageUnavailableRef = useRef(false);

  // Hitung jumlah murid aktual per kelas/rombel secara real-time dan urutkan rapi per jenjang (Paket A -> B -> C)
  const hydratedClasses = useMemo<Classroom[]>(() => {
    const mapped = classes.map((cls) => {
      const liveCount = getStudentsForClassroom(cls, students, classes).length;
      return {
        ...cls,
        studentCount: liveCount,
      };
    });
    return sortClassesByJenjang(mapped);
  }, [classes, students]);

  const selectedProgram: 'Semua' | PaketType =
    profile?.role === 'murid' ? 'Semua' : rawSelectedProgram;

  const setSelectedProgram = useCallback((program: 'Semua' | PaketType) => {
    setRawSelectedProgram(program);
    try {
      localStorage.setItem(GLOBAL_PROGRAM_KEY, program);
    } catch {
      // Ignore storage quota issues
    }
  }, []);

  // Persist local demo state
  const persistDemoCache = useCallback((patch: Partial<LocalCachePayload>) => {
    try {
      const currentRaw = localStorage.getItem(LOCAL_DATA_KEY);
      const current: LocalCachePayload = currentRaw ? JSON.parse(currentRaw) : buildSeedState();
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify({ ...current, ...patch }));
    } catch {
      // Ignore storage quota issues
    }
  }, []);

  // Auto-seed Firestore when an Admin signs in via Firebase for the first time
  const seedFirestoreIfEmpty = useCallback(async (uid: string, authorName: string) => {
    if (seededRef.current) return;
    seededRef.current = true;
    try {
      const seedIfMissing = async (
        colName: string,
        docId: string,
        payload: Record<string, unknown>
      ) => {
        const ref = doc(db, colName, docId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, payload);
        }
      };

      const ensureOnlineClassesSeeded = async () => {
        if (seededOnlineClassesRef.current) return;
        seededOnlineClassesRef.current = true;
        try {
          const existingCheck = await getDocs(query(collection(db, 'online_classes'), limit(1)));
          if (!existingCheck.empty) return;

          const [classesSnap, subjectsSnap] = await Promise.all([
            getDocs(query(collection(db, 'classes'), where('status', 'in', ['Aktif', 'Arsip']))),
            getDocs(query(collection(db, 'subjects'), where('status', 'in', ['Aktif', 'Arsip']))),
          ]);
          const existingClasses = classesSnap.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name || ''),
            paket: String(d.data().paket || 'Paket C'),
          }));
          const existingSubjects = subjectsSnap.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name || ''),
            paket: String(d.data().paket || 'Paket C'),
          }));

          const seededIds = new Set<string>();
          for (const oc of SEED_ONLINE_CLASSES) {
            const matchedClass =
              existingClasses.find((c) => c.id === oc.classId) ||
              existingClasses.find((c) => c.paket === oc.paket) ||
              existingClasses[0];
            const matchedSubject =
              existingSubjects.find((s) => s.id === oc.subjectId) ||
              existingSubjects.find((s) => s.paket === oc.paket) ||
              existingSubjects[0];
            if (!matchedClass || !matchedSubject) continue;

            await seedIfMissing('online_classes', oc.id, {
              title: oc.title,
              paket: oc.paket,
              fase: oc.fase,
              classId: matchedClass.id,
              className: matchedClass.name || oc.className,
              subjectId: matchedSubject.id,
              subjectName: matchedSubject.name || oc.subjectName,
              teacherId: oc.teacherId,
              teacherName: oc.teacherName,
              teacherUid: oc.teacherUid,
              modality: oc.modality,
              platform: oc.platform,
              meetingUrl: oc.meetingUrl,
              meetingCode: oc.meetingCode,
              recordingUrl: oc.recordingUrl,
              scheduleDate: oc.scheduleDate,
              startTime: oc.startTime,
              endTime: oc.endTime,
              durationMinutes: oc.durationMinutes,
              status: oc.status,
              description: oc.description,
              learningObjectives: oc.learningObjectives,
              materials: oc.materials,
              isPublished: oc.isPublished,
              ownerUid: uid,
              accessUids: Array.from(new Set([uid, oc.teacherUid])),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            seededIds.add(oc.id);
          }

          for (const cmt of SEED_ONLINE_CLASS_COMMENTS) {
            if (!seededIds.has(cmt.sessionId)) continue;
            await seedIfMissing('online_class_comments', cmt.id, {
              sessionId: cmt.sessionId,
              paket: cmt.paket,
              authorUid: cmt.authorUid,
              authorName: cmt.authorName,
              authorRole: cmt.authorRole,
              message: cmt.message,
              isPinned: cmt.isPinned,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn('Lewati auto-seed kelas online awal:', err);
        }
      };

      const ensureKurikulumMerdekaSeeded = async () => {
        try {
          const existingSnap = await getDocs(
            query(collection(db, 'subjects'), where('status', 'in', ['Aktif', 'Arsip']))
          );
          const existingById = new Set(existingSnap.docs.map((d) => d.id));
          const existingByCode = new Set(
            existingSnap.docs.map((d) => String(d.data()?.code || '').trim().toUpperCase()).filter(Boolean)
          );
          const existingByPaketName = new Set(
            existingSnap.docs.map(
              (d) =>
                `${String(d.data()?.paket || '').trim()}|${String(d.data()?.name || '').trim().toLowerCase()}`
            )
          );
          const missing = KURIKULUM_MERDEKA_SUBJECTS.filter(
            (s) =>
              !existingById.has(s.id) &&
              !existingByCode.has(s.code.trim().toUpperCase()) &&
              !existingByPaketName.has(`${s.paket}|${s.name.trim().toLowerCase()}`)
          );
          if (missing.length === 0) return;

          for (const s of missing) {
            await seedIfMissing('subjects', s.id, {
              code: s.code,
              name: s.name,
              paket: s.paket,
              category: s.category,
              hoursPerWeek: s.hoursPerWeek,
              kkm: s.kkm,
              status: s.status,
              createdBy: uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn('Lewati auto-seed mapel Kurikulum Merdeka:', err);
        }
      };

      const settingsSnap = await getDoc(doc(db, 'school_settings', 'main'));
      if (settingsSnap.exists()) {
        await ensureOnlineClassesSeeded();
        await ensureKurikulumMerdekaSeeded();
        return;
      }

      // Step 1: Independent collections (settings, branding, classes, teachers, subjects, announcements)
      await Promise.all([
        setDoc(doc(db, 'school_settings', 'main'), {
          schoolName: DEFAULT_SCHOOL_SETTINGS.schoolName,
          npsn: DEFAULT_SCHOOL_SETTINGS.npsn,
          address: DEFAULT_SCHOOL_SETTINGS.address,
          phone: DEFAULT_SCHOOL_SETTINGS.phone || '',
          email: DEFAULT_SCHOOL_SETTINGS.email || '',
          website: DEFAULT_SCHOOL_SETTINGS.website || '',
          slogan: DEFAULT_SCHOOL_SETTINGS.slogan || '',
          headmasterName: DEFAULT_SCHOOL_SETTINGS.headmasterName,
          headmasterNip: DEFAULT_SCHOOL_SETTINGS.headmasterNip || '',
          academicYear: DEFAULT_SCHOOL_SETTINGS.academicYear,
          semester: DEFAULT_SCHOOL_SETTINGS.semester,
          logoUrl: DEFAULT_SCHOOL_SETTINGS.logoUrl || '',
          letterheadUrl: DEFAULT_SCHOOL_SETTINGS.letterheadUrl || '',
          headmasterSignatureUrl: DEFAULT_SCHOOL_SETTINGS.headmasterSignatureUrl || '',
          teacherSignatureUrl: DEFAULT_SCHOOL_SETTINGS.teacherSignatureUrl || '',
          stampUrl: DEFAULT_SCHOOL_SETTINGS.stampUrl || '',
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        }),
        setDoc(doc(db, 'school_branding', 'main'), {
          schoolName: DEFAULT_SCHOOL_SETTINGS.schoolName,
          npsn: DEFAULT_SCHOOL_SETTINGS.npsn,
          address: DEFAULT_SCHOOL_SETTINGS.address,
          slogan: DEFAULT_SCHOOL_SETTINGS.slogan || '',
          academicYear: DEFAULT_SCHOOL_SETTINGS.academicYear,
          semester: DEFAULT_SCHOOL_SETTINGS.semester,
          logoUrl: DEFAULT_SCHOOL_SETTINGS.logoUrl || '',
          updatedAt: serverTimestamp(),
        }),
      ]);

      await Promise.all([
        ...SEED_CLASSES.map((c) =>
          seedIfMissing('classes', c.id, {
            name: c.name,
            paket: c.paket,
            gradeLevel: c.gradeLevel,
            homeroomTeacherId: c.homeroomTeacherId || '',
            homeroomTeacherName: c.homeroomTeacherName,
            academicYear: c.academicYear,
            capacity: c.capacity,
            studentCount: c.studentCount,
            status: c.status,
            createdBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_TEACHERS.map((t) =>
          seedIfMissing('teachers', t.id, {
            nip: t.nip,
            fullName: t.fullName,
            gender: t.gender,
            email: t.email || '',
            phone: t.phone || '',
            specialization: t.specialization,
            education: t.education || '',
            status: t.status,
            ownerUid: t.ownerUid,
            accessUids: Array.from(new Set([uid, t.ownerUid])),
            createdBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_SUBJECTS.map((s) =>
          seedIfMissing('subjects', s.id, {
            code: s.code,
            name: s.name,
            paket: s.paket,
            category: s.category,
            hoursPerWeek: s.hoursPerWeek,
            kkm: s.kkm,
            status: s.status,
            createdBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_ANNOUNCEMENTS.map((a) =>
          seedIfMissing('announcements', a.id, {
            title: a.title,
            content: a.content,
            category: a.category,
            targetRole: a.targetRole,
            authorName: a.authorName || authorName,
            authorId: uid,
            isPinned: a.isPinned,
            publishedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_TEACHING_DOCUMENTS.map((td) =>
          seedIfMissing('teaching_documents', td.id, {
            docType: td.docType,
            title: td.title,
            paket: td.paket,
            fase: td.fase,
            kelas: td.kelas,
            mapel: td.mapel,
            materi: td.materi,
            jumlahPertemuan: td.jumlahPertemuan,
            alokasiWaktu: td.alokasiWaktu,
            academicYear: td.academicYear,
            semester: td.semester,
            contentHtml: td.contentHtml,
            authorName: td.authorName,
            ownerUid: uid,
            accessUids: [uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_QUESTION_BANK.map((qb) =>
          seedIfMissing('question_bank', qb.id, {
            mapel: qb.mapel,
            paket: qb.paket,
            materi: qb.materi,
            questionType: qb.questionType,
            cognitiveLevel: qb.cognitiveLevel,
            questionJson: JSON.stringify(qb.question),
            visibility: qb.visibility,
            authorName: qb.authorName,
            ownerUid: uid,
            accessUids: [uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_EXAMS.map((ex) =>
          seedIfMissing('exams', ex.id, {
            title: ex.title,
            examType: ex.examType,
            paket: ex.paket,
            kelas: ex.kelas,
            mapel: ex.mapel,
            materi: ex.materi,
            academicYear: ex.academicYear,
            semester: ex.semester,
            durationMinutes: ex.durationMinutes,
            hasPaketB: ex.hasPaketB,
            isOnlinePublished: ex.isOnlinePublished,
            payloadJson: JSON.stringify({
              questions: ex.questions,
              paketBOrder: ex.paketBOrder || [],
              paketBOptionMaps: ex.paketBOptionMaps || {},
              paketCOrder: ex.paketCOrder || [],
              paketCOptionMaps: ex.paketCOptionMaps || {},
            }),
            authorName: ex.authorName,
            ownerUid: uid,
            accessUids: [uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
      ]);

      // Step 2: Dependent collections (students -> classes, assignments -> teachers/subjects/classes)
      await Promise.all([
        ...SEED_STUDENTS.map((st) =>
          seedIfMissing('students', st.id, {
            nis: st.nis,
            nisn: st.nisn || '',
            fullName: st.fullName,
            gender: st.gender,
            paket: st.paket,
            classId: st.classId,
            className: st.className,
            email: st.email || '',
            phone: st.phone || '',
            address: st.address || '',
            guardianName: st.guardianName || '',
            status: st.status,
            ownerUid: st.ownerUid,
            accessUids: [uid],
            createdBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_ASSIGNMENTS.map((asg) => {
          const classStudentUids = SEED_STUDENTS.filter((st) => st.classId === asg.classId)
            .map((st) => st.ownerUid)
            .filter(Boolean);
          const asgAccessUids = Array.from(new Set([uid, asg.teacherUid, ...classStudentUids])).slice(0, 30);
          return seedIfMissing('assignments', asg.id, {
            teacherId: asg.teacherId,
            teacherName: asg.teacherName,
            teacherUid: asg.teacherUid,
            subjectId: asg.subjectId,
            subjectName: asg.subjectName,
            classId: asg.classId,
            className: asg.className,
            paket: asg.paket,
            academicYear: asg.academicYear,
            semester: asg.semester,
            scheduleDay: asg.scheduleDay,
            scheduleTime: asg.scheduleTime,
            status: asg.status,
            accessUids: asgAccessUids,
            createdBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }),
        ...SEED_ATTENDANCE_SESSIONS.map((att) =>
          seedIfMissing('attendance_sessions', att.id, {
            date: att.date,
            monthKey: att.monthKey,
            academicYear: att.academicYear,
            semester: att.semester,
            paket: att.paket,
            classId: att.classId,
            className: att.className,
            subjectId: att.subjectId,
            subjectName: att.subjectName,
            teacherId: att.teacherId,
            teacherName: att.teacherName,
            recordsJson: JSON.stringify(att.records),
            summaryHadir: att.summaryHadir,
            summaryIzin: att.summaryIzin,
            summarySakit: att.summarySakit,
            summaryAlpa: att.summaryAlpa,
            studentUids: att.studentUids,
            ownerUid: uid,
            accessUids: [uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_TASKS.map((t) =>
          seedIfMissing('tasks', t.id, {
            title: t.title,
            description: t.description,
            paket: t.paket,
            classId: t.classId,
            className: t.className,
            subjectId: t.subjectId,
            subjectName: t.subjectName,
            teacherId: t.teacherId,
            teacherName: t.teacherName,
            teacherUid: t.teacherUid,
            dueAt: t.dueAt,
            maxScore: t.maxScore,
            attachmentsJson: JSON.stringify(t.attachments || []),
            targetStudentUids: t.targetStudentUids,
            ownerUid: uid,
            accessUids: [uid, t.teacherUid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
      ]);

      // Step 3: Dependent submissions referencing tasks & grade records
      await Promise.all([
        ...SEED_TASK_SUBMISSIONS.map((ts) =>
          seedIfMissing('task_submissions', ts.id, {
            taskId: ts.taskId,
            taskTitle: ts.taskTitle,
            classId: ts.classId,
            className: ts.className,
            subjectId: ts.subjectId,
            subjectName: ts.subjectName,
            studentId: ts.studentId,
            studentUid: ts.studentUid,
            studentName: ts.studentName,
            studentNis: ts.studentNis,
            answerText: ts.answerText,
            attachmentsJson: JSON.stringify(ts.attachments || []),
            status: ts.status,
            isLate: ts.isLate,
            score: ts.score,
            feedback: ts.feedback,
            gradedBy: ts.gradedBy,
            gradedAt: ts.gradedAt,
            accessUids: [uid],
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_GRADE_WEIGHTS.map((gw) =>
          seedIfMissing('grade_weights', gw.id, {
            classId: gw.classId,
            subjectId: gw.subjectId,
            tugas: gw.tugas,
            uh: gw.uh,
            asts: gw.asts,
            asat: gw.asat,
            praktik: gw.praktik,
            sikap: gw.sikap,
            ownerUid: uid,
            accessUids: [uid, gw.ownerUid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        ...SEED_GRADE_RECORDS.map((gr) =>
          seedIfMissing('grade_records', gr.id, {
            studentId: gr.studentId,
            studentUid: gr.studentUid,
            studentName: gr.studentName,
            studentNis: gr.studentNis,
            classId: gr.classId,
            className: gr.className,
            paket: gr.paket,
            subjectId: gr.subjectId,
            subjectName: gr.subjectName,
            kkm: gr.kkm,
            teacherId: gr.teacherId,
            teacherName: gr.teacherName,
            academicYear: gr.academicYear,
            semester: gr.semester,
            tugas: gr.tugas,
            uh: gr.uh,
            asts: gr.asts,
            asat: gr.asat,
            praktik: gr.praktik,
            sikap: gr.sikap,
            finalScore: gr.finalScore,
            predicate: gr.predicate,
            isPassed: gr.isPassed,
            achievementDescription: gr.achievementDescription,
            homeroomNote: gr.homeroomNote,
            ownerUid: uid,
            accessUids: [uid, gr.ownerUid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
      ]);

      await ensureOnlineClassesSeeded();
    } catch (error) {
      console.error('Gagal melakukan inisialisasi data awal Firestore:', error);
    }
  }, []);

  // Load data for active Firebase session
  useEffect(() => {
    if (!authMode || !firebaseUser || profile?.status !== 'Aktif') {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const isStaff = isBootstrappedAdmin || profile?.role === 'kepala_pkbm';

    if (isBootstrappedAdmin) {
      seedFirestoreIfEmpty(firebaseUser.uid, profile?.name || 'Administrator');
    }

    const unsubscribers: Array<() => void> = [];

    // 1. School settings — dibaca langsung oleh SELURUH peran aktif (Admin, Kepala PKBM, Guru, Murid)
    // agar nama Kepala PKBM, NIP, kop surat, logo, dan TTD pada seluruh surat & cetak selalu identik dengan Admin Master
    unsubscribers.push(
      onSnapshot(
        doc(db, 'school_settings', 'main'),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            const rawAddress = typeof d.address === 'string' ? d.address : '';
            const isLegacyBandungAddress = /bandung/i.test(rawAddress);
            const resolvedAddress = isLegacyBandungAddress
              ? DEFAULT_SCHOOL_SETTINGS.address
              : rawAddress || DEFAULT_SCHOOL_SETTINGS.address;

            const rawLogo = typeof d.logoUrl === 'string' ? d.logoUrl : '';
            const hasLegacyDummyLogo = isLegacyDummyLogo(rawLogo);
            const resolvedLogo = resolveSchoolLogo(rawLogo);

            const resolved: SchoolSettings = {
              schoolName: d.schoolName || DEFAULT_SCHOOL_SETTINGS.schoolName,
              npsn: d.npsn || DEFAULT_SCHOOL_SETTINGS.npsn,
              address: resolvedAddress,
              phone: typeof d.phone === 'string' ? d.phone : '',
              email: typeof d.email === 'string' ? d.email : '',
              website: typeof d.website === 'string' ? d.website : '',
              slogan: typeof d.slogan === 'string' ? d.slogan : '',
              headmasterName: d.headmasterName || DEFAULT_SCHOOL_SETTINGS.headmasterName,
              headmasterNip: typeof d.headmasterNip === 'string' ? d.headmasterNip : '',
              academicYear: d.academicYear || DEFAULT_SCHOOL_SETTINGS.academicYear,
              semester: d.semester || 'Ganjil',
              logoUrl: resolvedLogo,
              letterheadUrl: typeof d.letterheadUrl === 'string' ? d.letterheadUrl : '',
              headmasterSignatureUrl:
                typeof d.headmasterSignatureUrl === 'string'
                  ? d.headmasterSignatureUrl
                  : DEFAULT_SCHOOL_SETTINGS.headmasterSignatureUrl,
              teacherSignatureUrl:
                typeof d.teacherSignatureUrl === 'string' &&
                d.teacherSignatureUrl !== DEFAULT_TEACHER_SIG_SVG
                  ? d.teacherSignatureUrl
                  : '',
              stampUrl:
                typeof d.stampUrl === 'string' && d.stampUrl !== DEFAULT_STAMP_SVG
                  ? d.stampUrl
                  : '',
            };

            setSchoolSettings(resolved);
            applyBrandingSideEffects(resolved);

            // Hanya Admin Master yang melakukan sinkronisasi tulis otomatis ke school_settings / school_branding
            if (isBootstrappedAdmin) {
              if (isLegacyBandungAddress || hasLegacyDummyLogo) {
                updateDoc(doc(db, 'school_settings', 'main'), {
                  address: resolvedAddress,
                  logoUrl: resolvedLogo,
                  updatedBy: firebaseUser.uid,
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
              setDoc(doc(db, 'school_branding', 'main'), {
                schoolName: resolved.schoolName.slice(0, 150),
                npsn: resolved.npsn.slice(0, 24),
                address: resolved.address.slice(0, 300),
                slogan: (resolved.slogan || '').slice(0, 200),
                academicYear: resolved.academicYear.slice(0, 20),
                semester: resolved.semester,
                logoUrl: resolved.logoUrl || DEFAULT_PKBM_LOGO,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          } else {
            // Fallback ke school_branding/main hanya bila school_settings/main belum diinisialisasi
            getDoc(doc(db, 'school_branding', 'main'))
              .then((brandSnap) => {
                if (brandSnap.exists()) {
                  const bd = brandSnap.data();
                  const fallbackResolved: SchoolSettings = {
                    ...DEFAULT_SCHOOL_SETTINGS,
                    schoolName: bd.schoolName || DEFAULT_SCHOOL_SETTINGS.schoolName,
                    npsn: bd.npsn || DEFAULT_SCHOOL_SETTINGS.npsn,
                    address: bd.address || DEFAULT_SCHOOL_SETTINGS.address,
                    slogan: bd.slogan || DEFAULT_SCHOOL_SETTINGS.slogan,
                    academicYear: bd.academicYear || DEFAULT_SCHOOL_SETTINGS.academicYear,
                    semester: bd.semester || DEFAULT_SCHOOL_SETTINGS.semester,
                    logoUrl: resolveSchoolLogo(typeof bd.logoUrl === 'string' ? bd.logoUrl : ''),
                  };
                  setSchoolSettings(fallbackResolved);
                  applyBrandingSideEffects(fallbackResolved);
                } else {
                  setSchoolSettings(DEFAULT_SCHOOL_SETTINGS);
                }
              })
              .catch(() => {
                setSchoolSettings(DEFAULT_SCHOOL_SETTINGS);
              });
          }
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          if (isBootstrappedAdmin) {
            handleFirestoreError(err, OperationType.GET, 'school_settings/main');
          } else {
            // Fallback aman ke school_branding jika rules belum selesai ter-deploy
            getDoc(doc(db, 'school_branding', 'main'))
              .then((brandSnap) => {
                if (brandSnap.exists()) {
                  const bd = brandSnap.data();
                  const fallbackResolved: SchoolSettings = {
                    ...DEFAULT_SCHOOL_SETTINGS,
                    schoolName: bd.schoolName || DEFAULT_SCHOOL_SETTINGS.schoolName,
                    npsn: bd.npsn || DEFAULT_SCHOOL_SETTINGS.npsn,
                    address: bd.address || DEFAULT_SCHOOL_SETTINGS.address,
                    slogan: bd.slogan || DEFAULT_SCHOOL_SETTINGS.slogan,
                    academicYear: bd.academicYear || DEFAULT_SCHOOL_SETTINGS.academicYear,
                    semester: bd.semester || DEFAULT_SCHOOL_SETTINGS.semester,
                    logoUrl: resolveSchoolLogo(typeof bd.logoUrl === 'string' ? bd.logoUrl : ''),
                  };
                  setSchoolSettings(fallbackResolved);
                  applyBrandingSideEffects(fallbackResolved);
                }
              })
              .catch(() => {});
          }
        }
      )
    );

    if (isBootstrappedAdmin) {
      // 1b. Managed User Accounts (Khusus Admin)
      unsubscribers.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const toIso = (val: unknown): string | undefined => {
              if (!val) return undefined;
              if (typeof val === 'string') return val;
              if (
                typeof val === 'object' &&
                val !== null &&
                'toDate' in val &&
                typeof (val as { toDate: () => Date }).toDate === 'function'
              ) {
                return (val as { toDate: () => Date }).toDate().toISOString();
              }
              return undefined;
            };
            setAccounts(
              snap.docs.map((d) => {
                const data = d.data();
                return {
                  uid: String(data.uid || d.id),
                  docId: d.id,
                  username: String(data.username || ''),
                  internalEmail: String(data.internalEmail || ''),
                  name: String(data.name || ''),
                  role: data.role || 'murid',
                  status: data.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
                  authVersion: typeof data.authVersion === 'number' ? data.authVersion : 1,
                  nis: data.nis,
                  nip: data.nip,
                  linkedEntityId: data.linkedEntityId,
                  classLabel: data.classLabel,
                  avatarUrl:
                    typeof data.avatarUrl === 'string' && data.avatarUrl.trim()
                      ? data.avatarUrl
                      : undefined,
                  lastLoginAt: toIso(data.lastLoginAt),
                  createdAt: toIso(data.createdAt),
                  updatedAt: toIso(data.updatedAt),
                };
              })
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );

      // 1c. Kredensial Kartu Login khusus Admin agar password tetap terbuka lintas perangkat & sesi
      unsubscribers.push(
        onSnapshot(
          collection(db, 'login_card_credentials'),
          (snap) => {
            const remoteCreds: SessionIssuedCredential[] = [];
            snap.docs.forEach((d) => {
              const data = d.data();
              const pwd = typeof data.cardPassword === 'string' ? data.cardPassword : '';
              if (!pwd) return;
              const item: SessionIssuedCredential = {
                uid: String(data.uid || d.id),
                name: String(data.name || ''),
                username: String(data.username || ''),
                password: pwd,
                role: (data.role || 'murid') as UserProfile['role'],
                issuedAt: data.updatedAt?.toDate
                  ? data.updatedAt.toDate().toISOString()
                  : new Date().toISOString(),
              };
              if (typeof data.classLabel === 'string' && data.classLabel) {
                item.classLabel = data.classLabel;
              }
              remoteCreds.push(item);
            });

            const merged =
              remoteCreds.length > 0
                ? saveStoredCredentials(remoteCreds)
                : loadStoredCredentials();
            setIssuedCredentialsMap(merged);
          },
          () => {
            // Gunakan cache lokal bila koleksi belum tersedia
            setIssuedCredentialsMap(loadStoredCredentials());
          }
        )
      );
    } else {
      setAccounts([]);
    }

    // 2. Classes (wajib sertakan filter status agar sesuai constraint allow list di firestore.rules)
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'classes'), where('status', 'in', ['Aktif', 'Arsip'])),
        (snap) => {
          setClasses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'classes')
      )
    );

    // 3. Subjects (wajib sertakan filter status agar sesuai constraint allow list di firestore.rules)
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'subjects'), where('status', 'in', ['Aktif', 'Arsip'])),
        (snap) => {
          setSubjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'subjects')
      )
    );

    // 4. Announcements (wajib sertakan filter targetRole agar sesuai constraint allow list di firestore.rules)
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'announcements'), where('targetRole', 'in', ['Semua', 'Guru', 'Murid'])),
        (snap) => {
          setAnnouncements(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                title: data.title,
                content: data.content,
                category: data.category,
                targetRole: data.targetRole,
                authorName: data.authorName,
                authorId: data.authorId,
                isPinned: Boolean(data.isPinned),
                publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
      )
    );

    // 5. Students (secure query per role — guru mengajar seluruh paket/rombel/kelas)
    const studentsQuery =
      isStaff || profile?.role === 'guru'
        ? collection(db, 'students')
        : query(collection(db, 'students'), where('ownerUid', '==', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        studentsQuery,
        (snap) => {
          setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Student, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'students')
      )
    );

    // 6. Teachers (secure query per role)
    const teachersQuery = isStaff
      ? collection(db, 'teachers')
      : profile?.role === 'guru'
        ? query(collection(db, 'teachers'), where('ownerUid', '==', firebaseUser.uid))
        : query(collection(db, 'teachers'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        teachersQuery,
        (snap) => {
          setTeachers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Teacher, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'teachers')
      )
    );

    // 7. Assignments (wajib sertakan filter status agar sesuai constraint allow list di firestore.rules)
    const assignmentsQuery = query(
      collection(db, 'assignments'),
      where('status', 'in', ['Aktif', 'Selesai'])
    );

    unsubscribers.push(
      onSnapshot(
        assignmentsQuery,
        (snap) => {
          setAssignments(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeachingAssignment, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'assignments')
      )
    );

    // 8. Teaching Documents (only for staff/teachers)
    if (profile?.role !== 'murid') {
      const docsQuery = isStaff
        ? collection(db, 'teaching_documents')
        : query(collection(db, 'teaching_documents'), where('accessUids', 'array-contains', firebaseUser.uid));

      unsubscribers.push(
        onSnapshot(
          docsQuery,
          (snap) => {
            setTeachingDocuments(
              snap.docs.map((d) => {
                const data = d.data();
                return {
                  id: d.id,
                  docType: data.docType,
                  title: data.title,
                  paket: data.paket,
                  fase: data.fase,
                  kelas: data.kelas,
                  mapel: data.mapel,
                  materi: data.materi,
                  jumlahPertemuan: Number(data.jumlahPertemuan || 1),
                  alokasiWaktu: data.alokasiWaktu,
                  academicYear: data.academicYear,
                  semester: data.semester,
                  contentHtml: data.contentHtml,
                  authorName: data.authorName,
                  ownerUid: data.ownerUid,
                  accessUids: data.accessUids || [],
                  createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                  updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
                };
              })
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'teaching_documents')
        )
      );

      // 9. Question Bank (staff & teachers only, visibility == 'Sekolah' or owned)
      const qbQuery = isStaff
        ? collection(db, 'question_bank')
        : query(collection(db, 'question_bank'), where('visibility', '==', 'Sekolah'));

      unsubscribers.push(
        onSnapshot(
          qbQuery,
          (snap) => {
            setQuestionBank(
              snap.docs.map((d) => {
                const data = d.data();
                return {
                  id: d.id,
                  mapel: data.mapel,
                  paket: data.paket,
                  materi: data.materi,
                  questionType: data.questionType,
                  cognitiveLevel: data.cognitiveLevel,
                  question: safeJsonParse<ExamQuestion>(data.questionJson, {} as ExamQuestion),
                  visibility: data.visibility,
                  authorName: data.authorName,
                  ownerUid: data.ownerUid,
                  accessUids: data.accessUids || [],
                  createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                  updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
                };
              })
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'question_bank')
        )
      );
    }

    // 10. Exams (teachers/staff see owned/accessible; students see published online exams)
    const examsQuery = isStaff
      ? collection(db, 'exams')
      : profile?.role === 'murid'
        ? query(collection(db, 'exams'), where('isOnlinePublished', '==', true))
        : query(collection(db, 'exams'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        examsQuery,
        (snap) => {
          setExams(
            snap.docs.map((d) => {
              const data = d.data();
              const parsedPayload = safeJsonParse<{
                paketBOrder?: string[];
                paketBOptionMaps?: Record<string, number[]>;
                paketCOrder?: string[];
                paketCOptionMaps?: Record<string, number[]>;
                questions?: ExamQuestion[];
              }>(data.payloadJson, {});
              return {
                id: d.id,
                title: data.title,
                examType: data.examType,
                paket: data.paket,
                kelas: data.kelas,
                mapel: data.mapel,
                materi: data.materi,
                academicYear: data.academicYear,
                semester: data.semester,
                durationMinutes: Number(data.durationMinutes || 45),
                hasPaketB: Boolean(data.hasPaketB),
                paketBOrder: parsedPayload.paketBOrder || [],
                paketBOptionMaps: parsedPayload.paketBOptionMaps || {},
                paketCOrder: parsedPayload.paketCOrder || [],
                paketCOptionMaps: parsedPayload.paketCOptionMaps || {},
                isOnlinePublished: Boolean(data.isOnlinePublished),
                questions: Array.isArray(parsedPayload.questions) ? parsedPayload.questions : [],
                authorName: data.authorName,
                ownerUid: data.ownerUid,
                accessUids: data.accessUids || [],
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'exams')
      )
    );

    // 11. Exam Submissions
    const submissionsQuery = isStaff
      ? collection(db, 'exam_submissions')
      : profile?.role === 'murid'
        ? query(collection(db, 'exam_submissions'), where('studentUid', '==', firebaseUser.uid))
        : query(collection(db, 'exam_submissions'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        submissionsQuery,
        (snap) => {
          setExamSubmissions(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                examId: data.examId,
                examTitle: data.examTitle,
                paketVariant: data.paketVariant || 'A',
                studentUid: data.studentUid,
                studentName: data.studentName,
                studentNis: data.studentNis,
                paket: data.paket,
                className: data.className,
                answers: safeJsonParse(data.answersJson, {}),
                essayGrades: safeJsonParse(data.essayGradesJson, {}),
                autoScore: Number(data.autoScore || 0),
                essayScore: Number(data.essayScore || 0),
                maxScore: Number(data.maxScore || 100),
                finalScore: Number(data.finalScore || 0),
                status: data.status,
                accessUids: data.accessUids || [],
                submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'exam_submissions')
      )
    );

    // 12. Attendance Sessions (role-scoped)
    const attendanceQuery = isStaff
      ? collection(db, 'attendance_sessions')
      : profile?.role === 'murid'
        ? query(collection(db, 'attendance_sessions'), where('studentUids', 'array-contains', firebaseUser.uid))
        : query(collection(db, 'attendance_sessions'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        attendanceQuery,
        (snap) => {
          setAttendanceSessions(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                date: data.date,
                monthKey: data.monthKey,
                academicYear: data.academicYear,
                semester: data.semester,
                paket: data.paket,
                classId: data.classId,
                className: data.className,
                subjectId: data.subjectId,
                subjectName: data.subjectName,
                teacherId: data.teacherId,
                teacherName: data.teacherName,
                records: safeJsonParse(data.recordsJson, []),
                summaryHadir: Number(data.summaryHadir || 0),
                summaryIzin: Number(data.summaryIzin || 0),
                summarySakit: Number(data.summarySakit || 0),
                summaryAlpa: Number(data.summaryAlpa || 0),
                studentUids: data.studentUids || [],
                ownerUid: data.ownerUid,
                accessUids: data.accessUids || [],
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'attendance_sessions')
      )
    );

    // 13. Tasks (strictly scoped to target class students or owning/accessing teachers & admins)
    const tasksQuery = isStaff
      ? collection(db, 'tasks')
      : profile?.role === 'murid'
        ? query(collection(db, 'tasks'), where('targetStudentUids', 'array-contains', firebaseUser.uid))
        : query(collection(db, 'tasks'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        tasksQuery,
        (snap) => {
          setTasks(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                title: data.title,
                description: data.description,
                paket: data.paket,
                classId: data.classId,
                className: data.className,
                deliveryMode: data.deliveryMode === 'online' ? 'online' : 'regular',
                onlineClassId: typeof data.onlineClassId === 'string' ? data.onlineClassId : '',
                onlineClassTitle: typeof data.onlineClassTitle === 'string' ? data.onlineClassTitle : '',
                subjectId: data.subjectId,
                subjectName: data.subjectName,
                teacherId: data.teacherId,
                teacherName: data.teacherName,
                teacherUid: data.teacherUid,
                dueAt: data.dueAt,
                maxScore: Number(data.maxScore || 100),
                attachments: safeJsonParse(data.attachmentsJson, []),
                targetStudentUids: data.targetStudentUids || [],
                ownerUid: data.ownerUid,
                accessUids: data.accessUids || [],
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
      )
    );

    // 14. Task Submissions (student sees own submissions; teacher/staff sees accessible submissions)
    const taskSubmissionsQuery = isStaff
      ? collection(db, 'task_submissions')
      : profile?.role === 'murid'
        ? query(collection(db, 'task_submissions'), where('studentUid', '==', firebaseUser.uid))
        : query(collection(db, 'task_submissions'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        taskSubmissionsQuery,
        (snap) => {
          setTaskSubmissions(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                taskId: data.taskId,
                taskTitle: data.taskTitle,
                classId: data.classId,
                className: data.className,
                subjectId: data.subjectId,
                subjectName: data.subjectName,
                studentId: data.studentId,
                studentUid: data.studentUid,
                studentName: data.studentName,
                studentNis: data.studentNis,
                answerText: data.answerText || '',
                attachments: safeJsonParse(data.attachmentsJson, []),
                status: data.status,
                isLate: Boolean(data.isLate),
                score: Number(data.score || 0),
                feedback: data.feedback || '',
                gradedBy: data.gradedBy || '',
                gradedAt: data.gradedAt || '',
                accessUids: data.accessUids || [],
                submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'task_submissions')
      )
    );

    // 15. Grade Weights (staff & teachers)
    if (profile?.role !== 'murid') {
      const weightsQuery = isStaff
        ? collection(db, 'grade_weights')
        : query(collection(db, 'grade_weights'), where('accessUids', 'array-contains', firebaseUser.uid));

      unsubscribers.push(
        onSnapshot(
          weightsQuery,
          (snap) => {
            setGradeWeights(
              snap.docs.map((d) => {
                const data = d.data();
                return {
                  id: d.id,
                  classId: data.classId,
                  subjectId: data.subjectId,
                  tugas: Number(data.tugas || 20),
                  uh: Number(data.uh || 15),
                  asts: Number(data.asts || 20),
                  asat: Number(data.asat || 25),
                  praktik: Number(data.praktik || 10),
                  sikap: Number(data.sikap || 10),
                  ownerUid: data.ownerUid,
                  accessUids: data.accessUids || [],
                  createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                  updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
                };
              })
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'grade_weights')
        )
      );
    }

    // 16. Grade Records (students see only their own grades; teachers/staff see accessible records)
    const gradeRecordsQuery = isStaff
      ? collection(db, 'grade_records')
      : profile?.role === 'murid'
        ? query(collection(db, 'grade_records'), where('studentUid', '==', firebaseUser.uid))
        : query(collection(db, 'grade_records'), where('accessUids', 'array-contains', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        gradeRecordsQuery,
        (snap) => {
          setGradeRecords(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                studentId: data.studentId,
                studentUid: data.studentUid,
                studentName: data.studentName,
                studentNis: data.studentNis,
                classId: data.classId,
                className: data.className,
                paket: data.paket,
                subjectId: data.subjectId,
                subjectName: data.subjectName,
                kkm: Number(data.kkm || 75),
                teacherId: data.teacherId,
                teacherName: data.teacherName,
                academicYear: data.academicYear,
                semester: data.semester,
                tugas: Number(data.tugas || 0),
                uh: Number(data.uh || 0),
                asts: Number(data.asts || 0),
                asat: Number(data.asat || 0),
                praktik: Number(data.praktik || 0),
                sikap: Number(data.sikap || 0),
                finalScore: Number(data.finalScore || 0),
                predicate: data.predicate || 'D',
                isPassed: Boolean(data.isPassed),
                achievementDescription: data.achievementDescription || '',
                homeroomNote: data.homeroomNote || '',
                ownerUid: data.ownerUid,
                accessUids: data.accessUids || [],
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'grade_records')
      )
    );

    // 17. Online Classes (Kelas Online Paket A, B, C)
    const mapOnlineClassDoc = (d: { id: string; data: () => Record<string, unknown> }): OnlineClassSession => {
      const data = d.data();
      const rawObjectives = Array.isArray(data.learningObjectives)
        ? data.learningObjectives.filter((v): v is string => typeof v === 'string')
        : [];
      const rawMaterials = Array.isArray(data.materials)
        ? data.materials
            .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
            .map((m, idx) => ({
              id: typeof m.id === 'string' && m.id ? m.id : `mat_${idx + 1}`,
              title: typeof m.title === 'string' ? m.title : 'Materi Pembelajaran',
              type: (['Ringkasan Materi', 'Video Pembelajaran', 'Slide / PDF', 'LKPD / Latihan'].includes(
                String(m.type || '')
              )
                ? m.type
                : 'Ringkasan Materi') as OnlineClassSession['materials'][number]['type'],
              durationMinutes: Number(m.durationMinutes || 15),
              summary: typeof m.summary === 'string' ? m.summary : '',
              contentText: typeof m.contentText === 'string' ? m.contentText : '',
              resourceUrl: typeof m.resourceUrl === 'string' ? m.resourceUrl : '',
            }))
        : [];
      const createdTs = data.createdAt as { toDate?: () => Date } | undefined;
      const updatedTs = data.updatedAt as { toDate?: () => Date } | undefined;
      return {
        id: d.id,
        title: String(data.title || ''),
        paket: (data.paket === 'Paket A' || data.paket === 'Paket B' || data.paket === 'Paket C'
          ? data.paket
          : 'Paket C') as PaketType,
        fase: String(data.fase || ''),
        classId: String(data.classId || ''),
        className: String(data.className || ''),
        subjectId: String(data.subjectId || ''),
        subjectName: String(data.subjectName || ''),
        teacherId: String(data.teacherId || ''),
        teacherName: String(data.teacherName || ''),
        teacherUid: String(data.teacherUid || ''),
        modality: (['Live Interaktif', 'Tutorial Daring', 'Belajar Mandiri'].includes(String(data.modality || ''))
          ? data.modality
          : 'Live Interaktif') as OnlineClassSession['modality'],
        platform: (['Google Meet', 'Zoom Meeting', 'YouTube Live', 'Ruang Belajar Mandiri'].includes(
          String(data.platform || '')
        )
          ? data.platform
          : 'Google Meet') as OnlineClassSession['platform'],
        meetingUrl: String(data.meetingUrl || ''),
        meetingCode: String(data.meetingCode || ''),
        recordingUrl: String(data.recordingUrl || ''),
        scheduleDate: String(data.scheduleDate || ''),
        startTime: String(data.startTime || '08:00'),
        endTime: String(data.endTime || '09:30'),
        durationMinutes: Number(data.durationMinutes || 60),
        status: (['Terjadwal', 'Live', 'Selesai'].includes(String(data.status || ''))
          ? data.status
          : 'Terjadwal') as OnlineClassStatus,
        description: String(data.description || ''),
        learningObjectives: rawObjectives,
        materials: rawMaterials,
        isPublished: data.isPublished !== false,
        ownerUid: String(data.ownerUid || ''),
        accessUids: Array.isArray(data.accessUids) ? (data.accessUids as string[]) : [],
        createdAt: createdTs?.toDate ? createdTs.toDate().toISOString() : new Date().toISOString(),
        updatedAt: updatedTs?.toDate ? updatedTs.toDate().toISOString() : new Date().toISOString(),
      };
    };

    if (isStaff) {
      unsubscribers.push(
        onSnapshot(
          collection(db, 'online_classes'),
          (snap) => {
            setOnlineClasses(snap.docs.map((d) => mapOnlineClassDoc(d)));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'online_classes')
        )
      );
    } else if (profile?.role === 'guru') {
      const publishedMap = new Map<string, OnlineClassSession>();
      const ownMap = new Map<string, OnlineClassSession>();
      const flushMerged = () => {
        const merged = new Map<string, OnlineClassSession>();
        publishedMap.forEach((v, k) => merged.set(k, v));
        ownMap.forEach((v, k) => merged.set(k, v));
        setOnlineClasses(Array.from(merged.values()));
      };
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'online_classes'), where('isPublished', '==', true)),
          (snap) => {
            publishedMap.clear();
            snap.docs.forEach((d) => publishedMap.set(d.id, mapOnlineClassDoc(d)));
            flushMerged();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'online_classes')
        )
      );
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'online_classes'), where('ownerUid', '==', firebaseUser.uid)),
          (snap) => {
            ownMap.clear();
            snap.docs.forEach((d) => ownMap.set(d.id, mapOnlineClassDoc(d)));
            flushMerged();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'online_classes')
        )
      );
    } else {
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'online_classes'), where('isPublished', '==', true)),
          (snap) => {
            setOnlineClasses(snap.docs.map((d) => mapOnlineClassDoc(d)));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'online_classes')
        )
      );
    }

    // 18. Online Class Progress (murid lihat miliknya; staff & guru lihat rekap progres)
    const progressQuery =
      isStaff || profile?.role === 'guru'
        ? collection(db, 'online_class_progress')
        : query(collection(db, 'online_class_progress'), where('studentUid', '==', firebaseUser.uid));

    unsubscribers.push(
      onSnapshot(
        progressQuery,
        (snap) => {
          setOnlineClassProgress(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                sessionId: String(data.sessionId || ''),
                paket: (data.paket === 'Paket A' || data.paket === 'Paket B' || data.paket === 'Paket C'
                  ? data.paket
                  : 'Paket C') as PaketType,
                classId: String(data.classId || ''),
                studentId: String(data.studentId || ''),
                studentUid: String(data.studentUid || ''),
                studentName: String(data.studentName || ''),
                studentNis: String(data.studentNis || ''),
                joinedLive: Boolean(data.joinedLive),
                joinedAt: String(data.joinedAt || ''),
                completedMaterialIds: Array.isArray(data.completedMaterialIds)
                  ? data.completedMaterialIds.filter((x): x is string => typeof x === 'string')
                  : [],
                progressPercent: Number(data.progressPercent || 0),
                personalNote: String(data.personalNote || ''),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'online_class_progress')
      )
    );

    // 19. Online Class Forum Comments (diskusi & tanya jawab tutor)
    const commentsQuery = isStaff
      ? collection(db, 'online_class_comments')
      : query(collection(db, 'online_class_comments'), where('paket', 'in', ['Paket A', 'Paket B', 'Paket C']));

    unsubscribers.push(
      onSnapshot(
        commentsQuery,
        (snap) => {
          setOnlineClassComments(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                sessionId: String(data.sessionId || ''),
                paket: (data.paket === 'Paket A' || data.paket === 'Paket B' || data.paket === 'Paket C'
                  ? data.paket
                  : 'Paket C') as PaketType,
                authorUid: String(data.authorUid || ''),
                authorName: String(data.authorName || ''),
                authorRole: (['admin', 'kepala_pkbm', 'guru', 'murid'].includes(String(data.authorRole || ''))
                  ? data.authorRole
                  : 'murid') as OnlineClassComment['authorRole'],
                message: String(data.message || ''),
                isPinned: Boolean(data.isPinned),
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'online_class_comments')
      )
    );

    // 20. Galeri 5 Foto Kegiatan Belajar Mengajar (tampil di laman depan & dasbor)
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'gallery_photos'), where('slotIndex', '>=', 1), where('slotIndex', '<=', 5)),
        (snap) => {
          const remoteItems = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              slotIndex: Number(data.slotIndex || 1) as 1 | 2 | 3 | 4 | 5,
              title: typeof data.title === 'string' ? data.title : '',
              caption: typeof data.caption === 'string' ? data.caption : '',
              paketLabel: typeof data.paketLabel === 'string' ? data.paketLabel : '',
              imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
              updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : undefined,
            };
          });
          const merged = mergeGalleryPhotosWithDefaults(remoteItems);
          setActivityGalleryPhotos(merged);
          writeCachedPublicGalleryPhotos(merged);
        },
        (err) => {
          console.warn('Gagal menyinkronkan galeri foto KBM:', err);
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [authMode, firebaseUser, isBootstrappedAdmin, profile?.name, profile?.role, profile?.status, seedFirestoreIfEmpty]);

  // Helper to generate safe Firestore doc IDs matching ^[a-zA-Z0-9_\-]+$
  const makeId = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const uploadSchoolAsset = async (file: File, key: string): Promise<string> => {
    const targetDim = key === 'letterheadUrl' ? 960 : 520;
    const dataUrl = await compressImageToDataUrl(file, targetDim, 135000);
    if (dataUrl.length > 340000) {
      throw new Error('Ukuran gambar masih terlalu besar setelah dikompresi. Gunakan gambar lebih kecil.');
    }
    return dataUrl;
  };

  const uploadTaskFile: DataContextValue['uploadTaskFile'] = async (
    file,
    folder,
    onProgress
  ) => {
    onProgress?.(10);
    const readAsDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca file lampiran.'));
        reader.readAsDataURL(file);
      });

    if (authMode === 'firebase' && firebaseUser && !storageUnavailableRef.current) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const assetRef = storageRef(storage, `tasks/${folder}/${Date.now()}_${safeName}`);
        const uploadTask = uploadBytesResumable(assetRef, file);
        const url = await new Promise<string>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            try {
              uploadTask.cancel();
            } catch {
              // Ignore cancel failure
            }
            reject(new Error('STORAGE_TIMEOUT'));
          }, 2500);

          uploadTask.on(
            'state_changed',
            (snap) => {
              if (snap.bytesTransferred > 0) {
                window.clearTimeout(timeoutId);
              }
              const pct = snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 90) + 10 : 50;
              onProgress?.(Math.min(99, pct));
            },
            (err) => {
              window.clearTimeout(timeoutId);
              reject(err);
            },
            async () => {
              window.clearTimeout(timeoutId);
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            }
          );
        });
        onProgress?.(100);
        return {
          id: makeId('att'),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          url,
        };
      } catch {
        storageUnavailableRef.current = true;
      }
    }

    onProgress?.(45);
    const isImageFile =
      file.type.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);

    if (isImageFile) {
      const compressedImg = await compressImageToDataUrl(file, 960, 115000);
      if (compressedImg.length > 500000) {
        throw new Error(
          `Gambar "${file.name}" masih terlalu besar setelah dikompresi. Gunakan gambar dengan resolusi lebih kecil.`
        );
      }
      onProgress?.(100);
      return {
        id: makeId('att'),
        name: file.name,
        mimeType: compressedImg.startsWith('data:image/webp')
          ? 'image/webp'
          : compressedImg.startsWith('data:image/jpeg')
            ? 'image/jpeg'
            : file.type || 'image/jpeg',
        sizeBytes: file.size,
        url: compressedImg,
      };
    }

    const rawDataUrl = await readAsDataUrl();
    if (rawDataUrl.length > 685000) {
      throw new Error(
        `File "${file.name}" melebihi batas ~500 KB untuk penyimpanan langsung tanpa Cloud Storage. Kecilkan ukuran PDF/DOCX atau kirim dalam bentuk gambar JPG/PNG.`
      );
    }
    onProgress?.(100);
    return {
      id: makeId('att'),
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      url: rawDataUrl,
    };
  };

  const updateSchoolSettings = async (next: SchoolSettings) => {
    const assetFields: Array<[string, string | undefined]> = [
      ['Logo Sekolah', next.logoUrl],
      ['Kop Surat', next.letterheadUrl],
      ['TTD Kepala PKBM', next.headmasterSignatureUrl],
      ['TTD Guru / Wali Kelas', next.teacherSignatureUrl],
      ['Cap / Stempel Lembaga', next.stampUrl],
    ];
    for (const [label, val] of assetFields) {
      if (val && val.length > 345000) {
        throw new Error(`Ukuran gambar "${label}" melebihi batas penyimpanan. Silakan unggah ulang.`);
      }
    }

    setSchoolSettings(next);
    applyBrandingSideEffects(next);
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await Promise.all([
          setDoc(doc(db, 'school_settings', 'main'), {
            schoolName: next.schoolName.slice(0, 150),
            npsn: next.npsn.slice(0, 24),
            address: next.address.slice(0, 300),
            phone: (next.phone || '').slice(0, 40),
            email: (next.email || '').slice(0, 120),
            website: (next.website || '').slice(0, 160),
            slogan: (next.slogan || '').slice(0, 200),
            headmasterName: next.headmasterName.slice(0, 120),
            headmasterNip: (next.headmasterNip || '').slice(0, 40),
            academicYear: next.academicYear.slice(0, 20),
            semester: next.semester,
            logoUrl: next.logoUrl || '',
            letterheadUrl: next.letterheadUrl || '',
            headmasterSignatureUrl: next.headmasterSignatureUrl || '',
            teacherSignatureUrl: next.teacherSignatureUrl || '',
            stampUrl: next.stampUrl || '',
            updatedBy: firebaseUser.uid,
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, 'school_branding', 'main'), {
            schoolName: next.schoolName.slice(0, 150),
            npsn: next.npsn.slice(0, 24),
            address: next.address.slice(0, 300),
            slogan: (next.slogan || '').slice(0, 200),
            academicYear: next.academicYear.slice(0, 20),
            semester: next.semester,
            logoUrl: next.logoUrl || '',
            updatedAt: serverTimestamp(),
          }),
        ]);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'school_settings/main');
      }
    } else {
      persistDemoCache({ schoolSettings: next });
    }
  };

  const saveStudent: DataContextValue['saveStudent'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('mrd');
    const existingItem = students.find((s) => s.id === id);
    const classTeacherUids = assignments
      .filter((a) => a.classId === item.classId && a.teacherUid)
      .map((a) => a.teacherUid);
    const mergedAccess = Array.from(
      new Set([...(existingItem?.accessUids || []), uid, ...classTeacherUids].filter(Boolean))
    ).slice(0, 30);
    const cleanNisOwner = String(item.nis || '').replace(/[^a-zA-Z0-9]/g, '');
    const resolvedOwnerUid =
      item.ownerUid ||
      existingItem?.ownerUid ||
      `uid_${cleanNisOwner.length >= 2 ? cleanNisOwner : id.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 128);
    const fullItem: Student = {
      ...item,
      id,
      nis: String(item.nis || '').trim().slice(0, 32),
      nisn: String(item.nisn || '').trim().slice(0, 32),
      fullName: String(item.fullName || '').trim().slice(0, 120),
      className: String(item.className || '').trim().slice(0, 80),
      email: String(item.email || '').trim().slice(0, 160),
      phone: String(item.phone || '').trim().slice(0, 32),
      address: String(item.address || '').trim().slice(0, 250),
      guardianName: String(item.guardianName || '').trim().slice(0, 120),
      ownerUid: resolvedOwnerUid,
      accessUids: mergedAccess,
      createdBy: existingItem?.createdBy || uid,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'students', id);
        if (existingItem) {
          await updateDoc(docRef, {
            nis: fullItem.nis,
            nisn: fullItem.nisn || '',
            fullName: fullItem.fullName,
            gender: fullItem.gender,
            paket: fullItem.paket,
            classId: fullItem.classId,
            className: fullItem.className,
            email: fullItem.email || '',
            phone: fullItem.phone || '',
            address: fullItem.address || '',
            guardianName: fullItem.guardianName || '',
            status: fullItem.status,
            ownerUid: fullItem.ownerUid,
            accessUids: fullItem.accessUids,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            nis: fullItem.nis,
            nisn: fullItem.nisn || '',
            fullName: fullItem.fullName,
            gender: fullItem.gender,
            paket: fullItem.paket,
            classId: fullItem.classId,
            className: fullItem.className,
            email: fullItem.email || '',
            phone: fullItem.phone || '',
            address: fullItem.address || '',
            guardianName: fullItem.guardianName || '',
            status: fullItem.status,
            ownerUid: fullItem.ownerUid,
            accessUids: fullItem.accessUids,
            createdBy: fullItem.createdBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Pastikan murid aktif di kelas langsung menerima tugas aktif kelas tersebut
        if (fullItem.status === 'Aktif' && fullItem.ownerUid) {
          const classTasks = tasks.filter(
            (t) => t.classId === fullItem.classId && !(t.targetStudentUids || []).includes(fullItem.ownerUid)
          );
          if (classTasks.length > 0) {
            await Promise.all(
              classTasks.map((t) =>
                updateDoc(doc(db, 'tasks', t.id), {
                  targetStudentUids: Array.from(new Set([...(t.targetStudentUids || []), fullItem.ownerUid])).slice(0, 100),
                  updatedAt: serverTimestamp(),
                }).catch(() => {})
              )
            );
          }
        }
        // Sinkronkan classLabel pada akun login murid terkait agar Kartu Login & Manajemen Akun selalu akurat
        if (isBootstrappedAdmin) {
          const nextClassLabel = resolveStudentPlacement(fullItem, classes).fullClassLabel;
          const cleanNameLower = fullItem.fullName.trim().toLowerCase();
          const linkedAccounts = accounts.filter(
            (acc) =>
              acc.role === 'murid' &&
              (acc.linkedEntityId === id ||
                (fullItem.ownerUid && acc.uid === fullItem.ownerUid) ||
                (fullItem.nis && acc.nis && acc.nis.trim().toLowerCase() === fullItem.nis.trim().toLowerCase()) ||
                (!acc.linkedEntityId && acc.name.trim().toLowerCase() === cleanNameLower))
          );
          if (linkedAccounts.length > 0) {
            await Promise.all(
              linkedAccounts
                .filter((acc) => acc.classLabel !== nextClassLabel || !acc.linkedEntityId)
                .map((acc) =>
                  updateDoc(doc(db, 'users', acc.docId || acc.uid), {
                    classLabel: nextClassLabel,
                    linkedEntityId: acc.linkedEntityId || id,
                    nis: acc.nis || fullItem.nis,
                    updatedAt: serverTimestamp(),
                  }).catch(() => {})
                )
            );
          }
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `students/${id}`);
      }
    } else {
      setStudents((prev) => {
        const hasPrev = prev.some((s) => s.id === id);
        const next = hasPrev ? prev.map((s) => (s.id === id ? fullItem : s)) : [fullItem, ...prev];
        persistDemoCache({ students: next });
        return next;
      });
    }
  };

  const deleteStudent = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'students', id));
        // Hapus akun login murid yang tertaut agar tidak tertinggal akun yatim
        const linkedUsers = await getDocs(
          query(collection(db, 'users'), where('linkedEntityId', '==', id))
        ).catch(() => null);
        if (linkedUsers && !linkedUsers.empty) {
          await Promise.all(
            linkedUsers.docs
              .filter((uDoc) => uDoc.id !== firebaseUser.uid)
              .map(async (uDoc) => {
                const uname = normalizeUsername(String(uDoc.data()?.username || ''));
                if (uname) {
                  await deleteDoc(doc(db, 'account_lookups', uname)).catch(() => {});
                }
                await deleteDoc(uDoc.ref).catch(() => {});
              })
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `students/${id}`);
      }
    } else {
      const next = students.filter((s) => s.id !== id);
      setStudents(next);
      persistDemoCache({ students: next });
    }
  };

  const importStudentsBatch: DataContextValue['importStudentsBatch'] = async (
    rows,
    onProgress
  ): Promise<ImportStudentsBatchResult> => {
    if (rows.length === 0) {
      return {
        successCount: 0,
        createdCount: 0,
        updatedCount: 0,
        failedCount: 0,
        failures: [],
      };
    }

    const extractReadableError = (err: unknown): string => {
      if (err instanceof Error && err.message) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string; operationType?: string; path?: string };
          if (parsed.error) {
            return parsed.path ? `${parsed.error} (path: ${parsed.path})` : parsed.error;
          }
        } catch {
          return err.message;
        }
        return err.message;
      }
      return String(err || 'Kesalahan tidak diketahui');
    };

    // Pastikan seluruh kelas standar PKBM (Paket A Kelas 6, Paket B Kelas 7/8/9, Paket C Kelas 10/11/12)
    // tersedia di Firestore agar siswa tidak pernah tersasar ke Paket A - Kelas 6A
    const availableClasses: Classroom[] = [...classes];
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';

    for (const seedCls of SEED_CLASSES) {
      const seedGrade = extractGradeHint(`${seedCls.name} ${seedCls.gradeLevel}`);
      const alreadyExists = availableClasses.some((c) => {
        if (c.id === seedCls.id) return true;
        if (c.paket !== seedCls.paket) return false;
        const cGrade = extractGradeHint(`${c.name} ${c.gradeLevel}`);
        return Boolean(seedGrade && cGrade && cGrade === seedGrade);
      });
      if (!alreadyExists) {
        const clsIdToUse = availableClasses.some((c) => c.id === seedCls.id)
          ? makeId('cls')
          : seedCls.id;
        const createdCls: Classroom = {
          ...seedCls,
          id: clsIdToUse,
          homeroomTeacherId: '',
          homeroomTeacherName: seedCls.homeroomTeacherName || 'Belum Ditentukan',
          academicYear: schoolSettings.academicYear || seedCls.academicYear,
          studentCount: 0,
          createdBy: uid,
        };
        try {
          await saveClassroom(createdCls);
          availableClasses.push(createdCls);
        } catch (err) {
          if (availableClasses.length === 0) {
            const clsReason = `Gagal menyiapkan kelas standar "${seedCls.name}": ${extractReadableError(err)}`;
            return {
              successCount: 0,
              createdCount: 0,
              updatedCount: 0,
              failedCount: rows.length,
              failures: rows.map((r) => ({
                rowNumber: r.rowNumber,
                fullName: String(r.fullName || '(Tanpa Nama)'),
                nis: String(r.nis || ''),
                reason: clsReason,
              })),
            };
          }
        }
      }
    }

    const gradeLevelLabelFor = (paket: Student['paket'], grade: string | null): string => {
      const romanMap: Record<string, string> = {
        '1': 'I',
        '2': 'II',
        '3': 'III',
        '4': 'IV',
        '5': 'V',
        '6': 'VI',
        '7': 'VII',
        '8': 'VIII',
        '9': 'IX',
        '10': 'X',
        '11': 'XI',
        '12': 'XII',
      };
      const jenjang = paket === 'Paket A' ? 'SD' : paket === 'Paket B' ? 'SMP' : 'SMA';
      if (grade && romanMap[grade]) {
        return `Setara Kelas ${romanMap[grade]} ${jenjang}`;
      }
      return `Setara ${jenjang}`;
    };

    const resolveOrCreateClassForRow = async (
      rowClassName: string,
      rowPaket?: Student['paket']
    ): Promise<Classroom> => {
      const targetPaket: Student['paket'] =
        rowPaket === 'Paket A' || rowPaket === 'Paket B' || rowPaket === 'Paket C'
          ? rowPaket
          : 'Paket C';
      const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
      const cleanName = normalizeName(rowClassName);
      const cleanShort = normalizeName(stripPaketPrefixFromClassName(rowClassName));
      const samePaketClasses = availableClasses.filter((c) => c.paket === targetPaket);

      if (cleanName) {
        // 1. Kecocokan persis nama lengkap atau nama pendek (tidak pernah menukar "10 CIPANAS 2" dengan "10 CIPANAS")
        const exactSamePaket = samePaketClasses.find((c) => {
          const cNorm = normalizeName(c.name);
          const cShort = normalizeName(stripPaketPrefixFromClassName(c.name));
          return cNorm === cleanName || (cleanShort && cShort === cleanShort);
        });
        if (exactSamePaket) return exactSamePaket;

        const exactAny = availableClasses.find((c) => normalizeName(c.name) === cleanName);
        if (exactAny) return exactAny;

        // 2. Jika spreadsheet menyebut nama rombel spesifik yang belum ada di Firestore,
        // buat rombel baru tersebut secara otomatis agar nama & pemisahan rombel persis sesuai spreadsheet!
        const normalizedDisplayName = formatStudentAccountClassLabel(targetPaket, rowClassName);
        const existingFormatted = availableClasses.find(
          (c) => normalizeName(c.name) === normalizeName(normalizedDisplayName)
        );
        if (existingFormatted) return existingFormatted;

        const gradeHint = extractGradeHint(rowClassName);
        const slug = normalizedDisplayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 48);
        const newClsId = availableClasses.some((c) => c.id === `cls_${slug}`)
          ? makeId('cls')
          : `cls_${slug || Date.now()}`;
        const newClassroom: Classroom = {
          id: newClsId,
          name: normalizedDisplayName.slice(0, 80),
          paket: targetPaket,
          gradeLevel: gradeLevelLabelFor(targetPaket, gradeHint),
          homeroomTeacherId: '',
          homeroomTeacherName: 'Belum Ditentukan',
          academicYear: schoolSettings.academicYear || '2026/2027',
          capacity: 55,
          studentCount: 0,
          status: 'Aktif',
          createdBy: uid,
        };
        try {
          await saveClassroom(newClassroom);
          availableClasses.push(newClassroom);
          return newClassroom;
        } catch {
          // Fallback ke kelas dengan tingkat & paket yang sama bila gagal membuat kelas baru
        }

        if (gradeHint) {
          const gradeMatch = samePaketClasses.find((c) => {
            const cHint = extractGradeHint(`${c.name} ${c.gradeLevel}`);
            return cHint === gradeHint;
          });
          if (gradeMatch) return gradeMatch;
        }
      }

      if (samePaketClasses.length > 0) {
        return samePaketClasses[0];
      }

      return availableClasses[0];
    };

    const existingByNis = new Map<string, Student>();
    const existingByNisn = new Map<string, Student>();
    const existingByName = new Map<string, Student>();
    students.forEach((s) => {
      if (s.nis) existingByNis.set(s.nis.trim().toLowerCase(), s);
      if (s.nisn) existingByNisn.set(s.nisn.trim().toLowerCase(), s);
      if (s.fullName) existingByName.set(s.fullName.trim().replace(/\s+/g, ' ').toLowerCase(), s);
    });

    let successCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    const failures: ImportStudentsBatchFailure[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cleanName = String(row.fullName || '').trim().slice(0, 120);
      let cleanNis = String(row.nis || row.nisn || '').trim().replace(/\s+/g, '').slice(0, 32);
      if (!cleanNis) {
        cleanNis = `2026${String(Date.now()).slice(-4)}${String(i + 1).padStart(2, '0')}`.slice(0, 32);
      } else if (cleanNis.length < 3) {
        cleanNis = cleanNis.padStart(4, '0');
      }

      if (cleanName.length < 2) {
        failures.push({
          rowNumber: row.rowNumber,
          fullName: cleanName || '(Kosong)',
          nis: cleanNis,
          reason: 'Nama Lengkap wajib minimal 2 karakter.',
        });
        onProgress?.(i + 1, rows.length);
        continue;
      }

      const matchedClass = await resolveOrCreateClassForRow(row.className || '', row.paket);
      const cleanNisnLookup = row.nisn ? String(row.nisn).trim().toLowerCase() : '';
      const cleanNameLookup = cleanName.replace(/\s+/g, ' ').toLowerCase();
      const existingMatch =
        (cleanNisnLookup ? existingByNisn.get(cleanNisnLookup) : undefined) ||
        existingByNis.get(cleanNis.toLowerCase()) ||
        existingByName.get(cleanNameLookup);
      const targetId = existingMatch?.id || makeId('mrd');

      const payload: Omit<Student, 'id' | 'createdBy' | 'accessUids' | 'ownerUid'> & {
        id?: string;
        ownerUid?: string;
      } = {
        id: targetId,
        ownerUid: existingMatch?.ownerUid,
        nis: cleanNis,
        nisn: row.nisn ? String(row.nisn).trim().slice(0, 32) : existingMatch?.nisn || '',
        fullName: cleanName,
        gender: row.gender === 'P' ? 'P' : 'L',
        paket:
          row.paket === 'Paket A' || row.paket === 'Paket B' || row.paket === 'Paket C'
            ? row.paket
            : matchedClass.paket,
        classId: matchedClass.id,
        className: matchedClass.name,
        email: row.email ? String(row.email).trim().slice(0, 160) : existingMatch?.email || '',
        phone: row.phone ? String(row.phone).trim().slice(0, 32) : existingMatch?.phone || '',
        address: row.address ? String(row.address).trim().slice(0, 250) : existingMatch?.address || '',
        guardianName: row.guardianName
          ? String(row.guardianName).trim().slice(0, 120)
          : existingMatch?.guardianName || '',
        status:
          row.status === 'Cuti' || row.status === 'Lulus' || row.status === 'Nonaktif'
            ? row.status
            : 'Aktif',
      };

      try {
        await saveStudent(payload);
        successCount++;
        if (existingMatch) {
          updatedCount++;
        } else {
          createdCount++;
          existingByNis.set(cleanNis.toLowerCase(), {
            ...payload,
            id: targetId,
            ownerUid: payload.ownerUid || '',
            accessUids: [],
            createdBy: '',
          } as Student);
        }
      } catch (err) {
        failures.push({
          rowNumber: row.rowNumber,
          fullName: cleanName,
          nis: cleanNis,
          reason: extractReadableError(err),
        });
      }
      onProgress?.(i + 1, rows.length);
    }

    return {
      successCount,
      createdCount,
      updatedCount,
      failedCount: failures.length,
      failures,
    };
  };

  const bulkAssignStudentsClass: DataContextValue['bulkAssignStudentsClass'] = async (
    studentIds,
    targetClass
  ) => {
    const idSet = new Set(studentIds);
    const targetStudents = students.filter((s) => idSet.has(s.id));
    if (targetStudents.length === 0) {
      return { updatedCount: 0, syncedAccountsCount: 0 };
    }

    // Pastikan kelas target benar-benar tersimpan di Firestore
    if (!classes.some((c) => c.id === targetClass.id)) {
      await saveClassroom({
        ...targetClass,
        studentCount: 0,
      });
    }

    let updatedCount = 0;
    let syncedAccountsCount = 0;
    const nextClassLabel = formatStudentAccountClassLabel(targetClass.paket, targetClass.name);

    for (const stu of targetStudents) {
      await saveStudent({
        id: stu.id,
        ownerUid: stu.ownerUid,
        nis: stu.nis,
        nisn: stu.nisn,
        fullName: stu.fullName,
        gender: stu.gender,
        paket: targetClass.paket,
        classId: targetClass.id,
        className: targetClass.name,
        email: stu.email,
        phone: stu.phone,
        address: stu.address,
        guardianName: stu.guardianName,
        status: stu.status,
      });
      updatedCount++;

      if (
        accounts.some(
          (a) =>
            a.role === 'murid' &&
            (a.linkedEntityId === stu.id || (stu.ownerUid && a.uid === stu.ownerUid)) &&
            a.classLabel !== nextClassLabel
        )
      ) {
        syncedAccountsCount++;
      }
    }

    return { updatedCount, syncedAccountsCount };
  };

  const syncStudentAccountClassLabels: DataContextValue['syncStudentAccountClassLabels'] = async () => {
    if (authMode !== 'firebase' || !firebaseUser || !isBootstrappedAdmin) return 0;

    const studentById = new Map(students.map((s) => [s.id, s]));
    const studentByNis = new Map(
      students.filter((s) => s.nis).map((s) => [s.nis.trim().toLowerCase(), s])
    );
    const studentByOwnerUid = new Map(
      students.filter((s) => s.ownerUid).map((s) => [s.ownerUid, s])
    );
    const studentByName = new Map<string, Student>();
    const dupNames = new Set<string>();
    students.forEach((s) => {
      const key = s.fullName.trim().toLowerCase();
      if (!key) return;
      if (studentByName.has(key)) dupNames.add(key);
      else studentByName.set(key, s);
    });

    const updates: Array<{ docId: string; nextLabel: string; stuId: string; nis: string }> = [];
    for (const acc of accounts) {
      if (acc.role !== 'murid') continue;
      const cleanAccName = acc.name.trim().toLowerCase();
      const stu =
        (acc.linkedEntityId ? studentById.get(acc.linkedEntityId) : undefined) ||
        (acc.nis ? studentByNis.get(acc.nis.trim().toLowerCase()) : undefined) ||
        studentByOwnerUid.get(acc.uid) ||
        (!dupNames.has(cleanAccName) ? studentByName.get(cleanAccName) : undefined);
      if (!stu) continue;
      const expectedLabel = resolveStudentPlacement(stu, classes).fullClassLabel;
      if ((acc.classLabel || '') !== expectedLabel || acc.linkedEntityId !== stu.id) {
        updates.push({
          docId: acc.docId || acc.uid,
          nextLabel: expectedLabel,
          stuId: stu.id,
          nis: acc.nis || stu.nis,
        });
      }
    }

    if (updates.length === 0) return 0;

    await Promise.all(
      updates.map((u) =>
        updateDoc(doc(db, 'users', u.docId), {
          classLabel: u.nextLabel,
          linkedEntityId: u.stuId,
          ...(u.nis ? { nis: u.nis } : {}),
          updatedAt: serverTimestamp(),
        }).catch(() => {})
      )
    );

    return updates.length;
  };

  const syncClassroomsAndStudents: DataContextValue['syncClassroomsAndStudents'] = async () => {
    if (authMode !== 'firebase' || !firebaseUser || !isBootstrappedAdmin) {
      return { fixedStudents: 0, updatedClasses: 0, syncedAccounts: 0 };
    }

    const adminUid = firebaseUser.uid;
    let fixedStudents = 0;
    let updatedClasses = 0;

    // 1. Petakan semua guru (wali kelas + pengampu) per kelas agar guru selalu bisa melihat murid kelas ampuan
    const teacherUidsByClassId = new Map<string, string[]>();
    const addTeacherUid = (classId: string, tUid?: string) => {
      if (!classId || !tUid) return;
      const list = teacherUidsByClassId.get(classId) || [];
      if (!list.includes(tUid)) {
        list.push(tUid);
        teacherUidsByClassId.set(classId, list);
      }
    };

    classes.forEach((cls) => {
      if (cls.homeroomTeacherId) {
        const tch = teachers.find((t) => t.id === cls.homeroomTeacherId);
        if (tch?.ownerUid) addTeacherUid(cls.id, tch.ownerUid);
        const tchAcc = accounts.find(
          (a) => a.role === 'guru' && a.linkedEntityId === cls.homeroomTeacherId
        );
        if (tchAcc?.uid) addTeacherUid(cls.id, tchAcc.uid);
      }
    });

    assignments.forEach((asg) => {
      if (asg.teacherUid) addTeacherUid(asg.classId, asg.teacherUid);
      if (asg.teacherId) {
        const tch = teachers.find((t) => t.id === asg.teacherId);
        if (tch?.ownerUid) addTeacherUid(asg.classId, tch.ownerUid);
      }
    });

    // 2. Pastikan setiap murid terikat pada classId, className, paket & accessUids yang benar
    for (const stu of students) {
      const placed = resolveStudentPlacement(stu, classes);
      const targetCls = classes.find((c) => c.id === placed.classId);
      const nextClassId = targetCls?.id || stu.classId;
      const nextClassName = targetCls?.name || placed.className;
      const nextPaket = targetCls?.paket || placed.paket;
      const expectedTeacherUids = teacherUidsByClassId.get(nextClassId) || [];
      const mergedAccess = Array.from(
        new Set([...(stu.accessUids || []), adminUid, ...expectedTeacherUids].filter(Boolean))
      ).slice(0, 30);

      const accessChanged = mergedAccess.some((u) => !(stu.accessUids || []).includes(u));
      const placementChanged =
        stu.classId !== nextClassId ||
        stu.className !== nextClassName ||
        stu.paket !== nextPaket;

      if (placementChanged || accessChanged) {
        await updateDoc(doc(db, 'students', stu.id), {
          paket: nextPaket,
          classId: nextClassId,
          className: nextClassName,
          accessUids: mergedAccess,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        fixedStudents++;
      }
    }

    // 3. Perbarui studentCount & capacity pada dokumen kelas di Firestore sesuai jumlah murid aktual
    for (const cls of classes) {
      const actualCount = getStudentsForClassroom(cls, students, classes).length;
      const boundedCount = Math.max(0, Math.min(100, actualCount));
      const nextCapacity = Math.max(cls.capacity || 35, boundedCount, 1);
      if (cls.studentCount !== boundedCount || cls.capacity < boundedCount) {
        await updateDoc(doc(db, 'classes', cls.id), {
          studentCount: boundedCount,
          capacity: Math.min(100, nextCapacity),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        updatedClasses++;
      }
    }

    // 4. Sinkronkan classLabel akun login murid terkait
    const syncedAccounts = await syncStudentAccountClassLabels();

    return { fixedStudents, updatedClasses, syncedAccounts };
  };

  const applyCanonicalCipanasSpreadsheetData: DataContextValue['applyCanonicalCipanasSpreadsheetData'] = useCallback(async () => {
    const academicYear = schoolSettings.academicYear || '2026/2027';

    // Mode Demo / Lokal
    if (authMode !== 'firebase' || !firebaseUser) {
      const uid = profile?.uid || 'demo_admin_01';
      const nextClasses: Classroom[] = CIPANAS_CLASSES.map((c) => ({
        ...c,
        academicYear,
        createdBy: uid,
      }));
      const nextStudents: Student[] = CIPANAS_STUDENTS.map(({ hasExplicitCsvNis: _flag, ...s }) => ({
        ...s,
        accessUids: [uid],
        createdBy: uid,
      }));
      setClasses(nextClasses);
      setStudents(nextStudents);
      persistDemoCache({ classes: nextClasses, students: nextStudents });
      return {
        totalClasses: nextClasses.length,
        totalStudents: nextStudents.length,
        createdStudents: nextStudents.length,
        updatedStudents: 0,
        removedLegacyStudents: 0,
        removedLegacyClasses: 0,
        syncedAccounts: 0,
      };
    }

    if (!isBootstrappedAdmin) {
      throw new Error('Hanya Administrator aktif yang dapat merapikan data rombel & siswa secara massal.');
    }

    const adminUid = firebaseUser.uid;
    const normStr = (val?: string) => String(val || '').trim().replace(/\s+/g, ' ').toLowerCase();

    type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;
    const commitChunked = async (ops: BatchOp[]) => {
      const CHUNK_SIZE = 350;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const slice = ops.slice(i, i + CHUNK_SIZE);
        slice.forEach((fn) => fn(batch));
        await batch.commit();
      }
    };

    // Ambil snapshot terbaru langsung dari Firestore agar tidak memakai state usang
    const [
      classesSnap,
      studentsSnap,
      teachersSnap,
      assignmentsSnap,
      usersSnap,
      credsSnap,
    ] = await Promise.all([
      getDocs(query(collection(db, 'classes'), where('status', 'in', ['Aktif', 'Arsip']))),
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'teachers')),
      getDocs(query(collection(db, 'assignments'), where('status', 'in', ['Aktif', 'Selesai']))),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'login_card_credentials')).catch(() => null),
    ]);

    const liveClasses = classesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Classroom, 'id'>),
    }));
    const liveStudents = studentsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Student, 'id'>),
    }));
    const liveTeachers = teachersSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Teacher, 'id'>),
    }));
    const liveAssignments = assignmentsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TeachingAssignment, 'id'>),
    }));
    const liveUsers: Array<Record<string, unknown> & { docId: string }> = usersSnap.docs.map((d) => ({
      ...(d.data() as Record<string, unknown>),
      docId: d.id,
    }));
    const liveCredIds = new Set(credsSnap ? credsSnap.docs.map((d) => d.id) : []);

    const liveClassById = new Map(liveClasses.map((c) => [c.id, c]));
    const liveClassByName = new Map(liveClasses.map((c) => [normStr(c.name), c]));
    const canonicalClassIds = new Set(CIPANAS_CLASSES.map((c) => c.id));
    const canonicalClassById = new Map(CIPANAS_CLASSES.map((c) => [c.id, c]));

    // =========================================================================
    // FASE 1: Siapkan 9 Rombel Cipanas (WAJIB commit lebih dulu karena rules students create memeriksa exists(classes/classId))
    // =========================================================================
    const phase1Ops: BatchOp[] = [];
    for (const c of CIPANAS_CLASSES) {
      const existingById = liveClassById.get(c.id);
      const existingByName = liveClassByName.get(normStr(c.name));
      const existingHomeroom = existingById || existingByName;
      const homeroomTeacherId = existingHomeroom?.homeroomTeacherId || c.homeroomTeacherId || '';
      const homeroomTeacherName =
        existingHomeroom?.homeroomTeacherName && existingHomeroom.homeroomTeacherName !== 'Belum Ditentukan'
          ? existingHomeroom.homeroomTeacherName
          : c.homeroomTeacherName;
      const finalCapacity = Math.min(100, Math.max(c.capacity, c.studentCount, 1));
      const clsRef = doc(db, 'classes', c.id);

      if (existingById) {
        phase1Ops.push((batch) => {
          batch.update(clsRef, {
            name: c.name,
            paket: c.paket,
            gradeLevel: c.gradeLevel,
            homeroomTeacherId,
            homeroomTeacherName: homeroomTeacherName.slice(0, 120),
            academicYear,
            capacity: finalCapacity,
            studentCount: c.studentCount,
            status: 'Aktif',
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        phase1Ops.push((batch) => {
          batch.set(clsRef, {
            name: c.name,
            paket: c.paket,
            gradeLevel: c.gradeLevel,
            homeroomTeacherId,
            homeroomTeacherName: homeroomTeacherName.slice(0, 120),
            academicYear,
            capacity: finalCapacity,
            studentCount: c.studentCount,
            status: 'Aktif',
            createdBy: adminUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      }
    }
    await commitChunked(phase1Ops);

    // Petakan akses guru per Cipanas classId agar guru langsung bisa melihat seluruh murid rombel ampuan
    const teacherUidsByClassId = new Map<string, string[]>();
    const addTeacherUid = (cid: string, tUid?: string) => {
      if (!cid || !tUid) return;
      const list = teacherUidsByClassId.get(cid) || [];
      if (!list.includes(tUid)) {
        list.push(tUid);
        teacherUidsByClassId.set(cid, list);
      }
    };
    CIPANAS_CLASSES.forEach((c) => {
      if (c.homeroomTeacherId) {
        const tch = liveTeachers.find((t) => t.id === c.homeroomTeacherId);
        if (tch?.ownerUid) addTeacherUid(c.id, tch.ownerUid);
        const tchUser = liveUsers.find(
          (u) => u.role === 'guru' && u.linkedEntityId === c.homeroomTeacherId
        );
        if (typeof tchUser?.uid === 'string') addTeacherUid(c.id, tchUser.uid);
      }
    });
    liveAssignments.forEach((asg) => {
      const mappedClassId = LEGACY_CLASS_ID_TO_CIPANAS[asg.classId] || asg.classId;
      if (asg.teacherUid) addTeacherUid(mappedClassId, asg.teacherUid);
      const tch = liveTeachers.find((t) => t.id === asg.teacherId);
      if (tch?.ownerUid) addTeacherUid(mappedClassId, tch.ownerUid);
    });

    // Indeks akun login murid yang sudah ada agar NIS/ownerUid akun login yang sudah dicetak tidak pernah putus!
    const muridUsers = liveUsers.filter((u) => u.role === 'murid');
    const userByLinkedStudentId = new Map<string, Record<string, unknown>>();
    const userByUid = new Map<string, Record<string, unknown>>();
    const userByNis = new Map<string, Record<string, unknown>>();
    const userByName = new Map<string, Record<string, unknown>>();
    muridUsers.forEach((u) => {
      if (typeof u.linkedEntityId === 'string' && u.linkedEntityId) {
        userByLinkedStudentId.set(u.linkedEntityId, u);
      }
      if (typeof u.uid === 'string' && u.uid) {
        userByUid.set(u.uid, u);
      }
      if (typeof u.nis === 'string' && u.nis.trim()) {
        userByNis.set(u.nis.trim().toLowerCase(), u);
      }
      if (typeof u.name === 'string' && u.name.trim()) {
        userByName.set(normStr(u.name), u);
      }
    });

    // Indeks dokumen students yang sudah ada di Firestore (prioritaskan yg punya akun login aktif jika ada duplikat)
    const studentHasLoginAccount = (s: Student) =>
      userByLinkedStudentId.has(s.id) ||
      (Boolean(s.ownerUid) && userByUid.has(s.ownerUid)) ||
      (Boolean(s.nis) && userByNis.has(s.nis.trim().toLowerCase()));

    const sortedLiveStudents = [...liveStudents].sort((a, b) => {
      const aHas = studentHasLoginAccount(a) ? 1 : 0;
      const bHas = studentHasLoginAccount(b) ? 1 : 0;
      return bHas - aHas;
    });

    const existingByNisn = new Map<string, Student[]>();
    const existingByNis = new Map<string, Student[]>();
    const existingByName = new Map<string, Student[]>();
    sortedLiveStudents.forEach((s) => {
      if (s.nisn && s.nisn.trim()) {
        const k = s.nisn.trim().toLowerCase();
        existingByNisn.set(k, [...(existingByNisn.get(k) || []), s]);
      }
      if (s.nis && s.nis.trim()) {
        const k = s.nis.trim().toLowerCase();
        existingByNis.set(k, [...(existingByNis.get(k) || []), s]);
      }
      const nKey = normStr(s.fullName);
      if (nKey) {
        existingByName.set(nKey, [...(existingByName.get(nKey) || []), s]);
      }
    });

    // =========================================================================
    // FASE 2: Sinkronkan seluruh 238 Siswa Cipanas + bersihkan data dummy/duplikat
    // =========================================================================
    const phase2Ops: BatchOp[] = [];
    const claimedStudentIds = new Set<string>();
    const usedFinalNis = new Set<string>();
    const canonicalNisnSet = new Set(
      CIPANAS_STUDENTS.map((s) => (s.nisn || '').trim().toLowerCase()).filter(Boolean)
    );
    const canonicalNameSet = new Set(CIPANAS_STUDENTS.map((s) => normStr(s.fullName)));

    interface ResolvedCanonicalStudent {
      id: string;
      nis: string;
      nisn: string;
      fullName: string;
      classId: string;
      className: string;
      paket: PaketType;
      ownerUid: string;
    }
    const resolvedCanonicalList: ResolvedCanonicalStudent[] = [];

    let createdStudents = 0;
    let updatedStudents = 0;
    let fallbackNisSeq = 9001;

    for (const seed of CIPANAS_STUDENTS) {
      const nisnKey = (seed.nisn || '').trim().toLowerCase();
      const csvNisKey = seed.hasExplicitCsvNis ? seed.nis.trim().toLowerCase() : '';
      const nameKey = normStr(seed.fullName);

      const pickUnclaimed = (list?: Student[]) => list?.find((s) => !claimedStudentIds.has(s.id));
      const matched =
        (nisnKey ? pickUnclaimed(existingByNisn.get(nisnKey)) : undefined) ||
        (csvNisKey ? pickUnclaimed(existingByNis.get(csvNisKey)) : undefined) ||
        pickUnclaimed(existingByName.get(nameKey));

      const teacherUids = teacherUidsByClassId.get(seed.classId) || [];

      if (matched) {
        claimedStudentIds.add(matched.id);
        const linkedAcc =
          userByLinkedStudentId.get(matched.id) ||
          (matched.ownerUid ? userByUid.get(matched.ownerUid) : undefined) ||
          (matched.nis ? userByNis.get(matched.nis.trim().toLowerCase()) : undefined);

        // Pertahankan NIS existing bila siswa sudah punya akun login atau CSV NIS kosong
        let finalNis = seed.hasExplicitCsvNis ? seed.nis : matched.nis || seed.nis;
        if (linkedAcc && typeof linkedAcc.nis === 'string' && linkedAcc.nis.trim().length >= 3) {
          finalNis = linkedAcc.nis.trim().slice(0, 32);
        }
        if (finalNis.length < 3) finalNis = seed.nis;
        usedFinalNis.add(finalNis.toLowerCase());

        const mergedAccess = Array.from(
          new Set([...(matched.accessUids || []), adminUid, ...teacherUids].filter(Boolean))
        ).slice(0, 30);

        const stuRef = doc(db, 'students', matched.id);
        const safeNisn = (seed.nisn || '').slice(0, 32);
        phase2Ops.push((batch) => {
          batch.update(stuRef, {
            nis: finalNis,
            nisn: safeNisn,
            fullName: seed.fullName.slice(0, 120),
            gender: seed.gender,
            paket: seed.paket,
            classId: seed.classId,
            className: seed.className.slice(0, 80),
            email: (seed.email || matched.email || '').slice(0, 160),
            phone: (seed.phone || matched.phone || '').slice(0, 32),
            address: (seed.address || matched.address || '').slice(0, 250),
            guardianName: (seed.guardianName || matched.guardianName || '').slice(0, 120),
            status: seed.status,
            accessUids: mergedAccess,
            updatedAt: serverTimestamp(),
          });
        });

        resolvedCanonicalList.push({
          id: matched.id,
          nis: finalNis,
          nisn: safeNisn,
          fullName: seed.fullName,
          classId: seed.classId,
          className: seed.className,
          paket: seed.paket,
          ownerUid: matched.ownerUid || seed.ownerUid,
        });
        updatedStudents++;
      } else {
        let finalNis = seed.nis;
        while (usedFinalNis.has(finalNis.toLowerCase())) {
          finalNis = `2026${String(fallbackNisSeq++).padStart(4, '0')}`;
        }
        usedFinalNis.add(finalNis.toLowerCase());

        const linkedAccByName = userByName.get(nameKey);
        const ownerUid =
          (typeof linkedAccByName?.uid === 'string' && linkedAccByName.uid) || seed.ownerUid;
        const mergedAccess = Array.from(new Set([adminUid, ...teacherUids].filter(Boolean))).slice(
          0,
          30
        );

        const stuRef = doc(db, 'students', seed.id);
        const safeNisn = (seed.nisn || '').slice(0, 32);
        phase2Ops.push((batch) => {
          batch.set(stuRef, {
            nis: finalNis.slice(0, 32),
            nisn: safeNisn,
            fullName: seed.fullName.slice(0, 120),
            gender: seed.gender,
            paket: seed.paket,
            classId: seed.classId,
            className: seed.className.slice(0, 80),
            email: (seed.email || '').slice(0, 160),
            phone: (seed.phone || '').slice(0, 32),
            address: (seed.address || '').slice(0, 250),
            guardianName: (seed.guardianName || '').slice(0, 120),
            status: seed.status,
            ownerUid,
            accessUids: mergedAccess,
            createdBy: adminUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        resolvedCanonicalList.push({
          id: seed.id,
          nis: finalNis,
          nisn: safeNisn,
          fullName: seed.fullName,
          classId: seed.classId,
          className: seed.className,
          paket: seed.paket,
          ownerUid,
        });
        createdStudents++;
      }
    }

    // Hapus siswa dummy bawaan (mrd_01..mrd_14) dan duplikat NISN/nama yang sudah digabungkan
    let removedLegacyStudents = 0;
    const legacyDummyNames = new Set([
      'budi santoso',
      'sari wulandari',
      'dimas pratama',
      'nadia putri azzahra',
      'raka mahendra',
      'rizky ramadhan',
      'aulia rahmawati',
      'farhan al-farizi',
      'muhammad farhan',
      'intan permatasari',
      'laila nurjanah',
      'ilham nugroho',
      'ilham saputra',
      'maya safitri',
      'fitri handayani',
      'bagas prasetyo',
      'bagas kurniawan',
      'zahra khairunnisa',
      'rafi akbar',
      'rafiq alfarizi',
      'dina maharani',
    ]);

    for (const s of liveStudents) {
      if (claimedStudentIds.has(s.id)) continue;
      const sNisn = (s.nisn || '').trim().toLowerCase();
      const sName = normStr(s.fullName);
      const isDummy = LEGACY_DEMO_STUDENT_IDS.has(s.id) || legacyDummyNames.has(sName);
      const isDuplicateOfCanonical = (Boolean(sNisn) && canonicalNisnSet.has(sNisn)) || canonicalNameSet.has(sName);
      if (isDummy || isDuplicateOfCanonical) {
        const stuRef = doc(db, 'students', s.id);
        phase2Ops.push((batch) => {
          batch.delete(stuRef);
        });
        removedLegacyStudents++;
      }
    }

    await commitChunked(phase2Ops);

    // =========================================================================
    // FASE 3: Perbarui penugasan mengajar, akun login murid, kartu login & hapus rombel lama
    // =========================================================================
    const phase3Ops: BatchOp[] = [];

    // 3a. Remap penugasan mengajar yang masih merujuk classId lama
    for (const asg of liveAssignments) {
      const mappedId = LEGACY_CLASS_ID_TO_CIPANAS[asg.classId];
      const targetCls = mappedId ? canonicalClassById.get(mappedId) : undefined;
      if (targetCls && (asg.classId !== targetCls.id || asg.className !== targetCls.name)) {
        const asgRef = doc(db, 'assignments', asg.id);
        phase3Ops.push((batch) => {
          batch.update(asgRef, {
            classId: targetCls.id,
            className: targetCls.name,
            paket: targetCls.paket,
            updatedAt: serverTimestamp(),
          });
        });
      }
    }

    // 3b. Sinkronkan classLabel & linkedEntityId pada users (murid) dan login_card_credentials
    const canonById = new Map(resolvedCanonicalList.map((s) => [s.id, s]));
    const canonByOwnerUid = new Map(resolvedCanonicalList.map((s) => [s.ownerUid, s]));
    const canonByNis = new Map(resolvedCanonicalList.map((s) => [s.nis.trim().toLowerCase(), s]));
    const canonByName = new Map(resolvedCanonicalList.map((s) => [normStr(s.fullName), s]));

    let syncedAccounts = 0;
    for (const acc of muridUsers) {
      const uid = String(acc.uid || acc.docId);
      const docId = String(acc.docId || uid);
      const accLinked = typeof acc.linkedEntityId === 'string' ? acc.linkedEntityId : '';
      const accNis = typeof acc.nis === 'string' ? acc.nis.trim().toLowerCase() : '';
      const accName = typeof acc.name === 'string' ? normStr(acc.name) : '';

      const stu =
        (accLinked ? canonById.get(accLinked) : undefined) ||
        canonByOwnerUid.get(uid) ||
        (accNis ? canonByNis.get(accNis) : undefined) ||
        (accName ? canonByName.get(accName) : undefined);

      if (!stu) continue;

      const expectedLabel = formatStudentAccountClassLabel(stu.paket, stu.className);
      if (acc.classLabel !== expectedLabel || acc.linkedEntityId !== stu.id) {
        const userRef = doc(db, 'users', docId);
        phase3Ops.push((batch) => {
          batch.update(userRef, {
            classLabel: expectedLabel,
            linkedEntityId: stu.id,
            nis: (typeof acc.nis === 'string' && acc.nis.trim() ? acc.nis.trim() : stu.nis).slice(0, 32),
            updatedAt: serverTimestamp(),
          });
        });
        syncedAccounts++;
      }

      if (liveCredIds.has(uid)) {
        const credRef = doc(db, 'login_card_credentials', uid);
        phase3Ops.push((batch) => {
          batch.update(credRef, {
            classLabel: expectedLabel,
            updatedBy: adminUid,
            updatedAt: serverTimestamp(),
          });
        });
      }
    }

    // 3c. Hapus rombel placeholder lama (Paket A - Kelas 6A, Paket C - Kelas 10 IPS, dst) & duplikat nama Cipanas ber-ID acak
    const canonicalNameLowerSet = new Set(CIPANAS_CLASSES.map((c) => normStr(c.name)));
    let removedLegacyClasses = 0;
    for (const cls of liveClasses) {
      if (canonicalClassIds.has(cls.id)) continue;
      const clsNameLower = normStr(cls.name);
      const isLegacyPlaceholder =
        LEGACY_PLACEHOLDER_CLASS_IDS.has(cls.id) ||
        LEGACY_PLACEHOLDER_CLASS_NAMES.has(clsNameLower) ||
        canonicalNameLowerSet.has(clsNameLower);
      if (isLegacyPlaceholder) {
        const clsRef = doc(db, 'classes', cls.id);
        phase3Ops.push((batch) => {
          batch.delete(clsRef);
        });
        removedLegacyClasses++;
      }
    }

    await commitChunked(phase3Ops);

    return {
      totalClasses: CIPANAS_CLASSES.length,
      totalStudents: resolvedCanonicalList.length,
      createdStudents,
      updatedStudents,
      removedLegacyStudents,
      removedLegacyClasses,
      syncedAccounts,
    };
  }, [authMode, firebaseUser, isBootstrappedAdmin, profile?.uid, schoolSettings.academicYear, persistDemoCache]);

  // Otomatis rapikan rombel & data siswa Cipanas sekali saat Admin login jika masih ditemukan rombel placeholder lama
  useEffect(() => {
    if (
      authMode !== 'firebase' ||
      !firebaseUser ||
      !isBootstrappedAdmin ||
      loading ||
      autoReconciledCipanasRef.current
    ) {
      return;
    }
    if (classes.length === 0 && students.length === 0) return;

    const hasLegacyClass = classes.some(
      (c) =>
        LEGACY_PLACEHOLDER_CLASS_IDS.has(c.id) ||
        LEGACY_PLACEHOLDER_CLASS_NAMES.has(c.name.trim().replace(/\s+/g, ' ').toLowerCase())
    );
    const hasAllNineCipanas = CIPANAS_CLASSES.every((cc) => classes.some((c) => c.id === cc.id));

    if (hasLegacyClass || !hasAllNineCipanas) {
      autoReconciledCipanasRef.current = true;
      applyCanonicalCipanasSpreadsheetData().catch((err) => {
        console.error('Gagal melakukan penyesuaian otomatis rombel Cipanas:', err);
      });
    } else {
      autoReconciledCipanasRef.current = true;
    }
  }, [
    authMode,
    firebaseUser,
    isBootstrappedAdmin,
    loading,
    classes,
    students.length,
    applyCanonicalCipanasSpreadsheetData,
  ]);

  const saveTeacher: DataContextValue['saveTeacher'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('guru');
    const existingItem = teachers.find((t) => t.id === id);
    const rawOwnerUid = String(
      item.ownerUid || existingItem?.ownerUid || `uid_${String(item.nip || id).replace(/[^a-zA-Z0-9]/g, '')}`
    ).trim();
    const resolvedOwnerUid = /^[a-zA-Z0-9_-]{1,128}$/.test(rawOwnerUid)
      ? rawOwnerUid
      : `uid_${id.replace(/[^a-zA-Z0-9_-]/g, '')}`.slice(0, 128);
    const mergedAccess = Array.from(
      new Set([...(existingItem?.accessUids || []), uid, resolvedOwnerUid].filter(Boolean))
    ).slice(0, 30);
    const rawNip = String(item.nip || '').trim();
    const safeNip = (rawNip.length >= 3 ? rawNip : `GURU${id.slice(-6)}`).slice(0, 32);
    const rawName = String(item.fullName || '').trim();
    const safeName = (rawName.length >= 2 ? rawName : 'Tutor PKBM').slice(0, 120);
    const rawSpec = String(item.specialization || '').trim();
    const safeSpec = (rawSpec.length >= 2 ? rawSpec : 'Guru Mata Pelajaran').slice(0, 120);
    const fullItem: Teacher = {
      ...item,
      id,
      nip: safeNip,
      fullName: safeName,
      email: String(item.email || '').trim().slice(0, 160),
      phone: String(item.phone || '').trim().slice(0, 32),
      specialization: safeSpec,
      education: String(item.education || '').trim().slice(0, 60),
      ownerUid: resolvedOwnerUid,
      accessUids: mergedAccess,
      createdBy: existingItem?.createdBy || uid,
    };

    if (authMode === 'firebase' && firebaseUser) {
      let existsInDb = Boolean(existingItem);
      try {
        const docRef = doc(db, 'teachers', id);
        if (!existsInDb) {
          const snap = await getDoc(docRef);
          existsInDb = snap.exists();
        }
        if (existsInDb) {
          await updateDoc(docRef, {
            nip: fullItem.nip,
            fullName: fullItem.fullName,
            gender: fullItem.gender,
            email: fullItem.email || '',
            phone: fullItem.phone || '',
            specialization: fullItem.specialization,
            education: fullItem.education || '',
            status: fullItem.status,
            ownerUid: fullItem.ownerUid,
            accessUids: fullItem.accessUids,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            nip: fullItem.nip,
            fullName: fullItem.fullName,
            gender: fullItem.gender,
            email: fullItem.email || '',
            phone: fullItem.phone || '',
            specialization: fullItem.specialization,
            education: fullItem.education || '',
            status: fullItem.status,
            ownerUid: fullItem.ownerUid,
            accessUids: fullItem.accessUids,
            createdBy: fullItem.createdBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existsInDb ? OperationType.UPDATE : OperationType.CREATE, `teachers/${id}`);
      }
    } else {
      setTeachers((prev) => {
        const hasExisting = prev.some((t) => t.id === id);
        const next = hasExisting
          ? prev.map((t) => (t.id === id ? fullItem : t))
          : [fullItem, ...prev];
        persistDemoCache({ teachers: next });
        return next;
      });
    }
    return fullItem;
  };

  const deleteTeacher = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'teachers', id));
        // Hapus akun login guru yang tertaut agar tidak muncul lagi sebagai akun tanpa data master
        const linkedUsers = await getDocs(
          query(collection(db, 'users'), where('linkedEntityId', '==', id))
        ).catch(() => null);
        if (linkedUsers && !linkedUsers.empty) {
          await Promise.all(
            linkedUsers.docs
              .filter((uDoc) => uDoc.id !== firebaseUser.uid)
              .map(async (uDoc) => {
                const uname = normalizeUsername(String(uDoc.data()?.username || ''));
                if (uname) {
                  await deleteDoc(doc(db, 'account_lookups', uname)).catch(() => {});
                }
                await deleteDoc(uDoc.ref).catch(() => {});
              })
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `teachers/${id}`);
      }
    } else {
      const next = teachers.filter((t) => t.id !== id);
      setTeachers(next);
      persistDemoCache({ teachers: next });
    }
  };

  const saveSubject: DataContextValue['saveSubject'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('mp');
    const existingItem = subjects.find((s) => s.id === id);
    const fullItem: Subject = {
      ...item,
      id,
      code: String(item.code || '').trim().slice(0, 24),
      name: String(item.name || '').trim().slice(0, 120),
      hoursPerWeek: Math.max(1, Math.min(20, Number(item.hoursPerWeek) || 2)),
      kkm: Math.max(0, Math.min(100, Number(item.kkm) || 75)),
      createdBy: existingItem?.createdBy || uid,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'subjects', id);
        if (existingItem) {
          await updateDoc(docRef, {
            code: fullItem.code,
            name: fullItem.name,
            paket: fullItem.paket,
            category: fullItem.category,
            hoursPerWeek: fullItem.hoursPerWeek,
            kkm: fullItem.kkm,
            status: fullItem.status,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            code: fullItem.code,
            name: fullItem.name,
            paket: fullItem.paket,
            category: fullItem.category,
            hoursPerWeek: fullItem.hoursPerWeek,
            kkm: fullItem.kkm,
            status: fullItem.status,
            createdBy: fullItem.createdBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `subjects/${id}`);
      }
    } else {
      const next = existingItem
        ? subjects.map((s) => (s.id === id ? fullItem : s))
        : [fullItem, ...subjects];
      setSubjects(next);
      persistDemoCache({ subjects: next });
    }
  };

  const deleteSubject = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'subjects', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `subjects/${id}`);
      }
    } else {
      const next = subjects.filter((s) => s.id !== id);
      setSubjects(next);
      persistDemoCache({ subjects: next });
    }
  };

  const saveClassroom: DataContextValue['saveClassroom'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('cls');
    const existingItem = classes.find((c) => c.id === id);
    const homeroomName = String(item.homeroomTeacherName || 'Belum Ditentukan').trim();
    const safeHomeroomName = (homeroomName.length >= 2 ? homeroomName : 'Belum Ditentukan').slice(0, 120);
    const rawClsName = String(item.name || '').trim();
    const safeClsName = (rawClsName.length >= 2 ? rawClsName : `${item.paket} - Rombel Baru`).slice(0, 80);
    const rawGrade = String(item.gradeLevel || '').trim();
    const safeGrade = (rawGrade.length >= 1 ? rawGrade : item.paket).slice(0, 40);
    const rawYear = String(item.academicYear || '2026/2027').trim();
    const safeYear = (rawYear.length >= 4 ? rawYear : '2026/2027').slice(0, 20);
    const fullItem: Classroom = {
      ...item,
      id,
      name: safeClsName,
      gradeLevel: safeGrade,
      homeroomTeacherId: (item.homeroomTeacherId || '').slice(0, 128),
      homeroomTeacherName: safeHomeroomName,
      academicYear: safeYear,
      capacity: Math.max(1, Math.min(100, Number(item.capacity) || 30)),
      studentCount: Math.max(0, Math.min(100, Number(item.studentCount) || 0)),
      createdBy: existingItem?.createdBy || uid,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'classes', id);
        if (existingItem) {
          await updateDoc(docRef, {
            name: fullItem.name,
            paket: fullItem.paket,
            gradeLevel: fullItem.gradeLevel,
            homeroomTeacherId: fullItem.homeroomTeacherId || '',
            homeroomTeacherName: fullItem.homeroomTeacherName,
            academicYear: fullItem.academicYear,
            capacity: fullItem.capacity,
            studentCount: fullItem.studentCount,
            status: fullItem.status,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            name: fullItem.name,
            paket: fullItem.paket,
            gradeLevel: fullItem.gradeLevel,
            homeroomTeacherId: fullItem.homeroomTeacherId || '',
            homeroomTeacherName: fullItem.homeroomTeacherName,
            academicYear: fullItem.academicYear,
            capacity: fullItem.capacity,
            studentCount: fullItem.studentCount,
            status: fullItem.status,
            createdBy: fullItem.createdBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Pastikan wali kelas terpilih memiliki akses melihat seluruh murid di rombel ini
        if (fullItem.homeroomTeacherId) {
          const homeroomTeacher = teachers.find((t) => t.id === fullItem.homeroomTeacherId);
          const homeroomAccount = accounts.find(
            (a) => a.role === 'guru' && a.linkedEntityId === fullItem.homeroomTeacherId
          );
          const homeroomUids = Array.from(
            new Set([homeroomTeacher?.ownerUid, homeroomAccount?.uid].filter((x): x is string => Boolean(x)))
          );
          if (homeroomUids.length > 0) {
            const studentsInCls = getStudentsForClassroom(fullItem, students, classes);
            await Promise.all(
              studentsInCls
                .filter((s) => homeroomUids.some((hUid) => !(s.accessUids || []).includes(hUid)))
                .map((s) =>
                  updateDoc(doc(db, 'students', s.id), {
                    accessUids: Array.from(
                      new Set([...(s.accessUids || []), uid, ...homeroomUids])
                    ).slice(0, 30),
                    updatedAt: serverTimestamp(),
                  }).catch(() => {})
                )
            );
          }
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `classes/${id}`);
      }
    } else {
      const next = existingItem
        ? classes.map((c) => (c.id === id ? fullItem : c))
        : [fullItem, ...classes];
      setClasses(next);
      persistDemoCache({ classes: next });
    }
  };

  const deleteClassroom = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'classes', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `classes/${id}`);
      }
    } else {
      const next = classes.filter((c) => c.id !== id);
      setClasses(next);
      persistDemoCache({ classes: next });
    }
  };

  const syncKurikulumMerdekaSubjectsInternal = async (): Promise<{
    addedCount: number;
    updatedCount: number;
    totalCount: number;
    syncedSubjects: Subject[];
  }> => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    let currentSubjects: Subject[] = [...subjects];

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const snap = await getDocs(
          query(collection(db, 'subjects'), where('status', 'in', ['Aktif', 'Arsip']))
        );
        currentSubjects = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Subject, 'id'>),
        }));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'subjects');
      }
    }

    const byId = new Map(currentSubjects.map((s) => [s.id, s]));
    const byCode = new Map(
      currentSubjects.map((s) => [String(s.code || '').trim().toUpperCase(), s])
    );
    const byPaketName = new Map(
      currentSubjects.map((s) => [
        `${s.paket}|${String(s.name || '').trim().toLowerCase()}`,
        s,
      ])
    );

    let addedCount = 0;
    let updatedCount = 0;
    const toCreate: Subject[] = [];
    const toUpdate: Subject[] = [];

    for (const kmSub of KURIKULUM_MERDEKA_SUBJECTS) {
      const existingById = byId.get(kmSub.id);
      if (existingById) {
        const needsUpdate =
          existingById.name !== kmSub.name ||
          existingById.code !== kmSub.code ||
          existingById.paket !== kmSub.paket ||
          existingById.category !== kmSub.category ||
          existingById.status !== 'Aktif';
        if (needsUpdate) {
          const updated: Subject = {
            ...existingById,
            code: kmSub.code,
            name: kmSub.name,
            paket: kmSub.paket,
            category: kmSub.category,
            hoursPerWeek: kmSub.hoursPerWeek,
            kkm: kmSub.kkm,
            status: 'Aktif',
          };
          toUpdate.push(updated);
          byId.set(updated.id, updated);
          updatedCount += 1;
        }
        continue;
      }

      const dupByCode = byCode.get(kmSub.code.trim().toUpperCase());
      const dupByPaketName = byPaketName.get(
        `${kmSub.paket}|${kmSub.name.trim().toLowerCase()}`
      );
      if (dupByCode || dupByPaketName) {
        continue;
      }

      const created: Subject = {
        ...kmSub,
        createdBy: uid,
      };
      toCreate.push(created);
      byId.set(created.id, created);
      byCode.set(created.code.trim().toUpperCase(), created);
      byPaketName.set(`${created.paket}|${created.name.trim().toLowerCase()}`, created);
      addedCount += 1;
    }

    const syncedSubjects = Array.from(byId.values());

    if (authMode === 'firebase' && firebaseUser) {
      const allOps = [
        ...toCreate.map((s) => ({ type: 'create' as const, sub: s })),
        ...toUpdate.map((s) => ({ type: 'update' as const, sub: s })),
      ];
      for (let i = 0; i < allOps.length; i += 350) {
        const chunk = allOps.slice(i, i + 350);
        const batch = writeBatch(db);
        for (const op of chunk) {
          const ref = doc(db, 'subjects', op.sub.id);
          if (op.type === 'create') {
            batch.set(ref, {
              code: op.sub.code,
              name: op.sub.name,
              paket: op.sub.paket,
              category: op.sub.category,
              hoursPerWeek: op.sub.hoursPerWeek,
              kkm: op.sub.kkm,
              status: op.sub.status,
              createdBy: op.sub.createdBy,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.update(ref, {
              code: op.sub.code,
              name: op.sub.name,
              paket: op.sub.paket,
              category: op.sub.category,
              hoursPerWeek: op.sub.hoursPerWeek,
              kkm: op.sub.kkm,
              status: op.sub.status,
              updatedAt: serverTimestamp(),
            });
          }
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'subjects');
        }
      }
    } else if (toCreate.length > 0 || toUpdate.length > 0) {
      setSubjects(syncedSubjects);
      persistDemoCache({ subjects: syncedSubjects });
    }

    return {
      addedCount,
      updatedCount,
      totalCount: syncedSubjects.length,
      syncedSubjects,
    };
  };

  const syncKurikulumMerdekaSubjects: DataContextValue['syncKurikulumMerdekaSubjects'] = async () => {
    const res = await syncKurikulumMerdekaSubjectsInternal();
    return {
      addedCount: res.addedCount,
      updatedCount: res.updatedCount,
      totalCount: res.totalCount,
    };
  };

  const autoDistributeTeachersAllClasses: DataContextValue['autoDistributeTeachersAllClasses'] = async () => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';

    // 1. Pastikan seluruh 42 mata pelajaran Kurikulum Merdeka (Paket A, B, C termasuk Pramuka & Menjahit) tersedia
    const { syncedSubjects } = await syncKurikulumMerdekaSubjectsInternal();

    // 2. Ambil data live guru, akun, dan kelas terbaru agar sinkronisasi akurat
    let liveTeachers: Teacher[] = [...teachers];
    let liveAccounts: UserProfile[] = [...accounts];
    let liveClasses: Classroom[] = [...classes];

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const [tSnap, uSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'teachers')),
          getDocs(collection(db, 'users')),
          getDocs(query(collection(db, 'classes'), where('status', 'in', ['Aktif', 'Arsip']))),
        ]);
        liveTeachers = tSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Teacher, 'id'>),
        }));
        liveAccounts = uSnap.docs.map((d) => ({
          uid: d.id,
          ...(d.data() as Omit<UserProfile, 'uid'>),
        }));
        liveClasses = cSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Classroom, 'id'>),
        }));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'teachers');
      }
    }

    // 3. Rekonsiliasi 7 Guru / Tutor Resmi PKBM Annur Karisma (perbaikan ejaan EYD V + mapel ampuan resmi)
    const realNonDemoAccountUids = new Set(
      liveAccounts.filter((a) => !a.uid.startsWith('demo_')).map((a) => a.uid)
    );
    const workingTeachers: Teacher[] = [...liveTeachers];
    const teacherIdsToDelete = new Set<string>();
    const canonicalResolvedTeacherIds = new Map<string, Teacher>();

    for (const canon of CANONICAL_PKBM_TEACHERS) {
      // Cari semua baris guru yang namanya cocok dengan guru resmi ini (termasuk variasi typo)
      const nameMatchedDocs = workingTeachers.filter(
        (t) =>
          !teacherIdsToDelete.has(t.id) &&
          findCanonicalTeacherByName(t.fullName)?.id === canon.id
      );

      // Cari akun pengguna yang sesuai (prioritas role guru, lalu nama cocok mis. Admin Ahmad Reza Pahlevi)
      const matchedAccount =
        liveAccounts.find(
          (a) => a.role === 'guru' && findCanonicalTeacherByName(a.name)?.id === canon.id
        ) ||
        liveAccounts.find((a) => findCanonicalTeacherByName(a.name)?.id === canon.id) ||
        null;

      let primaryDoc: Teacher | undefined =
        nameMatchedDocs.find(
          (t) =>
            (matchedAccount && (t.ownerUid === matchedAccount.uid || matchedAccount.linkedEntityId === t.id)) ||
            realNonDemoAccountUids.has(t.ownerUid)
        ) || nameMatchedDocs[0];

      // Jika belum ada yang cocok nama, cek apakah slot ID bawaan (guru_01..guru_07) ditempati data dummy lama
      let replacingLegacyDummy = false;
      if (!primaryDoc) {
        const slotDoc = workingTeachers.find(
          (t) => !teacherIdsToDelete.has(t.id) && t.id === canon.id
        );
        if (slotDoc && (isLegacyDummyTeacherName(slotDoc.fullName) || !slotDoc.fullName.trim())) {
          primaryDoc = slotDoc;
          replacingLegacyDummy = true;
        }
      }

      // Hapus duplikat nama yang sama (mis. data lama typo + data baru) bila ada lebih dari satu
      for (const dup of nameMatchedDocs) {
        if (primaryDoc && dup.id !== primaryDoc.id && !realNonDemoAccountUids.has(dup.ownerUid)) {
          teacherIdsToDelete.add(dup.id);
        }
      }

      const targetId =
        primaryDoc?.id ||
        (!workingTeachers.some((t) => t.id === canon.id) ? canon.id : makeId('guru'));

      const targetOwnerUid =
        matchedAccount?.uid ||
        (!replacingLegacyDummy && primaryDoc?.ownerUid && !primaryDoc.ownerUid.startsWith('demo_')
          ? primaryDoc.ownerUid
          : canon.ownerUid);

      const resolvedNip =
        !replacingLegacyDummy && primaryDoc?.nip && primaryDoc.nip.trim().length >= 3
          ? primaryDoc.nip.trim()
          : canon.nip;
      const resolvedEmail =
        !replacingLegacyDummy && primaryDoc?.email && primaryDoc.email.trim()
          ? primaryDoc.email.trim()
          : matchedAccount?.email || canon.email;
      const resolvedPhone =
        !replacingLegacyDummy && primaryDoc?.phone && primaryDoc.phone.trim()
          ? primaryDoc.phone.trim()
          : canon.phone;
      const resolvedEducation =
        !replacingLegacyDummy && primaryDoc?.education && primaryDoc.education.trim()
          ? primaryDoc.education.trim()
          : canon.education;

      const needsSave =
        !primaryDoc ||
        replacingLegacyDummy ||
        primaryDoc.fullName !== canon.fullName ||
        primaryDoc.specialization !== canon.specialization ||
        primaryDoc.gender !== canon.gender ||
        primaryDoc.status !== 'Aktif' ||
        primaryDoc.ownerUid !== targetOwnerUid ||
        primaryDoc.education !== resolvedEducation;

      let resolvedTeacher: Teacher;
      if (needsSave) {
        resolvedTeacher = await saveTeacher({
          id: targetId,
          nip: resolvedNip,
          fullName: canon.fullName,
          gender: canon.gender,
          email: resolvedEmail,
          phone: resolvedPhone,
          specialization: canon.specialization,
          education: resolvedEducation,
          status: 'Aktif',
          ownerUid: targetOwnerUid,
        });
      } else {
        resolvedTeacher = primaryDoc;
      }

      const existingIdx = workingTeachers.findIndex((t) => t.id === resolvedTeacher.id);
      if (existingIdx >= 0) {
        workingTeachers[existingIdx] = resolvedTeacher;
      } else {
        workingTeachers.push(resolvedTeacher);
      }
      canonicalResolvedTeacherIds.set(canon.id, resolvedTeacher);

      // Sinkronkan ejaan nama & label mapel pada akun user tertaut (tanpa mengubah username/password/role)
      if (
        authMode === 'firebase' &&
        firebaseUser &&
        matchedAccount &&
        findCanonicalTeacherByName(matchedAccount.name)?.id === canon.id
      ) {
        const nextClassLabel =
          matchedAccount.role === 'guru'
            ? canon.specialization.slice(0, 120)
            : matchedAccount.classLabel || '';
        const shouldSyncUser =
          matchedAccount.name !== canon.fullName ||
          (matchedAccount.role === 'guru' &&
            (matchedAccount.classLabel !== nextClassLabel ||
              matchedAccount.linkedEntityId !== resolvedTeacher.id));

        if (shouldSyncUser) {
          const userPatch: Record<string, unknown> = {
            name: canon.fullName,
            updatedAt: serverTimestamp(),
          };
          if (matchedAccount.role === 'guru') {
            userPatch.classLabel = nextClassLabel;
            userPatch.linkedEntityId = resolvedTeacher.id;
          }
          try {
            await updateDoc(doc(db, 'users', matchedAccount.uid), userPatch);
          } catch (err) {
            console.warn('Gagal menyinkronkan ejaan nama akun guru:', err);
          }
          try {
            const cardRef = doc(db, 'login_card_credentials', matchedAccount.uid);
            const cardSnap = await getDoc(cardRef);
            if (cardSnap.exists()) {
              const cardPatch: Record<string, unknown> = {
                name: canon.fullName,
                updatedBy: uid,
                updatedAt: serverTimestamp(),
              };
              if (matchedAccount.role === 'guru') {
                cardPatch.classLabel = nextClassLabel;
              }
              await updateDoc(cardRef, cardPatch);
            }
          } catch {
            // Kartu kredensial opsional, abaikan bila belum ada
          }
        }
      }
    }

    // 3b. Bersihkan guru dummy lama (fiktif) yang tidak tertaut ke akun login real mana pun
    for (const t of workingTeachers) {
      if (teacherIdsToDelete.has(t.id)) continue;
      if (
        isLegacyDummyTeacherName(t.fullName) &&
        !realNonDemoAccountUids.has(t.ownerUid) &&
        !liveAccounts.some((a) => !a.uid.startsWith('demo_') && a.linkedEntityId === t.id)
      ) {
        teacherIdsToDelete.add(t.id);
      }
    }

    if (teacherIdsToDelete.size > 0) {
      if (authMode === 'firebase' && firebaseUser) {
        const delIds = Array.from(teacherIdsToDelete);
        for (let i = 0; i < delIds.length; i += 350) {
          const batch = writeBatch(db);
          for (const tid of delIds.slice(i, i + 350)) {
            batch.delete(doc(db, 'teachers', tid));
          }
          try {
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'teachers');
          }
        }
      }
    }

    const cleanedTeachers = workingTeachers.filter((t) => !teacherIdsToDelete.has(t.id));

    // 3c. Pastikan akun guru tambahan (di luar 7 guru resmi) yang aktif juga memiliki profil guru
    const activeTeacherAccounts = liveAccounts.filter((a) => a.role === 'guru' && a.status === 'Aktif');
    for (const acc of activeTeacherAccounts) {
      const exists = cleanedTeachers.some(
        (t) =>
          (acc.linkedEntityId && t.id === acc.linkedEntityId) ||
          t.ownerUid === acc.uid ||
          t.fullName.trim().toLowerCase() === acc.name.trim().toLowerCase()
      );
      if (!exists) {
        const createdTeacher = await saveTeacher({
          id: acc.linkedEntityId || undefined,
          nip: acc.nip || `GURU-${acc.uid.slice(0, 6).toUpperCase()}`,
          fullName: acc.name,
          gender: 'L',
          email: acc.email || '',
          phone: '',
          specialization: acc.classLabel || 'Guru Mata Pelajaran',
          education: 'S1 Pendidikan',
          status: 'Aktif',
          ownerUid: acc.uid,
        });
        cleanedTeachers.push(createdTeacher);
      }
    }

    if (authMode !== 'firebase') {
      setTeachers(cleanedTeachers);
      persistDemoCache({ teachers: cleanedTeachers });
    }

    // 3d. Perbaiki wali kelas di rombel apabila masih memakai nama guru dummy lama
    const canonicalList = Array.from(canonicalResolvedTeacherIds.values());
    if (canonicalList.length > 0 && liveClasses.length > 0) {
      const classesToFix: Classroom[] = [];
      liveClasses.forEach((cls, idx) => {
        const hasStaleHomeroom =
          isLegacyDummyTeacherName(cls.homeroomTeacherName || '') ||
          teacherIdsToDelete.has(cls.homeroomTeacherId || '') ||
          !cls.homeroomTeacherName?.trim();
        if (!hasStaleHomeroom) return;
        const cipanasDefault = CIPANAS_CLASSES.find((cc) => cc.id === cls.id);
        const mappedCanon =
          (cipanasDefault?.homeroomTeacherId &&
            canonicalResolvedTeacherIds.get(cipanasDefault.homeroomTeacherId)) ||
          canonicalList[idx % canonicalList.length];
        if (mappedCanon) {
          classesToFix.push({
            ...cls,
            homeroomTeacherId: mappedCanon.id,
            homeroomTeacherName: mappedCanon.fullName,
          });
        }
      });

      if (classesToFix.length > 0) {
        if (authMode === 'firebase' && firebaseUser) {
          const batch = writeBatch(db);
          for (const cls of classesToFix) {
            batch.update(doc(db, 'classes', cls.id), {
              homeroomTeacherId: cls.homeroomTeacherId,
              homeroomTeacherName: cls.homeroomTeacherName,
              updatedAt: serverTimestamp(),
            });
          }
          try {
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, 'classes');
          }
        } else {
          const fixById = new Map(classesToFix.map((c) => [c.id, c]));
          const nextClasses = liveClasses.map((c) => fixById.get(c.id) || c);
          setClasses(nextClasses);
          persistDemoCache({ classes: nextClasses });
        }
      }
    }

    const activeTeachers = cleanedTeachers.filter((t) => t.status === 'Aktif');
    const activeClasses = sortClassesByJenjang(liveClasses.filter((c) => c.status === 'Aktif'));

    if (activeTeachers.length === 0 || activeClasses.length === 0) {
      return {
        teacherCount: activeTeachers.length,
        classCount: activeClasses.length,
        createdCount: 0,
        updatedCount: 0,
        removedDuplicateCount: 0,
      };
    }

    // 4. Fallback rumpun hanya untuk guru tambahan (non-kanonik) yang belum memiliki spesialisasi mapel
    const fallbackGroupByTeacher = assignDistinctSubjectGroupsToTeachers(activeTeachers);

    for (const t of activeTeachers) {
      if (findCanonicalTeacherByName(t.fullName)) continue;
      const assignedGroup = fallbackGroupByTeacher.get(t.id);
      if (!assignedGroup) continue;
      const currentGroup = detectSubjectGroupFromText(t.specialization);
      const def = getSubjectGroupDefinition(assignedGroup);
      if (!currentGroup) {
        await saveTeacher({
          id: t.id,
          nip: t.nip,
          fullName: t.fullName,
          gender: t.gender,
          email: t.email,
          phone: t.phone,
          specialization: def.specializationLabel,
          education: t.education,
          status: t.status,
          ownerUid: t.ownerUid,
        });
        t.specialization = def.specializationLabel;
      }
    }

    // 5. Sinkronkan penugasan multi-mapel setiap guru ke SELURUH kelas/rombel aktif (Paket A, B, C)
    let currentAssignments: TeachingAssignment[] = [...assignments];
    if (authMode === 'firebase' && firebaseUser) {
      try {
        const snap = await getDocs(
          query(collection(db, 'assignments'), where('status', 'in', ['Aktif', 'Selesai']))
        );
        currentAssignments = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TeachingAssignment, 'id'>),
        }));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'assignments');
      }
    }

    const toCreate: TeachingAssignment[] = [];
    const toUpdate: TeachingAssignment[] = [];
    const toDeleteIds = new Set<string>();
    const keptMap = new Map<string, TeachingAssignment>();
    const activeClassIds = new Set(activeClasses.map((c) => c.id));

    // Hapus penugasan milik guru dummy yang sudah dihapus
    for (const a of currentAssignments) {
      if (teacherIdsToDelete.has(a.teacherId) || isLegacyDummyTeacherName(a.teacherName || '')) {
        toDeleteIds.add(a.id);
      }
    }

    activeTeachers.forEach((teacher, teacherIdx) => {
      const fallbackGroup = fallbackGroupByTeacher.get(teacher.id);

      const linkedAcc =
        liveAccounts.find(
          (a) => a.role === 'guru' && (a.linkedEntityId === teacher.id || a.uid === teacher.ownerUid)
        ) ||
        liveAccounts.find((a) => a.uid === teacher.ownerUid);
      const rawTeacherUid = String(linkedAcc?.uid || teacher.ownerUid || uid).trim();
      const resolvedTeacherUid = /^[a-zA-Z0-9_-]{1,128}$/.test(rawTeacherUid)
        ? rawTeacherUid
        : uid;

      const belongsToTeacher = (a: TeachingAssignment) =>
        a.teacherId === teacher.id ||
        (Boolean(resolvedTeacherUid) &&
          !resolvedTeacherUid.startsWith('demo_') &&
          a.teacherUid === resolvedTeacherUid);

      const expectedClassSubjectKeys = new Set<string>();

      activeClasses.forEach((cls, classIdx) => {
        const matchedSubs = resolveSubjectsForTeacherInPaket(
          teacher,
          cls.paket,
          syncedSubjects,
          fallbackGroup
        );
        if (matchedSubs.length === 0) return;

        const classStudentUids = students
          .filter((s) => s.classId === cls.id && s.status === 'Aktif' && s.ownerUid)
          .map((s) => s.ownerUid);

        matchedSubs.forEach((matchedSub, subIdx) => {
          expectedClassSubjectKeys.add(`${cls.id}|${matchedSub.id}`);
          const slot = SCHEDULE_SLOTS[(teacherIdx + classIdx + subIdx) % SCHEDULE_SLOTS.length];

          const matchingExisting = currentAssignments.filter(
            (a) =>
              !toDeleteIds.has(a.id) &&
              a.classId === cls.id &&
              a.subjectId === matchedSub.id &&
              belongsToTeacher(a)
          );

          if (matchingExisting.length > 0) {
            const primary = matchingExisting[0];
            for (let dupIdx = 1; dupIdx < matchingExisting.length; dupIdx += 1) {
              toDeleteIds.add(matchingExisting[dupIdx].id);
            }

            const mergedAccess = Array.from(
              new Set([
                ...(primary.accessUids || []),
                uid,
                resolvedTeacherUid,
                ...classStudentUids,
              ].filter(Boolean))
            ).slice(0, 30);

            const updatedItem: TeachingAssignment = {
              ...primary,
              teacherId: teacher.id,
              teacherName: teacher.fullName.trim().slice(0, 120),
              teacherUid: resolvedTeacherUid,
              subjectId: matchedSub.id,
              subjectName: matchedSub.name.trim().slice(0, 120),
              classId: cls.id,
              className: cls.name.trim().slice(0, 80),
              paket: cls.paket,
              academicYear: schoolSettings.academicYear || primary.academicYear || '2026/2027',
              semester: schoolSettings.semester || primary.semester || 'Ganjil',
              scheduleDay: slot.day,
              scheduleTime: slot.time,
              status: 'Aktif',
              accessUids: mergedAccess,
            };

            const changed =
              primary.teacherId !== updatedItem.teacherId ||
              primary.subjectId !== updatedItem.subjectId ||
              primary.subjectName !== updatedItem.subjectName ||
              primary.teacherName !== updatedItem.teacherName ||
              primary.teacherUid !== updatedItem.teacherUid ||
              primary.className !== updatedItem.className ||
              primary.paket !== updatedItem.paket ||
              primary.scheduleDay !== updatedItem.scheduleDay ||
              primary.scheduleTime !== updatedItem.scheduleTime ||
              primary.status !== updatedItem.status;

            keptMap.set(updatedItem.id, updatedItem);
            if (changed) {
              toUpdate.push(updatedItem);
            }
          } else {
            const newId = makeId('tgs');
            const mergedAccess = Array.from(
              new Set([uid, resolvedTeacherUid, ...classStudentUids].filter(Boolean))
            ).slice(0, 30);

            const createdItem: TeachingAssignment = {
              id: newId,
              teacherId: teacher.id,
              teacherName: teacher.fullName.trim().slice(0, 120),
              teacherUid: resolvedTeacherUid,
              subjectId: matchedSub.id,
              subjectName: matchedSub.name.trim().slice(0, 120),
              classId: cls.id,
              className: cls.name.trim().slice(0, 80),
              paket: cls.paket,
              academicYear: schoolSettings.academicYear || '2026/2027',
              semester: schoolSettings.semester || 'Ganjil',
              scheduleDay: slot.day,
              scheduleTime: slot.time,
              status: 'Aktif',
              accessUids: mergedAccess,
              createdBy: uid,
            };
            toCreate.push(createdItem);
            keptMap.set(createdItem.id, createdItem);
          }
        });
      });

      // Hapus penugasan lama milik guru ini pada kelas aktif yang mapelnya sudah tidak sesuai pembagian terbaru
      for (const a of currentAssignments) {
        if (toDeleteIds.has(a.id) || keptMap.has(a.id)) continue;
        if (activeClassIds.has(a.classId) && belongsToTeacher(a)) {
          if (!expectedClassSubjectKeys.has(`${a.classId}|${a.subjectId}`)) {
            toDeleteIds.add(a.id);
          }
        }
      }
    });

    if (authMode === 'firebase' && firebaseUser) {
      // 1. Delete stale/duplicate assignments in chunks of 300 (only 1 cached user lookup in rules)
      const deleteList = Array.from(toDeleteIds);
      for (let i = 0; i < deleteList.length; i += 300) {
        const batch = writeBatch(db);
        for (const delId of deleteList.slice(i, i + 300)) {
          batch.delete(doc(db, 'assignments', delId));
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'assignments');
        }
      }

      // 2. Update existing assignments in chunks of 300 (no extra exists() calls in update rule)
      for (let i = 0; i < toUpdate.length; i += 300) {
        const batch = writeBatch(db);
        for (const item of toUpdate.slice(i, i + 300)) {
          batch.update(doc(db, 'assignments', item.id), {
            teacherId: item.teacherId,
            teacherName: item.teacherName,
            teacherUid: item.teacherUid,
            subjectId: item.subjectId,
            subjectName: item.subjectName,
            classId: item.classId,
            className: item.className,
            paket: item.paket,
            academicYear: item.academicYear,
            semester: item.semester,
            scheduleDay: item.scheduleDay,
            scheduleTime: item.scheduleTime,
            status: item.status,
            accessUids: item.accessUids,
            updatedAt: serverTimestamp(),
          });
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'assignments');
        }
      }

      // 3. Create new assignments in chunks of 5 so 3x exists() per doc never exceeds Firestore's 20-call batch rule limit
      for (let i = 0; i < toCreate.length; i += 5) {
        const batch = writeBatch(db);
        for (const item of toCreate.slice(i, i + 5)) {
          batch.set(doc(db, 'assignments', item.id), {
            teacherId: item.teacherId,
            teacherName: item.teacherName,
            teacherUid: item.teacherUid,
            subjectId: item.subjectId,
            subjectName: item.subjectName,
            classId: item.classId,
            className: item.className,
            paket: item.paket,
            academicYear: item.academicYear,
            semester: item.semester,
            scheduleDay: item.scheduleDay,
            scheduleTime: item.scheduleTime,
            status: item.status,
            accessUids: item.accessUids,
            createdBy: item.createdBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'assignments');
        }
      }
    } else {
      const remainingOld = currentAssignments.filter(
        (a) => !toDeleteIds.has(a.id) && !keptMap.has(a.id)
      );
      const nextAssignments = [...Array.from(keptMap.values()), ...remainingOld];
      setAssignments(nextAssignments);
      persistDemoCache({ assignments: nextAssignments });
    }

    return {
      teacherCount: activeTeachers.length,
      classCount: activeClasses.length,
      createdCount: toCreate.length,
      updatedCount: toUpdate.length,
      removedDuplicateCount: toDeleteIds.size,
    };
  };

  // Otomatis sinkronkan 7 Guru Resmi PKBM Annur Karisma (ejaan EYD V + mapel Kurikulum Merdeka) sekali saat Admin login
  useEffect(() => {
    if (
      authMode !== 'firebase' ||
      !firebaseUser ||
      !isBootstrappedAdmin ||
      loading ||
      autoReconciledTeachersRef.current
    ) {
      return;
    }
    if (classes.length === 0 && teachers.length === 0) return;

    const hasLegacyDummyTeacher = teachers.some((t) => isLegacyDummyTeacherName(t.fullName));
    const hasMissingOrOutdatedCanonicalTeacher = CANONICAL_PKBM_TEACHERS.some((canon) => {
      const match = teachers.find(
        (t) =>
          t.fullName === canon.fullName &&
          t.specialization === canon.specialization &&
          t.status === 'Aktif'
      );
      return !match;
    });
    const hasMissingPramukaOrMenjahit =
      !subjects.some((s) => s.id === 'mp_pa_prm') ||
      !subjects.some((s) => s.id === 'mp_pa_jht') ||
      !subjects.some((s) => s.id === 'mp_pc_prm') ||
      !subjects.some((s) => s.id === 'mp_pc_jht');

    if (
      hasLegacyDummyTeacher ||
      hasMissingOrOutdatedCanonicalTeacher ||
      hasMissingPramukaOrMenjahit
    ) {
      autoReconciledTeachersRef.current = true;
      autoDistributeTeachersAllClasses().catch((err) => {
        console.error('Gagal melakukan penyesuaian otomatis 7 guru & mapel PKBM:', err);
      });
    } else {
      autoReconciledTeachersRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authMode,
    firebaseUser,
    isBootstrappedAdmin,
    loading,
    teachers,
    subjects,
    classes.length,
  ]);

  const saveAssignment: DataContextValue['saveAssignment'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('tgs');
    const existingItem = assignments.find((a) => a.id === id);
    const classStudentUids = students
      .filter((s) => s.classId === item.classId && s.status === 'Aktif' && s.ownerUid)
      .map((s) => s.ownerUid);
    const mergedAccess = Array.from(
      new Set([...(existingItem?.accessUids || []), uid, item.teacherUid, ...classStudentUids].filter(Boolean))
    ).slice(0, 30);

    const fullItem: TeachingAssignment = {
      ...item,
      id,
      teacherName: String(item.teacherName || '').trim().slice(0, 120),
      subjectName: String(item.subjectName || '').trim().slice(0, 120),
      className: String(item.className || '').trim().slice(0, 80),
      academicYear: String(item.academicYear || '2026/2027').trim().slice(0, 20),
      scheduleDay: String(item.scheduleDay || 'Sabtu').trim().slice(0, 24),
      scheduleTime: String(item.scheduleTime || '08:00 - 09:30').trim().slice(0, 32),
      accessUids: mergedAccess,
      createdBy: existingItem?.createdBy || uid,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'assignments', id);
        if (existingItem) {
          await updateDoc(docRef, {
            teacherId: fullItem.teacherId,
            teacherName: fullItem.teacherName,
            teacherUid: fullItem.teacherUid,
            subjectId: fullItem.subjectId,
            subjectName: fullItem.subjectName,
            classId: fullItem.classId,
            className: fullItem.className,
            paket: fullItem.paket,
            academicYear: fullItem.academicYear,
            semester: fullItem.semester,
            scheduleDay: fullItem.scheduleDay,
            scheduleTime: fullItem.scheduleTime,
            status: fullItem.status,
            accessUids: fullItem.accessUids,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            teacherId: fullItem.teacherId,
            teacherName: fullItem.teacherName,
            teacherUid: fullItem.teacherUid,
            subjectId: fullItem.subjectId,
            subjectName: fullItem.subjectName,
            classId: fullItem.classId,
            className: fullItem.className,
            paket: fullItem.paket,
            academicYear: fullItem.academicYear,
            semester: fullItem.semester,
            scheduleDay: fullItem.scheduleDay,
            scheduleTime: fullItem.scheduleTime,
            status: fullItem.status,
            accessUids: fullItem.accessUids,
            createdBy: fullItem.createdBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Pastikan guru pengampu langsung memiliki akses membaca seluruh murid di kelas yang diampu
        const targetClassObj = classes.find((c) => c.id === fullItem.classId);
        const teacherAcc = accounts.find(
          (a) => a.role === 'guru' && a.linkedEntityId === fullItem.teacherId
        );
        const grantUids = Array.from(
          new Set([fullItem.teacherUid, teacherAcc?.uid].filter((x): x is string => Boolean(x)))
        );
        if (grantUids.length > 0) {
          const studentsInAssignedClass = targetClassObj
            ? getStudentsForClassroom(targetClassObj, students, classes)
            : students.filter((s) => s.classId === fullItem.classId);
          await Promise.all(
            studentsInAssignedClass
              .filter((s) => grantUids.some((gUid) => !(s.accessUids || []).includes(gUid)))
              .map((s) =>
                updateDoc(doc(db, 'students', s.id), {
                  accessUids: Array.from(
                    new Set([...(s.accessUids || []), uid, ...grantUids])
                  ).slice(0, 30),
                  updatedAt: serverTimestamp(),
                }).catch(() => {})
              )
          );
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `assignments/${id}`);
      }
    } else {
      const next = existingItem
        ? assignments.map((a) => (a.id === id ? fullItem : a))
        : [fullItem, ...assignments];
      setAssignments(next);
      persistDemoCache({ assignments: next });
    }
  };

  const deleteAssignment = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'assignments', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `assignments/${id}`);
      }
    } else {
      const next = assignments.filter((a) => a.id !== id);
      setAssignments(next);
      persistDemoCache({ assignments: next });
    }
  };

  const addAnnouncement: DataContextValue['addAnnouncement'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const rawAuthor = (profile?.name || 'Administrator PKBM').trim();
    const authorName = (rawAuthor.length >= 2 ? rawAuthor : 'Administrator PKBM').slice(0, 120);
    const safeTitle = String(item.title || 'Pengumuman').trim().slice(0, 140);
    const safeContent = String(item.content || 'Informasi akademik PKBM.').trim().slice(0, 1000);
    const id = makeId('ann');
    const newItem: Announcement = {
      ...item,
      title: safeTitle.length >= 3 ? safeTitle : `${safeTitle} PKBM`.slice(0, 140),
      content: safeContent.length >= 5 ? safeContent : `${safeContent} (PKBM)`.slice(0, 1000),
      id,
      authorName,
      authorId: uid,
      publishedAt: new Date().toISOString(),
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        await setDoc(doc(db, 'announcements', id), {
          title: newItem.title,
          content: newItem.content,
          category: newItem.category,
          targetRole: newItem.targetRole,
          authorName: newItem.authorName,
          authorId: uid,
          isPinned: newItem.isPinned,
          publishedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
      }
    } else {
      const next = [newItem, ...announcements];
      setAnnouncements(next);
      persistDemoCache({ announcements: next });
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'announcements', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
      }
    } else {
      const next = announcements.filter((a) => a.id !== id);
      setAnnouncements(next);
      persistDemoCache({ announcements: next });
    }
  };

  const saveTeachingDocument: DataContextValue['saveTeachingDocument'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('tdoc');
    const existingItem = teachingDocuments.find((d) => d.id === id);
    const nowIso = new Date().toISOString();
    const savedDoc: TeachingDocument = {
      ...item,
      id,
      ownerUid: existingItem?.ownerUid || uid,
      accessUids: existingItem?.accessUids?.includes(uid)
        ? existingItem.accessUids
        : [...(existingItem?.accessUids || []), uid],
      createdAt: existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'teaching_documents', id);
        if (existingItem) {
          await updateDoc(docRef, {
            title: savedDoc.title.slice(0, 160),
            materi: savedDoc.materi.slice(0, 200),
            jumlahPertemuan: Number(savedDoc.jumlahPertemuan),
            alokasiWaktu: savedDoc.alokasiWaktu.slice(0, 60),
            contentHtml: savedDoc.contentHtml.slice(0, 350000),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            docType: savedDoc.docType,
            title: savedDoc.title.slice(0, 160),
            paket: savedDoc.paket,
            fase: savedDoc.fase.slice(0, 40),
            kelas: savedDoc.kelas.slice(0, 80),
            mapel: savedDoc.mapel.slice(0, 120),
            materi: savedDoc.materi.slice(0, 200),
            jumlahPertemuan: Number(savedDoc.jumlahPertemuan),
            alokasiWaktu: savedDoc.alokasiWaktu.slice(0, 60),
            academicYear: savedDoc.academicYear.slice(0, 20),
            semester: savedDoc.semester,
            contentHtml: savedDoc.contentHtml.slice(0, 350000),
            authorName: savedDoc.authorName.slice(0, 120),
            ownerUid: uid,
            accessUids: savedDoc.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          existingItem ? OperationType.UPDATE : OperationType.CREATE,
          `teaching_documents/${id}`
        );
      }
    } else {
      const next = existingItem
        ? teachingDocuments.map((d) => (d.id === id ? savedDoc : d))
        : [savedDoc, ...teachingDocuments];
      setTeachingDocuments(next);
      persistDemoCache({ teachingDocuments: next });
    }
    return savedDoc;
  };

  const deleteTeachingDocument = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'teaching_documents', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `teaching_documents/${id}`);
      }
    } else {
      const next = teachingDocuments.filter((d) => d.id !== id);
      setTeachingDocuments(next);
      persistDemoCache({ teachingDocuments: next });
    }
  };

  const saveQuestionBankItem: DataContextValue['saveQuestionBankItem'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('qb');
    const existingItem = questionBank.find((q) => q.id === id);
    const nowIso = new Date().toISOString();
    const saved: QuestionBankItem = {
      ...item,
      id,
      ownerUid: existingItem?.ownerUid || uid,
      accessUids: existingItem?.accessUids?.includes(uid)
        ? existingItem.accessUids
        : [...(existingItem?.accessUids || []), uid],
      createdAt: existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'question_bank', id);
        if (existingItem) {
          await updateDoc(docRef, {
            mapel: saved.mapel.slice(0, 120),
            paket: saved.paket,
            materi: saved.materi.slice(0, 200),
            questionType: saved.questionType,
            cognitiveLevel: saved.cognitiveLevel,
            questionJson: JSON.stringify(saved.question).slice(0, 24000),
            visibility: saved.visibility,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            mapel: saved.mapel.slice(0, 120),
            paket: saved.paket,
            materi: saved.materi.slice(0, 200),
            questionType: saved.questionType,
            cognitiveLevel: saved.cognitiveLevel,
            questionJson: JSON.stringify(saved.question).slice(0, 24000),
            visibility: saved.visibility,
            authorName: saved.authorName.slice(0, 120),
            ownerUid: uid,
            accessUids: saved.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `question_bank/${id}`);
      }
    } else {
      const next = existingItem
        ? questionBank.map((q) => (q.id === id ? saved : q))
        : [saved, ...questionBank];
      setQuestionBank(next);
      persistDemoCache({ questionBank: next });
    }
    return saved;
  };

  const deleteQuestionBankItem = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'question_bank', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `question_bank/${id}`);
      }
    } else {
      const next = questionBank.filter((q) => q.id !== id);
      setQuestionBank(next);
      persistDemoCache({ questionBank: next });
    }
  };

  const saveExamPackage: DataContextValue['saveExamPackage'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const id = item.id || makeId('exam');
    const existingItem = exams.find((e) => e.id === id);
    const nowIso = new Date().toISOString();
    const safeExamTitle = (() => {
      const t = String(item.title || '').trim();
      return (t.length >= 3 ? t : `${item.examType} ${item.mapel || 'Ujian PKBM'}`).slice(0, 160);
    })();
    const safeExamKelas = (() => {
      const k = String(item.kelas || '').trim();
      return (k.length >= 1 ? k : item.paket || 'Paket C').slice(0, 80);
    })();
    const safeExamMapel = (() => {
      const m = String(item.mapel || '').trim();
      return (m.length >= 2 ? m : 'Mata Pelajaran').slice(0, 120);
    })();
    const safeExamMateri = (() => {
      const mt = String(item.materi || '').trim();
      return (mt.length >= 2 ? mt : 'Materi Ujian PKBM').slice(0, 200);
    })();
    const safeExamYear = (() => {
      const y = String(item.academicYear || '2026/2027').trim();
      return (y.length >= 4 ? y : '2026/2027').slice(0, 20);
    })();
    const safeExamAuthor = (() => {
      const a = String(item.authorName || '').trim();
      return (a.length >= 2 ? a : 'Tutor PKBM').slice(0, 120);
    })();
    const safeDuration = Math.max(5, Math.min(300, Number(item.durationMinutes) || 60));

    const saved: ExamPackage = {
      ...item,
      id,
      title: safeExamTitle,
      kelas: safeExamKelas,
      mapel: safeExamMapel,
      materi: safeExamMateri,
      academicYear: safeExamYear,
      authorName: safeExamAuthor,
      durationMinutes: safeDuration,
      ownerUid: existingItem?.ownerUid || uid,
      accessUids: existingItem?.accessUids?.includes(uid)
        ? existingItem.accessUids
        : [...(existingItem?.accessUids || []), uid],
      createdAt: existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const payloadJson = JSON.stringify({
      questions: saved.questions,
      paketBOrder: saved.paketBOrder || [],
      paketBOptionMaps: saved.paketBOptionMaps || {},
      paketCOrder: saved.paketCOrder || [],
      paketCOptionMaps: saved.paketCOptionMaps || {},
    }).slice(0, 450000);

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'exams', id);
        if (existingItem) {
          await updateDoc(docRef, {
            title: saved.title,
            examType: saved.examType,
            paket: saved.paket,
            kelas: saved.kelas,
            mapel: saved.mapel,
            materi: saved.materi,
            durationMinutes: saved.durationMinutes,
            hasPaketB: Boolean(saved.hasPaketB),
            isOnlinePublished: Boolean(saved.isOnlinePublished),
            payloadJson,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            title: saved.title,
            examType: saved.examType,
            paket: saved.paket,
            kelas: saved.kelas,
            mapel: saved.mapel,
            materi: saved.materi,
            academicYear: saved.academicYear,
            semester: saved.semester,
            durationMinutes: saved.durationMinutes,
            hasPaketB: Boolean(saved.hasPaketB),
            isOnlinePublished: Boolean(saved.isOnlinePublished),
            payloadJson,
            authorName: saved.authorName,
            ownerUid: uid,
            accessUids: saved.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `exams/${id}`);
      }
    } else {
      const next = existingItem
        ? exams.map((e) => (e.id === id ? saved : e))
        : [saved, ...exams];
      setExams(next);
      persistDemoCache({ exams: next });
    }
    return saved;
  };

  const deleteExamPackage = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'exams', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `exams/${id}`);
      }
    } else {
      const next = exams.filter((e) => e.id !== id);
      setExams(next);
      persistDemoCache({ exams: next });
    }
  };

  const submitStudentExam: DataContextValue['submitStudentExam'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_murid_01';
    const id = makeId('sub');
    const nowIso = new Date().toISOString();
    const parentExam = exams.find((ex) => ex.id === item.examId);
    const mergedAccess = Array.from(
      new Set(
        [
          ...(item.accessUids || []),
          ...(parentExam?.accessUids || []),
          parentExam?.ownerUid,
          uid,
        ].filter(Boolean) as string[]
      )
    ).slice(0, 30);

    const saved: ExamSubmission = {
      ...item,
      id,
      studentUid: uid,
      accessUids: mergedAccess,
      submittedAt: nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        await setDoc(doc(db, 'exam_submissions', id), {
          examId: saved.examId,
          examTitle: saved.examTitle.slice(0, 160),
          paketVariant: saved.paketVariant,
          studentUid: uid,
          studentName: saved.studentName.slice(0, 120),
          studentNis: saved.studentNis.slice(0, 32),
          paket: saved.paket,
          className: saved.className.slice(0, 80),
          answersJson: JSON.stringify(saved.answers).slice(0, 200000),
          essayGradesJson: JSON.stringify(saved.essayGrades || {}).slice(0, 100000),
          autoScore: Number(saved.autoScore),
          essayScore: Number(saved.essayScore),
          maxScore: Number(saved.maxScore),
          finalScore: Number(saved.finalScore),
          status: saved.status,
          accessUids: mergedAccess,
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `exam_submissions/${id}`);
      }
    } else {
      const next = [saved, ...examSubmissions];
      setExamSubmissions(next);
      persistDemoCache({ examSubmissions: next });
    }
    return saved;
  };

  const gradeExamSubmission: DataContextValue['gradeExamSubmission'] = async (
    submissionId,
    essayGrades,
    autoScore,
    maxScore
  ) => {
    const essayScore = Object.values(essayGrades).reduce(
      (sum, entry) => sum + (Number(entry.score) || 0),
      0
    );
    const totalPoints = autoScore + essayScore;
    const finalScore =
      maxScore > 0 ? Math.min(100, Math.round((totalPoints / maxScore) * 100 * 10) / 10) : 0;

    if (authMode === 'firebase' && firebaseUser) {
      try {
        await updateDoc(doc(db, 'exam_submissions', submissionId), {
          essayGradesJson: JSON.stringify(essayGrades).slice(0, 100000),
          essayScore,
          finalScore,
          status: 'Selesai Dinilai',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `exam_submissions/${submissionId}`);
      }
    } else {
      const next = examSubmissions.map((s) =>
        s.id === submissionId
          ? {
              ...s,
              essayGrades,
              essayScore,
              finalScore,
              status: 'Selesai Dinilai' as const,
              updatedAt: new Date().toISOString(),
            }
          : s
      );
      setExamSubmissions(next);
      persistDemoCache({ examSubmissions: next });
    }
  };

  const saveAttendanceSession: DataContextValue['saveAttendanceSession'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const cleanClassId = item.classId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanSubjectId = item.subjectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const deterministicId = item.id || `att_${cleanClassId}_${cleanSubjectId}_${item.date}`;
    const existingItem = attendanceSessions.find(
      (s) =>
        s.id === deterministicId ||
        (s.classId === item.classId && s.subjectId === item.subjectId && s.date === item.date)
    );
    const docId = existingItem?.id || deterministicId;
    const nowIso = new Date().toISOString();
    const monthKey = item.date.slice(0, 7);

    const summaryHadir = item.records.filter((r) => r.status === 'Hadir').length;
    const summaryIzin = item.records.filter((r) => r.status === 'Izin').length;
    const summarySakit = item.records.filter((r) => r.status === 'Sakit').length;
    const summaryAlpa = item.records.filter((r) => r.status === 'Alpa').length;

    const classSubjectTeacherUids = assignments
      .filter((a) => a.classId === item.classId && (!item.subjectId || a.subjectId === item.subjectId))
      .map((a) => a.teacherUid);
    const mergedAccess = Array.from(
      new Set([...(existingItem?.accessUids || []), uid, ...classSubjectTeacherUids].filter(Boolean))
    ).slice(0, 50);
    const uniqueStudentUids = Array.from(new Set(item.studentUids.filter(Boolean))).slice(0, 100);

    const saved: AttendanceSession = {
      ...item,
      id: docId,
      monthKey,
      summaryHadir,
      summaryIzin,
      summarySakit,
      summaryAlpa,
      studentUids: uniqueStudentUids,
      ownerUid: existingItem?.ownerUid || uid,
      accessUids: mergedAccess,
      createdAt: existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'attendance_sessions', docId);
        const recordsJson = JSON.stringify(saved.records).slice(0, 150000);
        if (existingItem) {
          await updateDoc(docRef, {
            recordsJson,
            summaryHadir: saved.summaryHadir,
            summaryIzin: saved.summaryIzin,
            summarySakit: saved.summarySakit,
            summaryAlpa: saved.summaryAlpa,
            studentUids: saved.studentUids,
            accessUids: saved.accessUids,
            teacherName: saved.teacherName.slice(0, 120),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            date: saved.date,
            monthKey: saved.monthKey,
            academicYear: saved.academicYear.slice(0, 20),
            semester: saved.semester,
            paket: saved.paket,
            classId: saved.classId,
            className: saved.className.slice(0, 80),
            subjectId: saved.subjectId,
            subjectName: saved.subjectName.slice(0, 120),
            teacherId: saved.teacherId,
            teacherName: saved.teacherName.slice(0, 120),
            recordsJson,
            summaryHadir: saved.summaryHadir,
            summaryIzin: saved.summaryIzin,
            summarySakit: saved.summarySakit,
            summaryAlpa: saved.summaryAlpa,
            studentUids: saved.studentUids,
            ownerUid: uid,
            accessUids: saved.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          existingItem ? OperationType.UPDATE : OperationType.CREATE,
          `attendance_sessions/${docId}`
        );
      }
    } else {
      const next = existingItem
        ? attendanceSessions.map((s) => (s.id === docId ? saved : s))
        : [saved, ...attendanceSessions];
      setAttendanceSessions(next);
      persistDemoCache({ attendanceSessions: next });
    }
    return saved;
  };

  const deleteAttendanceSession = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'attendance_sessions', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `attendance_sessions/${id}`);
      }
    } else {
      const next = attendanceSessions.filter((s) => s.id !== id);
      setAttendanceSessions(next);
      persistDemoCache({ attendanceSessions: next });
    }
  };

  const saveTask: DataContextValue['saveTask'] = async (item, options) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const isNew = !item.id;
    const id = item.id || makeId('task');
    const existingItem = tasks.find((t) => t.id === id);
    const nowIso = new Date().toISOString();

    const isOnlineTarget = item.deliveryMode === 'online' || Boolean(item.onlineClassId);
    const linkedOnlineClass = item.onlineClassId
      ? onlineClasses.find((oc) => oc.id === item.onlineClassId) || null
      : null;

    // For Kelas Online tasks, target all active students in the same jenjang (Paket A/B/C) + classId;
    // for regular Rombel tasks, target active students in that specific classId.
    const matchedStudents = isOnlineTarget
      ? students.filter(
          (s) => s.status === 'Aktif' && (s.paket === item.paket || s.classId === item.classId)
        )
      : students.filter((s) => s.classId === item.classId && s.status === 'Aktif');

    const targetStudentUids = Array.from(
      new Set([
        ...(item.targetStudentUids || []),
        ...matchedStudents.map((s) => s.ownerUid).filter(Boolean),
      ])
    ).slice(0, 100);

    const mergedAccess = Array.from(
      new Set(
        [
          ...(existingItem?.accessUids || []),
          uid,
          item.teacherUid,
          linkedOnlineClass?.teacherUid,
          linkedOnlineClass?.ownerUid,
        ].filter(Boolean)
      )
    ).slice(0, 50) as string[];

    const normalizedOnlineClassId = isOnlineTarget
      ? String(item.onlineClassId || '').trim().slice(0, 128)
      : '';
    const normalizedOnlineClassTitle = isOnlineTarget
      ? String(
          item.onlineClassTitle ||
            linkedOnlineClass?.title ||
            `Kelas Online ${item.paket}`
        )
          .trim()
          .slice(0, 180)
      : '';

    const saved: TeacherTask = {
      ...item,
      id,
      title: String(item.title || '').trim().slice(0, 160),
      description: String(item.description || '').trim().slice(0, 8000),
      className: String(item.className || '').trim().slice(0, 80),
      deliveryMode: isOnlineTarget ? 'online' : 'regular',
      onlineClassId: normalizedOnlineClassId,
      onlineClassTitle: normalizedOnlineClassTitle,
      subjectName: String(item.subjectName || '').trim().slice(0, 120),
      teacherName: String(item.teacherName || 'Guru PKBM').trim().slice(0, 120),
      targetStudentUids,
      ownerUid: existingItem?.ownerUid || uid,
      accessUids: mergedAccess,
      createdAt: existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const attachmentsJson = JSON.stringify(saved.attachments || []);
    if (attachmentsJson.length > 745000) {
      throw new Error(
        'Total ukuran lampiran tugas terlalu besar (maks. ~500 KB total lampiran tanpa Cloud Storage). Hapus sebagian lampiran atau perkecil ukuran file.'
      );
    }

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'tasks', id);
        if (existingItem) {
          await updateDoc(docRef, {
            title: saved.title,
            description: saved.description,
            paket: saved.paket,
            classId: saved.classId,
            className: saved.className,
            deliveryMode: saved.deliveryMode,
            onlineClassId: saved.onlineClassId || '',
            onlineClassTitle: saved.onlineClassTitle || '',
            subjectId: saved.subjectId,
            subjectName: saved.subjectName,
            dueAt: saved.dueAt.slice(0, 40),
            maxScore: Number(saved.maxScore),
            attachmentsJson,
            targetStudentUids: saved.targetStudentUids,
            accessUids: saved.accessUids,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            title: saved.title,
            description: saved.description,
            paket: saved.paket,
            classId: saved.classId,
            className: saved.className,
            deliveryMode: saved.deliveryMode,
            onlineClassId: saved.onlineClassId || '',
            onlineClassTitle: saved.onlineClassTitle || '',
            subjectId: saved.subjectId,
            subjectName: saved.subjectName,
            teacherId: saved.teacherId,
            teacherName: saved.teacherName.length >= 2 ? saved.teacherName : 'Guru PKBM',
            teacherUid: saved.teacherUid,
            dueAt: saved.dueAt.slice(0, 40),
            maxScore: Number(saved.maxScore),
            attachmentsJson,
            targetStudentUids: saved.targetStudentUids,
            ownerUid: uid,
            accessUids: saved.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existingItem ? OperationType.UPDATE : OperationType.CREATE, `tasks/${id}`);
      }
    } else {
      const next = existingItem ? tasks.map((t) => (t.id === id ? saved : t)) : [saved, ...tasks];
      setTasks(next);
      persistDemoCache({ tasks: next });
    }

    // Automatically broadcast announcement & bell notification for newly created tasks (best effort so task save never fails)
    if (isNew && options?.announce !== false) {
      try {
        const dueDisplay = new Date(saved.dueAt).toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        await addAnnouncement({
          title: (isOnlineTarget
            ? `Tugas Kelas Online (${saved.paket}): ${saved.title}`
            : `Tugas Baru: ${saved.title}`
          ).slice(0, 140),
          content: (isOnlineTarget
            ? `${saved.subjectName} — ${saved.onlineClassTitle || `Kelas Online ${saved.paket}`} oleh ${saved.teacherName}. Tenggat pengumpulan: ${dueDisplay}.`
            : `${saved.subjectName} (${saved.className}) oleh ${saved.teacherName}. Tenggat pengumpulan: ${dueDisplay}.`
          ).slice(0, 1000),
          category: 'Akademik',
          targetRole: 'Murid',
          isPinned: false,
        });
      } catch (announceErr) {
        console.warn('Pengumuman otomatis tugas baru dilewati:', announceErr);
      }
    }

    return saved;
  };

  const deleteTask = async (id: string) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'tasks', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
      }
    } else {
      const next = tasks.filter((t) => t.id !== id);
      setTasks(next);
      persistDemoCache({ tasks: next });
    }
  };

  const submitStudentTask: DataContextValue['submitStudentTask'] = async (item, dueAt) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_murid_01';
    const cleanTaskId = item.taskId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanStudentId = item.studentId.replace(/[^a-zA-Z0-9_-]/g, '');
    const docId = `tsub_${cleanTaskId}_${cleanStudentId}`;
    const existingItem = taskSubmissions.find((s) => s.id === docId || (s.taskId === item.taskId && s.studentId === item.studentId));
    const nowIso = new Date().toISOString();
    const isLate = Boolean(dueAt) && new Date().getTime() > new Date(dueAt).getTime();
    const status: TaskSubmission['status'] = isLate ? 'Terlambat' : 'Terkumpul';
    const parentTask = tasks.find((t) => t.id === item.taskId);
    const mergedAccess = Array.from(
      new Set(
        [
          ...(item.accessUids || []),
          ...(parentTask?.accessUids || []),
          parentTask?.ownerUid,
          parentTask?.teacherUid,
          uid,
        ].filter(Boolean) as string[]
      )
    ).slice(0, 50);

    const safeStudentName = String(item.studentName || 'Warga Belajar').trim().slice(0, 120);
    const safeStudentNis = String(item.studentNis || item.studentId || 'MURID').trim().slice(0, 32);
    const safeTaskTitle = String(item.taskTitle || 'Tugas PKBM').trim().slice(0, 160);

    const saved: TaskSubmission = {
      ...item,
      id: existingItem?.id || docId,
      taskTitle: safeTaskTitle.length >= 2 ? safeTaskTitle : 'Tugas PKBM',
      studentUid: uid,
      studentName: safeStudentName.length >= 2 ? safeStudentName : 'Warga Belajar',
      studentNis: safeStudentNis || 'MURID',
      answerText: String(item.answerText || '').slice(0, 15000),
      status,
      isLate,
      score: existingItem?.score || 0,
      feedback: existingItem?.feedback || '',
      gradedBy: existingItem?.gradedBy || '',
      gradedAt: existingItem?.gradedAt || '',
      accessUids: mergedAccess,
      submittedAt: existingItem?.submittedAt || nowIso,
      updatedAt: nowIso,
    };

    const attachmentsJson = JSON.stringify(saved.attachments || []);
    if (attachmentsJson.length > 745000) {
      throw new Error(
        'Total ukuran file jawaban terlalu besar (maks. ~500 KB total lampiran tanpa Cloud Storage). Hapus sebagian lampiran atau perkecil ukuran file.'
      );
    }

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'task_submissions', saved.id);
        if (existingItem) {
          await updateDoc(docRef, {
            answerText: saved.answerText,
            attachmentsJson,
            status: saved.status,
            isLate: saved.isLate,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            taskId: saved.taskId,
            taskTitle: saved.taskTitle,
            classId: saved.classId,
            className: saved.className.slice(0, 80),
            subjectId: saved.subjectId,
            subjectName: saved.subjectName.slice(0, 120),
            studentId: saved.studentId,
            studentUid: uid,
            studentName: saved.studentName,
            studentNis: saved.studentNis,
            answerText: saved.answerText,
            attachmentsJson,
            status: saved.status,
            isLate: saved.isLate,
            score: 0,
            feedback: '',
            gradedBy: '',
            gradedAt: '',
            accessUids: mergedAccess,
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          existingItem ? OperationType.UPDATE : OperationType.CREATE,
          `task_submissions/${saved.id}`
        );
      }
    } else {
      const next = existingItem
        ? taskSubmissions.map((s) => (s.id === saved.id ? saved : s))
        : [saved, ...taskSubmissions];
      setTaskSubmissions(next);
      persistDemoCache({ taskSubmissions: next });
    }
    return saved;
  };

  const reviewTaskSubmission: DataContextValue['reviewTaskSubmission'] = async (
    submissionId,
    payload
  ) => {
    const nowIso = new Date().toISOString();
    const safeScore = payload.status === 'Revisi' ? 0 : Math.max(0, Number(payload.score) || 0);

    if (authMode === 'firebase' && firebaseUser) {
      try {
        await updateDoc(doc(db, 'task_submissions', submissionId), {
          status: payload.status,
          score: safeScore,
          feedback: payload.feedback.slice(0, 4000),
          gradedBy: payload.gradedBy.slice(0, 120),
          gradedAt: nowIso,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `task_submissions/${submissionId}`);
      }
    } else {
      const next = taskSubmissions.map((s) =>
        s.id === submissionId
          ? {
              ...s,
              status: payload.status,
              score: safeScore,
              feedback: payload.feedback,
              gradedBy: payload.gradedBy,
              gradedAt: nowIso,
              updatedAt: nowIso,
            }
          : s
      );
      setTaskSubmissions(next);
      persistDemoCache({ taskSubmissions: next });
    }
  };

  const saveGradeWeights: DataContextValue['saveGradeWeights'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const cleanClassId = item.classId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanSubjectId = item.subjectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const docId = `gw_${cleanClassId}_${cleanSubjectId}`;
    const existingItem = gradeWeights.find((w) => w.id === docId);
    const nowIso = new Date().toISOString();
    const subjectTeacherUids = assignments
      .filter((a) => a.classId === item.classId && a.subjectId === item.subjectId)
      .map((a) => a.teacherUid);
    const mergedAccess = Array.from(
      new Set([...(existingItem?.accessUids || []), uid, ...subjectTeacherUids].filter(Boolean))
    ).slice(0, 50);

    const saved: GradeWeightConfig = {
      ...item,
      id: docId,
      ownerUid: existingItem?.ownerUid || uid,
      accessUids: mergedAccess,
      createdAt: existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const docRef = doc(db, 'grade_weights', docId);
        if (existingItem) {
          await updateDoc(docRef, {
            tugas: Number(saved.tugas),
            uh: Number(saved.uh),
            asts: Number(saved.asts),
            asat: Number(saved.asat),
            praktik: Number(saved.praktik),
            sikap: Number(saved.sikap),
            accessUids: saved.accessUids,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            classId: saved.classId,
            subjectId: saved.subjectId,
            tugas: Number(saved.tugas),
            uh: Number(saved.uh),
            asts: Number(saved.asts),
            asat: Number(saved.asat),
            praktik: Number(saved.praktik),
            sikap: Number(saved.sikap),
            ownerUid: uid,
            accessUids: saved.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          existingItem ? OperationType.UPDATE : OperationType.CREATE,
          `grade_weights/${docId}`
        );
      }
    } else {
      const next = existingItem
        ? gradeWeights.map((w) => (w.id === docId ? saved : w))
        : [saved, ...gradeWeights];
      setGradeWeights(next);
      persistDemoCache({ gradeWeights: next });
    }
    return saved;
  };

  const saveGradeRecordsBatch: DataContextValue['saveGradeRecordsBatch'] = async (records) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const nowIso = new Date().toISOString();

    const savedList: GradeRecord[] = records.map((item) => {
      const cleanStudentId = item.studentId.replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanSubjectId = item.subjectId.replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanSem = item.semester.replace(/[^a-zA-Z0-9_-]/g, '');
      const docId = `grd_${cleanStudentId}_${cleanSubjectId}_${cleanSem}`;
      const existingItem = gradeRecords.find((g) => g.id === docId);
      const subjectTeacherUids = assignments
        .filter((a) => a.classId === item.classId && a.subjectId === item.subjectId)
        .map((a) => a.teacherUid);
      const mergedAccess = Array.from(
        new Set([...(existingItem?.accessUids || []), uid, ...subjectTeacherUids].filter(Boolean))
      ).slice(0, 50);

      return {
        ...item,
        id: docId,
        ownerUid: existingItem?.ownerUid || uid,
        accessUids: mergedAccess,
        createdAt: existingItem?.createdAt || nowIso,
        updatedAt: nowIso,
      };
    });

    if (authMode === 'firebase' && firebaseUser) {
      try {
        await Promise.all(
          savedList.map(async (saved) => {
            const existingItem = gradeRecords.find((g) => g.id === saved.id);
            const docRef = doc(db, 'grade_records', saved.id);
            if (existingItem) {
              await updateDoc(docRef, {
                tugas: Number(saved.tugas),
                uh: Number(saved.uh),
                asts: Number(saved.asts),
                asat: Number(saved.asat),
                praktik: Number(saved.praktik),
                sikap: Number(saved.sikap),
                finalScore: Number(saved.finalScore),
                predicate: saved.predicate,
                isPassed: Boolean(saved.isPassed),
                kkm: Number(saved.kkm),
                achievementDescription: saved.achievementDescription.slice(0, 2000),
                homeroomNote: saved.homeroomNote.slice(0, 1000),
                teacherName: saved.teacherName.slice(0, 120),
                accessUids: saved.accessUids,
                updatedAt: serverTimestamp(),
              });
            } else {
              await setDoc(docRef, {
                studentId: saved.studentId,
                studentUid: saved.studentUid,
                studentName: saved.studentName.slice(0, 120),
                studentNis: saved.studentNis.slice(0, 32),
                classId: saved.classId,
                className: saved.className.slice(0, 80),
                paket: saved.paket,
                subjectId: saved.subjectId,
                subjectName: saved.subjectName.slice(0, 120),
                kkm: Number(saved.kkm),
                teacherId: saved.teacherId,
                teacherName: saved.teacherName.slice(0, 120),
                academicYear: saved.academicYear.slice(0, 20),
                semester: saved.semester,
                tugas: Number(saved.tugas),
                uh: Number(saved.uh),
                asts: Number(saved.asts),
                asat: Number(saved.asat),
                praktik: Number(saved.praktik),
                sikap: Number(saved.sikap),
                finalScore: Number(saved.finalScore),
                predicate: saved.predicate,
                isPassed: Boolean(saved.isPassed),
                achievementDescription: saved.achievementDescription.slice(0, 2000),
                homeroomNote: saved.homeroomNote.slice(0, 1000),
                ownerUid: uid,
                accessUids: saved.accessUids,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          })
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'grade_records');
      }
    } else {
      const map = new Map<string, GradeRecord>();
      gradeRecords.forEach((g) => map.set(g.id, g));
      savedList.forEach((s) => map.set(s.id, s));
      const next = Array.from(map.values());
      setGradeRecords(next);
      persistDemoCache({ gradeRecords: next });
    }

    return savedList;
  };

  const saveOnlineClass: DataContextValue['saveOnlineClass'] = async (item) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_admin_01';
    const existing = item.id ? onlineClasses.find((oc) => oc.id === item.id) : undefined;
    const id = existing?.id || item.id || makeId('olc');
    const nowIso = new Date().toISOString();

    const sanitizedObjectives = (item.learningObjectives || [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);

    const sanitizedMaterials = (item.materials || []).slice(0, 15).map((m, idx) => ({
      id: (m.id || `mat_${idx + 1}_${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
      title: (m.title || `Materi ${idx + 1}`).trim().slice(0, 160),
      type: m.type,
      durationMinutes: Math.max(5, Math.min(240, Number(m.durationMinutes || 15))),
      summary: (m.summary || '').trim().slice(0, 400),
      contentText: (m.contentText || '').trim().slice(0, 6000),
      resourceUrl: (m.resourceUrl || '').trim().slice(0, 500),
    }));

    const accessUids = Array.from(
      new Set([existing?.ownerUid || uid, uid, item.teacherUid || uid].filter(Boolean))
    ).slice(0, 50);

    const saved: OnlineClassSession = {
      ...item,
      id,
      title: item.title.trim().slice(0, 180),
      fase: item.fase.trim().slice(0, 40),
      className: item.className.trim().slice(0, 80),
      subjectName: item.subjectName.trim().slice(0, 120),
      teacherName: item.teacherName.trim().slice(0, 120),
      teacherUid: (item.teacherUid || uid).replace(/[^a-zA-Z0-9_-]/g, '_'),
      meetingUrl: item.meetingUrl.trim().slice(0, 500),
      meetingCode: item.meetingCode.trim().slice(0, 60),
      recordingUrl: item.recordingUrl.trim().slice(0, 500),
      durationMinutes: Math.max(15, Math.min(360, Number(item.durationMinutes || 60))),
      description: item.description.trim().slice(0, 3000),
      learningObjectives: sanitizedObjectives,
      materials: sanitizedMaterials,
      isPublished: item.isPublished !== false,
      ownerUid: existing?.ownerUid || uid,
      accessUids,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const ref = doc(db, 'online_classes', id);
        if (existing) {
          await updateDoc(ref, {
            title: saved.title,
            paket: saved.paket,
            fase: saved.fase,
            classId: saved.classId,
            className: saved.className,
            subjectId: saved.subjectId,
            subjectName: saved.subjectName,
            teacherId: saved.teacherId,
            teacherName: saved.teacherName,
            teacherUid: saved.teacherUid,
            modality: saved.modality,
            platform: saved.platform,
            meetingUrl: saved.meetingUrl,
            meetingCode: saved.meetingCode,
            recordingUrl: saved.recordingUrl,
            scheduleDate: saved.scheduleDate,
            startTime: saved.startTime,
            endTime: saved.endTime,
            durationMinutes: saved.durationMinutes,
            status: saved.status,
            description: saved.description,
            learningObjectives: saved.learningObjectives,
            materials: saved.materials,
            isPublished: saved.isPublished,
            accessUids: saved.accessUids,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            title: saved.title,
            paket: saved.paket,
            fase: saved.fase,
            classId: saved.classId,
            className: saved.className,
            subjectId: saved.subjectId,
            subjectName: saved.subjectName,
            teacherId: saved.teacherId,
            teacherName: saved.teacherName,
            teacherUid: saved.teacherUid,
            modality: saved.modality,
            platform: saved.platform,
            meetingUrl: saved.meetingUrl,
            meetingCode: saved.meetingCode,
            recordingUrl: saved.recordingUrl,
            scheduleDate: saved.scheduleDate,
            startTime: saved.startTime,
            endTime: saved.endTime,
            durationMinutes: saved.durationMinutes,
            status: saved.status,
            description: saved.description,
            learningObjectives: saved.learningObjectives,
            materials: saved.materials,
            isPublished: saved.isPublished,
            ownerUid: uid,
            accessUids: saved.accessUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `online_classes/${id}`);
      }
    } else {
      const next = existing
        ? onlineClasses.map((oc) => (oc.id === id ? saved : oc))
        : [saved, ...onlineClasses];
      setOnlineClasses(next);
      persistDemoCache({ onlineClasses: next });
    }

    return saved;
  };

  const updateOnlineClassStatus: DataContextValue['updateOnlineClassStatus'] = async (
    sessionId,
    status
  ) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await updateDoc(doc(db, 'online_classes', sessionId), {
          status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `online_classes/${sessionId}`);
      }
    } else {
      const next = onlineClasses.map((oc) =>
        oc.id === sessionId ? { ...oc, status, updatedAt: new Date().toISOString() } : oc
      );
      setOnlineClasses(next);
      persistDemoCache({ onlineClasses: next });
    }
  };

  const deleteOnlineClass: DataContextValue['deleteOnlineClass'] = async (sessionId) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'online_classes', sessionId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `online_classes/${sessionId}`);
      }
    } else {
      const next = onlineClasses.filter((oc) => oc.id !== sessionId);
      setOnlineClasses(next);
      persistDemoCache({ onlineClasses: next });
    }
  };

  const saveOnlineClassProgress: DataContextValue['saveOnlineClassProgress'] = async (
    session,
    patch
  ) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_murid_01';
    const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeSessionId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const progressId = `olp_${safeSessionId}_${safeUid}`.slice(0, 120);
    const existing = onlineClassProgress.find(
      (p) => p.id === progressId || (p.sessionId === session.id && p.studentUid === uid)
    );
    const nowIso = new Date().toISOString();

    const completedIds = Array.from(
      new Set(patch.completedMaterialIds ?? existing?.completedMaterialIds ?? [])
    ).slice(0, 20);
    const totalMaterials = Math.max(1, session.materials.length);
    const progressPercent = session.materials.length
      ? Math.min(100, Math.round((completedIds.length / totalMaterials) * 100))
      : patch.joinedLive || existing?.joinedLive
        ? 100
        : 0;

    const joinedLive = patch.joinedLive !== undefined ? patch.joinedLive : existing?.joinedLive ?? false;
    const joinedAt = joinedLive ? existing?.joinedAt || nowIso : existing?.joinedAt || '';

    const saved: OnlineClassProgress = {
      id: existing?.id || progressId,
      sessionId: session.id,
      paket: session.paket,
      classId: session.classId,
      studentId: patch.studentId || existing?.studentId || profile?.linkedEntityId || uid,
      studentUid: uid,
      studentName: (patch.studentName || existing?.studentName || profile?.name || 'Warga Belajar').slice(0, 120),
      studentNis: (patch.studentNis || existing?.studentNis || profile?.nis || '').slice(0, 32),
      joinedLive,
      joinedAt,
      completedMaterialIds: completedIds,
      progressPercent,
      personalNote: (patch.personalNote !== undefined ? patch.personalNote : existing?.personalNote ?? '').slice(0, 3000),
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        const ref = doc(db, 'online_class_progress', saved.id);
        const remoteSnap = await getDoc(ref);
        if (remoteSnap.exists()) {
          await updateDoc(ref, {
            joinedLive: saved.joinedLive,
            joinedAt: saved.joinedAt,
            completedMaterialIds: saved.completedMaterialIds,
            progressPercent: saved.progressPercent,
            personalNote: saved.personalNote,
            studentName: saved.studentName,
            studentNis: saved.studentNis,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            sessionId: saved.sessionId,
            paket: saved.paket,
            classId: saved.classId,
            studentId: saved.studentId,
            studentUid: uid,
            studentName: saved.studentName,
            studentNis: saved.studentNis,
            joinedLive: saved.joinedLive,
            joinedAt: saved.joinedAt,
            completedMaterialIds: saved.completedMaterialIds,
            progressPercent: saved.progressPercent,
            personalNote: saved.personalNote,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `online_class_progress/${saved.id}`);
      }
    } else {
      const next = existing
        ? onlineClassProgress.map((p) => (p.id === saved.id ? saved : p))
        : [saved, ...onlineClassProgress];
      setOnlineClassProgress(next);
      persistDemoCache({ onlineClassProgress: next });
    }

    return saved;
  };

  const addOnlineClassComment: DataContextValue['addOnlineClassComment'] = async (
    session,
    message,
    isPinned = false
  ) => {
    const uid = firebaseUser?.uid || profile?.uid || 'demo_murid_01';
    const id = makeId('olcmt');
    const nowIso = new Date().toISOString();
    const canPin = profile?.role === 'admin' || profile?.role === 'kepala_pkbm' || profile?.role === 'guru';
    const saved: OnlineClassComment = {
      id,
      sessionId: session.id,
      paket: session.paket,
      authorUid: uid,
      authorName: (profile?.name || 'Pengguna SIAKAD').slice(0, 120),
      authorRole: profile?.role || 'murid',
      message: message.trim().slice(0, 2000),
      isPinned: canPin ? Boolean(isPinned) : false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (authMode === 'firebase' && firebaseUser) {
      try {
        await setDoc(doc(db, 'online_class_comments', id), {
          sessionId: saved.sessionId,
          paket: saved.paket,
          authorUid: uid,
          authorName: saved.authorName,
          authorRole: saved.authorRole,
          message: saved.message,
          isPinned: saved.isPinned,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `online_class_comments/${id}`);
      }
    } else {
      const next = [...onlineClassComments, saved];
      setOnlineClassComments(next);
      persistDemoCache({ onlineClassComments: next });
    }

    return saved;
  };

  const togglePinOnlineClassComment: DataContextValue['togglePinOnlineClassComment'] = async (
    commentId,
    nextPinned
  ) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await updateDoc(doc(db, 'online_class_comments', commentId), {
          isPinned: nextPinned,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `online_class_comments/${commentId}`);
      }
    } else {
      const next = onlineClassComments.map((c) =>
        c.id === commentId ? { ...c, isPinned: nextPinned, updatedAt: new Date().toISOString() } : c
      );
      setOnlineClassComments(next);
      persistDemoCache({ onlineClassComments: next });
    }
  };

  const deleteOnlineClassComment: DataContextValue['deleteOnlineClassComment'] = async (commentId) => {
    if (authMode === 'firebase' && firebaseUser) {
      try {
        await deleteDoc(doc(db, 'online_class_comments', commentId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `online_class_comments/${commentId}`);
      }
    } else {
      const next = onlineClassComments.filter((c) => c.id !== commentId);
      setOnlineClassComments(next);
      persistDemoCache({ onlineClassComments: next });
    }
  };

  const saveActivityGalleryPhoto: DataContextValue['saveActivityGalleryPhoto'] = async (
    slotId,
    payload
  ) => {
    const slotMatch = DEFAULT_ACTIVITY_GALLERY_PHOTOS.find((p) => p.id === slotId);
    const slotIndex = (slotMatch?.slotIndex || 1) as 1 | 2 | 3 | 4 | 5;
    const cleanTitle = payload.title.trim().slice(0, 100);
    const cleanCaption = payload.caption.trim().slice(0, 240);
    const cleanPaket = payload.paketLabel.trim().slice(0, 40) || 'Kegiatan PKBM';
    const cleanImageUrl = payload.imageUrl.trim();

    if (cleanTitle.length < 2) {
      throw new Error('Judul kegiatan minimal 2 karakter.');
    }
    if (cleanImageUrl.length > 238000) {
      throw new Error('Ukuran foto terlalu besar. Silakan pilih foto yang lebih ringan.');
    }

    const uid = firebaseUser?.uid || profile?.uid || 'admin';
    const nowIso = new Date().toISOString();

    if (authMode === 'firebase' && firebaseUser) {
      await setDoc(doc(db, 'gallery_photos', slotId), {
        slotIndex,
        title: cleanTitle,
        caption: cleanCaption,
        paketLabel: cleanPaket,
        imageUrl: cleanImageUrl,
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
    }

    setActivityGalleryPhotos((prev) => {
      const next = prev.map((item) =>
        item.id === slotId
          ? {
              ...item,
              title: cleanTitle,
              caption: cleanCaption,
              paketLabel: cleanPaket,
              imageUrl: cleanImageUrl || slotMatch?.imageUrl || item.imageUrl,
              isCustom: true,
              updatedBy: uid,
              updatedAt: nowIso,
            }
          : item
      );
      writeCachedPublicGalleryPhotos(next);
      return next;
    });
  };

  const resetActivityGalleryPhoto: DataContextValue['resetActivityGalleryPhoto'] = async (
    slotId
  ) => {
    const fallback = DEFAULT_ACTIVITY_GALLERY_PHOTOS.find((p) => p.id === slotId);
    if (!fallback) return;

    if (authMode === 'firebase' && firebaseUser) {
      await deleteDoc(doc(db, 'gallery_photos', slotId)).catch(() => {});
    }

    setActivityGalleryPhotos((prev) => {
      const next = prev.map((item) => (item.id === slotId ? fallback : item));
      writeCachedPublicGalleryPhotos(next);
      return next;
    });
  };

  const updateUserProfileAvatar: DataContextValue['updateUserProfileAvatar'] = async (
    uid,
    avatarUrl
  ) => {
    if (!uid) throw new Error('UID akun tidak valid.');
    const cleanUrl = avatarUrl.trim();
    if (cleanUrl.length > 118000) {
      throw new Error('Ukuran foto profil melebihi batas penyimpanan (maks ~115 KB).');
    }

    if (authMode === 'firebase' && firebaseUser) {
      await updateDoc(doc(db, 'users', uid), {
        avatarUrl: cleanUrl,
        updatedAt: serverTimestamp(),
      });
    }

    setAccounts((prev) =>
      prev.map((acc) =>
        acc.uid === uid
          ? { ...acc, avatarUrl: cleanUrl || undefined, updatedAt: new Date().toISOString() }
          : acc
      )
    );
  };

  const resetDemoData = () => {
    const fresh = buildSeedState();
    setSchoolSettings(fresh.schoolSettings);
    setStudents(fresh.students);
    setTeachers(fresh.teachers);
    setSubjects(fresh.subjects);
    setClasses(fresh.classes);
    setAssignments(fresh.assignments);
    setAnnouncements(fresh.announcements);
    setTeachingDocuments(fresh.teachingDocuments || []);
    setQuestionBank(fresh.questionBank || []);
    setExams(fresh.exams || []);
    setExamSubmissions(fresh.examSubmissions || []);
    setAttendanceSessions(fresh.attendanceSessions || []);
    setTasks(fresh.tasks || []);
    setTaskSubmissions(fresh.taskSubmissions || []);
    setGradeWeights(fresh.gradeWeights || []);
    setGradeRecords(fresh.gradeRecords || []);
    setOnlineClasses(fresh.onlineClasses || []);
    setOnlineClassProgress(fresh.onlineClassProgress || []);
    setOnlineClassComments(fresh.onlineClassComments || []);
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(fresh));
    } catch {
      // Ignore
    }
  };

  return (
    <DataContext.Provider
      value={{
        schoolSettings,
        students,
        teachers,
        subjects,
        classes: hydratedClasses,
        assignments,
        announcements,
        teachingDocuments,
        questionBank,
        exams,
        examSubmissions,
        attendanceSessions,
        tasks,
        taskSubmissions,
        gradeWeights,
        gradeRecords,
        onlineClasses,
        onlineClassProgress,
        onlineClassComments,
        accounts,
        issuedCredentialsMap,
        loading,
        selectedProgram,
        setSelectedProgram,
        updateSchoolSettings,
        uploadSchoolAsset,
        uploadTaskFile,
        saveStudent,
        deleteStudent,
        importStudentsBatch,
        bulkAssignStudentsClass,
        syncStudentAccountClassLabels,
        syncClassroomsAndStudents,
        applyCanonicalCipanasSpreadsheetData,
        saveTeacher,
        deleteTeacher,
        saveSubject,
        deleteSubject,
        syncKurikulumMerdekaSubjects,
        saveClassroom,
        deleteClassroom,
        saveAssignment,
        deleteAssignment,
        autoDistributeTeachersAllClasses,
        addAnnouncement,
        deleteAnnouncement,
        saveTeachingDocument,
        deleteTeachingDocument,
        saveQuestionBankItem,
        deleteQuestionBankItem,
        saveExamPackage,
        deleteExamPackage,
        submitStudentExam,
        gradeExamSubmission,
        saveAttendanceSession,
        deleteAttendanceSession,
        saveTask,
        deleteTask,
        submitStudentTask,
        reviewTaskSubmission,
        saveGradeWeights,
        saveGradeRecordsBatch,
        saveOnlineClass,
        updateOnlineClassStatus,
        deleteOnlineClass,
        saveOnlineClassProgress,
        addOnlineClassComment,
        togglePinOnlineClassComment,
        deleteOnlineClassComment,
        activityGalleryPhotos,
        saveActivityGalleryPhoto,
        resetActivityGalleryPhoto,
        updateUserProfileAvatar,
        resetDemoData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useData harus digunakan di dalam DataProvider');
  }
  return ctx;
}
