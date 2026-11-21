import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, FileText, MonitorPlay, Paperclip, Trash2, UploadCloud, X } from 'lucide-react';
import {
  Classroom,
  OnlineClassSession,
  PaketType,
  Subject,
  TaskAttachment,
  Teacher,
  TeacherTask,
  TeachingAssignment,
  UserRole,
} from '../../types/siakad';
import { formatFileSize, getDefaultDueAtInput, toDateTimeLocalInput } from './taskHelpers';
import { getTeacherSubjectsForClassOrPaket } from '../../data/kurikulumMerdeka';
import { sortClassesByJenjang } from '../../utils/excelUtils';

const PAKET_LEVELS: Array<{ paket: PaketType; label: string; subtitle: string }> = [
  { paket: 'Paket A', label: 'Kelas Online — Paket A', subtitle: 'Setara SD / MI' },
  { paket: 'Paket B', label: 'Kelas Online — Paket B', subtitle: 'Setara SMP / MTs' },
  { paket: 'Paket C', label: 'Kelas Online — Paket C', subtitle: 'Setara SMA / MA' },
];

const PAKET_ORDER: Record<PaketType, number> = {
  'Paket A': 0,
  'Paket B': 1,
  'Paket C': 2,
};

interface TaskFormModalProps {
  open: boolean;
  editingTask: TeacherTask | null;
  effectiveRole: UserRole;
  currentTeacher: Teacher | null;
  teacherNameFallback: string;
  teacherUidFallback: string;
  classes: Classroom[];
  onlineClasses: OnlineClassSession[];
  subjects: Subject[];
  assignments: TeachingAssignment[];
  onUploadFile: (
    file: File,
    folder: string,
    onProgress?: (pct: number) => void
  ) => Promise<TaskAttachment>;
  onSave: (
    payload: Omit<TeacherTask, 'id' | 'ownerUid' | 'accessUids' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
    announce: boolean
  ) => Promise<void>;
  onClose: () => void;
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  open,
  editingTask,
  effectiveRole,
  currentTeacher,
  teacherNameFallback,
  teacherUidFallback,
  classes,
  onlineClasses,
  subjects,
  assignments,
  onUploadFile,
  onSave,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Penugasan milik guru yang sedang login (untuk memprioritaskan mata pelajaran Kurikulum Merdeka yang diampu)
  const teacherAssignments = useMemo(() => {
    if (effectiveRole !== 'guru' || !currentTeacher) return assignments;
    return assignments.filter(
      (a) => a.teacherId === currentTeacher.id || a.teacherUid === currentTeacher.ownerUid
    );
  }, [effectiveRole, currentTeacher, assignments]);

  // Guru mengajar di seluruh Paket (A, B, C) dan semua kelas/rombel aktif
  const availableClasses = useMemo(() => {
    const activeClasses = classes.filter((c) => c.status === 'Aktif');
    return sortClassesByJenjang(activeClasses.length > 0 ? activeClasses : classes);
  }, [classes]);

  const availableOnlineClasses = useMemo(() => {
    return [...onlineClasses]
      .filter((oc) => oc.isPublished !== false)
      .sort((a, b) => {
        const diff = PAKET_ORDER[a.paket] - PAKET_ORDER[b.paket];
        if (diff !== 0) return diff;
        return a.title.localeCompare(b.title);
      });
  }, [onlineClasses]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [paketFilter, setPaketFilter] = useState<'Semua' | PaketType>('Semua');
  // Target format: 'class:<classId>' | 'online-paket:<PaketType>' | 'online-room:<onlineClassId>'
  const [targetValue, setTargetValue] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueAt, setDueAt] = useState(getDefaultDueAtInput(3));
  const [maxScore, setMaxScore] = useState(100);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [announce, setAnnounce] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const filteredOnlinePaketLevels = useMemo(() => {
    return PAKET_LEVELS.filter((lvl) => {
      if (paketFilter !== 'Semua' && lvl.paket !== paketFilter) return false;
      // Ensure at least one class exists to satisfy Firestore referential integrity
      return classes.length > 0;
    });
  }, [paketFilter, classes.length]);

  const filteredOnlineRooms = useMemo(() => {
    return availableOnlineClasses.filter(
      (oc) => paketFilter === 'Semua' || oc.paket === paketFilter
    );
  }, [availableOnlineClasses, paketFilter]);

  const filteredRegularClasses = useMemo(() => {
    return availableClasses.filter(
      (c) => paketFilter === 'Semua' || c.paket === paketFilter
    );
  }, [availableClasses, paketFilter]);

  // Parse current targetSelection into normalized metadata
  const parsedTarget = useMemo(() => {
    if (targetValue.startsWith('online-room:')) {
      const ocId = targetValue.slice('online-room:'.length);
      const room = availableOnlineClasses.find((oc) => oc.id === ocId) || null;
      if (room) {
        const backingClass =
          classes.find((c) => c.id === room.classId) ||
          classes.find((c) => c.paket === room.paket && c.status === 'Aktif') ||
          classes.find((c) => c.paket === room.paket) ||
          classes[0] ||
          null;
        return {
          mode: 'online-room' as const,
          paket: room.paket,
          backingClass,
          onlineRoom: room,
        };
      }
    }

    if (targetValue.startsWith('online-paket:')) {
      const pk = targetValue.slice('online-paket:'.length) as PaketType;
      const backingClass =
        classes.find((c) => c.paket === pk && c.status === 'Aktif') ||
        classes.find((c) => c.paket === pk) ||
        classes[0] ||
        null;
      return {
        mode: 'online-paket' as const,
        paket: pk,
        backingClass,
        onlineRoom: null,
      };
    }

    if (targetValue.startsWith('class:')) {
      const cid = targetValue.slice('class:'.length);
      const cls =
        availableClasses.find((c) => c.id === cid) ||
        classes.find((c) => c.id === cid) ||
        null;
      return {
        mode: 'regular' as const,
        paket: cls?.paket || null,
        backingClass: cls,
        onlineRoom: null,
      };
    }

    return {
      mode: 'regular' as const,
      paket: null,
      backingClass: null,
      onlineRoom: null,
    };
  }, [targetValue, availableOnlineClasses, availableClasses, classes]);

  const availableSubjectsForTarget = useMemo(() => {
    const activeSubjects = subjects.filter((s) => s.status === 'Aktif');

    if (effectiveRole === 'guru' && currentTeacher && parsedTarget.paket) {
      const teacherSubs = getTeacherSubjectsForClassOrPaket(
        currentTeacher,
        parsedTarget.paket,
        parsedTarget.mode === 'regular' ? parsedTarget.backingClass?.id : undefined,
        subjects,
        teacherAssignments
      );
      if (teacherSubs.length > 0) return teacherSubs;
    }

    if (parsedTarget.mode === 'regular' && parsedTarget.backingClass) {
      const paketSubjects = activeSubjects.filter(
        (s) => s.paket === parsedTarget.backingClass?.paket
      );
      if (paketSubjects.length > 0) return paketSubjects;
    }

    if (parsedTarget.paket) {
      const paketSubjects = activeSubjects.filter((s) => s.paket === parsedTarget.paket);
      if (parsedTarget.onlineRoom) {
        const roomSubj = subjects.find((s) => s.id === parsedTarget.onlineRoom?.subjectId);
        if (roomSubj && !paketSubjects.some((s) => s.id === roomSubj.id)) {
          return [roomSubj, ...paketSubjects];
        }
      }
      if (paketSubjects.length > 0) return paketSubjects;
    }

    return activeSubjects.length > 0 ? activeSubjects : subjects;
  }, [parsedTarget, effectiveRole, currentTeacher, teacherAssignments, subjects]);

  const initKeyRef = useRef('');

  useEffect(() => {
    if (!open) {
      initKeyRef.current = '';
      return;
    }
    const key = editingTask?.id || 'new';
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;

    setErrorMsg('');
    setUploadProgress(null);
    setPaketFilter('Semua');

    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      if (
        editingTask.onlineClassId &&
        availableOnlineClasses.some((oc) => oc.id === editingTask.onlineClassId)
      ) {
        setTargetValue(`online-room:${editingTask.onlineClassId}`);
      } else if (editingTask.deliveryMode === 'online' || Boolean(editingTask.onlineClassId)) {
        setTargetValue(`online-paket:${editingTask.paket}`);
      } else {
        setTargetValue(`class:${editingTask.classId}`);
      }
      setSubjectId(editingTask.subjectId);
      setDueAt(toDateTimeLocalInput(editingTask.dueAt));
      setMaxScore(editingTask.maxScore);
      setAttachments(editingTask.attachments || []);
      setAnnounce(false);
    } else {
      const defaultTarget = availableClasses[0]
        ? `class:${availableClasses[0].id}`
        : availableOnlineClasses[0]
          ? `online-room:${availableOnlineClasses[0].id}`
          : 'online-paket:Paket C';
      setTitle('');
      setDescription('');
      setTargetValue(defaultTarget);
      setSubjectId('');
      setDueAt(getDefaultDueAtInput(3));
      setMaxScore(100);
      setAttachments([]);
      setAnnounce(true);
    }
  }, [open, editingTask, availableClasses, availableOnlineClasses]);

  // Ensure targetValue gets filled if classes load after modal opens
  useEffect(() => {
    if (!open || editingTask || targetValue) return;
    if (availableClasses.length > 0) {
      setTargetValue(`class:${availableClasses[0].id}`);
    } else if (availableOnlineClasses.length > 0) {
      setTargetValue(`online-room:${availableOnlineClasses[0].id}`);
    }
  }, [open, editingTask, targetValue, availableClasses, availableOnlineClasses]);

  // When switching Paket filter, keep targetValue within the selected Paket
  const handlePaketFilterChange = (nextPaket: 'Semua' | PaketType) => {
    setPaketFilter(nextPaket);
    if (nextPaket === 'Semua') return;

    if (parsedTarget.paket && parsedTarget.paket === nextPaket) return;

    // Prefer keeping same delivery category (online vs regular) when switching jenjang
    if (parsedTarget.mode === 'online-room') {
      const matchingRoom = availableOnlineClasses.find((oc) => oc.paket === nextPaket);
      setTargetValue(matchingRoom ? `online-room:${matchingRoom.id}` : `online-paket:${nextPaket}`);
    } else if (parsedTarget.mode === 'online-paket') {
      setTargetValue(`online-paket:${nextPaket}`);
    } else {
      const matchingClass = availableClasses.find((c) => c.paket === nextPaket);
      setTargetValue(matchingClass ? `class:${matchingClass.id}` : `online-paket:${nextPaket}`);
    }
  };

  // Auto-select matching subject when picking a specific Ruang Kelas Online
  const handleTargetChange = (nextTarget: string) => {
    setTargetValue(nextTarget);
    if (nextTarget.startsWith('online-room:')) {
      const roomId = nextTarget.slice('online-room:'.length);
      const room = availableOnlineClasses.find((oc) => oc.id === roomId);
      if (room?.subjectId && subjects.some((s) => s.id === room.subjectId)) {
        setSubjectId(room.subjectId);
      }
    }
  };

  // Keep subjectId valid when target changes
  useEffect(() => {
    if (!open) return;
    if (availableSubjectsForTarget.length === 0) return;
    if (!availableSubjectsForTarget.some((s) => s.id === subjectId)) {
      if (
        parsedTarget.onlineRoom?.subjectId &&
        availableSubjectsForTarget.some((s) => s.id === parsedTarget.onlineRoom?.subjectId)
      ) {
        setSubjectId(parsedTarget.onlineRoom.subjectId);
      } else {
        setSubjectId(availableSubjectsForTarget[0].id);
      }
    }
  }, [open, availableSubjectsForTarget, subjectId, parsedTarget.onlineRoom]);

  if (!open) return null;

  const isOnlineSelection =
    parsedTarget.mode === 'online-paket' || parsedTarget.mode === 'online-room';

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg('');
    const fileArray = Array.from(files).slice(0, 4);
    for (const f of fileArray) {
      if (f.size > 5 * 1024 * 1024) {
        setErrorMsg(`Ukuran file "${f.name}" melebihi batas 5 MB.`);
        continue;
      }
      try {
        setUploadProgress(5);
        const uploaded = await onUploadFile(f, 'lampiran_guru', (pct) => setUploadProgress(pct));
        setAttachments((prev) => [...prev, uploaded]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah file lampiran.');
      } finally {
        setUploadProgress(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (title.trim().length < 3) {
      setErrorMsg('Judul tugas minimal 3 karakter.');
      return;
    }
    if (description.trim().length < 5) {
      setErrorMsg('Deskripsi instruksi tugas minimal 5 karakter.');
      return;
    }

    const chosenClass = parsedTarget.backingClass;
    const chosenSubject = availableSubjectsForTarget.find((s) => s.id === subjectId);
    const chosenPaket = parsedTarget.paket || chosenClass?.paket;

    if (!chosenClass || !chosenSubject || !chosenPaket) {
      setErrorMsg('Pilih kelas tujuan (Reguler atau Kelas Online) dan mata pelajaran terlebih dahulu.');
      return;
    }

    // Resolve teacher responsible for this assignment so strict student/teacher matching holds
    const matchedAsg = assignments.find(
      (a) => a.classId === chosenClass.id && a.subjectId === chosenSubject.id
    );
    const resolvedTeacherId =
      editingTask?.teacherId ||
      (effectiveRole === 'guru' && currentTeacher
        ? currentTeacher.id
        : parsedTarget.onlineRoom?.teacherId ||
          matchedAsg?.teacherId ||
          currentTeacher?.id ||
          'guru_01');
    const resolvedTeacherName =
      editingTask?.teacherName ||
      (effectiveRole === 'guru' && currentTeacher
        ? currentTeacher.fullName
        : parsedTarget.onlineRoom?.teacherName ||
          matchedAsg?.teacherName ||
          teacherNameFallback);
    const resolvedTeacherUid =
      editingTask?.teacherUid ||
      (effectiveRole === 'guru' && currentTeacher
        ? currentTeacher.ownerUid || teacherUidFallback
        : parsedTarget.onlineRoom?.teacherUid ||
          matchedAsg?.teacherUid ||
          teacherUidFallback);

    const resolvedClassName = isOnlineSelection
      ? `Kelas Online ${chosenPaket}`
      : chosenClass.name;
    const resolvedOnlineClassId =
      parsedTarget.mode === 'online-room' && parsedTarget.onlineRoom
        ? parsedTarget.onlineRoom.id
        : '';
    const resolvedOnlineClassTitle =
      parsedTarget.mode === 'online-room' && parsedTarget.onlineRoom
        ? parsedTarget.onlineRoom.title
        : parsedTarget.mode === 'online-paket'
          ? `Kelas Online ${chosenPaket} (Semua Rombel)`
          : '';

    setSubmitting(true);
    try {
      await onSave(
        {
          id: editingTask?.id,
          title: title.trim(),
          description: description.trim(),
          paket: chosenPaket,
          classId: chosenClass.id,
          className: resolvedClassName,
          deliveryMode: isOnlineSelection ? 'online' : 'regular',
          onlineClassId: resolvedOnlineClassId,
          onlineClassTitle: resolvedOnlineClassTitle,
          subjectId: chosenSubject.id,
          subjectName: chosenSubject.name,
          teacherId: resolvedTeacherId,
          teacherName: resolvedTeacherName,
          teacherUid: resolvedTeacherUid,
          dueAt,
          maxScore: Math.max(1, Math.min(1000, Number(maxScore) || 100)),
          attachments,
          targetStudentUids: editingTask?.targetStudentUids || [],
        },
        !editingTask && announce
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan tugas.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-form-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div onClick={onClose} className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3
              id="task-form-title"
              className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white"
            >
              {editingTask ? 'Edit Tugas Pembelajaran' : 'Buat Tugas Baru'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pilih kelas reguler (rombel) atau Kelas Online sesuai jenjang Paket A, B, dan C.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form tugas"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Judul Tugas <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Analisis Teks Laporan Hasil Observasi"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Filter Jenjang Paket untuk memudahkan pemilihan Kelas Online / Rombel */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Filter Jenjang Program
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['Semua', 'Paket A', 'Paket B', 'Paket C'] as const).map((pk) => {
                const active = paketFilter === pk;
                return (
                  <button
                    key={pk}
                    type="button"
                    onClick={() => handlePaketFilterChange(pk)}
                    className={`min-h-[40px] px-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap ${
                      active
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500'
                    }`}
                  >
                    {pk === 'Semua' ? 'Semua' : pk}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Kelas Tujuan (Reguler / Kelas Online) <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetValue}
                onChange={(e) => handleTargetChange(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                {filteredOnlinePaketLevels.length > 0 && (
                  <optgroup label="Kelas Online per Jenjang (Paket A / B / C)">
                    {filteredOnlinePaketLevels.map((lvl) => (
                      <option key={`online-paket:${lvl.paket}`} value={`online-paket:${lvl.paket}`}>
                        {lvl.label} ({lvl.subtitle})
                      </option>
                    ))}
                  </optgroup>
                )}

                {filteredOnlineRooms.length > 0 && (
                  <optgroup label="Ruang Kelas Online Aktif">
                    {filteredOnlineRooms.map((oc) => (
                      <option key={`online-room:${oc.id}`} value={`online-room:${oc.id}`}>
                        [Kelas Online · {oc.paket}] {oc.title} ({oc.subjectName})
                      </option>
                    ))}
                  </optgroup>
                )}

                {filteredRegularClasses.length > 0 && (
                  <optgroup label="Kelas Reguler / Rombel">
                    {filteredRegularClasses.map((c) => (
                      <option key={`class:${c.id}`} value={`class:${c.id}`}>
                        {c.name} ({c.paket})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Mata Pelajaran <span className="text-rose-500">*</span>
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                {availableSubjectsForTarget.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isOnlineSelection && parsedTarget.paket && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 px-4 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <MonitorPlay className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-teal-900 dark:text-teal-200">
                  Mode Pengiriman: Kelas Online · {parsedTarget.paket}
                  {parsedTarget.onlineRoom ? ` — ${parsedTarget.onlineRoom.title}` : ''}
                </p>
                <p className="text-teal-800/90 dark:text-teal-300/90 mt-0.5">
                  Tugas akan dikirim ke seluruh warga belajar aktif jenjang{' '}
                  <strong>{parsedTarget.paket}</strong> dan muncul di menu <strong>Tugas</strong>{' '}
                  serta tab <strong>Tugas Kelas</strong> di Ruang Kelas Online.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Batas Waktu Pengumpulan <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Nilai Maksimal
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                required
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Deskripsi & Petunjuk Pengerjaan <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tuliskan langkah pengerjaan, format jawaban yang diharapkan, dan kriteria penilaian..."
              className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Lampiran Materi / LKPD */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Lampiran Materi / Soal (Opsional — Gambar maks. 5 MB, Dokumen PDF/DOCX maks. 500 KB)
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragActive
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-[#FAFAF7] dark:bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <UploadCloud className="w-6 h-6 mx-auto text-emerald-600 dark:text-emerald-400" />
              <p className="mt-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Seret file lampiran ke sini atau klik untuk memilih berkas
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Lembar kerja, panduan modul, gambar soal, atau contoh format tugas
              </p>
            </div>

            {uploadProgress !== null && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                  <span>Mengunggah lampiran...</span>
                  <span className="tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {att.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatFileSize(att.sizeBytes)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                      aria-label={`Hapus lampiran ${att.name}`}
                      className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!editingTask && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-950/10 dark:border-white/10 bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer">
              <input
                type="checkbox"
                checked={announce}
                onChange={(e) => setAnnounce(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-emerald-700"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  Kirim pengumuman & notifikasi lonceng tugas baru
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Warga belajar akan menerima pemberitahuan di ikon lonceng & papan pengumuman sekolah.
                </p>
              </div>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || uploadProgress !== null}
              className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-60 inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Paperclip className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : editingTask ? 'Simpan Perubahan' : 'Terbitkan Tugas'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
