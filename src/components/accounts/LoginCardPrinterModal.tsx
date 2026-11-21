import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  ShieldCheck,
  Shuffle,
  X,
} from 'lucide-react';
import { resolveSchoolLogo } from '../../assets/branding';
import { ROLE_LABELS } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  generateRandomPassword,
  resetManagedPassword,
  saveLoginCardCredential,
} from '../../services/accountService';
import {
  Classroom,
  PaketType,
  SchoolSettings,
  SessionIssuedCredential,
  Student,
  UserProfile,
  UserRole,
} from '../../types/siakad';
import {
  findStoredCredentialForAccount,
  mergeCredentialsMaps,
} from '../../utils/credentialStore';
import {
  extractPaketFromText,
  resolveStudentPlacement,
  stripPaketPrefixFromClassName,
} from '../../utils/excelUtils';
import { generateLoginCardsPdf } from '../../utils/loginCardPdfUtils';

export type CardPrintScope = 'single' | 'class' | 'teachers' | 'batch';
type BatchFillPasswordMode = 'nis' | 'random' | 'uniform';

interface LoginCardPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolSettings: SchoolSettings;
  accounts: UserProfile[];
  classes: Classroom[];
  students?: Student[];
  issuedCredentialsMap: Record<string, SessionIssuedCredential>;
  onCredentialsUpdated?: (creds: SessionIssuedCredential[]) => void;
  initialScope?: CardPrintScope;
  initialSelectedUid?: string;
  initialBatchUids?: string[];
}

interface PrintableCardItem {
  uid: string;
  account?: UserProfile;
  studentRecord?: Student;
  name: string;
  username: string;
  role: UserRole;
  nis?: string;
  nip?: string;
  paket?: PaketType;
  classId?: string;
  shortClassLabel: string;
  fullClassLabel: string;
  password?: string;
}

function buildDefaultCardPassword(acc?: UserProfile, nis?: string): string {
  const cleanNis = (nis || acc?.nis || '').replace(/\s+/g, '');
  if (cleanNis.length >= 6) return cleanNis;
  if (cleanNis.length > 0) return `pkbm${cleanNis}`.padEnd(6, '0');
  const cleanUname = (acc?.username || '').replace(/[^a-zA-Z0-9]/g, '');
  if (cleanUname.length >= 4) return `${cleanUname.slice(0, 6)}26`;
  return generateRandomPassword(8);
}

export const LoginCardPrinterModal: React.FC<LoginCardPrinterModalProps> = ({
  isOpen,
  onClose,
  schoolSettings,
  accounts,
  classes,
  students = [],
  issuedCredentialsMap,
  onCredentialsUpdated,
  initialScope = 'single',
  initialSelectedUid,
  initialBatchUids,
}) => {
  const { profile, firebaseUser } = useAuth();
  const {
    selectedProgram,
    setSelectedProgram,
    assignments,
    issuedCredentialsMap: ctxCredentialsMap,
    bulkAssignStudentsClass,
    syncClassroomsAndStudents,
  } = useData();
  const { showToast } = useToast();

  const mergedCredentialsMap = useMemo(
    () => mergeCredentialsMaps(ctxCredentialsMap, issuedCredentialsMap),
    [ctxCredentialsMap, issuedCredentialsMap]
  );

  const adminUid = firebaseUser?.uid || profile?.uid || '';

  const [scope, setScope] = useState<CardPrintScope>(initialScope);
  const [selectedUid, setSelectedUid] = useState<string>(
    initialSelectedUid || accounts[0]?.uid || ''
  );
  const selectedPaketFilter = selectedProgram;
  const setSelectedPaketFilter = setSelectedProgram;
  const [selectedClassName, setSelectedClassName] = useState<string>('');

  // Quick password generation for older accounts whose credentials were not yet cached
  const [fillMode, setFillMode] = useState<BatchFillPasswordMode>('nis');
  const [uniformFillPassword, setUniformFillPassword] = useState('Pkbm2026!');
  const [fillingPasswords, setFillingPasswords] = useState(false);
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number } | null>(null);

  // Per-card inline password & kelas editor state
  const [editingCardUid, setEditingCardUid] = useState<string | null>(null);
  const [inlinePasswordValue, setInlinePasswordValue] = useState('');
  const [savingInlineUid, setSavingInlineUid] = useState<string | null>(null);
  const [editingClassCardUid, setEditingClassCardUid] = useState<string | null>(null);
  const [savingClassCardUid, setSavingClassCardUid] = useState<string | null>(null);
  const [syncingRombel, setSyncingRombel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScope(initialScope);
      if (initialSelectedUid) {
        setSelectedUid(initialSelectedUid);
      }
      setSelectedClassName('');
      setEditingCardUid(null);
      setInlinePasswordValue('');
    }
  }, [isOpen, initialScope, initialSelectedUid]);

  useEffect(() => {
    setSelectedClassName('');
  }, [selectedProgram]);

  const websiteUrl = useMemo(() => {
    const custom = schoolSettings.website?.trim();
    if (custom) return custom.replace(/^https?:\/\//i, '');
    return typeof window !== 'undefined'
      ? window.location.host
      : 'pkbm-annurkarisma.sch.id';
  }, [schoolSettings.website]);

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

  const resolveAccountMeta = (acc?: UserProfile, fallbackClassLabel?: string) => {
    if (!acc || acc.role !== 'murid') {
      const rawLabel = (fallbackClassLabel || acc?.classLabel || '').trim();
      return {
        studentRecord: undefined as Student | undefined,
        classId: undefined as string | undefined,
        paket: extractPaketFromText(rawLabel),
        className: rawLabel,
        shortClassLabel: rawLabel || (acc?.role ? ROLE_LABELS[acc.role] : 'Guru / Tutor PKBM'),
        fullClassLabel: rawLabel,
        nis: acc?.nis,
      };
    }

    const cleanName = acc.name.trim().toLowerCase();
    const stu =
      (acc.linkedEntityId ? studentLookup.byId.get(acc.linkedEntityId) : undefined) ||
      (acc.nis ? studentLookup.byNis.get(acc.nis.trim().toLowerCase()) : undefined) ||
      studentLookup.byOwnerUid.get(acc.uid) ||
      (!studentLookup.dupNames.has(cleanName) ? studentLookup.byName.get(cleanName) : undefined);

    if (stu) {
      const placed = resolveStudentPlacement(stu, classes);
      return {
        studentRecord: stu,
        classId: placed.classId,
        paket: placed.paket,
        className: placed.className,
        shortClassLabel: placed.shortClassLabel,
        fullClassLabel: placed.fullClassLabel,
        nis: acc.nis || stu.nis,
      };
    }

    const label = (acc.classLabel || fallbackClassLabel || '').trim();
    const inferredPaket = extractPaketFromText(label);
    return {
      studentRecord: undefined as Student | undefined,
      classId: undefined as string | undefined,
      paket: inferredPaket,
      className: label,
      shortClassLabel: stripPaketPrefixFromClassName(label) || (inferredPaket ? inferredPaket : '—'),
      fullClassLabel: label,
      nis: acc.nis,
    };
  };

  const activeStudentAccountsWithMeta = useMemo(() => {
    return accounts
      .filter((a) => a.role === 'murid' && a.status === 'Aktif')
      .map((a) => ({
        acc: a,
        meta: resolveAccountMeta(a),
      }));
  }, [accounts, studentLookup, classes]);

  const teacherProgramLookup = useMemo(() => {
    const ids = new Set<string>();
    const uids = new Set<string>();
    const names = new Set<string>();
    if (selectedPaketFilter === 'Semua') {
      return { ids, uids, names };
    }
    assignments
      .filter((a) => a.paket === selectedPaketFilter)
      .forEach((a) => {
        if (a.teacherId) ids.add(a.teacherId);
        if (a.teacherUid) uids.add(a.teacherUid);
        if (a.teacherName) names.add(a.teacherName.trim().toLowerCase());
      });
    classes
      .filter((c) => c.paket === selectedPaketFilter)
      .forEach((c) => {
        if (c.homeroomTeacherId) ids.add(c.homeroomTeacherId);
        if (c.homeroomTeacherName) names.add(c.homeroomTeacherName.trim().toLowerCase());
      });
    const paketLower = selectedPaketFilter.toLowerCase();
    accounts
      .filter((acc) => acc.role === 'guru' && (acc.classLabel || '').toLowerCase().includes(paketLower))
      .forEach((acc) => {
        if (acc.linkedEntityId) ids.add(acc.linkedEntityId);
        if (acc.uid) uids.add(acc.uid);
        if (acc.name) names.add(acc.name.trim().toLowerCase());
      });
    return { ids, uids, names };
  }, [selectedPaketFilter, assignments, classes, accounts]);

  const isTeacherInSelectedProgram = (acc: UserProfile): boolean => {
    if (selectedPaketFilter === 'Semua') return true;
    return (
      (Boolean(acc.linkedEntityId) && teacherProgramLookup.ids.has(acc.linkedEntityId!)) ||
      teacherProgramLookup.uids.has(acc.uid) ||
      teacherProgramLookup.names.has(acc.name.trim().toLowerCase())
    );
  };

  const singleAccountOptions = useMemo(() => {
    if (selectedPaketFilter === 'Semua') return accounts;
    return accounts.filter((acc) => {
      if (initialSelectedUid && acc.uid === initialSelectedUid) return true;
      if (acc.role === 'murid') {
        return resolveAccountMeta(acc).paket === selectedPaketFilter;
      }
      if (acc.role === 'guru') {
        return isTeacherInSelectedProgram(acc);
      }
      return false;
    });
  }, [accounts, selectedPaketFilter, initialSelectedUid, teacherProgramLookup, studentLookup, classes]);

  useEffect(() => {
    if (scope !== 'single' || singleAccountOptions.length === 0) return;
    if (!singleAccountOptions.some((a) => a.uid === selectedUid)) {
      setSelectedUid(singleAccountOptions[0].uid);
    }
  }, [scope, singleAccountOptions, selectedUid]);

  const cardsToPrint = useMemo<PrintableCardItem[]>(() => {
    const buildCard = (
      uid: string,
      acc?: UserProfile,
      issued?: SessionIssuedCredential
    ): PrintableCardItem | null => {
      if (!acc && !issued) return null;
      const meta = resolveAccountMeta(acc, issued?.classLabel);
      const resolvedCred =
        issued || findStoredCredentialForAccount(mergedCredentialsMap, uid, acc?.username);
      const role = acc?.role || issued?.role || 'murid';

      return {
        uid: acc?.uid || uid,
        account: acc,
        studentRecord: meta.studentRecord,
        name: acc?.name || issued?.name || '',
        username: acc?.username || issued?.username || '',
        role,
        nis: meta.nis,
        nip: acc?.nip,
        paket:
          role === 'murid'
            ? meta.paket
            : selectedPaketFilter !== 'Semua'
              ? selectedPaketFilter
              : meta.paket,
        classId: meta.classId,
        shortClassLabel: meta.shortClassLabel,
        fullClassLabel: meta.fullClassLabel,
        password: resolvedCred?.password,
      };
    };

    if (scope === 'batch' && initialBatchUids && initialBatchUids.length > 0) {
      return initialBatchUids
        .map((uid) => {
          const directAcc = accounts.find((a) => a.uid === uid);
          const issued = findStoredCredentialForAccount(
            mergedCredentialsMap,
            uid,
            directAcc?.username
          );
          const acc =
            directAcc ||
            (issued?.username
              ? accounts.find(
                  (a) => a.username.toLowerCase() === issued.username.trim().toLowerCase()
                )
              : undefined);
          const card = buildCard(uid, acc, issued);
          if (!card) return null;
          if (selectedPaketFilter !== 'Semua' && card.role === 'murid') {
            if (card.paket !== selectedPaketFilter) return null;
          }
          return card;
        })
        .filter((x): x is PrintableCardItem => Boolean(x));
    }

    if (scope === 'single') {
      const targetUid = selectedUid || initialSelectedUid || singleAccountOptions[0]?.uid;
      const acc = accounts.find((a) => a.uid === targetUid);
      const issued = findStoredCredentialForAccount(mergedCredentialsMap, targetUid, acc?.username);
      const card = buildCard(targetUid || '', acc, issued);
      return card ? [card] : [];
    }

    if (scope === 'teachers') {
      return accounts
        .filter((a) => a.role === 'guru' && a.status === 'Aktif' && isTeacherInSelectedProgram(a))
        .map((a) => {
          const issued = findStoredCredentialForAccount(mergedCredentialsMap, a.uid, a.username);
          return buildCard(a.uid, a, issued);
        })
        .filter((x): x is PrintableCardItem => Boolean(x));
    }

    // per paket / kelas (murid aktif sesuai filter Paket & Rombel)
    const targetLower = selectedClassName.trim().toLowerCase();
    const targetShortLower = stripPaketPrefixFromClassName(selectedClassName).toLowerCase();

    return activeStudentAccountsWithMeta
      .filter(({ meta }) => {
        const matchPaket = selectedPaketFilter === 'Semua' || meta.paket === selectedPaketFilter;
        const matchClass =
          !targetLower ||
          meta.className.toLowerCase() === targetLower ||
          meta.fullClassLabel.toLowerCase() === targetLower ||
          meta.shortClassLabel.toLowerCase() === targetShortLower;
        return matchPaket && matchClass;
      })
      .map(({ acc }) => {
        const issued = findStoredCredentialForAccount(mergedCredentialsMap, acc.uid, acc.username);
        return buildCard(acc.uid, acc, issued);
      })
      .filter((x): x is PrintableCardItem => Boolean(x));
  }, [
    scope,
    initialBatchUids,
    selectedUid,
    initialSelectedUid,
    singleAccountOptions,
    selectedPaketFilter,
    selectedClassName,
    accounts,
    activeStudentAccountsWithMeta,
    mergedCredentialsMap,
    teacherProgramLookup,
    classes,
    students,
  ]);

  if (!isOpen) return null;

  const missingPasswordCards = cardsToPrint.filter(
    (c) => !c.password && c.account && c.uid !== adminUid
  );
  const missingPasswordCount = cardsToPrint.filter((c) => !c.password).length;

  const handleSaveSingleCardPassword = async (card: PrintableCardItem, newPass: string) => {
    if (!card.account || !adminUid) return;
    const cleanPass = newPass.trim();
    if (cleanPass.length < 6) {
      showToast('Password minimal harus 6 karakter.', 'error');
      return;
    }

    setSavingInlineUid(card.uid);
    try {
      const issued =
        card.uid === adminUid
          ? await saveLoginCardCredential({
              account: card.account,
              cardPassword: cleanPass,
              actorUid: adminUid,
            })
          : await resetManagedPassword({
              account: card.account,
              newPassword: cleanPass,
              adminUid,
            });
      onCredentialsUpdated?.([issued]);
      setEditingCardUid(null);
      setInlinePasswordValue('');
      showToast(`Password kartu @${issued.username} ditampilkan & siap dicetak.`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal mengatur password kartu.',
        'error'
      );
    } finally {
      setSavingInlineUid(null);
    }
  };

  const handleDownloadCardsPdf = async () => {
    if (cardsToPrint.length === 0) return;
    setExportingPdf(true);
    try {
      const scopeLabel =
        scope === 'single'
          ? cardsToPrint[0]?.username || 'Akun'
          : scope === 'teachers'
            ? 'Guru'
            : selectedClassName || selectedPaketFilter;
      const fileName = await generateLoginCardsPdf({
        cards: cardsToPrint.map((c) => ({
          uid: c.uid,
          name: c.name,
          username: c.username,
          password: c.password,
          role: c.role,
          nis: c.nis,
          nip: c.nip,
          paket: c.paket,
          shortClassLabel: c.shortClassLabel,
        })),
        schoolSettings,
        websiteUrl,
        scopeLabel,
      });
      showToast(`PDF Kartu Login berhasil diunduh (${cardsToPrint.length} kartu).`, 'success', fileName);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat berkas PDF Kartu Login.',
        'error'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleBatchRevealPasswords = async () => {
    if (!adminUid || missingPasswordCards.length === 0) return;
    if (fillMode === 'uniform' && uniformFillPassword.trim().length < 6) {
      showToast('Password seragam minimal harus 6 karakter.', 'error');
      return;
    }

    setFillingPasswords(true);
    setFillProgress({ done: 0, total: missingPasswordCards.length });

    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const newlyIssued: SessionIssuedCredential[] = [];
    let failedCount = 0;

    for (let i = 0; i < missingPasswordCards.length; i++) {
      const card = missingPasswordCards[i];
      if (!card.account) continue;

      if (i > 0) {
        await sleep(i % 12 === 0 ? 1000 : 320);
      }

      const pwd =
        fillMode === 'uniform'
          ? uniformFillPassword.trim()
          : fillMode === 'random'
            ? generateRandomPassword(8)
            : buildDefaultCardPassword(card.account, card.nis);

      try {
        const cred = await resetManagedPassword({
          account: card.account,
          newPassword: pwd,
          adminUid,
        });
        newlyIssued.push(cred);
        onCredentialsUpdated?.([cred]);
      } catch {
        failedCount++;
      }
      setFillProgress({ done: i + 1, total: missingPasswordCards.length });
    }

    setFillingPasswords(false);
    setFillProgress(null);

    if (newlyIssued.length > 0 && failedCount === 0) {
      showToast(
        `${newlyIssued.length} password kartu berhasil diterbitkan & ditampilkan siap cetak.`,
        'success'
      );
    } else if (newlyIssued.length > 0) {
      showToast(
        `${newlyIssued.length} password berhasil ditampilkan, ${failedCount} gagal (coba ulangi lagi sebentar).`,
        'warning'
      );
    } else {
      showToast('Gagal menerbitkan password kartu.', 'error');
    }
  };

  const handleQuickChangeCardClass = async (card: PrintableCardItem, targetClassId: string) => {
    if (!card.studentRecord) return;
    const targetCls = classes.find((c) => c.id === targetClassId);
    if (!targetCls) return;

    setSavingClassCardUid(card.uid);
    try {
      await bulkAssignStudentsClass([card.studentRecord.id], targetCls);
      setEditingClassCardUid(null);
      showToast(
        `${card.name} dipindahkan ke ${targetCls.paket} · ${stripPaketPrefixFromClassName(targetCls.name)}`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memperbarui kelas/paket murid.',
        'error'
      );
    } finally {
      setSavingClassCardUid(null);
    }
  };

  const handleSyncAllRombel = async () => {
    setSyncingRombel(true);
    try {
      const res = await syncClassroomsAndStudents();
      showToast(
        `Sinkronisasi selesai (${res.fixedStudents} murid, ${res.updatedClasses} rombel, ${res.syncedAccounts} akun login).`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyinkronkan data rombel.',
        'error'
      );
    } finally {
      setSyncingRombel(false);
    }
  };

  const handleCopyCard = async (card: PrintableCardItem) => {
    const lines = [
      `${schoolSettings.schoolName}`,
      `Nama: ${card.name}`,
      card.paket ? `Program: ${card.paket}` : `Peran: ${ROLE_LABELS[card.role]}`,
      card.shortClassLabel ? `Kelas / Rombel: ${card.shortClassLabel}` : '',
      `Username: ${card.username}`,
      card.password ? `Password: ${card.password}` : '',
      `Portal: https://${websiteUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      setCopiedUid(card.uid);
      window.setTimeout(() => setCopiedUid(null), 1800);
      showToast(`Info login ${card.name} berhasil disalin.`, 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:block">
      <div className="w-full max-w-5xl rounded-2xl border border-emerald-950/15 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[93vh] print:max-h-none print:border-0 print:shadow-none print:rounded-none print:block print:overflow-visible">
        {/* Toolbar (Tersembunyi saat print PDF) */}
        <div className="no-print px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#FAFAF7] dark:bg-slate-950">
          <div>
            <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
              Cetak Kartu Login SIAKAD
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pratinjau A4 siap cetak (2 kartu per baris) · Program Paket, Kelas, Username &amp; Password tampil jelas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncAllRombel}
              disabled={syncingRombel || fillingPasswords || exportingPdf}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-emerald-500/35 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingRombel ? 'animate-spin' : ''}`} />
              <span>{syncingRombel ? 'Menyinkronkan...' : 'Sinkronkan Paket & Kelas'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCardsPdf}
              disabled={cardsToPrint.length === 0 || fillingPasswords || exportingPdf}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {exportingPdf ? 'Membuat PDF...' : `Unduh PDF (${cardsToPrint.length})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={cardsToPrint.length === 0 || fillingPasswords || exportingPdf}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              disabled={fillingPasswords || exportingPdf}
              onClick={onClose}
              aria-label="Tutup modal cetak kartu login"
              className="min-h-[42px] min-w-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Scope (Tersembunyi saat print) */}
        <div className="no-print px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'single', label: 'Per Akun' },
                  { id: 'class', label: 'Per Paket / Kelas' },
                  { id: 'teachers', label: 'Semua Guru Aktif' },
                  ...(initialBatchUids && initialBatchUids.length > 0
                    ? [{ id: 'batch' as const, label: `Sesi Baru (${initialBatchUids.length})` }]
                    : []),
                ] as Array<{ id: CardPrintScope; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    scope === tab.id
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedPaketFilter}
                onChange={(e) => {
                  setSelectedPaketFilter(e.target.value as 'Semua' | PaketType);
                  setSelectedClassName('');
                }}
                aria-label="Filter Program Paket kartu login"
                className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold ${
                  selectedPaketFilter !== 'Semua'
                    ? 'border-emerald-500/45 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                }`}
              >
                <option value="Semua">Semua Program</option>
                <option value="Paket A">Paket A</option>
                <option value="Paket B">Paket B</option>
                <option value="Paket C">Paket C</option>
              </select>

              {scope === 'single' && (
                <select
                  value={selectedUid}
                  onChange={(e) => setSelectedUid(e.target.value)}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 max-w-[260px]"
                >
                  {singleAccountOptions.map((acc) => (
                    <option key={acc.uid} value={acc.uid}>
                      {acc.name} (@{acc.username}) · {ROLE_LABELS[acc.role]}
                    </option>
                  ))}
                </select>
              )}

              {scope === 'class' && (
                <select
                  value={selectedClassName}
                  onChange={(e) => setSelectedClassName(e.target.value)}
                  aria-label="Filter Kelas kartu login"
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100"
                >
                  <option value="">
                    Semua Rombel (
                    {selectedPaketFilter === 'Semua'
                      ? activeStudentAccountsWithMeta.length
                      : activeStudentAccountsWithMeta.filter((x) => x.meta.paket === selectedPaketFilter)
                          .length}{' '}
                    akun)
                  </option>
                  {classes
                    .filter((cls) => selectedPaketFilter === 'Semua' || cls.paket === selectedPaketFilter)
                    .map((cls) => {
                      const clsShort = stripPaketPrefixFromClassName(cls.name).toLowerCase();
                      const countInClass = activeStudentAccountsWithMeta.filter(
                        (x) =>
                          x.meta.className.toLowerCase() === cls.name.toLowerCase() ||
                          x.meta.fullClassLabel.toLowerCase() === cls.name.toLowerCase() ||
                          x.meta.shortClassLabel.toLowerCase() === clsShort
                      ).length;
                      return (
                        <option key={cls.id} value={cls.name}>
                          {cls.name} ({countInClass} akun)
                        </option>
                      );
                    })}
                </select>
              )}
            </div>
          </div>

          {/* Panel Aksi Cepat Untuk Menampilkan Password pada Kartu Lama */}
          {missingPasswordCount > 0 && missingPasswordCards.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/35 px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-bold text-emerald-900 dark:text-emerald-200">
                  {missingPasswordCount} kartu
                </span>{' '}
                dibuat sebelum pencatatan sandi lokal. Terbitkan &amp; tampilkan password langsung agar semua kartu siap dicetak:
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={fillMode}
                  disabled={fillingPasswords}
                  onChange={(e) => setFillMode(e.target.value as BatchFillPasswordMode)}
                  aria-label="Pola password kartu"
                  className="min-h-[36px] px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value="nis">Sesuai NIS / Default</option>
                  <option value="random">Acak Unik per Kartu</option>
                  <option value="uniform">1 Sandi Seragam</option>
                </select>

                {fillMode === 'uniform' && (
                  <input
                    type="text"
                    value={uniformFillPassword}
                    disabled={fillingPasswords}
                    onChange={(e) => setUniformFillPassword(e.target.value)}
                    placeholder="Min 6 karakter"
                    className="min-h-[36px] w-32 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                )}

                <button
                  type="button"
                  disabled={fillingPasswords}
                  onClick={handleBatchRevealPasswords}
                  className="min-h-[36px] px-3.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                >
                  {fillingPasswords ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        Memproses {fillProgress?.done || 0}/{fillProgress?.total || missingPasswordCards.length}...
                      </span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Tampilkan Semua Password ({missingPasswordCards.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Area Pratinjau Kartu A4 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 bg-slate-100 dark:bg-slate-950 print:overflow-visible print:bg-white print:p-0">
          {cardsToPrint.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
              Tidak ada akun yang cocok pada pilihan cetak ini.
            </div>
          ) : (
            <div className="print-only-sheet max-w-[210mm] mx-auto bg-white text-slate-900 p-5 sm:p-7 shadow-md rounded-xl print:shadow-none print:rounded-none print:p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-[5mm]">
                {cardsToPrint.map((card) => {
                  const isEditingThis = editingCardUid === card.uid;
                  const isSavingThis = savingInlineUid === card.uid;
                  const isEditingClass = editingClassCardUid === card.uid;
                  const isSavingClass = savingClassCardUid === card.uid;
                  const isOwnAdminCard = card.uid === adminUid;
                  const canEditInline = Boolean(card.account);
                  const canEditClass = Boolean(card.role === 'murid' && card.studentRecord && classes.length > 0);
                  const headerTag =
                    card.role === 'murid' && card.paket
                      ? card.paket.toUpperCase()
                      : ROLE_LABELS[card.role].toUpperCase();
                  const headerSubTag =
                    card.role === 'murid' && card.shortClassLabel && card.shortClassLabel !== '—'
                      ? card.shortClassLabel.toUpperCase()
                      : '';

                  return (
                    <article
                      key={card.uid}
                      className="login-card-print-item break-inside-avoid rounded-xl border-[1.5px] border-slate-300 bg-white overflow-hidden flex flex-col justify-between shadow-xs print:shadow-none print:border-slate-700"
                    >
                      {/* Kop Kartu Resmi PKBM */}
                      <header className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white flex items-center justify-between gap-2.5 border-b-[2.5px] border-amber-400">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-white p-0.5 shrink-0 overflow-hidden flex items-center justify-center border border-emerald-950/20">
                            <img
                              src={resolveSchoolLogo(schoolSettings.logoUrl)}
                              alt="Logo Sekolah"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8.5px] font-bold tracking-[0.14em] text-amber-300 uppercase leading-none">
                              {card.role === 'murid'
                                ? 'Kartu Login Peserta Didik'
                                : card.role === 'guru'
                                  ? 'Kartu Login Pendidik'
                                  : 'Kartu Akun SIAKAD'}
                            </p>
                            <p className="mt-0.5 text-[11.5px] font-extrabold text-white truncate leading-tight">
                              {schoolSettings.schoolName}
                            </p>
                            <p className="text-[9px] text-emerald-100/90 truncate leading-tight tabular-nums">
                              NPSN {schoolSettings.npsn} · TA {schoolSettings.academicYear}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 px-2.5 py-1 rounded-md bg-white/15 border border-amber-300/40 text-center">
                          <span className="block text-[9.5px] font-extrabold tracking-wide text-amber-200 whitespace-nowrap leading-tight">
                            {headerTag}
                          </span>
                          {headerSubTag && (
                            <span className="block text-[8px] font-bold text-white/95 whitespace-nowrap leading-tight mt-0.5">
                              {headerSubTag}
                            </span>
                          )}
                        </div>
                      </header>

                      {/* Isi Kartu: Identitas, Program/Rombel & Kredensial */}
                      <div className="p-3.5 space-y-2.5 text-xs flex-1 flex flex-col justify-between">
                        {/* Baris Nama + NIS/NIP */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                              Nama Lengkap
                            </p>
                            <p className="mt-1 text-[13.5px] font-extrabold text-slate-950 leading-snug truncate">
                              {card.name}
                            </p>
                          </div>
                          {(card.nis || card.nip) && (
                            <div className="text-right shrink-0">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                                {card.nis ? 'NIS' : 'NIP'}
                              </p>
                              <p className="mt-1 font-mono text-[11px] font-bold text-slate-800 tabular-nums">
                                {card.nis || card.nip}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Grid Program & Kelas / Rombel (Selalu Sesuai Paket & Kelas Murid) */}
                        <div className="grid grid-cols-2 gap-3 py-2 border-y border-slate-200">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                              {card.role === 'murid' ? 'Program Paket' : 'Peran Akun'}
                            </p>
                            <p className="mt-1 text-[11.5px] font-extrabold text-emerald-900 truncate">
                              {card.role === 'murid'
                                ? card.paket || 'Kesetaraan'
                                : card.paket
                                  ? `${ROLE_LABELS[card.role]} · ${card.paket}`
                                  : ROLE_LABELS[card.role]}
                            </p>
                          </div>
                          <div className="min-w-0 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                                {card.role === 'murid' ? 'Kelas / Rombel' : 'Bidang / Mapel'}
                              </p>
                              {canEditClass && !isEditingClass && (
                                <button
                                  type="button"
                                  onClick={() => setEditingClassCardUid(card.uid)}
                                  title="Ubah Paket & Kelas murid ini"
                                  className="no-print text-slate-400 hover:text-emerald-700"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>

                            {isEditingClass && canEditClass ? (
                              <div className="no-print mt-1 flex items-center justify-end gap-1">
                                <select
                                  value={card.classId || ''}
                                  disabled={isSavingClass}
                                  onChange={(e) => handleQuickChangeCardClass(card, e.target.value)}
                                  aria-label="Pilih kelas dan paket murid"
                                  className="max-w-[155px] px-1.5 py-0.5 rounded border border-emerald-400 bg-white text-[10.5px] font-semibold text-slate-900"
                                >
                                  <option value="">-- Pilih Rombel --</option>
                                  {classes.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                      {cls.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={isSavingClass}
                                  onClick={() => setEditingClassCardUid(null)}
                                  className="text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <p className="mt-1 text-[11.5px] font-extrabold text-slate-900 truncate">
                                {card.shortClassLabel || '—'}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Kotak Username & Password (Terbuka & Jelas — Tidak Pernah Disembunyikan) */}
                        <div className="rounded-lg bg-slate-50 border border-slate-300 px-3 py-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold text-slate-500">
                              Username
                            </span>
                            <span className="font-mono font-bold text-[13px] tracking-wide text-emerald-900 select-all tabular-nums">
                              {card.username}
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-slate-200/70 flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold text-slate-500 shrink-0">
                              Password
                            </span>

                            {isEditingThis ? (
                              <div className="no-print flex items-center gap-1 flex-1 justify-end">
                                <input
                                  type="text"
                                  value={inlinePasswordValue}
                                  disabled={isSavingThis}
                                  onChange={(e) => setInlinePasswordValue(e.target.value)}
                                  placeholder={isOwnAdminCard ? 'Ketik sandi Anda' : 'Min 6 kar.'}
                                  className="w-32 px-2 py-1 rounded border border-emerald-400 bg-white text-[11px] font-mono text-slate-900"
                                />
                                {!isOwnAdminCard && (
                                  <button
                                    type="button"
                                    disabled={isSavingThis}
                                    onClick={() =>
                                      setInlinePasswordValue(generateRandomPassword(8))
                                    }
                                    title="Acak sandi"
                                    className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  >
                                    <Shuffle className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isSavingThis}
                                  onClick={() =>
                                    handleSaveSingleCardPassword(card, inlinePasswordValue)
                                  }
                                  className="px-2 py-1 rounded bg-emerald-700 text-white text-[10px] font-bold hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {isSavingThis ? '...' : 'Simpan'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingThis}
                                  onClick={() => setEditingCardUid(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : card.password ? (
                              <div className="flex items-center justify-end gap-1.5 min-w-0 flex-1">
                                <span className="font-mono font-extrabold text-[13.5px] tracking-wide text-slate-950 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded select-all break-all whitespace-normal text-right print:bg-transparent print:border-0 print:px-0">
                                  {card.password}
                                </span>
                                {canEditInline && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCardUid(card.uid);
                                      setInlinePasswordValue(card.password || '');
                                    }}
                                    title={
                                      isOwnAdminCard
                                        ? 'Perbarui catatan sandi kartu Anda'
                                        : 'Ubah sandi kartu'
                                    }
                                    className="no-print text-[10px] font-semibold text-slate-400 hover:text-emerald-700 px-1 shrink-0"
                                  >
                                    Ubah
                                  </button>
                                )}
                              </div>
                            ) : (
                              <>
                                <span className="hidden print:inline font-mono text-[11px] font-bold text-slate-600">
                                  (Belum Diatur)
                                </span>
                                {canEditInline && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCardUid(card.uid);
                                      setInlinePasswordValue(
                                        isOwnAdminCard
                                          ? ''
                                          : buildDefaultCardPassword(card.account, card.nis)
                                      );
                                    }}
                                    className="no-print px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10.5px] font-bold inline-flex items-center gap-1 transition-colors"
                                  >
                                    <KeyRound className="w-3 h-3" />
                                    <span>
                                      {isOwnAdminCard
                                        ? 'Catat & Tampilkan Sandi'
                                        : 'Atur & Tampilkan Sandi'}
                                    </span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Footer Kartu */}
                        <footer className="pt-0.5 flex items-center justify-between gap-2 text-[9.5px] text-slate-500">
                          <span className="inline-flex items-center gap-1 min-w-0 truncate">
                            <ShieldCheck className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span className="truncate font-medium">{websiteUrl}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium text-slate-600">
                              Jaga kerahasiaan akun
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCard(card)}
                              title="Salin username & password kartu ini"
                              className="no-print inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold"
                            >
                              {copiedUid === card.uid ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
