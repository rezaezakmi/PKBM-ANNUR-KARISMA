import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  Loader2,
  Printer,
  Search,
  Shuffle,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { isValidUsernameFormat, normalizeUsername } from '../../lib/firebase';
import { saveStoredCredentials } from '../../utils/credentialStore';
import { resolveStudentPlacement } from '../../utils/excelUtils';
import {
  createManagedAccount,
  generateRandomPassword,
} from '../../services/accountService';
import {
  PaketType,
  SessionIssuedCredential,
  Student,
  UserProfile,
} from '../../types/siakad';

interface BulkStudentAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIssuedCredentials?: (creds: SessionIssuedCredential[]) => void;
  onPrintBatch?: (uids: string[]) => void;
}

type PasswordMode = 'nis' | 'uniform' | 'random';

function suggestStudentUsername(student: Student, usedSet: Set<string>): string {
  const fromNis = normalizeUsername(student.nis || '');
  const baseFromName = normalizeUsername(
    student.fullName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.')
  );

  let base = fromNis.length >= 3 && isValidUsernameFormat(fromNis) ? fromNis : baseFromName;
  if (!isValidUsernameFormat(base)) {
    base = `murid.${student.id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()}`;
  }

  let candidate = base.slice(0, 34);
  let counter = 2;
  while (usedSet.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 30)}${counter}`;
    counter++;
  }
  usedSet.add(candidate.toLowerCase());
  return candidate;
}

function buildDefaultNisPassword(student: Student): string {
  const clean = (student.nis || '').replace(/\s+/g, '');
  if (clean.length >= 6) return clean;
  if (clean.length > 0) return `pkbm${clean}`.padEnd(6, '0');
  return 'Pkbm2026!';
}

export const BulkStudentAccountModal: React.FC<BulkStudentAccountModalProps> = ({
  isOpen,
  onClose,
  onIssuedCredentials,
  onPrintBatch,
}) => {
  const { firebaseUser, profile } = useAuth();
  const { students, classes, accounts, schoolSettings, selectedProgram, setSelectedProgram } = useData();
  const { showToast } = useToast();

  const adminUid = firebaseUser?.uid || profile?.uid || '';

  const paketFilter = selectedProgram;
  const setPaketFilter = setSelectedProgram;
  const [classFilter, setClassFilter] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [usernamesMap, setUsernamesMap] = useState<Record<string, string>>({});
  const [passwordsMap, setPasswordsMap] = useState<Record<string, string>>({});
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('nis');
  const [uniformPassword, setUniformPassword] = useState('Pkbm2026!');
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; statusNote?: string } | null>(null);
  const [resultReport, setResultReport] = useState<{
    succeeded: Array<SessionIssuedCredential & { nis?: string }>;
    failed: Array<{ name: string; nis: string; username: string; reason: string }>;
    pausedCount: number;
  } | null>(null);

  const studentsWithoutAccount = useMemo(() => {
    const linkedIds = new Set(
      accounts
        .filter((a) => a.role === 'murid' && a.linkedEntityId)
        .map((a) => a.linkedEntityId!)
    );
    const linkedNis = new Set(
      accounts
        .filter((a) => a.role === 'murid' && a.nis)
        .map((a) => a.nis!.trim().toLowerCase())
    );
    return students.filter(
      (s) =>
        !linkedIds.has(s.id) &&
        !(s.nis && linkedNis.has(s.nis.trim().toLowerCase()))
    );
  }, [students, accounts]);

  useEffect(() => {
    if (!isOpen) return;
    const used = new Set(accounts.map((a) => a.username.toLowerCase()));
    const nextUsernames: Record<string, string> = {};
    const nextPasswords: Record<string, string> = {};

    studentsWithoutAccount.forEach((s) => {
      nextUsernames[s.id] = suggestStudentUsername(s, used);
      nextPasswords[s.id] = buildDefaultNisPassword(s);
    });

    setClassFilter('Semua');
    setSearchQuery('');
    setPasswordMode('nis');
    setUniformPassword('Pkbm2026!');
    setUsernamesMap(nextUsernames);
    setPasswordsMap(nextPasswords);
    setSelectedIds(
      studentsWithoutAccount
        .filter((s) => selectedProgram === 'Semua' || s.paket === selectedProgram)
        .map((s) => s.id)
    );
    setProgress(null);
    setResultReport(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || creating || resultReport) return;
    setClassFilter('Semua');
    setSelectedIds(
      studentsWithoutAccount
        .filter((s) => selectedProgram === 'Semua' || s.paket === selectedProgram)
        .map((s) => s.id)
    );
  }, [selectedProgram]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return studentsWithoutAccount.filter((s) => {
      const matchPaket = paketFilter === 'Semua' || s.paket === paketFilter;
      const matchClass = classFilter === 'Semua' || s.classId === classFilter;
      const matchQuery =
        !q ||
        s.fullName.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q);
      return matchPaket && matchClass && matchQuery;
    });
  }, [studentsWithoutAccount, paketFilter, classFilter, searchQuery]);

  const handleChangePasswordMode = (mode: PasswordMode) => {
    setPasswordMode(mode);
    const updated: Record<string, string> = {};
    studentsWithoutAccount.forEach((s) => {
      if (mode === 'nis') updated[s.id] = buildDefaultNisPassword(s);
      else if (mode === 'random') updated[s.id] = generateRandomPassword(8);
      else updated[s.id] = uniformPassword;
    });
    setPasswordsMap(updated);
  };

  const handleApplyUniformPassword = (val: string) => {
    setUniformPassword(val);
    if (passwordMode === 'uniform') {
      const updated: Record<string, string> = {};
      studentsWithoutAccount.forEach((s) => {
        updated[s.id] = val;
      });
      setPasswordsMap(updated);
    }
  };

  const handleSelectAllFiltered = () => {
    const merged = new Set(selectedIds);
    filteredStudents.forEach((s) => merged.add(s.id));
    setSelectedIds(Array.from(merged));
  };

  const handleDeselectAllFiltered = () => {
    const filteredSet = new Set(filteredStudents.map((s) => s.id));
    setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
  };

  const selectedStudentsList = useMemo(
    () => studentsWithoutAccount.filter((s) => selectedIds.includes(s.id)),
    [studentsWithoutAccount, selectedIds]
  );

  const handleExecuteCreate = async () => {
    if (!adminUid) {
      showToast('Sesi Admin tidak ditemukan. Silakan muat ulang halaman.', 'error');
      return;
    }
    if (selectedStudentsList.length === 0) {
      showToast('Pilih minimal 1 murid terlebih dahulu.', 'warning');
      return;
    }
    if (passwordMode === 'uniform' && uniformPassword.trim().length < 6) {
      showToast('Password seragam minimal harus 6 karakter.', 'error');
      return;
    }

    setCreating(true);
    setProgress({ done: 0, total: selectedStudentsList.length });

    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const isTooManyRequestsError = (err: unknown): boolean => {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : String(err || '');
      return code.includes('too-many-requests') || msg.toLowerCase().includes('too-many-requests');
    };

    const succeeded: Array<SessionIssuedCredential & { nis?: string }> = [];
    const failed: Array<{ name: string; nis: string; username: string; reason: string }> = [];
    const rollingUsers: UserProfile[] = [...accounts];
    let pausedCount = 0;

    for (let i = 0; i < selectedStudentsList.length; i++) {
      const stu = selectedStudentsList[i];
      const rawUsername = usernamesMap[stu.id] || stu.nis || '';
      const cleanUsername = normalizeUsername(rawUsername);
      const pwd =
        passwordMode === 'uniform'
          ? uniformPassword.trim()
          : (passwordsMap[stu.id] || buildDefaultNisPassword(stu)).trim();
      const placement = resolveStudentPlacement(stu, classes);
      const studentClassLabel = placement.fullClassLabel;

      if (!isValidUsernameFormat(cleanUsername)) {
        failed.push({
          name: stu.fullName,
          nis: stu.nis,
          username: rawUsername || '-',
          reason: 'Username harus 3–40 karakter (huruf kecil, angka, . _ - tanpa spasi).',
        });
        setProgress({ done: i + 1, total: selectedStudentsList.length });
        continue;
      }

      if (rollingUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
        failed.push({
          name: stu.fullName,
          nis: stu.nis,
          username: cleanUsername,
          reason: `Username "${cleanUsername}" sudah dipakai akun lain.`,
        });
        setProgress({ done: i + 1, total: selectedStudentsList.length });
        continue;
      }

      if (pwd.length < 6) {
        failed.push({
          name: stu.fullName,
          nis: stu.nis,
          username: cleanUsername,
          reason: 'Password minimal harus 6 karakter.',
        });
        setProgress({ done: i + 1, total: selectedStudentsList.length });
        continue;
      }

      // Beri jeda antar-request agar tidak memicu batas anti-spam Firebase Auth
      if (i > 0) {
        await sleep(i % 15 === 0 ? 1100 : 350);
      }

      let createdSuccess = false;
      let hitRateLimitStop = false;
      const retryDelays = [0, 6000, 12000];

      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (attempt > 0) {
          const waitSec = Math.round(retryDelays[attempt] / 1000);
          setProgress({
            done: i,
            total: selectedStudentsList.length,
            statusNote: `Jeda anti-spam Firebase Auth (${waitSec} dtk) sebelum mencoba ulang...`,
          });
          await sleep(retryDelays[attempt]);
        }

        try {
          const cred = await createManagedAccount({
            input: {
              name: stu.fullName,
              username: cleanUsername,
              password: pwd,
              role: 'murid',
              linkedEntityId: stu.id,
              nis: stu.nis,
              classLabel: studentClassLabel,
            },
            adminUid,
            existingUsers: rollingUsers,
          });
          succeeded.push({ ...cred, nis: stu.nis });
          rollingUsers.push({
            uid: cred.uid,
            username: cred.username,
            internalEmail: `${cred.username}@annurkarisma.app`,
            name: cred.name,
            role: 'murid',
            status: 'Aktif',
            linkedEntityId: stu.id,
            nis: stu.nis,
            classLabel: studentClassLabel,
          });
          createdSuccess = true;
          break;
        } catch (err) {
          if (isTooManyRequestsError(err)) {
            if (attempt < retryDelays.length - 1) {
              continue;
            }
            hitRateLimitStop = true;
            break;
          }
          failed.push({
            name: stu.fullName,
            nis: stu.nis,
            username: cleanUsername,
            reason: err instanceof Error ? err.message : 'Gagal membuat akun di Firebase Auth.',
          });
          break;
        }
      }

      if (hitRateLimitStop) {
        pausedCount = selectedStudentsList.length - i;
        break;
      }

      setProgress({
        done: i + 1,
        total: selectedStudentsList.length,
        statusNote: undefined,
      });
      if (!createdSuccess) {
        continue;
      }
    }

    if (succeeded.length > 0) {
      saveStoredCredentials(succeeded);
      onIssuedCredentials?.(succeeded);
    }

    setResultReport({ succeeded, failed, pausedCount });
    setCreating(false);

    if (pausedCount > 0) {
      showToast(
        `${succeeded.length} akun dibuat. ${pausedCount} murid dijeda karena batas sementara Firebase Auth — tunggu 2–5 menit lalu lanjutkan lagi.`,
        'warning'
      );
    } else if (succeeded.length > 0 && failed.length === 0) {
      showToast(`${succeeded.length} akun login murid berhasil dibuat serentak.`, 'success');
    } else if (succeeded.length > 0) {
      showToast(`${succeeded.length} akun murid berhasil dibuat, ${failed.length} gagal.`, 'warning');
    } else {
      showToast(`Gagal membuat akun murid (${failed.length} gagal).`, 'error');
    }
  };

  const handleExportCredentialsExcel = () => {
    if (!resultReport || resultReport.succeeded.length === 0) return;
    const rows = resultReport.succeeded.map((c, idx) => ({
      No: idx + 1,
      'Nama Lengkap': c.name,
      NIS: c.nis || '-',
      Kelas: c.classLabel || '-',
      Username: c.username,
      Password: c.password,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 16 },
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
    ];
    // Jaga NIS, Username, dan Password sebagai teks agar angka 0 di depan tidak hilang
    Object.keys(ws).forEach((addr) => {
      if (addr.startsWith('!') || addr.endsWith('1')) return;
      const cell = ws[addr] as XLSX.CellObject;
      if (cell && (addr.startsWith('C') || addr.startsWith('E') || addr.startsWith('F'))) {
        cell.t = 's';
        cell.z = '@';
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Akun Login Murid');
    XLSX.writeFile(
      wb,
      `Akun_Login_Murid_${schoolSettings.schoolName.replace(/\s+/g, '_')}.xlsx`
    );
    showToast('Daftar Username & Password murid berhasil diunduh (Excel).', 'success');
  };

  const handleCopyAll = async () => {
    if (!resultReport || resultReport.succeeded.length === 0) return;
    const text = resultReport.succeeded
      .map(
        (c) =>
          `${c.name} (${c.classLabel || '-'}) | Username: ${c.username} | Password: ${c.password}`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Semua kredensial login murid berhasil disalin.', 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-50/80 via-white to-amber-50/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                  Buat Akun Login Murid Serentak
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Otomatis mengambil murid dari Data Master yang belum punya akun login dan menautkannya ke tugas serta nilai kelas masing-masing.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={onClose}
              aria-label="Tutup modal buat akun murid serentak"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            {resultReport ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm text-emerald-950 dark:text-emerald-100">
                        {resultReport.succeeded.length} Akun Login Murid Berhasil Dibuat
                        {resultReport.failed.length > 0 ? ` (${resultReport.failed.length} gagal)` : ''}
                      </p>
                      <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                        Unduh file Excel daftar username &amp; password ini untuk dibagikan ke wali kelas atau murid.
                      </p>
                    </div>
                  </div>

                  {resultReport.succeeded.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyAll}
                        className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-xs font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5 hover:bg-emerald-100/60"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Semua</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportCredentialsExcel}
                        className="min-h-[38px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Download Excel Akun</span>
                      </button>
                      {onPrintBatch && (
                        <button
                          type="button"
                          onClick={() => {
                            const uids = resultReport.succeeded.map((c) => c.uid);
                            onClose();
                            onPrintBatch(uids);
                          }}
                          className="min-h-[38px] px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Cetak Kartu Login</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {resultReport.pausedCount > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-1">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        Dijeda Sementara oleh Batas Keamanan Firebase Auth ({resultReport.pausedCount} murid tersisa)
                      </span>
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <strong>{resultReport.succeeded.length}</strong> akun murid sudah tersimpan aman. Firebase Auth membatasi pembuatan akun berturut-turut sekitar ~80–100 akun per sesi demi mencegah spam. Silakan unduh Excel/cetak kartu batch ini terlebih dahulu, tunggu <strong>2–5 menit</strong>, lalu klik <strong>Buat Akun Murid Serentak</strong> lagi untuk otomatis melanjutkan <strong>{resultReport.pausedCount} murid</strong> yang belum punya akun.
                    </p>
                  </div>
                )}

                {resultReport.failed.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 space-y-1.5">
                    <p className="text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Murid yang gagal dibuatkan akun ({resultReport.failed.length}):</span>
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {resultReport.failed.map((f, idx) => (
                        <p key={idx} className="text-xs text-rose-700 dark:text-rose-300">
                          • <span className="font-semibold">{f.name}</span> (NIS: {f.nis}, @{f.username}): {f.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {resultReport.succeeded.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3 font-bold">Nama Murid</th>
                          <th className="py-2.5 px-3 font-bold">Kelas</th>
                          <th className="py-2.5 px-3 font-bold">Username Login</th>
                          <th className="py-2.5 px-3 font-bold">Password</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {resultReport.succeeded.map((cred) => (
                          <tr key={cred.uid}>
                            <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">{cred.name}</td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{cred.classLabel || '-'}</td>
                            <td className="py-2 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">{cred.username}</td>
                            <td className="py-2 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">{cred.password}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : studentsWithoutAccount.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <UserCheck className="w-10 h-10 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm text-slate-900 dark:text-white">
                  {students.length === 0
                    ? 'Belum ada data murid di Data Master Murid.'
                    : 'Semua murid yang terdaftar sudah memiliki akun login!'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {students.length === 0
                    ? 'Tambahkan atau impor data murid terlebih dahulu di menu Data Murid, lalu kembali ke sini untuk membuat akun login serentak.'
                    : 'Anda dapat mencetak ulang Kartu Login atau mereset password murid langsung dari daftar akun.'}
                </p>
              </div>
            ) : (
              <>
                {/* Mode Password */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-emerald-600" />
                      <span>Pengaturan Password Awal Murid:</span>
                    </span>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleChangePasswordMode('nis')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          passwordMode === 'nis'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Sesuai NIS (Mudah Diingat)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangePasswordMode('uniform')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          passwordMode === 'uniform'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        1 Sandi Seragam
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangePasswordMode('random')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          passwordMode === 'random'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Acak Unik per Murid
                      </button>
                    </div>
                  </div>

                  {passwordMode === 'uniform' && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={uniformPassword}
                        onChange={(e) => handleApplyUniformPassword(e.target.value)}
                        placeholder="Masukkan password seragam (minimal 6 karakter)..."
                        className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyUniformPassword(generateRandomPassword(8))}
                        className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 hover:bg-slate-100"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Acak Sandi</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Filters & Select All */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama atau NIS murid..."
                        className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <select
                      value={paketFilter}
                      onChange={(e) => {
                        const next = e.target.value as 'Semua' | PaketType;
                        setPaketFilter(next);
                        setClassFilter('Semua');
                        setSelectedIds(
                          studentsWithoutAccount
                            .filter((s) => next === 'Semua' || s.paket === next)
                            .map((s) => s.id)
                        );
                      }}
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="Semua">Semua Program</option>
                      <option value="Paket A">Paket A</option>
                      <option value="Paket B">Paket B</option>
                      <option value="Paket C">Paket C</option>
                    </select>
                    <select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[200px]"
                    >
                      <option value="Semua">Semua Kelas</option>
                      {classes
                        .filter((c) => paketFilter === 'Semua' || c.paket === paketFilter)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Pilih Semua ({filteredStudents.length})
                    </button>
                    {filteredStudents.length > 80 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedIds(filteredStudents.slice(0, 80).map((s) => s.id))}
                          className="font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                        >
                          Pilih 80 Pertama (Aman Batas Burst)
                        </button>
                      </>
                    )}
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllFiltered}
                      className="font-semibold text-slate-500 hover:underline"
                    >
                      Batal Pilih
                    </button>
                  </div>
                </div>

                {/* Student Table */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-[38vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">Pilih</th>
                        <th className="py-2.5 px-3 font-bold">Nama Murid</th>
                        <th className="py-2.5 px-3 font-bold">NIS</th>
                        <th className="py-2.5 px-3 font-bold">Paket &amp; Kelas</th>
                        <th className="py-2.5 px-3 font-bold">Username Login</th>
                        <th className="py-2.5 px-3 font-bold">Password Awal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredStudents.map((stu) => {
                        const checked = selectedIds.includes(stu.id);
                        const uname = usernamesMap[stu.id] || '';
                        const cleanUname = normalizeUsername(uname);
                        const invalidUname = checked && !isValidUsernameFormat(cleanUname);
                        const pwd =
                          passwordMode === 'uniform'
                            ? uniformPassword
                            : passwordsMap[stu.id] || '';
                        return (
                          <tr
                            key={stu.id}
                            className={
                              checked
                                ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                                : 'opacity-65 hover:opacity-100'
                            }
                          >
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIds((prev) => [...prev, stu.id]);
                                  } else {
                                    setSelectedIds((prev) => prev.filter((id) => id !== stu.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white min-w-[160px]">
                              {stu.fullName}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {stu.nis}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {stu.paket}
                              </span>{' '}
                              · {stu.className}
                            </td>
                            <td className="py-2 px-3 min-w-[160px]">
                              <input
                                type="text"
                                value={uname}
                                disabled={creating}
                                onChange={(e) =>
                                  setUsernamesMap((prev) => ({
                                    ...prev,
                                    [stu.id]: e.target.value.toLowerCase().replace(/\s+/g, ''),
                                  }))
                                }
                                className={`w-full min-h-[34px] px-2.5 rounded-lg border text-xs font-mono bg-white dark:bg-slate-900 ${
                                  invalidUname
                                    ? 'border-rose-400 text-rose-700'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-3 min-w-[150px]">
                              <input
                                type="text"
                                value={pwd}
                                disabled={creating || passwordMode === 'uniform'}
                                onChange={(e) =>
                                  setPasswordsMap((prev) => ({
                                    ...prev,
                                    [stu.id]: e.target.value,
                                  }))
                                }
                                className="w-full min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white disabled:opacity-60"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {creating && progress ? (
                <span className="inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {progress.statusNote ||
                      `Membuat akun ${progress.done} dari ${progress.total} murid...`}
                  </span>
                </span>
              ) : resultReport ? (
                <span>
                  Selesai: <strong>{resultReport.succeeded.length}</strong> berhasil
                  {resultReport.pausedCount > 0 ? `, ${resultReport.pausedCount} dijeda` : ''}
                  {resultReport.failed.length > 0 ? `, ${resultReport.failed.length} gagal` : ''}.
                </span>
              ) : (
                <span>
                  Terpilih <strong>{selectedStudentsList.length}</strong> dari{' '}
                  <strong>{studentsWithoutAccount.length}</strong> murid yang belum memiliki akun login.
                  {selectedStudentsList.length > 85 && (
                    <span className="ml-1.5 text-amber-700 dark:text-amber-400">
                      (Disarankan ≤80 murid per batch agar aman dari batas anti-spam Firebase.)
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                disabled={creating}
                onClick={onClose}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {resultReport ? 'Selesai & Tutup' : 'Batal'}
              </button>

              {!resultReport && studentsWithoutAccount.length > 0 && (
                <button
                  type="button"
                  disabled={creating || selectedStudentsList.length === 0}
                  onClick={handleExecuteCreate}
                  className="min-h-[40px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs font-bold shadow-sm hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Membuat Akun...</span>
                    </>
                  ) : (
                    <>
                      <GraduationCap className="w-4 h-4" />
                      <span>Buat {selectedStudentsList.length} Akun Murid Serentak</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
