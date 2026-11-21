import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Printer,
  Search,
  Shuffle,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ROLE_LABELS } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { isValidUsernameFormat, normalizeUsername } from '../../lib/firebase';
import {
  AccountImportRowPreview,
  createManagedAccount,
  deleteManagedAccount,
  downloadAccountImportTemplate,
  generateRandomPassword,
  parseAccountImportFile,
  resetManagedPassword,
  toggleManagedAccountStatus,
  updateManagedUsername,
} from '../../services/accountService';
import { PaketType, SessionIssuedCredential, Student, UserProfile, UserRole } from '../../types/siakad';
import {
  findStoredCredentialForAccount,
  loadStoredCredentials,
  mergeCredentialsMaps,
  removeStoredCredential,
  saveStoredCredentials,
  updateStoredCredentialMetadata,
} from '../../utils/credentialStore';
import {
  extractPaketFromText,
  formatStudentAccountClassLabel,
  resolveStudentPlacement,
} from '../../utils/excelUtils';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { InitialAvatar } from '../ui/InitialAvatar';
import { ProfilePhotoModal } from '../profile/ProfilePhotoModal';
import { CardPrintScope, LoginCardPrinterModal } from './LoginCardPrinterModal';
import { BulkStudentAccountModal } from './BulkStudentAccountModal';

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  admin: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
  kepala_pkbm: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
  guru: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300',
  murid: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function formatDateTime(iso?: string): string {
  if (!iso) return 'Belum pernah login';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Belum pernah login';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function suggestTeacherUsername(fullName: string): string {
  const withoutTitle = fullName.split(',')[0] || fullName;
  const parts = withoutTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'guru.pkbm';
  return parts.slice(0, 2).join('.').slice(0, 32);
}

interface BulkNewTeacherRow {
  rowId: string;
  fullName: string;
  nip: string;
  specialization: string;
  gender: 'L' | 'P';
  username: string;
  usernameEdited: boolean;
  password: string;
}

function makeUniqueTeacherUsername(base: string, usedSet: Set<string>): string {
  const cleanBase = isValidUsernameFormat(base) ? base : 'guru.pkbm';
  let candidate = cleanBase;
  let counter = 1;
  while (usedSet.has(candidate)) {
    candidate = `${cleanBase.slice(0, 34)}${counter}`;
    counter++;
  }
  usedSet.add(candidate);
  return candidate;
}

export const ManajemenAkunView: React.FC = () => {
  const { profile, effectiveRole } = useAuth();
  const {
    accounts,
    students,
    teachers,
    classes,
    assignments,
    schoolSettings,
    selectedProgram,
    setSelectedProgram,
    saveTeacher,
    issuedCredentialsMap: syncedCredentialsMap,
    syncClassroomsAndStudents,
  } = useData();
  const { showToast } = useToast();
  const adminUid = profile?.uid || '';
  const [syncingClassLabels, setSyncingClassLabels] = useState(false);

  // Pencarian & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'Semua' | UserRole>('Semua');
  const [statusFilter, setStatusFilter] = useState<'Semua' | 'Aktif' | 'Nonaktif'>('Semua');

  // Penyimpanan persisten password kartu login (gabungan Firestore login_card_credentials + localStorage)
  const [localCredentialsMap, setLocalCredentialsMap] = useState<
    Record<string, SessionIssuedCredential>
  >(() => loadStoredCredentials());
  const issuedCredentialsMap = useMemo(
    () => mergeCredentialsMaps(syncedCredentialsMap, localCredentialsMap),
    [syncedCredentialsMap, localCredentialsMap]
  );
  const [revealedCredential, setRevealedCredential] = useState<SessionIssuedCredential | null>(null);

  const persistCredentials = (creds: SessionIssuedCredential[]) => {
    if (creds.length === 0) return;
    const updated = saveStoredCredentials(creds);
    setLocalCredentialsMap(updated);
  };

  // Modal Tambah Akun
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('murid');
  const [linkedEntityId, setLinkedEntityId] = useState('');
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newClassLabel, setNewClassLabel] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(true);
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Modal Edit Username / Reset Password
  const [editingAccount, setEditingAccount] = useState<UserProfile | null>(null);
  const [editTab, setEditTab] = useState<'username' | 'reset'>('username');
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editClassLabel, setEditClassLabel] = useState('');
  const [resetPassValue, setResetPassValue] = useState('');
  const [showResetPass, setShowResetPass] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Confirm Hapus / Nonaktifkan
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'deactivate' | 'activate';
    account: UserProfile;
  } | null>(null);
  const [processingConfirm, setProcessingConfirm] = useState(false);

  // Modal Unggah Foto Profil Akun (Guru, Kepala Sekolah, Admin)
  const [photoTargetAccount, setPhotoTargetAccount] = useState<UserProfile | null>(null);

  // Modal Import Excel Massal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<AccountImportRowPreview[]>([]);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [executingImport, setExecutingImport] = useState(false);
  const [importReport, setImportReport] = useState<{
    succeeded: SessionIssuedCredential[];
    failed: Array<{ rowNumber: number; username: string; reason: string }>;
  } | null>(null);

  // Modal Cetak Kartu Login
  const [printerState, setPrinterState] = useState<{
    open: boolean;
    scope: CardPrintScope;
    selectedUid?: string;
    batchUids?: string[];
  }>({ open: false, scope: 'single' });

  // Modal Tambah Guru Sekaligus (Bulk) & Buat Akun Murid Serentak
  const [showBulkTeacherModal, setShowBulkTeacherModal] = useState(false);
  const [showBulkStudentModal, setShowBulkStudentModal] = useState(false);
  const [bulkTab, setBulkTab] = useState<'existing' | 'new'>('existing');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [bulkUsernames, setBulkUsernames] = useState<Record<string, string>>({});
  const [bulkPasswordMode, setBulkPasswordMode] = useState<'random' | 'uniform'>('random');
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkNewRows, setBulkNewRows] = useState<BulkNewTeacherRow[]>([]);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResultReport, setBulkResultReport] = useState<{
    succeeded: SessionIssuedCredential[];
    failed: Array<{ name: string; username: string; reason: string }>;
  } | null>(null);

  const createEmptyNewTeacherRow = (idx: number): BulkNewTeacherRow => ({
    rowId: `row_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
    fullName: '',
    nip: '',
    specialization: '',
    gender: 'L',
    username: '',
    usernameEdited: false,
    password: generateRandomPassword(8),
  });

  const openBulkTeacherModal = () => {
    const unlinked = teachers.filter((t) => !linkedTeacherIdsWithAccount.has(t.id));
    const used = new Set(accounts.map((a) => a.username.toLowerCase()));
    const initialUsernames: Record<string, string> = {};
    unlinked.forEach((t) => {
      initialUsernames[t.id] = makeUniqueTeacherUsername(suggestTeacherUsername(t.fullName), used);
    });
    setBulkUsernames(initialUsernames);
    setSelectedTeacherIds(unlinked.map((t) => t.id));
    setBulkPasswordMode('random');
    setBulkPassword(generateRandomPassword(8));
    setBulkNewRows([
      createEmptyNewTeacherRow(0),
      createEmptyNewTeacherRow(1),
      createEmptyNewTeacherRow(2),
    ]);
    setShowPasteBox(false);
    setPasteText('');
    setBulkResultReport(null);
    setBulkTab(unlinked.length > 0 ? 'existing' : 'new');
    setShowBulkTeacherModal(true);
  };

  const handleApplyPasteTeachers = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast('Tempel minimal satu baris nama guru terlebih dahulu.', 'error');
      return;
    }

    const used = new Set(accounts.map((a) => a.username.toLowerCase()));
    bulkNewRows.forEach((r) => {
      if (r.fullName.trim() && r.username.trim()) {
        used.add(normalizeUsername(r.username));
      }
    });

    const parsedRows: BulkNewTeacherRow[] = lines.map((line, i) => {
      const cols = line.split(/[|\t;,]+/).map((c) => c.trim());
      const fullName = cols[0] || '';
      const nip = cols[1] || '';
      const specialization = cols[2] || 'Tutor Mata Pelajaran';
      const rawGender = (cols[3] || '').toUpperCase();
      const gender: 'L' | 'P' = rawGender === 'P' || rawGender === 'PEREMPUAN' ? 'P' : 'L';
      const username = makeUniqueTeacherUsername(suggestTeacherUsername(fullName), used);
      return {
        rowId: `paste_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        fullName,
        nip,
        specialization,
        gender,
        username,
        usernameEdited: false,
        password: generateRandomPassword(8),
      };
    });

    const existingFilled = bulkNewRows.filter((r) => r.fullName.trim().length > 0);
    setBulkNewRows([...existingFilled, ...parsedRows]);
    setPasteText('');
    setShowPasteBox(false);
    showToast(`${parsedRows.length} baris guru berhasil dimasukkan ke daftar.`, 'success');
  };

  const handleExecuteBulkTeacherCreate = async () => {
    if (!adminUid) return;
    if (bulkPasswordMode === 'uniform' && bulkPassword.trim().length < 6) {
      showToast('Password seragam minimal harus 6 karakter.', 'error');
      return;
    }

    setBulkCreating(true);
    const succeeded: SessionIssuedCredential[] = [];
    const failed: Array<{ name: string; username: string; reason: string }> = [];
    const rollingUsers: UserProfile[] = [...accounts];

    if (bulkTab === 'existing') {
      const chosenTeachers = teachers.filter((t) => selectedTeacherIds.includes(t.id));
      for (const t of chosenTeachers) {
        const rawUname = bulkUsernames[t.id] || suggestTeacherUsername(t.fullName);
        const cleanUname = normalizeUsername(rawUname);
        if (!isValidUsernameFormat(cleanUname)) {
          failed.push({
            name: t.fullName,
            username: rawUname || '-',
            reason: 'Format username tidak valid (min 3 karakter huruf kecil/angka/._-).',
          });
          continue;
        }
        if (rollingUsers.some((u) => u.username.toLowerCase() === cleanUname)) {
          failed.push({
            name: t.fullName,
            username: cleanUname,
            reason: `Username "${cleanUname}" sudah digunakan.`,
          });
          continue;
        }
        const pwd =
          bulkPasswordMode === 'uniform' ? bulkPassword.trim() : generateRandomPassword(8);
        try {
          const cred = await createManagedAccount({
            input: {
              name: t.fullName,
              username: cleanUname,
              password: pwd,
              role: 'guru',
              linkedEntityId: t.id,
              nip: t.nip,
              classLabel: t.specialization,
            },
            adminUid,
            existingUsers: rollingUsers,
          });
          succeeded.push(cred);
          rollingUsers.push({
            uid: cred.uid,
            username: cred.username,
            internalEmail: `${cred.username}@annurkarisma.app`,
            name: cred.name,
            role: 'guru',
            status: 'Aktif',
            linkedEntityId: t.id,
            nip: t.nip,
            classLabel: t.specialization,
          });
        } catch (err) {
          failed.push({
            name: t.fullName,
            username: cleanUname,
            reason: err instanceof Error ? err.message : 'Gagal membuat akun di Firebase Auth.',
          });
        }
      }
    } else {
      const filledRows = bulkNewRows.filter((r) => r.fullName.trim().length > 0);
      for (let i = 0; i < filledRows.length; i++) {
        const row = filledRows[i];
        const fullName = row.fullName.trim();
        if (fullName.length < 2) {
          failed.push({
            name: fullName || `Baris ${i + 1}`,
            username: row.username || '-',
            reason: 'Nama guru minimal 2 karakter.',
          });
          continue;
        }
        const cleanUname = normalizeUsername(row.username || suggestTeacherUsername(fullName));
        if (!isValidUsernameFormat(cleanUname)) {
          failed.push({
            name: fullName,
            username: row.username || '-',
            reason: 'Format username tidak valid (min 3 karakter huruf kecil/angka/._-).',
          });
          continue;
        }
        if (rollingUsers.some((u) => u.username.toLowerCase() === cleanUname)) {
          failed.push({
            name: fullName,
            username: cleanUname,
            reason: `Username "${cleanUname}" sudah dipakai.`,
          });
          continue;
        }
        const pwd =
          bulkPasswordMode === 'uniform'
            ? bulkPassword.trim()
            : row.password.trim() || generateRandomPassword(8);
        if (pwd.length < 6) {
          failed.push({
            name: fullName,
            username: cleanUname,
            reason: 'Password minimal harus 6 karakter.',
          });
          continue;
        }

        const safeNip =
          row.nip.trim().length >= 3
            ? row.nip.trim().slice(0, 32)
            : `TUTOR-${Date.now().toString(36).toUpperCase().slice(-4)}${i + 1}`;
        const safeSpec = row.specialization.trim() || 'Tutor Mata Pelajaran';

        try {
          const createdTeacher = await saveTeacher({
            nip: safeNip,
            fullName,
            gender: row.gender,
            specialization: safeSpec,
            status: 'Aktif',
            email: '',
            phone: '',
            education: '',
          });

          const cred = await createManagedAccount({
            input: {
              name: fullName,
              username: cleanUname,
              password: pwd,
              role: 'guru',
              linkedEntityId: createdTeacher.id,
              nip: safeNip,
              classLabel: safeSpec,
            },
            adminUid,
            existingUsers: rollingUsers,
          });
          succeeded.push(cred);
          rollingUsers.push({
            uid: cred.uid,
            username: cred.username,
            internalEmail: `${cred.username}@annurkarisma.app`,
            name: cred.name,
            role: 'guru',
            status: 'Aktif',
            linkedEntityId: createdTeacher.id,
            nip: safeNip,
            classLabel: safeSpec,
          });
        } catch (err) {
          failed.push({
            name: fullName,
            username: cleanUname,
            reason: err instanceof Error ? err.message : 'Gagal menyimpan guru dan membuat akun.',
          });
        }
      }
    }

    if (succeeded.length > 0) {
      persistCredentials(succeeded);
    }

    setBulkCreating(false);
    setBulkResultReport({ succeeded, failed });
    if (succeeded.length > 0 && failed.length === 0) {
      showToast(`Berhasil membuat ${succeeded.length} akun guru sekaligus!`, 'success');
    } else if (succeeded.length > 0) {
      showToast(`${succeeded.length} akun guru dibuat, ${failed.length} baris dilewati.`, 'info');
    } else {
      showToast('Tidak ada akun guru yang berhasil dibuat. Periksa rincian error.', 'error');
    }
  };

  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === 'Aktif').length;
    const inactive = accounts.filter((a) => a.status === 'Nonaktif').length;
    const teachersCount = accounts.filter((a) => a.role === 'guru').length;
    const studentsCount = accounts.filter((a) => a.role === 'murid').length;
    return { total, active, inactive, teachersCount, studentsCount };
  }, [accounts]);

  // Map lookup murid agar label Paket & Rombel akun selalu akurat sesuai Data Master
  const studentLookup = useMemo(() => {
    const byId = new Map<string, Student>();
    const byNis = new Map<string, Student>();
    const byOwnerUid = new Map<string, Student>();
    const byName = new Map<string, Student>();
    const dupNames = new Set<string>();
    students.forEach((s) => {
      byId.set(s.id, s);
      if (s.nis) byNis.set(s.nis.trim().toLowerCase(), s);
      if (s.ownerUid) byOwnerUid.set(s.ownerUid, s);
      const cleanName = s.fullName.trim().toLowerCase();
      if (cleanName) {
        if (byName.has(cleanName)) dupNames.add(cleanName);
        else byName.set(cleanName, s);
      }
    });
    return { byId, byNis, byOwnerUid, byName, dupNames };
  }, [students]);

  const findMatchedStudentForAccount = (acc: UserProfile): Student | undefined => {
    if (acc.role !== 'murid') return undefined;
    const cleanName = acc.name.trim().toLowerCase();
    return (
      (acc.linkedEntityId ? studentLookup.byId.get(acc.linkedEntityId) : undefined) ||
      (acc.nis ? studentLookup.byNis.get(acc.nis.trim().toLowerCase()) : undefined) ||
      studentLookup.byOwnerUid.get(acc.uid) ||
      (!studentLookup.dupNames.has(cleanName) ? studentLookup.byName.get(cleanName) : undefined)
    );
  };

  const teacherProgramLookup = useMemo(() => {
    const ids = new Set<string>();
    const uids = new Set<string>();
    const names = new Set<string>();
    if (selectedProgram === 'Semua') {
      return { ids, uids, names };
    }
    assignments
      .filter((a) => a.paket === selectedProgram)
      .forEach((a) => {
        if (a.teacherId) ids.add(a.teacherId);
        if (a.teacherUid) uids.add(a.teacherUid);
        if (a.teacherName) names.add(a.teacherName.trim().toLowerCase());
      });
    classes
      .filter((c) => c.paket === selectedProgram)
      .forEach((c) => {
        if (c.homeroomTeacherId) ids.add(c.homeroomTeacherId);
        if (c.homeroomTeacherName) names.add(c.homeroomTeacherName.trim().toLowerCase());
      });
    const paketLower = selectedProgram.toLowerCase();
    accounts
      .filter((acc) => acc.role === 'guru' && (acc.classLabel || '').toLowerCase().includes(paketLower))
      .forEach((acc) => {
        if (acc.linkedEntityId) ids.add(acc.linkedEntityId);
        if (acc.uid) uids.add(acc.uid);
        if (acc.name) names.add(acc.name.trim().toLowerCase());
      });
    return { ids, uids, names };
  }, [selectedProgram, assignments, classes, accounts]);

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

  const resolveAccountPaket = (acc: UserProfile): PaketType | undefined => {
    if (acc.role !== 'murid') return undefined;
    const stu = findMatchedStudentForAccount(acc);
    if (stu) return resolveStudentPlacement(stu, classes).paket;
    return extractPaketFromText(acc.classLabel || '');
  };

  const resolveAccountClassLabel = (acc: UserProfile): string => {
    if (acc.role !== 'murid') return acc.classLabel || '';
    const stu = findMatchedStudentForAccount(acc);
    if (!stu) return acc.classLabel || '';
    return resolveStudentPlacement(stu, classes).fullClassLabel;
  };

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...accounts]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .filter((acc) => {
        if (roleFilter !== 'Semua' && acc.role !== roleFilter) return false;
        if (statusFilter !== 'Semua' && acc.status !== statusFilter) return false;
        if (selectedProgram !== 'Semua') {
          if (acc.role === 'murid') {
            if (resolveAccountPaket(acc) !== selectedProgram) return false;
          } else if (acc.role === 'guru') {
            const normName = acc.name.trim().toLowerCase();
            const hasAnyAssignment =
              (Boolean(acc.linkedEntityId) && anyAssignedTeacherLookup.ids.has(acc.linkedEntityId!)) ||
              anyAssignedTeacherLookup.uids.has(acc.uid) ||
              anyAssignedTeacherLookup.names.has(normName);
            const matchTeacher =
              !hasAnyAssignment ||
              (Boolean(acc.linkedEntityId) && teacherProgramLookup.ids.has(acc.linkedEntityId!)) ||
              teacherProgramLookup.uids.has(acc.uid) ||
              teacherProgramLookup.names.has(normName);
            if (!matchTeacher) return false;
          } else if (roleFilter === 'Semua') {
            return false;
          }
        }
        if (!q) return true;
        return (
          acc.name.toLowerCase().includes(q) ||
          acc.username.toLowerCase().includes(q) ||
          (acc.classLabel || '').toLowerCase().includes(q) ||
          resolveAccountClassLabel(acc).toLowerCase().includes(q) ||
          (acc.nis || '').toLowerCase().includes(q) ||
          (acc.nip || '').toLowerCase().includes(q)
        );
      });
  }, [
    accounts,
    searchQuery,
    roleFilter,
    statusFilter,
    selectedProgram,
    studentLookup,
    classes,
    teacherProgramLookup,
    anyAssignedTeacherLookup,
  ]);

  const outOfSyncStudentAccountCount = useMemo(() => {
    return accounts.filter((acc) => {
      if (acc.role !== 'murid') return false;
      const stu = findMatchedStudentForAccount(acc);
      if (!stu) return false;
      const expected = resolveStudentPlacement(stu, classes).fullClassLabel;
      return (acc.classLabel || '') !== expected || acc.linkedEntityId !== stu.id;
    }).length;
  }, [accounts, studentLookup, classes]);

  const handleSyncStudentClassLabels = async () => {
    setSyncingClassLabels(true);
    try {
      const res = await syncClassroomsAndStudents();
      if (res.syncedAccounts > 0 || res.fixedStudents > 0 || res.updatedClasses > 0) {
        showToast(
          `Sinkronisasi berhasil: ${res.fixedStudents} murid, ${res.updatedClasses} rombel, dan ${res.syncedAccounts} akun login diperbarui.`,
          'success'
        );
      } else {
        showToast('Semua data murid, rombel, dan akun login sudah sinkron.', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyinkronkan kelas akun.', 'error');
    } finally {
      setSyncingClassLabels(false);
    }
  };

  // Daftar guru & murid yang ditautkan di dropdown Tambah Akun
  const linkedStudentIdsWithAccount = useMemo(
    () => new Set(accounts.filter((a) => a.role === 'murid' && a.linkedEntityId).map((a) => a.linkedEntityId!)),
    [accounts]
  );
  const linkedTeacherIdsWithAccount = useMemo(
    () => new Set(accounts.filter((a) => a.role === 'guru' && a.linkedEntityId).map((a) => a.linkedEntityId!)),
    [accounts]
  );

  const usernameValidationMsg = useMemo(() => {
    if (!newUsername) return null;
    if (/\s/.test(newUsername)) return 'Username tidak boleh mengandung spasi.';
    const clean = normalizeUsername(newUsername);
    if (!isValidUsernameFormat(clean)) {
      return 'Minimal 3 karakter huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).';
    }
    if (accounts.some((a) => a.username.toLowerCase() === clean)) {
      return `Username "${clean}" sudah digunakan.`;
    }
    return null;
  }, [newUsername, accounts]);

  if (effectiveRole !== 'admin') {
    return (
      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 p-8 text-center">
        <p className="font-display font-bold text-lg text-slate-900 dark:text-white">
          Akses Terbatas Khusus Administrator
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Hanya Administrator sekolah yang dapat mengelola akun guru dan murid.
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setNewRole('murid');
    setLinkedEntityId('');
    setNewName('');
    setNewUsername('');
    setNewPassword(generateRandomPassword(10));
    setNewClassLabel('');
    setShowNewPassword(true);
    setShowCreateModal(true);
  };

  const handleLinkedEntityChange = (entityId: string) => {
    setLinkedEntityId(entityId);
    if (!entityId) return;
    if (newRole === 'murid') {
      const stu = students.find((s) => s.id === entityId);
      if (stu) {
        setNewName(stu.fullName);
        setNewUsername(normalizeUsername(stu.nis));
        setNewClassLabel(formatStudentAccountClassLabel(stu.paket, stu.className));
      }
    } else if (newRole === 'guru') {
      const tch = teachers.find((t) => t.id === entityId);
      if (tch) {
        setNewName(tch.fullName);
        setNewUsername(suggestTeacherUsername(tch.fullName));
        setNewClassLabel(tch.specialization);
      }
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUid) return;

    setCreatingAccount(true);
    try {
      const selectedStudent = newRole === 'murid' ? students.find((s) => s.id === linkedEntityId) : undefined;
      let resolvedLinkedEntityId = linkedEntityId || undefined;
      let resolvedNip =
        newRole === 'guru' ? teachers.find((t) => t.id === linkedEntityId)?.nip : undefined;

      // Jika Admin membuat akun guru baru tanpa menautkan data guru lama, otomatis buatkan entri Data Master Guru agar langsung muncul di pilihan Wali Kelas
      if (newRole === 'guru' && !resolvedLinkedEntityId) {
        const cleanNip = `GURU-${normalizeUsername(newUsername).replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase() || Date.now().toString().slice(-6)}`;
        const createdTeacher = await saveTeacher({
          nip: cleanNip,
          fullName: newName.trim(),
          gender: 'L',
          email: '',
          phone: '',
          specialization: newClassLabel.trim() || 'Tutor Kesetaraan PKBM',
          education: '',
          status: 'Aktif',
        });
        resolvedLinkedEntityId = createdTeacher.id;
        resolvedNip = createdTeacher.nip;
      }

      const issued = await createManagedAccount({
        input: {
          name: newName,
          username: newUsername,
          password: newPassword,
          role: newRole,
          linkedEntityId: resolvedLinkedEntityId,
          nis: selectedStudent?.nis,
          nip: resolvedNip,
          classLabel: newClassLabel || undefined,
        },
        adminUid,
        existingUsers: accounts,
      });

      persistCredentials([issued]);
      setRevealedCredential(issued);
      setShowCreateModal(false);
      showToast(`Akun @${issued.username} berhasil dibuat.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat akun baru.', 'error');
    } finally {
      setCreatingAccount(false);
    }
  };

  const openEditModal = (account: UserProfile, initialTab: 'username' | 'reset') => {
    setEditingAccount(account);
    setEditTab(initialTab);
    setEditUsername(account.username);
    setEditName(account.name);
    setEditClassLabel(account.classLabel || '');
    setResetPassValue(generateRandomPassword(10));
    setShowResetPass(true);
  };

  const handleSaveUsernameEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSavingEdit(true);
    try {
      const res = await updateManagedUsername({
        account: editingAccount,
        newUsernameRaw: editUsername,
        newName: editName,
        newClassLabel: editClassLabel,
        existingUsers: accounts,
        adminUid,
      });
      const updatedLocal = updateStoredCredentialMetadata({
        uid: editingAccount.uid,
        oldUsername: editingAccount.username,
        newUsername: res.username,
        newName: editName,
        newClassLabel: editClassLabel,
      });
      setLocalCredentialsMap(updatedLocal);
      setEditingAccount(null);
      showToast(`Data akun @${res.username} berhasil diperbarui.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui username.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !adminUid) return;
    setSavingEdit(true);
    try {
      const issued = await resetManagedPassword({
        account: editingAccount,
        newPassword: resetPassValue,
        adminUid,
      });
      persistCredentials([issued]);
      setRevealedCredential(issued);
      setEditingAccount(null);
      showToast(`Password baru untuk @${issued.username} berhasil diterbitkan.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mereset password.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmExecute = async () => {
    if (!confirmAction || !adminUid) return;
    setProcessingConfirm(true);
    try {
      const { type, account } = confirmAction;
      if (type === 'deactivate') {
        await toggleManagedAccountStatus({
          account,
          nextStatus: 'Nonaktif',
          adminUid,
        });
        showToast(`Akun @${account.username} berhasil dinonaktifkan.`, 'info');
      } else if (type === 'activate') {
        await toggleManagedAccountStatus({
          account,
          nextStatus: 'Aktif',
          adminUid,
        });
        showToast(`Akun @${account.username} berhasil diaktifkan kembali.`, 'success');
      } else {
        await deleteManagedAccount({ account, adminUid });
        setLocalCredentialsMap(removeStoredCredential(account.uid, account.username));
        showToast(`Akun @${account.username} berhasil dihapus.`, 'success');
      }
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memproses aksi akun.', 'error');
    } finally {
      setProcessingConfirm(false);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParsingExcel(true);
    setImportReport(null);
    try {
      const parsed = await parseAccountImportFile({
        file,
        existingUsers: accounts,
        students,
        teachers,
        classes,
      });
      setImportRows(parsed);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membaca file Excel.', 'error');
    } finally {
      setParsingExcel(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!adminUid) return;
    const validRows = importRows.filter((r) => r.valid);
    if (validRows.length === 0) return;

    setExecutingImport(true);
    const succeeded: SessionIssuedCredential[] = [];
    const failed: Array<{ rowNumber: number; username: string; reason: string }> = importRows
      .filter((r) => !r.valid)
      .map((r) => ({
        rowNumber: r.rowNumber,
        username: r.username || '-',
        reason: r.reason || 'Validasi gagal',
      }));

    let rollingUsers = [...accounts];

    for (const row of validRows) {
      try {
        let resolvedLinkedId = row.matchedEntityId;
        let resolvedNip = row.nip;
        if (row.role === 'guru' && !resolvedLinkedId) {
          const fallbackNip =
            row.nip?.trim() ||
            `GURU-${normalizeUsername(row.username).replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase()}`;
          const createdTeacher = await saveTeacher({
            nip: fallbackNip,
            fullName: row.name.trim(),
            gender: 'L',
            email: '',
            phone: '',
            specialization: row.kelas?.trim() || 'Tutor Kesetaraan PKBM',
            education: '',
            status: 'Aktif',
          });
          resolvedLinkedId = createdTeacher.id;
          resolvedNip = createdTeacher.nip;
        }

        const issued = await createManagedAccount({
          input: {
            name: row.name,
            username: row.username,
            password: row.password,
            role: row.role,
            linkedEntityId: resolvedLinkedId,
            nis: row.nis,
            nip: resolvedNip,
            classLabel: row.kelas || undefined,
          },
          adminUid,
          existingUsers: rollingUsers,
        });
        succeeded.push(issued);
        rollingUsers.push({
          uid: issued.uid,
          username: issued.username,
          internalEmail: `${issued.username}@annurkarisma.app`,
          name: issued.name,
          role: issued.role,
          status: 'Aktif',
          classLabel: issued.classLabel,
        });
      } catch (err) {
        failed.push({
          rowNumber: row.rowNumber,
          username: row.username,
          reason: err instanceof Error ? err.message : 'Gagal membuat akun di Firebase Auth',
        });
      }
    }

    if (succeeded.length > 0) {
      persistCredentials(succeeded);
    }

    setImportReport({ succeeded, failed });
    setExecutingImport(false);
    showToast(
      `Import selesai: ${succeeded.length} berhasil, ${failed.length} gagal.`,
      failed.length === 0 ? 'success' : 'info'
    );
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} berhasil disalin.`, 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard.', 'error');
    }
  };

  const validImportCount = importRows.filter((r) => r.valid).length;
  const invalidImportCount = importRows.filter((r) => !r.valid).length;

  const readyCardCount = accounts.filter((a) =>
    Boolean(findStoredCredentialForAccount(issuedCredentialsMap, a.uid, a.username)?.password)
  ).length;

  return (
    <>
    <div className={printerState.open ? 'no-print space-y-6' : 'space-y-6'}>
      {/* Header & Ringkasan */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
            Manajemen Akun Guru &amp; Murid
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Kelola akun login berbasis username, reset password satu kali, nonaktifkan akses, import Excel massal, dan cetak Kartu Login.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {outOfSyncStudentAccountCount > 0 && (
            <button
              type="button"
              disabled={syncingClassLabels}
              onClick={handleSyncStudentClassLabels}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-bold hover:bg-amber-100 dark:hover:bg-amber-950/60 flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {syncingClassLabels
                  ? 'Menyinkronkan...'
                  : `Sinkronkan Kelas (${outOfSyncStudentAccountCount})`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setPrinterState({
                open: true,
                scope: 'class',
                selectedUid: accounts[0]?.uid,
              })
            }
            className="min-h-[44px] px-4 py-2 rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
          >
            <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Cetak Kartu Login</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBulkStudentModal(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-emerald-500/35 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/60 flex items-center gap-2 transition-colors"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Buat Akun Murid Serentak</span>
          </button>

          <button
            type="button"
            onClick={openBulkTeacherModal}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-sky-500/30 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 text-xs sm:text-sm font-semibold hover:bg-sky-100 dark:hover:bg-sky-950/60 flex items-center gap-2 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Guru Sekaligus</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setImportRows([]);
              setImportReport(null);
              setShowImportModal(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/60 flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Akun</span>
          </button>
        </div>
      </div>

      {/* Kartu Statistik Akun */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Akun Terdaftar</p>
          <p className="mt-1.5 font-display font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">
            {stats.total}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {stats.teachersCount} Guru · {stats.studentsCount} Murid
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Status Aktif</p>
          <p className="mt-1.5 font-display font-extrabold text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums">
            {stats.active}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
            Dapat masuk ke SIAKAD
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Status Nonaktif</p>
          <p className="mt-1.5 font-display font-extrabold text-2xl text-rose-600 dark:text-rose-400 tabular-nums">
            {stats.inactive}
          </p>
          <p className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80">
            Diblokir oleh Security Rules
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sandi Kartu Login</p>
          <p className="mt-1.5 font-display font-extrabold text-2xl text-emerald-700 dark:text-emerald-400 tabular-nums">
            {readyCardCount} <span className="text-sm font-semibold text-slate-400">/ {stats.total}</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Tersimpan &amp; tampil di Kartu Login
          </p>
        </div>
      </div>

      {/* Banner Kredensial Baru */}
      <AnimatePresence>
        {revealedCredential && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-emerald-500/40 bg-emerald-50/90 dark:bg-emerald-950/50 p-5 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <h3 className="font-display font-bold text-base">
                    Kredensial Akun Siap Dibagikan
                  </h3>
                </div>
                <p className="text-xs text-emerald-900/80 dark:text-emerald-200/80 max-w-2xl">
                  Username dan password telah disimpan untuk pencetakan <strong>Kartu Login</strong> agar tidak tersembunyi saat dicetak.
                </p>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-slate-400">Nama / Peran</span>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {revealedCredential.name}
                    </p>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      {ROLE_LABELS[revealedCredential.role]}
                    </span>
                  </div>

                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-slate-400">Username</span>
                      <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">
                        {revealedCredential.username}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(revealedCredential.username, 'Username')}
                      className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-emerald-100"
                      aria-label="Salin username"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-slate-400">Password</span>
                      <p className="font-mono text-sm font-bold text-slate-900 dark:text-white truncate">
                        {revealedCredential.password}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(revealedCredential.password, 'Password')}
                      className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-emerald-100"
                      aria-label="Salin password"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setPrinterState({
                      open: true,
                      scope: 'single',
                      selectedUid: revealedCredential.uid,
                    })
                  }
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Kartu Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRevealedCredential(null)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-white/60 dark:hover:bg-slate-900/50"
                >
                  Tutup
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter & Pencarian */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, username, NIS/NIP, atau kelas/mapel..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value as 'Semua' | PaketType)}
            aria-label="Filter Program Paket akun"
            className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-semibold ${
              selectedProgram !== 'Semua'
                ? 'border-emerald-500/45 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-800 dark:text-slate-100'
            }`}
          >
            <option value="Semua">Semua Program</option>
            <option value="Paket A">Paket A</option>
            <option value="Paket B">Paket B</option>
            <option value="Paket C">Paket C</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'Semua' | UserRole)}
            aria-label="Filter role akun"
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100"
          >
            <option value="Semua">Semua Peran</option>
            <option value="murid">Murid</option>
            <option value="guru">Guru / Tutor</option>
            <option value="kepala_pkbm">Kepala PKBM</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'Semua' | 'Aktif' | 'Nonaktif')}
            aria-label="Filter status akun"
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100"
          >
            <option value="Semua">Semua Status</option>
            <option value="Aktif">Aktif</option>
            <option value="Nonaktif">Nonaktif</option>
          </select>
        </div>
      </div>

      {selectedProgram !== 'Semua' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/75 dark:bg-emerald-950/35 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-emerald-900 dark:text-emerald-200 font-medium">
            Menampilkan akun murid &amp; guru untuk program <strong>{selectedProgram}</strong> sesuai filter global Header.
          </span>
          <button
            type="button"
            onClick={() => setSelectedProgram('Semua')}
            className="font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            Tampilkan Semua Program
          </button>
        </div>
      )}

      {/* Tabel Desktop */}
      <div className="hidden lg:block rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-5">Pengguna</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Username</th>
                <th className="py-3.5 px-4">Password Kartu</th>
                <th className="py-3.5 px-4">Kelas / Mapel</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Login Terakhir</th>
                <th className="py-3.5 px-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    Tidak ada akun yang cocok dengan filter pencarian Anda.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const isSelf = acc.uid === adminUid;
                  const cachedCred = findStoredCredentialForAccount(
                    issuedCredentialsMap,
                    acc.uid,
                    acc.username
                  );
                  return (
                    <tr
                      key={acc.uid}
                      className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3 min-w-0">
                          <InitialAvatar name={acc.name} src={acc.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate">
                              {acc.name}{' '}
                              {isSelf && (
                                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Anda
                                </span>
                              )}
                            </p>
                            {(acc.nis || acc.nip) && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {acc.nis ? `NIS ${acc.nis}` : `NIP ${acc.nip}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${ROLE_BADGE_CLASS[acc.role]}`}
                        >
                          {ROLE_LABELS[acc.role]}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-md">
                          {acc.username}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {cachedCred?.password ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-white bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-2.5 py-1 rounded-md select-all break-all">
                              {cachedCred.password}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(cachedCred.password, 'Password')}
                              title="Salin password"
                              className="p-1 text-slate-400 hover:text-emerald-700"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : !isSelf ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(acc, 'reset')}
                            className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Atur &amp; Tampilkan Sandi</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setPrinterState({
                                open: true,
                                scope: 'single',
                                selectedUid: acc.uid,
                              })
                            }
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Catat Sandi Kartu</span>
                          </button>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                        {resolveAccountClassLabel(acc) || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
                            acc.status === 'Aktif'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              acc.status === 'Aktif' ? 'bg-emerald-600' : 'bg-rose-600'
                            }`}
                          />
                          {acc.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {formatDateTime(acc.lastLoginAt)}
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-end gap-1.5">
                          {acc.role !== 'murid' && (
                            <button
                              type="button"
                              onClick={() => setPhotoTargetAccount(acc)}
                              title="Unggah / ubah foto profil"
                              className="min-h-[36px] min-w-[36px] rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openEditModal(acc, 'username')}
                            title="Edit username & profil"
                            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => openEditModal(acc, 'reset')}
                            title={isSelf ? 'Gunakan admin lain untuk reset akun sendiri' : 'Reset password'}
                            className="min-h-[36px] px-2.5 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-amber-100 disabled:opacity-40"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPrinterState({
                                open: true,
                                scope: 'single',
                                selectedUid: acc.uid,
                              })
                            }
                            title="Cetak Kartu Login"
                            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() =>
                              setConfirmAction({
                                type: acc.status === 'Aktif' ? 'deactivate' : 'activate',
                                account: acc,
                              })
                            }
                            title={acc.status === 'Aktif' ? 'Nonaktifkan akun' : 'Aktifkan akun'}
                            className={`min-h-[36px] min-w-[36px] rounded-lg border flex items-center justify-center disabled:opacity-40 ${
                              acc.status === 'Aktif'
                                ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700'
                                : 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => setConfirmAction({ type: 'delete', account: acc })}
                            title="Hapus akun"
                            className="min-h-[36px] min-w-[36px] rounded-lg border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kartu Mobile & Tablet */}
      <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredAccounts.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
            Tidak ada akun yang cocok dengan filter pencarian.
          </div>
        ) : (
          filteredAccounts.map((acc) => {
            const isSelf = acc.uid === adminUid;
            const cachedCred = findStoredCredentialForAccount(
              issuedCredentialsMap,
              acc.uid,
              acc.username
            );
            return (
              <div
                key={acc.uid}
                className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <InitialAvatar name={acc.name} src={acc.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {acc.name}
                      </p>
                      <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                        @{acc.username}
                        {cachedCred?.password && (
                          <span className="ml-2 text-slate-700 dark:text-slate-200 font-bold">
                            · Sandi: {cachedCred.password}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                      acc.status === 'Aktif'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${ROLE_BADGE_CLASS[acc.role]}`}>
                    {ROLE_LABELS[acc.role]}
                  </span>
                  {resolveAccountClassLabel(acc) && (
                    <span className="text-slate-600 dark:text-slate-300 truncate">
                      {resolveAccountClassLabel(acc)}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Login terakhir: {formatDateTime(acc.lastLoginAt)}
                </p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                  {acc.role !== 'murid' && (
                    <button
                      type="button"
                      onClick={() => setPhotoTargetAccount(acc)}
                      className="min-h-[38px] px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Foto</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditModal(acc, 'username')}
                    className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => openEditModal(acc, 'reset')}
                    className="min-h-[38px] px-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Password</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPrinterState({ open: true, scope: 'single', selectedUid: acc.uid })
                    }
                    className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Kartu</span>
                  </button>

                  {!isSelf && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            type: acc.status === 'Aktif' ? 'deactivate' : 'activate',
                            account: acc,
                          })
                        }
                        className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        {acc.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: 'delete', account: acc })}
                        className="min-h-[38px] px-3 rounded-xl border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-600 dark:text-rose-400"
                      >
                        Hapus
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Tambah Akun */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !creatingAccount) setShowCreateModal(false);
            }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-lg max-h-[92vh] overflow-y-auto my-auto rounded-2xl border border-emerald-950/15 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                      Tambah Akun Baru
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Admin tetap login saat membuat akun guru/murid baru.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Pilih Role Akun
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['murid', 'guru', 'kepala_pkbm', 'admin'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setNewRole(r);
                          setLinkedEntityId('');
                        }}
                        className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-bold transition-colors ${
                          newRole === r
                            ? 'border-emerald-600 bg-emerald-700 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {r === 'kepala_pkbm'
                          ? 'Kepala'
                          : r === 'admin'
                            ? 'Admin'
                            : r === 'guru'
                              ? 'Guru'
                              : 'Murid'}
                      </button>
                    ))}
                  </div>
                </div>

                {(newRole === 'murid' || newRole === 'guru') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tautkan ke Data {newRole === 'murid' ? 'Murid' : 'Guru'} yang Sudah Ada (Opsional)
                    </label>
                    <select
                      value={linkedEntityId}
                      onChange={(e) => handleLinkedEntityChange(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="">
                        — Pilih {newRole === 'murid' ? 'Murid' : 'Guru'} untuk tautan otomatis —
                      </option>
                      {newRole === 'murid'
                        ? students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.fullName} (NIS {s.nis} · {s.className})
                              {linkedStudentIdsWithAccount.has(s.id) ? ' [Sudah punya akun]' : ''}
                            </option>
                          ))
                        : teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName} ({t.specialization})
                              {linkedTeacherIdsWithAccount.has(t.id) ? ' [Sudah punya akun]' : ''}
                            </option>
                          ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Username Unik *
                    </label>
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      placeholder="contoh: 2026001 / siti.aminah"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                    {usernameValidationMsg ? (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                        {usernameValidationMsg}
                      </p>
                    ) : newUsername ? (
                      <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                        Username tersedia
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Kelas / Mapel (Opsional)
                    </label>
                    <input
                      type="text"
                      value={newClassLabel}
                      onChange={(e) => setNewClassLabel(e.target.value)}
                      placeholder="Paket C - Kelas 12 CIPANAS"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Password Awal *
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewPassword(generateRandomPassword(10))}
                      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>Buat password acak</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={creatingAccount || Boolean(usernameValidationMsg)}
                    className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {creatingAccount ? 'Membuat Akun...' : 'Simpan & Terbitkan Akun'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Edit Username & Reset Password */}
      <AnimatePresence>
        {editingAccount && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !savingEdit) setEditingAccount(null);
            }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md max-h-[92vh] overflow-y-auto my-auto rounded-2xl border border-emerald-950/15 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Kelola Akun: {editingAccount.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    @{editingAccount.username}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 pt-4">
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditTab('username')}
                    className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                      editTab === 'username'
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Ubah Username &amp; Info
                  </button>
                  <button
                    type="button"
                    disabled={editingAccount.uid === adminUid}
                    onClick={() => setEditTab('reset')}
                    className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors disabled:opacity-40 ${
                      editTab === 'reset'
                        ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Reset Password
                  </button>
                </div>
              </div>

              {editTab === 'username' ? (
                <form onSubmit={handleSaveUsernameEdit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nama Lengkap
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Username Baru (huruf kecil, tanpa spasi)
                    </label>
                    <input
                      type="text"
                      required
                      value={editUsername}
                      onChange={(e) =>
                        setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))
                      }
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Kelas / Mapel
                    </label>
                    <input
                      type="text"
                      value={editClassLabel}
                      onChange={(e) => setEditClassLabel(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAccount(null)}
                      className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="min-h-[42px] px-5 rounded-xl bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                    Sistem akan menerbitkan kredensial autentikasi versi baru untuk{' '}
                    <strong>@{editingAccount.username}</strong> dan memblokir password lama secara
                    otomatis melalui Security Rules.
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Password Baru
                      </label>
                      <button
                        type="button"
                        onClick={() => setResetPassValue(generateRandomPassword(10))}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Acak baru</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showResetPass ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={resetPassValue}
                        onChange={(e) => setResetPassValue(e.target.value)}
                        className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPass((p) => !p)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400"
                      >
                        {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAccount(null)}
                      className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="min-h-[42px] px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {savingEdit ? 'Menerbitkan...' : 'Terbitkan Password Baru'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Import Excel Massal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-4xl rounded-2xl border border-emerald-950/15 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                      Import Akun Massal dari Excel
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Kolom wajib: <code className="font-mono">nama, username, password, role, kelas</code>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Unggah file .xlsx / .xls / .csv
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Sistem memvalidasi format username, duplikat, dan tautan kelas/guru sebelum membuat akun.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadAccountImportTemplate}
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Template</span>
                    </button>

                    <label className="min-h-[40px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{parsingExcel ? 'Membaca...' : 'Pilih File Excel'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleExcelUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Laporan Hasil Setelah Eksekusi */}
                {importReport && (
                  <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                          Hasil Import: {importReport.succeeded.length} Akun Berhasil ·{' '}
                          {importReport.failed.length} Gagal
                        </p>
                        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                          Anda dapat langsung mencetak Kartu Login sekarang atau kapan saja melalui tombol Cetak Kartu Login.
                        </p>
                      </div>
                      {importReport.succeeded.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPrinterState({
                              open: true,
                              scope: 'batch',
                              batchUids: importReport.succeeded.map((c) => c.uid),
                            })
                          }
                          className="min-h-[40px] px-4 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <Printer className="w-4 h-4" />
                          <span>Cetak Semua Kartu ({importReport.succeeded.length})</span>
                        </button>
                      )}
                    </div>

                    {importReport.failed.length > 0 && (
                      <div className="rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 p-3 space-y-1.5">
                        <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                          Rincian Baris Gagal:
                        </p>
                        <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                          {importReport.failed.map((f, i) => (
                            <li key={i}>
                              Baris {f.rowNumber} (<code className="font-mono">{f.username}</code>):{' '}
                              <span className="text-rose-600 dark:text-rose-400">{f.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Tabel Pratinjau Baris Excel */}
                {importRows.length > 0 && !importReport && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        Pratinjau Data ({importRows.length} baris):{' '}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {validImportCount} siap import
                        </span>
                        {invalidImportCount > 0 && (
                          <span className="text-rose-600 dark:text-rose-400 ml-2">
                            · {invalidImportCount} gagal validasi
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <th className="py-2.5 px-3">Baris</th>
                            <th className="py-2.5 px-3">Nama</th>
                            <th className="py-2.5 px-3">Username</th>
                            <th className="py-2.5 px-3">Role</th>
                            <th className="py-2.5 px-3">Kelas / Mapel</th>
                            <th className="py-2.5 px-3">Status Validasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {importRows.map((row) => (
                            <tr
                              key={row.rowNumber}
                              className={
                                row.valid
                                  ? 'bg-white dark:bg-slate-900'
                                  : 'bg-rose-50/70 dark:bg-rose-950/30'
                              }
                            >
                              <td className="py-2 px-3 tabular-nums text-slate-500">
                                {row.rowNumber}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                                {row.name || '—'}
                              </td>
                              <td className="py-2 px-3 font-mono text-emerald-700 dark:text-emerald-300">
                                {row.username || '—'}
                              </td>
                              <td className="py-2 px-3">{row.rawRole || row.role}</td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                                {row.kelas || '—'}
                              </td>
                              <td className="py-2 px-3">
                                {row.valid ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Siap dibuat
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {row.reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-[#FAFAF7] dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Tutup
                </button>
                {!importReport && validImportCount > 0 && (
                  <button
                    type="button"
                    disabled={executingImport}
                    onClick={handleExecuteImport}
                    className="min-h-[42px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {executingImport
                      ? 'Membuat Akun Massal...'
                      : `Buat ${validImportCount} Akun Valid`}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dialog Konfirmasi Aktif / Nonaktif / Hapus */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'delete'
            ? `Hapus Akun @${confirmAction.account.username}?`
            : confirmAction?.type === 'deactivate'
              ? `Nonaktifkan Akun @${confirmAction.account.username}?`
              : `Aktifkan Akun @${confirmAction?.account.username}?`
        }
        description={
          confirmAction?.type === 'delete'
            ? 'Profil akun dan pencarian username akan dihapus dari Firestore sehingga pengguna ini tidak dapat login atau mengakses data lagi.'
            : confirmAction?.type === 'deactivate'
              ? 'Akun berstatus Nonaktif otomatis ditolak saat login dan diblokir oleh Firestore Security Rules. Anda dapat mengaktifkannya kembali kapan saja.'
              : 'Pengguna akan dapat masuk kembali ke SIAKAD menggunakan username dan password sebelumnya.'
        }
        confirmLabel={
          confirmAction?.type === 'delete'
            ? 'Ya, Hapus Akun'
            : confirmAction?.type === 'deactivate'
              ? 'Ya, Nonaktifkan'
              : 'Ya, Aktifkan'
        }
        loading={processingConfirm}
        onConfirm={handleConfirmExecute}
        onCancel={() => {
          if (!processingConfirm) setConfirmAction(null);
        }}
      />

      {/* Modal Tambah Guru Sekaligus */}
      <AnimatePresence>
        {showBulkTeacherModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                    <span>Tambah Akun Guru Sekaligus</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Buat banyak akun login guru sekaligus dari Data Guru terdaftar atau input/tempel daftar guru baru secara langsung.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={bulkCreating}
                  onClick={() => setShowBulkTeacherModal(false)}
                  aria-label="Tutup modal tambah guru sekaligus"
                  className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!bulkResultReport && (
                <div className="px-6 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex rounded-xl bg-white dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setBulkTab('existing')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                        bulkTab === 'existing'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      Dari Data Guru Terdaftar ({teachers.filter((t) => !linkedTeacherIdsWithAccount.has(t.id)).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkTab('new')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                        bulkTab === 'new'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      Input Banyak Guru Baru ({bulkNewRows.filter((r) => r.fullName.trim()).length})
                    </button>
                  </div>

                  {/* Mode Password */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Mode Sandi:
                    </span>
                    <button
                      type="button"
                      onClick={() => setBulkPasswordMode('random')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        bulkPasswordMode === 'random'
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Acak Unik per Guru
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkPasswordMode('uniform')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        bulkPasswordMode === 'uniform'
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Sandi Seragam
                    </button>
                  </div>
                </div>
              )}

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {bulkResultReport ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm">
                          Berhasil membuat {bulkResultReport.succeeded.length} akun guru
                          {bulkResultReport.failed.length > 0 ? ` (${bulkResultReport.failed.length} gagal)` : '!'}
                        </p>
                        <p className="text-xs mt-0.5">
                          Salin daftar kredensial atau cetak langsung Kartu Login Guru sebelum menutup jendela.
                        </p>
                      </div>
                      {bulkResultReport.succeeded.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const text = bulkResultReport.succeeded
                                .map((c) => `${c.name} | Username: ${c.username} | Password: ${c.password}`)
                                .join('\n');
                              copyToClipboard(text, 'Semua kredensial guru baru');
                            }}
                            className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 hover:bg-emerald-100/60"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Semua</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const uids = bulkResultReport.succeeded.map((c) => c.uid);
                              setShowBulkTeacherModal(false);
                              setPrinterState({
                                open: true,
                                scope: 'batch',
                                batchUids: uids,
                              });
                            }}
                            className="min-h-[38px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Cetak Kartu Login Guru Baru</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {bulkResultReport.failed.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-1.5">
                        <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                          Baris yang gagal diproses ({bulkResultReport.failed.length}):
                        </p>
                        {bulkResultReport.failed.map((f, idx) => (
                          <p key={idx} className="text-xs text-rose-700 dark:text-rose-300">
                            • <span className="font-semibold">{f.name}</span> (@{f.username}): {f.reason}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {bulkResultReport.succeeded.map((cred) => (
                        <div
                          key={cred.uid}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{cred.name}</p>
                            <p className="text-slate-600 dark:text-slate-300 font-mono">
                              Username: @{cred.username} · Pass:{' '}
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {cred.password}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                `Nama: ${cred.name}\nUsername: ${cred.username}\nPassword: ${cred.password}`,
                                `Kredensial @${cred.username}`
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                          >
                            Salin
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {bulkPasswordMode === 'uniform' && (
                      <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 space-y-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Password Seragam untuk Semua Akun Baru (Min. 6 Karakter)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={bulkPassword}
                            onChange={(e) => setBulkPassword(e.target.value)}
                            placeholder="Masukkan password seragam..."
                            className="flex-1 min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setBulkPassword(generateRandomPassword(8))}
                            className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 flex items-center gap-1.5"
                          >
                            <Shuffle className="w-3.5 h-3.5" />
                            <span>Acak</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {bulkTab === 'existing' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Pilih Guru Terdaftar ({selectedTeacherIds.length} dipilih) — username bisa diedit langsung
                          </span>
                          <div className="space-x-2">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTeacherIds(
                                  teachers
                                    .filter((t) => !linkedTeacherIdsWithAccount.has(t.id))
                                    .map((t) => t.id)
                                )
                              }
                              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              Pilih Semua
                            </button>
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              onClick={() => setSelectedTeacherIds([])}
                              className="text-xs font-semibold text-slate-500 hover:underline"
                            >
                              Batal Pilih
                            </button>
                          </div>
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-950">
                          {teachers.filter((t) => !linkedTeacherIdsWithAccount.has(t.id)).length === 0 ? (
                            <div className="text-center py-8 space-y-2">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Semua guru di Data Master sudah memiliki akun login.
                              </p>
                              <button
                                type="button"
                                onClick={() => setBulkTab('new')}
                                className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                              >
                                Input Banyak Guru Baru Sekaligus
                              </button>
                            </div>
                          ) : (
                            teachers
                              .filter((t) => !linkedTeacherIdsWithAccount.has(t.id))
                              .map((t) => {
                                const isChecked = selectedTeacherIds.includes(t.id);
                                const uname = bulkUsernames[t.id] ?? suggestTeacherUsername(t.fullName);
                                const norm = normalizeUsername(uname);
                                const isTaken = accounts.some((a) => a.username.toLowerCase() === norm);
                                const isInvalid = !isValidUsernameFormat(norm);
                                return (
                                  <div
                                    key={t.id}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl border transition-colors ${
                                      isChecked
                                        ? 'border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/30'
                                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                    }`}
                                  >
                                    <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedTeacherIds([...selectedTeacherIds, t.id]);
                                          } else {
                                            setSelectedTeacherIds(selectedTeacherIds.filter((id) => id !== t.id));
                                          }
                                        }}
                                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                                      />
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                          {t.fullName}
                                        </p>
                                        <p className="text-[11px] text-slate-500 font-mono truncate">
                                          NIP: {t.nip} · {t.specialization}
                                        </p>
                                      </div>
                                    </label>
                                    <div className="flex items-center gap-1.5 sm:w-56">
                                      <span className="text-xs font-mono text-slate-400">@</span>
                                      <input
                                        type="text"
                                        value={uname}
                                        onChange={(e) =>
                                          setBulkUsernames((prev) => ({
                                            ...prev,
                                            [t.id]: e.target.value.toLowerCase().replace(/\s+/g, ''),
                                          }))
                                        }
                                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono bg-white dark:bg-slate-900 ${
                                          isChecked && (isTaken || isInvalid)
                                            ? 'border-rose-400 text-rose-700 dark:text-rose-300'
                                            : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                                        }`}
                                        placeholder="username"
                                      />
                                    </div>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            Setiap baris otomatis tersimpan ke <strong>Data Master Guru</strong> sekaligus dibuatkan <strong>Akun Login</strong>.
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowPasteBox((v) => !v)}
                              className="px-3 py-1.5 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100"
                            >
                              {showPasteBox ? 'Tutup Tempel Cepat' : 'Tempel Daftar Nama'}
                            </button>
                            {bulkPasswordMode === 'random' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setBulkNewRows((prev) =>
                                    prev.map((r) => ({ ...r, password: generateRandomPassword(8) }))
                                  )
                                }
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 inline-flex items-center gap-1"
                              >
                                <Shuffle className="w-3.5 h-3.5" />
                                <span>Acak Sandi</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setBulkNewRows((prev) => [...prev, createEmptyNewTeacherRow(prev.length)])
                              }
                              className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tambah Baris</span>
                            </button>
                          </div>
                        </div>

                        {showPasteBox && (
                          <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 space-y-2">
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              Tempel daftar guru (1 guru per baris). Format: <span className="font-mono">Nama Lengkap | NIP (opsional) | Mapel (opsional)</span> atau cukup nama saja per baris.
                            </p>
                            <textarea
                              rows={4}
                              value={pasteText}
                              onChange={(e) => setPasteText(e.target.value)}
                              placeholder={'Budi Santoso, S.Pd | 198501012010011001 | Matematika\nSiti Aminah, M.Pd | | Bahasa Indonesia\nDedi Kurniawan'}
                              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-100"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleApplyPasteTeachers}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                              >
                                Masukkan ke Daftar
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {bulkNewRows.map((row, idx) => {
                            const norm = normalizeUsername(row.username);
                            const isInvalidUname = row.fullName.trim() !== '' && !isValidUsernameFormat(norm);
                            const isDupAccount =
                              row.fullName.trim() !== '' &&
                              accounts.some((a) => a.username.toLowerCase() === norm);
                            return (
                              <div
                                key={row.rowId}
                                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                              >
                                <div className="sm:col-span-3">
                                  <input
                                    type="text"
                                    value={row.fullName}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBulkNewRows((prev) => {
                                        const used = new Set(accounts.map((a) => a.username.toLowerCase()));
                                        prev.forEach((other, oIdx) => {
                                          if (oIdx !== idx && other.username) {
                                            used.add(normalizeUsername(other.username));
                                          }
                                        });
                                        return prev.map((item) => {
                                          if (item.rowId !== row.rowId) return item;
                                          const autoUsername = item.usernameEdited
                                            ? item.username
                                            : val.trim()
                                              ? makeUniqueTeacherUsername(suggestTeacherUsername(val), used)
                                              : '';
                                          return { ...item, fullName: val, username: autoUsername };
                                        });
                                      });
                                    }}
                                    placeholder={`Nama Guru ${idx + 1} *`}
                                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <input
                                    type="text"
                                    value={row.nip}
                                    onChange={(e) =>
                                      setBulkNewRows((prev) =>
                                        prev.map((item) =>
                                          item.rowId === row.rowId ? { ...item, nip: e.target.value } : item
                                        )
                                      )
                                    }
                                    placeholder="NIP (opsional)"
                                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <input
                                    type="text"
                                    value={row.specialization}
                                    onChange={(e) =>
                                      setBulkNewRows((prev) =>
                                        prev.map((item) =>
                                          item.rowId === row.rowId
                                            ? { ...item, specialization: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    placeholder="Mapel / Keahlian"
                                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <input
                                    type="text"
                                    value={row.username}
                                    onChange={(e) =>
                                      setBulkNewRows((prev) =>
                                        prev.map((item) =>
                                          item.rowId === row.rowId
                                            ? {
                                                ...item,
                                                username: e.target.value.toLowerCase().replace(/\s+/g, ''),
                                                usernameEdited: true,
                                              }
                                            : item
                                        )
                                      )
                                    }
                                    placeholder="username"
                                    className={`w-full px-2.5 py-2 rounded-lg border bg-white dark:bg-slate-900 text-xs font-mono ${
                                      isInvalidUname || isDupAccount
                                        ? 'border-rose-400 text-rose-700 dark:text-rose-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                                    }`}
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <input
                                    type="text"
                                    disabled={bulkPasswordMode === 'uniform'}
                                    value={bulkPasswordMode === 'uniform' ? bulkPassword : row.password}
                                    onChange={(e) =>
                                      setBulkNewRows((prev) =>
                                        prev.map((item) =>
                                          item.rowId === row.rowId ? { ...item, password: e.target.value } : item
                                        )
                                      )
                                    }
                                    placeholder="Password"
                                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white disabled:opacity-60"
                                  />
                                </div>
                                <div className="sm:col-span-1 flex justify-end gap-1">
                                  <select
                                    value={row.gender}
                                    onChange={(e) =>
                                      setBulkNewRows((prev) =>
                                        prev.map((item) =>
                                          item.rowId === row.rowId
                                            ? { ...item, gender: e.target.value === 'P' ? 'P' : 'L' }
                                            : item
                                        )
                                      )
                                    }
                                    aria-label="Jenis kelamin"
                                    className="px-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                                  >
                                    <option value="L">L</option>
                                    <option value="P">P</option>
                                  </select>
                                  <button
                                    type="button"
                                    disabled={bulkNewRows.length <= 1}
                                    onClick={() =>
                                      setBulkNewRows((prev) => prev.filter((item) => item.rowId !== row.rowId))
                                    }
                                    aria-label="Hapus baris"
                                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-30"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bulkCreating}
                  onClick={() => setShowBulkTeacherModal(false)}
                  className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-50"
                >
                  {bulkResultReport ? 'Tutup' : 'Batal'}
                </button>
                {!bulkResultReport && (
                  <button
                    type="button"
                    disabled={
                      bulkCreating ||
                      (bulkTab === 'existing'
                        ? selectedTeacherIds.length === 0
                        : bulkNewRows.filter((r) => r.fullName.trim().length >= 2).length === 0)
                    }
                    onClick={handleExecuteBulkTeacherCreate}
                    className="min-h-[42px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {bulkCreating
                      ? 'Sedang Memproses...'
                      : bulkTab === 'existing'
                        ? `Buat ${selectedTeacherIds.length} Akun Guru`
                        : `Simpan & Buat ${bulkNewRows.filter((r) => r.fullName.trim().length >= 2).length} Akun Guru`}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Buat Akun Login Murid Serentak */}
      <BulkStudentAccountModal
        isOpen={showBulkStudentModal}
        onClose={() => setShowBulkStudentModal(false)}
        onIssuedCredentials={(creds) => {
          persistCredentials(creds);
        }}
        onPrintBatch={(uids) => {
          setPrinterState({
            open: true,
            scope: 'batch',
            batchUids: uids,
          });
        }}
      />
    </div>

    {/* Modal Cetak Kartu Login (di luar wrapper no-print agar A4 sheet bersih) */}
    <LoginCardPrinterModal
      isOpen={printerState.open}
      onClose={() => setPrinterState((prev) => ({ ...prev, open: false }))}
      schoolSettings={schoolSettings}
      accounts={accounts}
      classes={classes}
      students={students}
      issuedCredentialsMap={issuedCredentialsMap}
      onCredentialsUpdated={(creds) => persistCredentials(creds)}
      initialScope={printerState.scope}
      initialSelectedUid={printerState.selectedUid}
      initialBatchUids={printerState.batchUids}
    />

    {/* Modal Unggah / Ubah Foto Profil Akun Guru, Kepala Sekolah & Admin */}
    <ProfilePhotoModal
      isOpen={Boolean(photoTargetAccount)}
      onClose={() => setPhotoTargetAccount(null)}
      targetUser={photoTargetAccount}
    />
    </>
  );
};
