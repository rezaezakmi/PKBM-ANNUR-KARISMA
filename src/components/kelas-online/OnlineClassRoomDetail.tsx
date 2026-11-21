import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  MessageSquare,
  NotebookPen,
  Pin,
  PlayCircle,
  Radio,
  Save,
  Send,
  Target,
  Trash2,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  OnlineClassMaterial,
  OnlineClassSession,
  OnlineClassStatus,
  OnlineMaterialType,
} from '../../types/siakad';
import { AnimatedSaveCheck } from '../ui/MotionPrimitives';

interface OnlineClassRoomDetailProps {
  session: OnlineClassSession;
  onBack: () => void;
  onEdit: (session: OnlineClassSession) => void;
  onDeleted: () => void;
  onOpenTasks?: () => void;
}

type DetailTab = 'materi' | 'tugas' | 'catatan' | 'diskusi' | 'peserta';

function formatIndoDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTimeShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMaterialIcon(type: OnlineMaterialType) {
  switch (type) {
    case 'Video Pembelajaran':
      return PlayCircle;
    case 'Slide / PDF':
      return FileText;
    case 'LKPD / Latihan':
      return NotebookPen;
    default:
      return BookOpen;
  }
}

export const OnlineClassRoomDetail: React.FC<OnlineClassRoomDetailProps> = ({
  session,
  onBack,
  onEdit,
  onDeleted,
  onOpenTasks,
}) => {
  const { profile, effectiveRole, firebaseUser } = useAuth();
  const {
    students,
    tasks,
    taskSubmissions,
    onlineClassProgress,
    onlineClassComments,
    saveOnlineClassProgress,
    updateOnlineClassStatus,
    deleteOnlineClass,
    addOnlineClassComment,
    togglePinOnlineClassComment,
    deleteOnlineClassComment,
  } = useData();
  const { showToast } = useToast();

  const currentUid = firebaseUser?.uid || profile?.uid || 'demo_murid_01';
  const canManage =
    effectiveRole === 'admin' || effectiveRole === 'kepala_pkbm' || effectiveRole === 'guru';

  const currentStudent = useMemo(
    () =>
      students.find(
        (s) =>
          s.ownerUid === currentUid ||
          (profile?.linkedEntityId && s.id === profile.linkedEntityId)
      ) || null,
    [students, currentUid, profile?.linkedEntityId]
  );

  const myProgress = useMemo(
    () =>
      onlineClassProgress.find(
        (p) => p.sessionId === session.id && p.studentUid === currentUid
      ) || null,
    [onlineClassProgress, session.id, currentUid]
  );

  const sessionParticipants = useMemo(
    () =>
      onlineClassProgress
        .filter((p) => p.sessionId === session.id)
        .sort((a, b) => b.progressPercent - a.progressPercent),
    [onlineClassProgress, session.id]
  );

  const sessionComments = useMemo(
    () =>
      onlineClassComments
        .filter((c) => c.sessionId === session.id)
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [onlineClassComments, session.id]
  );

  // Tasks linked specifically to this Online Class room OR sent to Kelas Online for this same Paket & Mapel
  const sessionTasks = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.onlineClassId && t.onlineClassId === session.id) return true;
          const isGeneralOnlineForPaket =
            t.deliveryMode === 'online' && !t.onlineClassId && t.paket === session.paket;
          if (isGeneralOnlineForPaket) {
            return !t.subjectId || t.subjectId === session.subjectId;
          }
          return false;
        })
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [tasks, session.id, session.paket, session.subjectId]
  );

  const [activeTab, setActiveTab] = useState<DetailTab>('materi');
  const [expandedMaterialId, setExpandedMaterialId] = useState<string>(
    session.materials[0]?.id || ''
  );
  const [noteDraft, setNoteDraft] = useState<string>(myProgress?.personalNote || '');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSavedTick, setNoteSavedTick] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [togglingMaterialId, setTogglingMaterialId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [pinNewComment, setPinNewComment] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    setNoteDraft(myProgress?.personalNote || '');
  }, [myProgress?.personalNote, session.id]);

  useEffect(() => {
    if (session.materials.length > 0 && !session.materials.some((m) => m.id === expandedMaterialId)) {
      setExpandedMaterialId(session.materials[0].id);
    }
  }, [session.materials, expandedMaterialId]);

  const completedIds = myProgress?.completedMaterialIds || [];
  const totalMaterials = session.materials.length;
  const completedCount = session.materials.filter((m) => completedIds.includes(m.id)).length;
  const progressPercent =
    totalMaterials > 0
      ? Math.round((completedCount / totalMaterials) * 100)
      : myProgress?.joinedLive
        ? 100
        : 0;

  const handleCopyCode = async () => {
    const textToCopy = session.meetingCode || session.meetingUrl;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedCode(true);
      showToast('Kode ruang kelas berhasil disalin.', 'success');
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      showToast('Tidak dapat menyalin otomatis. Salin kode secara manual.', 'info');
    }
  };

  const handleCheckInLive = async () => {
    setCheckingIn(true);
    try {
      await saveOnlineClassProgress(session, {
        joinedLive: true,
        studentId: currentStudent?.id || profile?.linkedEntityId || currentUid,
        studentName: currentStudent?.fullName || profile?.name || 'Warga Belajar',
        studentNis: currentStudent?.nis || profile?.nis || '',
      });
      showToast('Kehadiran kelas online berhasil dicatat!', 'success');
    } catch {
      showToast('Gagal mencatat kehadiran. Coba lagi sesaat.', 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleToggleMaterialDone = async (material: OnlineClassMaterial) => {
    setTogglingMaterialId(material.id);
    const isDone = completedIds.includes(material.id);
    const nextIds = isDone
      ? completedIds.filter((id) => id !== material.id)
      : [...completedIds, material.id];
    try {
      await saveOnlineClassProgress(session, {
        completedMaterialIds: nextIds,
        studentId: currentStudent?.id || profile?.linkedEntityId || currentUid,
        studentName: currentStudent?.fullName || profile?.name || 'Warga Belajar',
        studentNis: currentStudent?.nis || profile?.nis || '',
      });
      showToast(
        isDone ? `Status selesai "${material.title}" dibatalkan.` : `Materi "${material.title}" ditandai selesai!`,
        'success'
      );
    } catch {
      showToast('Gagal memperbarui progres materi.', 'error');
    } finally {
      setTogglingMaterialId(null);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      await saveOnlineClassProgress(session, {
        personalNote: noteDraft,
        studentId: currentStudent?.id || profile?.linkedEntityId || currentUid,
        studentName: currentStudent?.fullName || profile?.name || 'Warga Belajar',
        studentNis: currentStudent?.nis || profile?.nis || '',
      });
      setNoteSavedTick(true);
      showToast('Catatan belajar berhasil disimpan.', 'success');
      window.setTimeout(() => setNoteSavedTick(false), 1800);
    } catch {
      showToast('Gagal menyimpan catatan belajar.', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    setSendingComment(true);
    try {
      await addOnlineClassComment(session, commentInput.trim(), canManage ? pinNewComment : false);
      setCommentInput('');
      setPinNewComment(false);
      showToast('Pesan diskusi berhasil dikirim.', 'success');
    } catch {
      showToast('Gagal mengirim pesan diskusi.', 'error');
    } finally {
      setSendingComment(false);
    }
  };

  const handleStatusChange = async (nextStatus: OnlineClassStatus) => {
    if (nextStatus === session.status) return;
    setUpdatingStatus(true);
    try {
      await updateOnlineClassStatus(session.id, nextStatus);
      showToast(`Status kelas diubah menjadi ${nextStatus === 'Live' ? 'Sedang Live' : nextStatus}.`, 'success');
    } catch {
      showToast('Gagal memperbarui status kelas.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteRoom = async () => {
    try {
      await deleteOnlineClass(session.id);
      showToast('Ruang kelas online telah dihapus.', 'success');
      onDeleted();
    } catch {
      showToast('Gagal menghapus ruang kelas online.', 'error');
    }
  };

  const totalStudyMinutes = session.materials.reduce((acc, m) => acc + (m.durationMinutes || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500/40 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Kelas Online
        </button>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-1">
              {(['Terjadwal', 'Live', 'Selesai'] as OnlineClassStatus[]).map((st) => {
                const active = session.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleStatusChange(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      active
                        ? st === 'Live'
                          ? 'bg-rose-600 text-white'
                          : st === 'Selesai'
                            ? 'bg-slate-700 text-white dark:bg-slate-600'
                            : 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {st === 'Live' ? 'Live' : st}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onEdit(session)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500/40"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Kelas
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">Hapus kelas?</span>
                <button
                  type="button"
                  onClick={handleDeleteRoom}
                  className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Ya
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-white dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Classroom Header & Live Access Card */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Session Overview */}
          <div className="lg:col-span-7 p-6 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {session.status === 'Live' ? (
                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
                  </span>
                  Sedang Live
                </span>
              ) : (
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {session.status === 'Selesai' ? 'Rekaman & Modul Tersedia' : 'Sesi Terjadwal'}
                </span>
              )}
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="font-bold text-slate-900 dark:text-white">{session.paket}</span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span>{session.fase}</span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span>{session.modality}</span>
            </div>

            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                {session.title}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {session.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-950/10 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300">
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
                  Mata Pelajaran & Rombel
                </span>
                <span className="mt-0.5 block font-semibold text-slate-900 dark:text-white">
                  {session.subjectName} — {session.className}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
                  Tutor Pengampu
                </span>
                <span className="mt-0.5 block font-semibold text-slate-900 dark:text-white">
                  {session.teacherName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{formatIndoDate(session.scheduleDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {session.startTime} – {session.endTime} WIB ({session.durationMinutes} menit)
                </span>
              </div>
            </div>
          </div>

          {/* Right: Live Room Access & Attendance Box */}
          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-950/60 p-6 sm:p-7 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Akses Ruang Tatap Muka
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {session.platform}
                </span>
              </div>

              {session.meetingCode && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Kode Ruang / ID
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white truncate block">
                      {session.meetingCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-950/10 dark:border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Disalin' : 'Salin'}
                  </button>
                </div>
              )}

              {/* Primary Join & Recording Links (standard <a> — never window.open) */}
              <div className="flex flex-col gap-2.5">
                {session.meetingUrl ? (
                  <a
                    href={session.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors ${
                      session.status === 'Live'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700'
                    }`}
                  >
                    {session.status === 'Live' ? <Radio className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                    {session.status === 'Live'
                      ? `Gabung Live (${session.platform})`
                      : `Buka Ruang ${session.platform}`}
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                    Sesi ini menggunakan moda belajar mandiri melalui modul di bawah.
                  </div>
                )}

                {session.recordingUrl && (
                  <a
                    href={session.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-2 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-950/50 transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Tonton Rekaman / Referensi Video
                    <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                  </a>
                )}

                {/* 1-click Attendance Check-In */}
                <button
                  type="button"
                  disabled={checkingIn}
                  onClick={handleCheckInLive}
                  className={`min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${
                    myProgress?.joinedLive
                      ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                      : 'border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-emerald-500/50'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  {myProgress?.joinedLive
                    ? `Tercatat Hadir (${formatDateTimeShort(myProgress.joinedAt) || 'Hari ini'})`
                    : checkingIn
                      ? 'Mencatat Kehadiran...'
                      : 'Konfirmasi Absen Hadir Kelas Online'}
                </button>
              </div>
            </div>

            {/* Personal Learning Progress */}
            <div className="pt-3 border-t border-emerald-950/10 dark:border-white/10 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  Progres Belajar Saya
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {completedCount}/{totalMaterials} Modul · {progressPercent}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-emerald-950/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs inside Room */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-emerald-950/10 dark:border-white/10">
        {(
          [
            { id: 'materi', label: `Materi & Modul (${totalMaterials})`, icon: BookOpen },
            { id: 'tugas', label: `Tugas Kelas (${sessionTasks.length})`, icon: ClipboardList },
            { id: 'catatan', label: 'Catatan Belajar Saya', icon: NotebookPen },
            { id: 'diskusi', label: `Diskusi & Tanya Tutor (${sessionComments.length})`, icon: MessageSquare },
            ...(canManage
              ? [{ id: 'peserta' as DetailTab, label: `Peserta & Progres (${sessionParticipants.length})`, icon: Users }]
              : []),
          ] as Array<{ id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                active
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: MATERI & MODUL BELAJAR */}
      {activeTab === 'materi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Objectives & Quick Stats */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <Target className="w-4 h-4" />
                Tujuan Pembelajaran
              </div>
              <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {session.learningObjectives.map((obj, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{obj}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-900/50 p-5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                Panduan Belajar Mandiri
              </div>
              <p className="leading-relaxed">
                Pelajari setiap modul secara berurutan (estimasi total{' '}
                <strong className="text-slate-900 dark:text-white">{totalStudyMinutes} menit</strong>).
                Klik <strong>Tandai Selesai</strong> setelah membaca tiap modul agar progres belajar tercatat otomatis untuk tutor.
              </p>
            </div>
          </div>

          {/* Right: Accordion Study Modules */}
          <div className="lg:col-span-8 space-y-3">
            {session.materials.map((mat, index) => {
              const Icon = getMaterialIcon(mat.type);
              const isExpanded = expandedMaterialId === mat.id;
              const isDone = completedIds.includes(mat.id);
              const isBusy = togglingMaterialId === mat.id;

              return (
                <div
                  key={mat.id}
                  className={`rounded-2xl border transition-colors ${
                    isDone
                      ? 'border-emerald-500/35 bg-emerald-50/35 dark:bg-emerald-950/20'
                      : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedMaterialId(isExpanded ? '' : mat.id)}
                    className="w-full p-4 sm:p-5 flex items-start justify-between gap-4 text-left"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {isDone ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Bagian {index + 1} · {mat.type} · {mat.durationMinutes} menit
                          {isDone && (
                            <span className="ml-2 font-bold text-emerald-700 dark:text-emerald-400">
                              · Selesai Dipelajari
                            </span>
                          )}
                        </div>
                        <h3 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white">
                          {mat.title}
                        </h3>
                        {mat.summary && (
                          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                            {mat.summary}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className="mt-1 text-slate-400 shrink-0">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-emerald-950/10 dark:border-white/10 space-y-4">
                      <div className="rounded-xl bg-[#FAFAF7] dark:bg-slate-950/70 border border-emerald-950/5 dark:border-white/5 p-4 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                        {mat.contentText}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {mat.resourceUrl ? (
                          <a
                            href={mat.resourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Buka Sumber Belajar / Video
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Bahan ajar lengkap tersedia langsung di atas.
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleMaterialDone(mat)}
                          className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                            isDone
                              ? 'border border-emerald-600/30 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                          {isBusy
                            ? 'Menyimpan...'
                            : isDone
                              ? 'Sudah Selesai (Klik untuk batal)'
                              : 'Tandai Modul Selesai'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 1B: TUGAS KELAS ONLINE */}
      {activeTab === 'tugas' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Daftar Tugas — Kelas Online {session.paket}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {canManage
                  ? 'Tugas yang diterbitkan dari menu Tugas ke kelas online ini akan tampil otomatis di sini.'
                  : 'Kerjakan dan unggah jawaban tugas kelas online ini melalui menu Tugas.'}
              </p>
            </div>
            {onOpenTasks && (
              <button
                type="button"
                onClick={onOpenTasks}
                className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 text-white text-xs font-bold shadow-sm hover:brightness-105 inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
              >
                <ClipboardList className="w-4 h-4" />
                {canManage ? 'Kelola / Buat Tugas Baru' : 'Buka Menu Tugas'}
              </button>
            )}
          </div>

          {sessionTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-950/15 dark:border-white/15 bg-white/60 dark:bg-slate-900/40 p-8 text-center space-y-2">
              <ClipboardList className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Belum Ada Tugas untuk Kelas Online Ini
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {canManage
                  ? `Guru dapat mengirim tugas baru dari menu Tugas dengan memilih target "Kelas Online — ${session.paket}" atau langsung memilih ruang "${session.title}".`
                  : 'Tutor belum mengirimkan penugasan khusus untuk ruang kelas online ini.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessionTasks.map((task) => {
                const taskSubs = taskSubmissions.filter((sub) => sub.taskId === task.id);
                const mySub =
                  effectiveRole === 'murid'
                    ? taskSubs.find(
                        (sub) =>
                          sub.studentUid === currentUid ||
                          (currentStudent && sub.studentId === currentStudent.id)
                      ) || null
                    : null;
                const isOverdue = new Date(task.dueAt).getTime() < Date.now();

                return (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-5 flex flex-col justify-between gap-4 shadow-sm"
                  >
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {task.subjectName}
                        </span>
                        {effectiveRole === 'murid' ? (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              mySub?.status === 'Sudah Dinilai'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : mySub?.status === 'Revisi'
                                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                  : mySub
                                    ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {mySub ? `${mySub.status}${mySub.status === 'Sudah Dinilai' ? ` (${mySub.score}/${task.maxScore})` : ''}` : 'Belum Dikerjakan'}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                            {taskSubs.length} pengumpulan · Maks {task.maxScore}
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-display font-bold text-base text-slate-900 dark:text-white leading-snug">
                          {task.title}
                        </h4>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                          {task.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-emerald-950/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${
                          isOverdue
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Tenggat: {formatDateTimeShort(task.dueAt) || task.dueAt}
                      </span>

                      {onOpenTasks && (
                        <button
                          type="button"
                          onClick={onOpenTasks}
                          className="min-h-[36px] px-3 rounded-lg border border-emerald-600/30 bg-emerald-50/70 dark:bg-emerald-950/40 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
                        >
                          {effectiveRole === 'murid'
                            ? mySub
                              ? 'Lihat Jawaban'
                              : 'Kerjakan Tugas'
                            : 'Nilai di Menu Tugas'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CATATAN BELAJAR SAYA */}
      {activeTab === 'catatan' && (
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Catatan Belajar Pribadi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Catat rangkuman, jawaban latihan LKPD, atau hal yang ingin ditanyakan saat kelas live. Tersimpan otomatis ke akun Anda.
              </p>
            </div>
            {myProgress?.updatedAt && (
              <span className="text-xs text-slate-400">
                Terakhir diperbarui: {formatDateTimeShort(myProgress.updatedAt)}
              </span>
            )}
          </div>

          <textarea
            rows={8}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Tulis rangkuman penting, rumus, atau jawaban latihan mandiri dari materi kelas ini..."
            className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-[#FAFAF7] dark:bg-slate-950/60 p-4 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400 tabular-nums">
              {noteDraft.length} / 3.000 karakter
            </span>
            <button
              type="button"
              disabled={savingNote}
              onClick={handleSaveNote}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
            >
              {noteSavedTick ? <AnimatedSaveCheck visible /> : <Save className="w-4 h-4" />}
              {savingNote ? 'Menyimpan...' : noteSavedTick ? 'Tersimpan' : 'Simpan Catatan'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: DISKUSI & TANYA TUTOR */}
      {activeTab === 'diskusi' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSendComment}
            className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-4 sm:p-5 space-y-3"
          >
            <textarea
              rows={3}
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder={
                canManage
                  ? 'Tulis pengumuman, instruksi tugas, atau jawaban untuk warga belajar...'
                  : 'Ajukan pertanyaan tentang materi atau bagikan hasil latihanmu kepada tutor...'
              }
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-[#FAFAF7] dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {canManage ? (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinNewComment}
                    onChange={(e) => setPinNewComment(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Sematkan sebagai Pengumuman Tutor di atas
                </label>
              ) : (
                <span className="text-xs text-slate-400">
                  Diskusi terbuka untuk seluruh peserta {session.paket}.
                </span>
              )}

              <button
                type="submit"
                disabled={sendingComment || !commentInput.trim()}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors"
              >
                <Send className="w-4 h-4" />
                {sendingComment ? 'Mengirim...' : 'Kirim Pesan'}
              </button>
            </div>
          </form>

          {sessionComments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-950/15 dark:border-white/15 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada pesan di forum diskusi kelas ini. Mulai percakapan pertama sekarang.
            </div>
          ) : (
            <div className="space-y-3">
              {sessionComments.map((cmt) => {
                const isTutorRole = cmt.authorRole !== 'murid';
                const canDeleteThis = canManage || cmt.authorUid === currentUid;
                return (
                  <div
                    key={cmt.id}
                    className={`rounded-2xl border p-4 sm:p-5 space-y-2 ${
                      cmt.isPinned
                        ? 'border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20'
                        : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        {cmt.isPinned && (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400">
                            <Pin className="w-3.5 h-3.5" />
                            Disematkan
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {cmt.authorName}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span
                          className={`font-semibold ${
                            isTutorRole
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cmt.authorRole === 'admin'
                            ? 'Admin PKBM'
                            : cmt.authorRole === 'kepala_pkbm'
                              ? 'Kepala PKBM'
                              : cmt.authorRole === 'guru'
                                ? 'Tutor'
                                : 'Warga Belajar'}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-400">{formatDateTimeShort(cmt.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => togglePinOnlineClassComment(cmt.id, !cmt.isPinned)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                            title={cmt.isPinned ? 'Lepas sematan' : 'Sematkan pesan'}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteThis && (
                          <button
                            type="button"
                            onClick={() => deleteOnlineClassComment(cmt.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Hapus pesan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                      {cmt.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PESERTA & PROGRES (ADMIN / KEPALA / TUTOR) */}
      {activeTab === 'peserta' && canManage && (
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 overflow-hidden">
          <div className="p-5 border-b border-emerald-950/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Rekap Kehadiran & Progres Modul Warga Belajar
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Menampilkan seluruh warga belajar yang sudah menekan Absen Hadir atau menyelesaikan modul pada sesi ini.
              </p>
            </div>
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {sessionParticipants.filter((p) => p.joinedLive).length} Hadir Live ·{' '}
              {sessionParticipants.filter((p) => p.progressPercent === 100).length} Tuntas 100%
            </div>
          </div>

          {sessionParticipants.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada warga belajar yang mencatat kehadiran atau menyelesaikan modul pada kelas ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAFAF7] dark:bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-emerald-950/10 dark:border-white/10">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Warga Belajar</th>
                    <th className="px-4 py-3 font-semibold">Kehadiran Daring</th>
                    <th className="px-4 py-3 font-semibold">Progres Modul</th>
                    <th className="px-5 py-3 font-semibold">Aktivitas Terakhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/10 dark:divide-white/10">
                  {sessionParticipants.map((p) => (
                    <tr key={p.id} className="hover:bg-emerald-50/30 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {p.studentName}
                        </div>
                        {p.studentNis && (
                          <div className="text-xs text-slate-500 font-mono">NIS {p.studentNis}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {p.joinedLive ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            Hadir · {formatDateTimeShort(p.joinedAt) || 'Tercatat'}
                          </span>
                        ) : (
                          <span className="text-slate-400">Belajar Mandiri</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-24 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-600"
                              style={{ width: `${p.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                            {p.completedMaterialIds.length}/{totalMaterials} ({p.progressPercent}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTimeShort(p.updatedAt) || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
