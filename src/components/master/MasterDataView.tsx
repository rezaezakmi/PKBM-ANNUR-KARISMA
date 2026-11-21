import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownUp,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  compareClassroomsByJenjang,
  downloadStudentTemplateExcel,
  exportRecordsToExcel,
  getStudentsForClassroom,
  ImportStudentsBatchResult,
  parseStudentsExcelWithPreview,
  resolveStudentPlacement,
  StudentImportParseResult,
  StudentImportPreviewRow,
} from '../../utils/excelUtils';
import { CIPANAS_CLASSES } from '../../data/cipanasMasterData';
import {
  Classroom,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from '../../types/siakad';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { InitialAvatar } from '../ui/InitialAvatar';
import { TableSkeleton } from '../ui/SkeletonLoader';
import { StatusBadge } from '../ui/StatusBadge';
import { MasterEntityModal, MasterTabType } from './MasterEntityModal';
import { StudentImportPreviewModal } from './StudentImportPreviewModal';
import { BulkStudentAccountModal } from '../accounts/BulkStudentAccountModal';
import { getStaggerItemProps, useAdaptiveMotion } from '../../config/animations';

interface MasterDataViewProps {
  entityType: MasterTabType;
  globalSearch: string;
}

const PAGE_SIZE = 7;

export const MasterDataView: React.FC<MasterDataViewProps> = ({
  entityType,
  globalSearch,
}) => {
  const { profile, effectiveRole } = useAuth();
  const {
    students,
    teachers,
    subjects,
    classes,
    assignments,
    accounts,
    loading,
    schoolSettings,
    selectedProgram,
    setSelectedProgram,
    saveClassroom,
    deleteStudent,
    deleteTeacher,
    deleteSubject,
    deleteClassroom,
    deleteAssignment,
    importStudentsBatch,
    bulkAssignStudentsClass,
    syncClassroomsAndStudents,
    applyCanonicalCipanasSpreadsheetData,
    syncKurikulumMerdekaSubjects,
    autoDistributeTeachersAllClasses,
  } = useData();
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();

  const [search, setSearch] = useState('');
  const paketFilter = effectiveRole === 'murid' ? 'Semua' : selectedProgram;
  const setPaketFilter = setSelectedProgram;
  const [classFilter, setClassFilter] = useState<string>('Semua');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [sortAsc, setSortAsc] = useState(true);
  const [sortField, setSortField] = useState<'primary' | 'secondary'>('primary');
  const [page, setPage] = useState(1);

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkMoveModalOpen, setBulkMoveModalOpen] = useState(false);
  const [bulkTargetClassId, setBulkTargetClassId] = useState<string>('');
  const [bulkMoving, setBulkMoving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<unknown | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seedingClasses, setSeedingClasses] = useState(false);
  const [syncingRombel, setSyncingRombel] = useState(false);
  const [applyingSpreadsheet, setApplyingSpreadsheet] = useState(false);
  const [syncingKurikulum, setSyncingKurikulum] = useState(false);
  const [distributingTeachers, setDistributingTeachers] = useState(false);

  // Modal Daftar Murid per Kelas / Rombel
  const [rosterClassId, setRosterClassId] = useState<string | null>(null);
  const [rosterTab, setRosterTab] = useState<'members' | 'assign'>('members');
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterShowAllPaket, setRosterShowAllPaket] = useState(false);
  const [rosterSelectedIds, setRosterSelectedIds] = useState<string[]>([]);
  const [rosterAssigning, setRosterAssigning] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importParseResult, setImportParseResult] = useState<StudentImportParseResult | null>(null);
  const [importingStudents, setImportingStudents] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportStudentsBatchResult | null>(null);
  const [bulkStudentAccountOpen, setBulkStudentAccountOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeRosterClass = useMemo(
    () => (rosterClassId ? classes.find((c) => c.id === rosterClassId) || null : null),
    [rosterClassId, classes]
  );

  const rosterMembers = useMemo(() => {
    if (!activeRosterClass) return [];
    return getStudentsForClassroom(activeRosterClass, students, classes).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'id')
    );
  }, [activeRosterClass, students, classes]);

  const rosterCandidateStudents = useMemo(() => {
    if (!activeRosterClass) return [];
    const memberSet = new Set(rosterMembers.map((s) => s.id));
    const q = rosterSearch.trim().toLowerCase();
    return students
      .filter((s) => {
        if (memberSet.has(s.id)) return false;
        const placed = resolveStudentPlacement(s, classes);
        if (!rosterShowAllPaket && placed.paket !== activeRosterClass.paket) return false;
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.nis.toLowerCase().includes(q) ||
          placed.fullClassLabel.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
  }, [activeRosterClass, rosterMembers, students, classes, rosterSearch, rosterShowAllPaket]);

  const handleSyncRombelAndStudents = async () => {
    setSyncingRombel(true);
    try {
      const res = await syncClassroomsAndStudents();
      if (res.fixedStudents > 0 || res.updatedClasses > 0 || res.syncedAccounts > 0) {
        showToast(
          `Sinkronisasi selesai: ${res.fixedStudents} murid, ${res.updatedClasses} rombel, dan ${res.syncedAccounts} akun login diselaraskan.`,
          'success'
        );
      } else {
        showToast('Seluruh data rombel, jumlah murid, dan akses guru sudah sinkron.', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyinkronkan rombel & murid.', 'error');
    } finally {
      setSyncingRombel(false);
    }
  };

  const handleApplyCipanasSpreadsheet = async () => {
    setApplyingSpreadsheet(true);
    try {
      const res = await applyCanonicalCipanasSpreadsheetData();
      showToast(
        `Berhasil dirapikan sesuai spreadsheet: ${res.totalClasses} rombel Cipanas & ${res.totalStudents} siswa (${res.createdStudents} baru, ${res.updatedStudents} diperbarui${res.syncedAccounts > 0 ? `, ${res.syncedAccounts} akun login diselaraskan` : ''}).`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal merapikan data sesuai spreadsheet.',
        'error'
      );
    } finally {
      setApplyingSpreadsheet(false);
    }
  };

  const handleOpenRosterModal = (cls: Classroom) => {
    setRosterClassId(cls.id);
    setRosterTab('members');
    setRosterSearch('');
    setRosterShowAllPaket(false);
    setRosterSelectedIds([]);
  };

  const handleAssignRosterStudents = async () => {
    if (!activeRosterClass || rosterSelectedIds.length === 0) return;
    setRosterAssigning(true);
    try {
      const res = await bulkAssignStudentsClass(rosterSelectedIds, activeRosterClass);
      setRosterSelectedIds([]);
      setRosterTab('members');
      showToast(
        `${res.updatedCount} murid berhasil dimasukkan ke ${activeRosterClass.name}.`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memasukkan murid ke rombel.', 'error');
    } finally {
      setRosterAssigning(false);
    }
  };

  // Sync global header search into local search when changed
  useEffect(() => {
    if (globalSearch) {
      setSearch(globalSearch);
    }
  }, [globalSearch]);

  // Reset pagination & entity-specific filters on entity switch (preserve global Program/Paket filter)
  useEffect(() => {
    setPage(1);
    setStatusFilter('Semua');
    setClassFilter('Semua');
    setSelectedStudentIds([]);
  }, [entityType]);

  // Reset class filter, page, and selection when global Program changes
  useEffect(() => {
    setPage(1);
    setClassFilter('Semua');
    setSelectedStudentIds([]);
  }, [selectedProgram]);

  const canModify = effectiveRole === 'admin';

  const studentsWithoutAccountCount = useMemo(() => {
    const linkedIds = new Set(
      accounts.filter((a) => a.role === 'murid' && a.linkedEntityId).map((a) => a.linkedEntityId!)
    );
    const linkedNis = new Set(
      accounts.filter((a) => a.role === 'murid' && a.nis).map((a) => a.nis!.trim().toLowerCase())
    );
    return students.filter(
      (s) => !linkedIds.has(s.id) && !(s.nis && linkedNis.has(s.nis.trim().toLowerCase()))
    ).length;
  }, [students, accounts]);

  // Scoped records per role
  const currentTeacher = useMemo(() => {
    if (effectiveRole !== 'guru') return null;
    return (
      teachers.find(
        (t) =>
          t.id === profile?.linkedEntityId ||
          t.ownerUid === profile?.uid ||
          (Boolean(profile?.nip) && t.nip === profile?.nip) ||
          (Boolean(profile?.email) && t.email === profile?.email)
      ) || teachers[0] || null
    );
  }, [effectiveRole, teachers, profile]);

  const currentStudent = useMemo(() => {
    if (effectiveRole !== 'murid') return null;
    return (
      students.find((s) => s.id === profile?.linkedEntityId || s.nis === profile?.nis) ||
      students[0] ||
      null
    );
  }, [effectiveRole, students, profile]);

  const roleScopedStudents = useMemo(() => {
    if (effectiveRole === 'murid') {
      return currentStudent ? [currentStudent] : [];
    }
    // Guru mengajar di seluruh Paket (A, B, C) & semua rombel/kelas aktif
    return students;
  }, [effectiveRole, students, currentStudent]);

  const roleScopedAssignments = useMemo(() => {
    if (effectiveRole === 'guru' && currentTeacher) {
      return assignments.filter(
        (a) => a.teacherId === currentTeacher.id || a.teacherUid === currentTeacher.ownerUid
      );
    }
    if (effectiveRole === 'murid' && currentStudent) {
      return assignments.filter((a) => a.classId === currentStudent.classId);
    }
    return assignments;
  }, [effectiveRole, assignments, currentTeacher, currentStudent]);

  const teacherProgramLookup = useMemo(() => {
    const ids = new Set<string>();
    const uids = new Set<string>();
    const names = new Set<string>();
    if (paketFilter === 'Semua') {
      return { ids, uids, names };
    }
    assignments
      .filter((a) => a.paket === paketFilter)
      .forEach((a) => {
        if (a.teacherId) ids.add(a.teacherId);
        if (a.teacherUid) uids.add(a.teacherUid);
        if (a.teacherName) names.add(a.teacherName.trim().toLowerCase());
      });
    classes
      .filter((c) => c.paket === paketFilter)
      .forEach((c) => {
        if (c.homeroomTeacherId) ids.add(c.homeroomTeacherId);
        if (c.homeroomTeacherName) names.add(c.homeroomTeacherName.trim().toLowerCase());
      });
    const paketLower = paketFilter.toLowerCase();
    accounts
      .filter((acc) => acc.role === 'guru' && (acc.classLabel || '').toLowerCase().includes(paketLower))
      .forEach((acc) => {
        if (acc.linkedEntityId) ids.add(acc.linkedEntityId);
        if (acc.uid) uids.add(acc.uid);
        if (acc.name) names.add(acc.name.trim().toLowerCase());
      });
    return { ids, uids, names };
  }, [paketFilter, assignments, classes, accounts]);

  // Kumpulan seluruh guru yang sudah memiliki penugasan / wali kelas pada program manapun,
  // agar guru yang baru diinput (belum ditugaskan) tidak pernah tersembunyi saat filter Paket aktif.
  const anyAssignedTeacherLookup = useMemo(() => {
    const ids = new Set<string>();
    const uids = new Set<string>();
    const names = new Set<string>();
    assignments.forEach((a) => {
      if (a.teacherId) ids.add(a.teacherId);
      if (a.teacherUid) uids.add(a.teacherUid);
      if (a.teacherName) names.add(a.teacherName.trim().toLowerCase());
    });
    classes.forEach((c) => {
      if (c.homeroomTeacherId) ids.add(c.homeroomTeacherId);
      if (c.homeroomTeacherName && c.homeroomTeacherName !== 'Belum Ditentukan') {
        names.add(c.homeroomTeacherName.trim().toLowerCase());
      }
    });
    return { ids, uids, names };
  }, [assignments, classes]);

  // Filtered + Sorted items
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (entityType === 'students') {
      const clsMap = new Map(classes.map((c) => [c.id, c]));
      return roleScopedStudents
        .filter((s) => {
          const matchQ =
            !q ||
            s.fullName.toLowerCase().includes(q) ||
            s.nis.toLowerCase().includes(q) ||
            (s.nisn || '').toLowerCase().includes(q) ||
            s.className.toLowerCase().includes(q) ||
            (s.guardianName || '').toLowerCase().includes(q);
          const matchP = paketFilter === 'Semua' || s.paket === paketFilter;
          const matchC = classFilter === 'Semua' || s.classId === classFilter;
          const matchS = statusFilter === 'Semua' || s.status === statusFilter;
          return matchQ && matchP && matchC && matchS;
        })
        .sort((a, b) => {
          if (sortField === 'secondary') {
            return sortAsc ? a.nis.localeCompare(b.nis, 'id') : b.nis.localeCompare(a.nis, 'id');
          }
          // Urut rapi sesuai Jenjang (Paket A -> B -> C) -> Tingkat & Rombel -> Nama Lengkap A-Z
          const clsA = clsMap.get(a.classId);
          const clsB = clsMap.get(b.classId);
          const jenjangCmp = compareClassroomsByJenjang(
            { paket: clsA?.paket || a.paket, name: clsA?.name || a.className, gradeLevel: clsA?.gradeLevel || '' },
            { paket: clsB?.paket || b.paket, name: clsB?.name || b.className, gradeLevel: clsB?.gradeLevel || '' }
          );
          if (jenjangCmp !== 0) return sortAsc ? jenjangCmp : -jenjangCmp;
          return sortAsc
            ? a.fullName.localeCompare(b.fullName, 'id')
            : b.fullName.localeCompare(a.fullName, 'id');
        });
    }

    if (entityType === 'teachers') {
      return teachers
        .filter((t) => {
          const matchQ =
            !q ||
            t.fullName.toLowerCase().includes(q) ||
            t.nip.toLowerCase().includes(q) ||
            t.specialization.toLowerCase().includes(q);
          const normName = t.fullName.trim().toLowerCase();
          const hasAnyAssignment =
            anyAssignedTeacherLookup.ids.has(t.id) ||
            (Boolean(t.ownerUid) && anyAssignedTeacherLookup.uids.has(t.ownerUid)) ||
            anyAssignedTeacherLookup.names.has(normName);
          const matchP =
            paketFilter === 'Semua' ||
            t.status === 'Aktif' ||
            !hasAnyAssignment ||
            teacherProgramLookup.ids.has(t.id) ||
            (Boolean(t.ownerUid) && teacherProgramLookup.uids.has(t.ownerUid)) ||
            teacherProgramLookup.names.has(normName);
          const matchS = statusFilter === 'Semua' || t.status === statusFilter;
          return matchQ && matchP && matchS;
        })
        .sort((a, b) => {
          const valA = sortField === 'primary' ? a.fullName : a.nip;
          const valB = sortField === 'primary' ? b.fullName : b.nip;
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
    }

    if (entityType === 'subjects') {
      return subjects
        .filter((m) => {
          const matchQ =
            !q ||
            m.name.toLowerCase().includes(q) ||
            m.code.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q);
          const matchP = paketFilter === 'Semua' || m.paket === paketFilter;
          const matchS = statusFilter === 'Semua' || m.status === statusFilter;
          return matchQ && matchP && matchS;
        })
        .sort((a, b) => {
          const valA = sortField === 'primary' ? a.name : a.code;
          const valB = sortField === 'primary' ? b.name : b.code;
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
    }

    if (entityType === 'classes') {
      return classes
        .filter((c) => {
          const matchQ =
            !q ||
            c.name.toLowerCase().includes(q) ||
            c.homeroomTeacherName.toLowerCase().includes(q) ||
            c.gradeLevel.toLowerCase().includes(q);
          const matchP = paketFilter === 'Semua' || c.paket === paketFilter;
          const matchS = statusFilter === 'Semua' || c.status === statusFilter;
          return matchQ && matchP && matchS;
        })
        .sort((a, b) => {
          const cmp = compareClassroomsByJenjang(a, b);
          return sortAsc ? cmp : -cmp;
        });
    }

    // assignments
    return roleScopedAssignments
      .filter((a) => {
        const matchQ =
          !q ||
          a.teacherName.toLowerCase().includes(q) ||
          a.subjectName.toLowerCase().includes(q) ||
          a.className.toLowerCase().includes(q);
        const matchP = paketFilter === 'Semua' || a.paket === paketFilter;
        const matchS = statusFilter === 'Semua' || a.status === statusFilter;
        return matchQ && matchP && matchS;
      })
      .sort((a, b) => {
        const valA = sortField === 'primary' ? a.teacherName : a.scheduleDay;
        const valB = sortField === 'primary' ? b.teacherName : b.scheduleDay;
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [
    entityType,
    search,
    paketFilter,
    classFilter,
    statusFilter,
    sortAsc,
    sortField,
    roleScopedStudents,
    teachers,
    teacherProgramLookup,
    anyAssignedTeacherLookup,
    subjects,
    classes,
    roleScopedAssignments,
  ]);

  const effectivePageSize =
    entityType === 'classes' ? 12 : entityType === 'students' ? 15 : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / effectivePageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice(
    (safePage - 1) * effectivePageSize,
    safePage * effectivePageSize
  );

  const jenjangSummary = useMemo(() => {
    const programs: Array<'Paket A' | 'Paket B' | 'Paket C'> = ['Paket A', 'Paket B', 'Paket C'];
    return programs.map((paket) => {
      const rombelList = classes.filter((c) => c.paket === paket);
      const studentTotal = roleScopedStudents.filter((s) => s.paket === paket).length;
      return {
        paket,
        rombelCount: rombelList.length,
        studentCount: studentTotal,
      };
    });
  }, [classes, roleScopedStudents]);

  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      showToast('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    if (entityType === 'students') {
      const rows = (filteredItems as Student[]).map((s) => ({
        NIS: s.nis,
        NISN: s.nisn || '-',
        'Nama Lengkap': s.fullName,
        'Jenis Kelamin': s.gender,
        Paket: s.paket,
        Kelas: s.className,
        Telepon: s.phone || '-',
        Status: s.status,
      }));
      exportRecordsToExcel(rows, 'Data_Murid_PKBM_Annur_Karisma', 'Murid');
    } else if (entityType === 'teachers') {
      const rows = (filteredItems as Teacher[]).map((t) => ({
        NIP: t.nip,
        'Nama Lengkap': t.fullName,
        'Jenis Kelamin': t.gender,
        Keahlian: t.specialization,
        Pendidikan: t.education || '-',
        Telepon: t.phone || '-',
        Status: t.status,
      }));
      exportRecordsToExcel(rows, 'Data_Guru_PKBM_Annur_Karisma', 'Guru');
    } else if (entityType === 'subjects') {
      const rows = (filteredItems as Subject[]).map((m) => ({
        Kode: m.code,
        'Mata Pelajaran': m.name,
        Paket: m.paket,
        Kelompok: m.category,
        'Jam/Minggu': m.hoursPerWeek,
        KKM: m.kkm,
        Status: m.status,
      }));
      exportRecordsToExcel(rows, 'Data_Mapel_PKBM_Annur_Karisma', 'Mapel');
    } else if (entityType === 'classes') {
      const rows = (filteredItems as Classroom[]).map((c) => ({
        Rombel: c.name,
        Paket: c.paket,
        Tingkat: c.gradeLevel,
        'Wali Kelas': c.homeroomTeacherName,
        'Tahun Ajaran': c.academicYear,
        'Jumlah Murid': c.studentCount,
        Kapasitas: c.capacity,
        Status: c.status,
      }));
      exportRecordsToExcel(rows, 'Data_Kelas_PKBM_Annur_Karisma', 'Kelas');
    } else {
      const rows = (filteredItems as TeachingAssignment[]).map((a) => ({
        Guru: a.teacherName,
        'Mata Pelajaran': a.subjectName,
        Kelas: a.className,
        Paket: a.paket,
        Hari: a.scheduleDay,
        Waktu: a.scheduleTime,
        Status: a.status,
      }));
      exportRecordsToExcel(rows, 'Penugasan_Mengajar_PKBM_Annur_Karisma', 'Penugasan');
    }
    showToast('Berkas Excel berhasil diunduh', 'success');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportResult(null);
    setImportProgress(null);

    try {
      const parsedResult = await parseStudentsExcelWithPreview(file, students, classes);
      setImportParseResult(parsedResult);
      setImportModalOpen(true);

      if (parsedResult.fatalError) {
        showToast(parsedResult.fatalError, 'error');
      }
    } catch (err) {
      const technicalDetail =
        err instanceof Error && err.message
          ? err.message
          : String(err || 'Kesalahan teknis tidak diketahui saat membaca berkas.');
      setImportParseResult({
        fileName: file.name,
        sheetName: '-',
        totalRowsScanned: 0,
        detectedHeaders: [],
        missingRequiredColumns: [],
        missingOptionalColumns: [],
        fatalError: technicalDetail,
        rows: [],
      });
      setImportModalOpen(true);
      showToast(technicalDetail, 'error');
    }
  };

  const handleConfirmImport = async (validRows: StudentImportPreviewRow[]) => {
    if (validRows.length === 0) return;
    setImportingStudents(true);
    setImportProgress({ done: 0, total: validRows.length });

    try {
      const payload = validRows.map((r) => ({
        rowNumber: r.rowNumber,
        nis: r.resolvedNis,
        nisn: r.nisn,
        fullName: r.fullName,
        gender: r.gender,
        paket: r.paket,
        className: r.className || r.resolvedClassName,
        email: r.email,
        phone: r.phone,
        address: r.address,
        guardianName: r.guardianName,
        status: r.status,
      }));

      const res = await importStudentsBatch(payload, (done, total) => {
        setImportProgress({ done, total });
      });
      setImportResult(res);

      const invalidSkipped = (importParseResult?.rows || []).filter((r) => !r.valid).length;
      const totalFailed = res.failedCount + invalidSkipped;

      if (res.successCount > 0 && totalFailed === 0) {
        showToast(`Import selesai: ${res.successCount} murid berhasil masuk, 0 gagal.`, 'success');
      } else if (res.successCount > 0) {
        showToast(
          `Import selesai: ${res.successCount} murid masuk, ${totalFailed} baris gagal/dilewati.`,
          'warning'
        );
      } else {
        showToast(
          `Import gagal: 0 murid masuk, ${totalFailed} baris gagal disimpan.`,
          'error'
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Terjadi kesalahan teknis saat menyimpan data ke database.';
      showToast(`Gagal mengimpor murid: ${msg}`, 'error');
    } finally {
      setImportingStudents(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (entityType === 'students') await deleteStudent(deleteTarget.id);
      else if (entityType === 'teachers') await deleteTeacher(deleteTarget.id);
      else if (entityType === 'subjects') await deleteSubject(deleteTarget.id);
      else if (entityType === 'classes') await deleteClassroom(deleteTarget.id);
      else if (entityType === 'assignments') await deleteAssignment(deleteTarget.id);

      showToast(`${deleteTarget.label} berhasil dihapus`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : `Gagal menghapus ${deleteTarget.label}.`,
        'error'
      );
    } finally {
      setDeleting(false);
    }
  };

  const toggleSort = (field: 'primary' | 'secondary') => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const headersMeta: Record<
    MasterTabType,
    { title: string; subtitle: string; addLabel: string }
  > = {
    students: {
      title: effectiveRole === 'murid' ? 'Data Induk Warga Belajar Anda' : 'Data Master Murid',
      subtitle:
        effectiveRole === 'murid'
          ? 'Informasi resmi kepesertaan Anda pada PKBM Annur Karisma'
          : 'Kelola biodata warga belajar Paket A, Paket B, dan Paket C',
      addLabel: 'Tambah Murid',
    },
    teachers: {
      title: 'Data Master Guru & Tutor',
      subtitle: 'Daftar pendidik dan tutor aktif PKBM Annur Karisma',
      addLabel: 'Tambah Guru',
    },
    subjects: {
      title: 'Kurikulum & Mata Pelajaran',
      subtitle: 'Daftar modul wajib, pemberdayaan, dan keterampilan kesetaraan',
      addLabel: 'Tambah Mapel',
    },
    classes: {
      title: 'Manajemen Kelas & Rombel',
      subtitle: 'Pengaturan rombongan belajar Paket A (6), Paket B (7–9), Paket C (10–12) & wali kelas',
      addLabel: 'Tambah Rombel',
    },
    assignments: {
      title:
        effectiveRole === 'murid'
          ? 'Jadwal Belajar Kelas Anda'
          : effectiveRole === 'guru'
            ? 'Mapel & Kelas Ampuan Saya'
            : 'Penugasan Guru ke Mapel & Kelas',
      subtitle: 'Pemetaan tutor pengampu mata pelajaran dan jadwal belajar PKBM (Sabtu – Minggu)',
      addLabel: 'Buat Penugasan',
    },
  };

  const standardPkbmClasses = useMemo(
    () =>
      CIPANAS_CLASSES.map((c) => ({
        id: c.id,
        paket: c.paket,
        name: c.name,
        gradeLevel: c.gradeLevel,
        capacity: c.capacity,
      })),
    []
  );

  const missingStandardClasses = useMemo(
    () =>
      standardPkbmClasses.filter(
        (std) =>
          !classes.some(
            (c) =>
              c.id === std.id ||
              c.name.trim().replace(/\s+/g, ' ').toLowerCase() ===
                std.name.trim().replace(/\s+/g, ' ').toLowerCase()
          )
      ),
    [classes, standardPkbmClasses]
  );

  const combinedClassOptions = useMemo<Classroom[]>(() => {
    const existingList = [...classes];
    const missingAsClassrooms: Classroom[] = missingStandardClasses.map((std) => ({
      id: existingList.some((c) => c.id === std.id) ? `${std.id}_std` : std.id,
      name: std.name,
      paket: std.paket,
      gradeLevel: std.gradeLevel,
      homeroomTeacherId: '',
      homeroomTeacherName: 'Belum Ditentukan',
      academicYear: schoolSettings.academicYear,
      capacity: 35,
      studentCount: 0,
      status: 'Aktif',
      createdBy: profile?.uid || 'admin',
    }));
    return [...existingList, ...missingAsClassrooms];
  }, [classes, missingStandardClasses, schoolSettings.academicYear, profile?.uid]);

  const handleSeedMissingClasses = async () => {
    if (missingStandardClasses.length === 0) return;
    setSeedingClasses(true);
    try {
      for (let i = 0; i < missingStandardClasses.length; i++) {
        const std = missingStandardClasses[i];
        const fallbackTeacher = teachers[i % Math.max(1, teachers.length)];
        await saveClassroom({
          id: classes.some((c) => c.id === std.id) ? undefined : std.id,
          name: std.name,
          paket: std.paket,
          gradeLevel: std.gradeLevel,
          homeroomTeacherId: fallbackTeacher?.id || '',
          homeroomTeacherName: fallbackTeacher?.fullName || 'Belum Ditentukan',
          academicYear: schoolSettings.academicYear,
          capacity: 30,
          studentCount: 0,
          status: 'Aktif',
        });
      }
      showToast(
        `${missingStandardClasses.length} kelas standar PKBM (Paket A–C) berhasil dilengkapi.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal melengkapi kelas PKBM.',
        'error'
      );
    } finally {
      setSeedingClasses(false);
    }
  };

  const handleSyncKurikulumMerdeka = async () => {
    setSyncingKurikulum(true);
    try {
      const res = await syncKurikulumMerdekaSubjects();
      showToast(
        res.addedCount > 0 || res.updatedCount > 0
          ? `Mapel Kurikulum Merdeka disinkronkan: +${res.addedCount} mapel baru, ${res.updatedCount} diperbarui (total ${res.totalCount} mapel Paket A, B, C).`
          : `Seluruh ${res.totalCount} mata pelajaran Kurikulum Merdeka (Paket A, B, C) sudah lengkap.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyinkronkan mata pelajaran Kurikulum Merdeka.',
        'error'
      );
    } finally {
      setSyncingKurikulum(false);
    }
  };

  const handleAutoDistributeTeachersAllClasses = async () => {
    setDistributingTeachers(true);
    try {
      const res = await autoDistributeTeachersAllClasses();
      showToast(
        `${res.teacherCount} guru/tutor resmi PKBM & seluruh mata pelajaran Kurikulum Merdeka (termasuk Pramuka & Menjahit) telah disinkronkan ke ${res.classCount} rombel Paket A, B, C (+${res.createdCount} penugasan baru, ${res.updatedCount} diperbarui).`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyinkronkan data guru & penugasan semua kelas.',
        'error'
      );
    } finally {
      setDistributingTeachers(false);
    }
  };

  const handleConfirmBulkMoveClass = async () => {
    if (selectedStudentIds.length === 0 || !bulkTargetClassId) return;
    const targetCls = combinedClassOptions.find((c) => c.id === bulkTargetClassId);
    if (!targetCls) return;

    setBulkMoving(true);
    try {
      const res = await bulkAssignStudentsClass(selectedStudentIds, targetCls);
      setBulkMoveModalOpen(false);
      setSelectedStudentIds([]);
      showToast(
        `${res.updatedCount} murid dipindahkan ke ${targetCls.name}${res.syncedAccountsCount > 0 ? ` (${res.syncedAccountsCount} akun login disinkronkan)` : ''}.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memindahkan kelas murid.',
        'error'
      );
    } finally {
      setBulkMoving(false);
    }
  };

  // Dedicated Clean Personal Card View for Murid on 'students' route
  if (effectiveRole === 'murid' && entityType === 'students' && currentStudent) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <InitialAvatar name={currentStudent.fullName} size="lg" />
              <div>
                <h2 className="font-display font-extrabold text-xl text-slate-900 dark:text-white">
                  {currentStudent.fullName}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  NIS <span className="font-mono font-semibold">{currentStudent.nis}</span> ·{' '}
                  {currentStudent.paket} · {currentStudent.className}
                </p>
              </div>
            </div>
            <StatusBadge status={currentStudent.status} />
          </div>

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">NISN</dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100">
                {currentStudent.nisn || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Jenis Kelamin</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {currentStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Orang Tua / Wali</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {currentStudent.guardianName || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Email Terdaftar</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {currentStudent.email || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Nomor Telepon</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {currentStudent.phone || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Alamat</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {currentStudent.address || '-'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
            {headersMeta[entityType].title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {headersMeta[entityType].subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canModify && entityType === 'students' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportExcel}
                className="hidden"
              />
              <button
                type="button"
                onClick={downloadStudentTemplateExcel}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Template Excel</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-700/30 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Import Excel</span>
              </button>
              {students.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBulkStudentAccountOpen(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-600/30 dark:border-sky-500/30 bg-sky-50/80 dark:bg-sky-950/40 text-xs font-semibold text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {studentsWithoutAccountCount > 0
                      ? `Buat Akun Login (${studentsWithoutAccountCount})`
                      : 'Akun Login Murid'}
                  </span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-amber-600" />
            <span>Export Excel</span>
          </button>

          {canModify && (entityType === 'students' || entityType === 'classes') && (
            <button
              type="button"
              disabled={applyingSpreadsheet}
              onClick={handleApplyCipanasSpreadsheet}
              title="Rapikan seluruh 9 rombel Cipanas & 238 siswa persis sesuai spreadsheet tanpa memutus akun login yang sudah dibuat"
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50/90 dark:bg-emerald-950/50 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${applyingSpreadsheet ? 'animate-spin' : ''}`} />
              <span>
                {applyingSpreadsheet
                  ? 'Merapikan Data...'
                  : 'Rapikan Sesuai Spreadsheet'}
              </span>
            </button>
          )}

          {canModify && entityType === 'classes' && (
            <button
              type="button"
              disabled={syncingRombel}
              onClick={handleSyncRombelAndStudents}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/40 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${syncingRombel ? 'animate-spin' : ''}`} />
              <span>{syncingRombel ? 'Menyinkronkan...' : 'Sinkronkan Rombel & Murid'}</span>
            </button>
          )}

          {canModify && entityType === 'classes' && missingStandardClasses.length > 0 && (
            <button
              type="button"
              disabled={seedingClasses}
              onClick={handleSeedMissingClasses}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-700/30 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            >
              <GraduationCap className="w-4 h-4" />
              <span>
                {seedingClasses
                  ? 'Melengkapi...'
                  : `Lengkapi Rombel Cipanas (${missingStandardClasses.length})`}
              </span>
            </button>
          )}

          {canModify && entityType === 'subjects' && (
            <button
              type="button"
              disabled={syncingKurikulum}
              onClick={handleSyncKurikulumMerdeka}
              title="Lengkapi daftar mata pelajaran resmi Kurikulum Merdeka Kesetaraan untuk Paket A, Paket B, dan Paket C"
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50/90 dark:bg-emerald-950/50 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            >
              <BookOpenCheck className={`w-4 h-4 ${syncingKurikulum ? 'animate-pulse' : ''}`} />
              <span>
                {syncingKurikulum ? 'Melengkapi Mapel...' : 'Lengkapi Mapel Kurikulum Merdeka'}
              </span>
            </button>
          )}

          {canModify && (entityType === 'teachers' || entityType === 'assignments') && (
            <button
              type="button"
              disabled={distributingTeachers}
              onClick={handleAutoDistributeTeachersAllClasses}
              title="Rapikan ejaan 7 guru/tutor resmi PKBM Annur Karisma beserta seluruh mata pelajaran Kurikulum Merdeka (termasuk Pramuka & Menjahit) di semua rombel Paket A, B, dan C"
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50/90 dark:bg-emerald-950/50 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            >
              <Layers className={`w-4 h-4 ${distributingTeachers ? 'animate-pulse' : ''}`} />
              <span>
                {distributingTeachers
                  ? 'Menyinkronkan Guru & Mapel...'
                  : entityType === 'teachers'
                    ? 'Sinkronkan 7 Guru & Mapel PKBM'
                    : 'Sinkronkan Penugasan Semua Guru'}
              </span>
            </button>
          )}

          {canModify && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 active:scale-[0.98] transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{headersMeta[entityType].addLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Ringkasan Jenjang & Rombel (Paket A, B, C) */}
      {(entityType === 'students' || entityType === 'classes') && effectiveRole !== 'murid' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setPaketFilter('Semua');
              setClassFilter('Semua');
              setPage(1);
            }}
            className={`text-left rounded-2xl border p-3.5 transition-all ${
              paketFilter === 'Semua'
                ? 'border-emerald-600/50 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-sm'
                : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-emerald-500/30'
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Semua Jenjang
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                {roleScopedStudents.length} Siswa
              </span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {classes.length} Rombel
              </span>
            </div>
          </button>
          {jenjangSummary.map((item) => {
            const active = paketFilter === item.paket;
            const subLabel =
              item.paket === 'Paket A'
                ? 'Setara SD'
                : item.paket === 'Paket B'
                  ? 'Setara SMP'
                  : 'Setara SMA';
            return (
              <button
                key={item.paket}
                type="button"
                onClick={() => {
                  setPaketFilter(item.paket);
                  setClassFilter('Semua');
                  setPage(1);
                }}
                className={`text-left rounded-2xl border p-3.5 transition-all ${
                  active
                    ? 'border-emerald-600/50 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-sm'
                    : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-emerald-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    {item.paket}
                  </span>
                  <span className="text-[11px] text-slate-400">{subLabel}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {item.studentCount} Siswa
                  </span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                    {item.rombelCount} Rombel
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={
              entityType === 'students'
                ? 'Cari nama murid, NIS, NISN, rombel, atau wali...'
                : 'Cari nama, kode, atau keterangan...'
            }
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {effectiveRole !== 'murid' && (
            <select
              aria-label="Filter Program Paket"
              value={paketFilter}
              onChange={(e) => {
                setPaketFilter(e.target.value as 'Semua' | 'Paket A' | 'Paket B' | 'Paket C');
                setClassFilter('Semua');
                setPage(1);
              }}
              className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-semibold ${
                paketFilter !== 'Semua'
                  ? 'border-emerald-500/45 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <option value="Semua">Semua Program</option>
              <option value="Paket A">Paket A</option>
              <option value="Paket B">Paket B</option>
              <option value="Paket C">Paket C</option>
            </select>
          )}

          {entityType === 'students' && (
            <select
              aria-label="Filter Kelas / Rombel"
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[260px]"
            >
              <option value="Semua">Semua Rombel ({classes.filter((c) => paketFilter === 'Semua' || c.paket === paketFilter).length})</option>
              {classes
                .filter((c) => paketFilter === 'Semua' || c.paket === paketFilter)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.studentCount})
                  </option>
                ))}
            </select>
          )}

          <select
            aria-label="Filter Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <option value="Semua">Semua Status</option>
            <option value="Aktif">Aktif</option>
            {(entityType === 'students' || entityType === 'teachers') && (
              <>
                <option value="Cuti">Cuti</option>
                {entityType === 'students' && <option value="Lulus">Lulus</option>}
                <option value="Nonaktif">Nonaktif</option>
              </>
            )}
            {(entityType === 'subjects' || entityType === 'classes') && (
              <option value="Arsip">Arsip</option>
            )}
            {entityType === 'assignments' && <option value="Selesai">Selesai</option>}
          </select>

          <button
            type="button"
            onClick={() => toggleSort('primary')}
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
          >
            <ArrowDownUp className="w-4 h-4 text-emerald-600" />
            <span>{sortAsc ? 'A–Z' : 'Z–A'}</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar untuk Murid */}
      {canModify && entityType === 'students' && selectedStudentIds.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/35 bg-emerald-50/90 dark:bg-emerald-950/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            <strong>{selectedStudentIds.length}</strong> murid terpilih
            {filteredItems.length > selectedStudentIds.length && (
              <button
                type="button"
                onClick={() => setSelectedStudentIds((filteredItems as Student[]).map((s) => s.id))}
                className="ml-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 underline"
              >
                Pilih semua {filteredItems.length} murid di filter ini
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedStudentIds([])}
              className="min-h-[36px] px-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Batal Pilih
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkTargetClassId(combinedClassOptions[0]?.id || '');
                setBulkMoveModalOpen(true);
              }}
              className="min-h-[36px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Pindah Rombel / Kelas Massal</span>
            </button>
          </div>
        </div>
      )}

      {/* Indikator Sinkronisasi Program Global */}
      {paketFilter !== 'Semua' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/75 dark:bg-emerald-950/35 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-emerald-900 dark:text-emerald-200 font-medium">
            Menampilkan data terfilter untuk program <strong>{paketFilter}</strong>
            {entityType === 'teachers' &&
              ` (termasuk guru baru yang belum memiliki penugasan · total ${teachers.length} guru terdaftar)`}
            .
          </span>
          <button
            type="button"
            onClick={() => setPaketFilter('Semua')}
            className="font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            Tampilkan Semua Program
          </button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : paginatedItems.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Belum ada data yang sesuai"
          description={
            paketFilter !== 'Semua'
              ? `Tidak ada data pada filter global ${paketFilter}. Ubah pilihan Program di Header atau tambahkan entri baru.`
              : 'Coba ubah kata kunci pencarian atau filter, atau tambahkan entri data baru ke sistem.'
          }
          actionLabel={canModify ? headersMeta[entityType].addLabel : undefined}
          onAction={
            canModify
              ? () => {
                  setEditingItem(null);
                  setModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <>
          {/* Desktop Data Table */}
          <div className="hidden md:block rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {entityType === 'students' && (
                      <>
                        {canModify && (
                          <th className="py-3.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              aria-label="Pilih semua murid di halaman ini"
                              checked={
                                (paginatedItems as Student[]).length > 0 &&
                                (paginatedItems as Student[]).every((s) =>
                                  selectedStudentIds.includes(s.id)
                                )
                              }
                              onChange={(e) => {
                                const pageIds = (paginatedItems as Student[]).map((s) => s.id);
                                if (e.target.checked) {
                                  setSelectedStudentIds((prev) =>
                                    Array.from(new Set([...prev, ...pageIds]))
                                  );
                                } else {
                                  const pageSet = new Set(pageIds);
                                  setSelectedStudentIds((prev) =>
                                    prev.filter((id) => !pageSet.has(id))
                                  );
                                }
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </th>
                        )}
                        <th className="py-3.5 px-4">
                          <button type="button" onClick={() => toggleSort('primary')} className="hover:text-emerald-700">
                            Nama Murid
                          </button>
                        </th>
                        <th className="py-3.5 px-4">
                          <button type="button" onClick={() => toggleSort('secondary')} className="hover:text-emerald-700">
                            NIS / NISN
                          </button>
                        </th>
                        <th className="py-3.5 px-4">Program & Rombel</th>
                        <th className="py-3.5 px-4">Kontak</th>
                        <th className="py-3.5 px-4">Status</th>
                        {canModify && <th className="py-3.5 px-4 text-right">Aksi</th>}
                      </>
                    )}
                    {entityType === 'teachers' && (
                      <>
                        <th className="py-3.5 px-4">Nama Guru / Tutor</th>
                        <th className="py-3.5 px-4">NIP</th>
                        <th className="py-3.5 px-4">Bidang Keahlian</th>
                        <th className="py-3.5 px-4">Kontak</th>
                        <th className="py-3.5 px-4">Status</th>
                        {canModify && <th className="py-3.5 px-4 text-right">Aksi</th>}
                      </>
                    )}
                    {entityType === 'subjects' && (
                      <>
                        <th className="py-3.5 px-4">Kode</th>
                        <th className="py-3.5 px-4">Nama Mata Pelajaran</th>
                        <th className="py-3.5 px-4">Program & Kelompok</th>
                        <th className="py-3.5 px-4 text-right">Jam/Mgg</th>
                        <th className="py-3.5 px-4 text-right">KKM</th>
                        <th className="py-3.5 px-4">Status</th>
                        {canModify && <th className="py-3.5 px-4 text-right">Aksi</th>}
                      </>
                    )}
                    {entityType === 'classes' && (
                      <>
                        <th className="py-3.5 px-4">Nama Kelas / Rombel</th>
                        <th className="py-3.5 px-4">Program</th>
                        <th className="py-3.5 px-4">Wali Kelas</th>
                        <th className="py-3.5 px-4">Murid &amp; Kapasitas</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-right">Aksi</th>
                      </>
                    )}
                    {entityType === 'assignments' && (
                      <>
                        <th className="py-3.5 px-4">Guru / Tutor</th>
                        <th className="py-3.5 px-4">Mata Pelajaran</th>
                        <th className="py-3.5 px-4">Kelas / Rombel</th>
                        <th className="py-3.5 px-4">Jadwal</th>
                        <th className="py-3.5 px-4">Status</th>
                        {canModify && <th className="py-3.5 px-4 text-right">Aksi</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {entityType === 'students' &&
                    (paginatedItems as Student[]).map((s, idx) => (
                      <motion.tr
                        key={s.id}
                        {...getStaggerItemProps(idx, motionProfile)}
                        className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                      >
                        {canModify && (
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${s.fullName}`}
                              checked={selectedStudentIds.includes(s.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStudentIds((prev) =>
                                    prev.includes(s.id) ? prev : [...prev, s.id]
                                  );
                                } else {
                                  setSelectedStudentIds((prev) => prev.filter((id) => id !== s.id));
                                }
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <InitialAvatar name={s.fullName} size="sm" />
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{s.fullName}</p>
                              <p className="text-xs text-slate-500">{s.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                          <div>{s.nis}</div>
                          <div className="text-slate-400">{s.nisn || '-'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{s.className}</p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">{s.paket}</p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                          <div>{s.phone || '-'}</div>
                          <div className="truncate max-w-[160px]">{s.email || '-'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={s.status} />
                        </td>
                        {canModify && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(s);
                                  setModalOpen(true);
                                }}
                                aria-label={`Edit ${s.fullName}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: s.id, label: s.fullName })}
                                aria-label={`Hapus ${s.fullName}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    ))}

                  {entityType === 'teachers' &&
                    (paginatedItems as Teacher[]).map((t, idx) => (
                      <motion.tr
                        key={t.id}
                        {...getStaggerItemProps(idx, motionProfile)}
                        className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <InitialAvatar name={t.fullName} size="sm" />
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{t.fullName}</p>
                              <p className="text-xs text-slate-500">{t.education || 'Sarjana Pendidikan'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                          {t.nip}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                          {t.specialization}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                          <div>{t.phone || '-'}</div>
                          <div>{t.email || '-'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={t.status} />
                        </td>
                        {canModify && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(t);
                                  setModalOpen(true);
                                }}
                                aria-label={`Edit ${t.fullName}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: t.id, label: t.fullName })}
                                aria-label={`Hapus ${t.fullName}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    ))}

                  {entityType === 'subjects' &&
                    (paginatedItems as Subject[]).map((m, idx) => (
                      <motion.tr
                        key={m.id}
                        {...getStaggerItemProps(idx, motionProfile)}
                        className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          {m.code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{m.name}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                          {m.paket} · {m.category}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums font-medium">{m.hoursPerWeek} JP</td>
                        <td className="py-3 px-4 text-right tabular-nums font-semibold">{m.kkm}</td>
                        <td className="py-3 px-4">
                          <StatusBadge status={m.status} />
                        </td>
                        {canModify && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(m);
                                  setModalOpen(true);
                                }}
                                aria-label={`Edit ${m.name}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: m.id, label: m.name })}
                                aria-label={`Hapus ${m.name}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    ))}

                  {entityType === 'classes' &&
                    (paginatedItems as Classroom[]).map((c, idx) => {
                      const classStudents = getStudentsForClassroom(c, students, classes);
                      const liveCount = classStudents.length;
                      return (
                        <motion.tr
                          key={c.id}
                          {...getStaggerItemProps(idx, motionProfile)}
                          className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
                            <p className="text-xs text-slate-500">{c.gradeLevel}</p>
                          </td>
                          <td className="py-3 px-4 font-semibold text-emerald-700 dark:text-emerald-400 text-xs">
                            {c.paket}
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{c.homeroomTeacherName}</td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleOpenRosterModal(c)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                                liveCount > 0
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>
                                {liveCount} / {Math.max(c.capacity, liveCount)} Murid
                              </span>
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenRosterModal(c)}
                                title={`Kelola / lihat daftar murid ${c.name}`}
                                className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 inline-flex items-center gap-1"
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>Murid</span>
                              </button>
                              {canModify && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItem(c);
                                      setModalOpen(true);
                                    }}
                                    aria-label={`Edit ${c.name}`}
                                    className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget({ id: c.id, label: c.name })}
                                    aria-label={`Hapus ${c.name}`}
                                    className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}

                  {entityType === 'assignments' &&
                    (paginatedItems as TeachingAssignment[]).map((a, idx) => (
                      <motion.tr
                        key={a.id}
                        {...getStaggerItemProps(idx, motionProfile)}
                        className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <InitialAvatar name={a.teacherName} size="sm" />
                            <span className="font-semibold text-slate-900 dark:text-white">{a.teacherName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{a.subjectName}</td>
                        <td className="py-3 px-4">
                          <p className="text-slate-800 dark:text-slate-200">{a.className}</p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">{a.paket}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                          {a.scheduleDay}, {a.scheduleTime}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={a.status} />
                        </td>
                        {canModify && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(a);
                                  setModalOpen(true);
                                }}
                                aria-label={`Edit penugasan ${a.subjectName}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: a.id, label: `${a.teacherName} - ${a.subjectName}` })}
                                aria-label={`Hapus penugasan ${a.subjectName}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Responsive Card View */}
          <div className="md:hidden space-y-3">
            {entityType === 'students' &&
              (paginatedItems as Student[]).map((s, idx) => (
                <motion.div
                  key={s.id}
                  {...getStaggerItemProps(idx, motionProfile)}
                  className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <InitialAvatar name={s.fullName} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{s.fullName}</p>
                        <p className="text-xs font-mono text-slate-500">NIS {s.nis}</p>
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">{s.paket}</span>
                    <span>·</span>
                    <span>{s.className}</span>
                    {s.phone && (
                      <>
                        <span>·</span>
                        <span>{s.phone}</span>
                      </>
                    )}
                  </div>
                  {canModify && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(s);
                          setModalOpen(true);
                        }}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: s.id, label: s.fullName })}
                        className="min-h-[44px] px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}

            {entityType === 'teachers' &&
              (paginatedItems as Teacher[]).map((t, idx) => (
                <motion.div
                  key={t.id}
                  {...getStaggerItemProps(idx, motionProfile)}
                  className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <InitialAvatar name={t.fullName} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{t.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{t.specialization}</p>
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-xs font-mono text-slate-500">NIP {t.nip}</div>
                  {canModify && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(t);
                          setModalOpen(true);
                        }}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: t.id, label: t.fullName })}
                        className="min-h-[44px] px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600"
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}

            {entityType === 'subjects' &&
              (paginatedItems as Subject[]).map((m, idx) => (
                <motion.div
                  key={m.id}
                  {...getStaggerItemProps(idx, motionProfile)}
                  className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {m.code}
                      </span>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{m.name}</p>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {m.paket} · {m.category} · {m.hoursPerWeek} JP/Mgg · KKM {m.kkm}
                  </p>
                  {canModify && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(m);
                          setModalOpen(true);
                        }}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: m.id, label: m.name })}
                        className="min-h-[44px] px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600"
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}

            {entityType === 'classes' &&
              (paginatedItems as Classroom[]).map((c, idx) => {
                const liveCount = getStudentsForClassroom(c, students, classes).length;
                return (
                  <motion.div
                    key={c.id}
                    {...getStaggerItemProps(idx, motionProfile)}
                    className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{c.name}</p>
                        <p className="text-xs text-slate-500">
                          {c.paket} · {c.gradeLevel}
                        </p>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Wali Kelas: <strong className="text-slate-800 dark:text-slate-200">{c.homeroomTeacherName}</strong> ·{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {liveCount}/{Math.max(c.capacity, liveCount)} Murid
                      </strong>
                    </p>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenRosterModal(c)}
                        className="min-h-[42px] px-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Daftar Murid ({liveCount})</span>
                      </button>
                      {canModify && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(c);
                              setModalOpen(true);
                            }}
                            className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ id: c.id, label: c.name })}
                            className="min-h-[42px] px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600"
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}

            {entityType === 'assignments' &&
              (paginatedItems as TeachingAssignment[]).map((a, idx) => (
                <motion.div
                  key={a.id}
                  {...getStaggerItemProps(idx, motionProfile)}
                  className="card-hover-lift rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{a.subjectName}</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                        {a.className}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Tutor: {a.teacherName} · {a.scheduleDay}, {a.scheduleTime}
                  </p>
                  {canModify && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(a);
                          setModalOpen(true);
                        }}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: a.id, label: a.subjectName })}
                        className="min-h-[44px] px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600"
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredItems.length)} dari {filteredItems.length} entri
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>
              <span className="px-3 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center gap-1"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <MasterEntityModal
        open={modalOpen}
        entityType={entityType}
        editingItem={editingItem}
        onClose={() => setModalOpen(false)}
        onSaved={(msg) => showToast(msg, 'success')}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Hapus "${deleteTarget?.label}"?`}
        description="Tindakan ini tidak dapat dibatalkan. Data akan dihapus dari basis data SIAKAD."
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <StudentImportPreviewModal
        open={importModalOpen}
        parseResult={importParseResult}
        importing={importingStudents}
        progress={importProgress}
        importResult={importResult}
        onClose={() => {
          if (!importingStudents) {
            setImportModalOpen(false);
            setImportParseResult(null);
            setImportResult(null);
            setImportProgress(null);
          }
        }}
        onChooseAnotherFile={() => {
          fileInputRef.current?.click();
        }}
        onConfirmImport={handleConfirmImport}
      />

      <BulkStudentAccountModal
        isOpen={bulkStudentAccountOpen}
        onClose={() => setBulkStudentAccountOpen(false)}
      />

      {/* Modal Pindah Rombel / Kelas Massal */}
      {bulkMoveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Pindah Kelas Massal"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display font-extrabold text-base text-slate-900 dark:text-white">
                Pindah Kelas / Rombel Massal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Memindahkan <strong>{selectedStudentIds.length} murid terpilih</strong> ke kelas yang sesuai serta menyinkronkan label kelas di akun login mereka.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Pilih Paket &amp; Kelas Tujuan
              </label>
              <select
                value={bulkTargetClassId}
                onChange={(e) => setBulkTargetClassId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
              >
                {combinedClassOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.paket} · {c.name}
                  </option>
                ))}
              </select>
              {missingStandardClasses.length > 0 && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Kelas standar Paket A (6), Paket B (7, 8, 9), dan Paket C (10, 11, 12) akan dibuat otomatis jika belum tersedia.
                </p>
              )}
            </div>
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkMoving}
                onClick={() => setBulkMoveModalOpen(false)}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={bulkMoving || !bulkTargetClassId}
                onClick={handleConfirmBulkMoveClass}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-50"
              >
                {bulkMoving ? 'Memindahkan...' : `Pindahkan ${selectedStudentIds.length} Murid`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Daftar Murid & Kelola Anggota Rombel */}
      {activeRosterClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={`Daftar Murid ${activeRosterClass.name}`}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-950 flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                    {activeRosterClass.paket}
                  </span>
                  <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                    {activeRosterClass.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Wali Kelas: <strong>{activeRosterClass.homeroomTeacherName}</strong> ·{' '}
                  <strong>{rosterMembers.length}</strong> murid terdaftar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRosterClassId(null)}
                aria-label="Tutup daftar murid rombel"
                className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canModify && (
              <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRosterTab('members')}
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold transition-colors ${
                      rosterTab === 'members'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Anggota Rombel ({rosterMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterTab('assign')}
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      rosterTab === 'assign'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Masukkan Murid</span>
                  </button>
                </div>

                {rosterTab === 'assign' && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rosterShowAllPaket}
                      onChange={(e) => setRosterShowAllPaket(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Tampilkan semua Paket</span>
                  </label>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {rosterTab === 'members' ? (
                rosterMembers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Belum ada murid di rombel {activeRosterClass.name}.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {canModify
                        ? 'Klik tombol "Masukkan Murid" di atas untuk menempatkan murid sesuai paket & kelasnya.'
                        : 'Hubungi Admin apabila murid kelas ini belum tampil.'}
                    </p>
                    {canModify && (
                      <button
                        type="button"
                        onClick={() => setRosterTab('assign')}
                        className="min-h-[40px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Masukkan Murid ke Rombel Ini</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2.5 px-3 w-10 text-center">No</th>
                          <th className="py-2.5 px-3">NIS</th>
                          <th className="py-2.5 px-3">Nama Lengkap</th>
                          <th className="py-2.5 px-3 text-center">L/P</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rosterMembers.map((stu, idx) => (
                          <tr key={stu.id} className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20">
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">{stu.nis}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{stu.fullName}</td>
                            <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-300">{stu.gender}</td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={stu.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder="Cari nama murid, NIS, atau kelas asal..."
                      className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  {rosterCandidateStudents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
                      Tidak ada murid lain pada filter ini. Centang &ldquo;Tampilkan semua Paket&rdquo; untuk memindahkan murid dari rombel lain.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      {rosterCandidateStudents.map((stu) => {
                        const placed = resolveStudentPlacement(stu, classes);
                        const checked = rosterSelectedIds.includes(stu.id);
                        return (
                          <label
                            key={stu.id}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setRosterSelectedIds((prev) => [...prev, stu.id]);
                                  } else {
                                    setRosterSelectedIds((prev) => prev.filter((id) => id !== stu.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">
                                  {stu.fullName}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  NIS {stu.nis} · Saat ini: {placed.fullClassLabel}
                                </p>
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              {placed.paket}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {rosterTab === 'assign'
                  ? `${rosterSelectedIds.length} murid dipilih untuk dimasukkan`
                  : `Total ${rosterMembers.length} murid di ${activeRosterClass.name}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRosterClassId(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Tutup
                </button>
                {rosterTab === 'assign' && canModify && (
                  <button
                    type="button"
                    disabled={rosterAssigning || rosterSelectedIds.length === 0}
                    onClick={handleAssignRosterStudents}
                    className="min-h-[40px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {rosterAssigning
                      ? 'Menyimpan...'
                      : `Masukkan ${rosterSelectedIds.length} Murid ke Rombel`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
