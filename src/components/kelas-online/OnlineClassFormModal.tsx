import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Save, Trash2, Video, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  OnlineClassMaterial,
  OnlineClassModality,
  OnlineClassSession,
  OnlineClassStatus,
  OnlineMaterialType,
  OnlineMeetingPlatform,
  PaketType,
} from '../../types/siakad';
import { MotionModal } from '../ui/MotionPrimitives';
import { getTeacherSubjectsForClassOrPaket } from '../../data/kurikulumMerdeka';
import { sortClassesByJenjang } from '../../utils/excelUtils';

interface OnlineClassFormModalProps {
  open: boolean;
  onClose: () => void;
  editingSession?: OnlineClassSession | null;
  defaultPaket?: PaketType;
  onSaved?: (session: OnlineClassSession) => void;
}

const DEFAULT_FASE_BY_PAKET: Record<PaketType, string> = {
  'Paket A': 'Fase C (Kelas 5–6)',
  'Paket B': 'Fase D (Kelas 7–9)',
  'Paket C': 'Fase F (Kelas 11–12)',
};

const MODALITIES: OnlineClassModality[] = ['Live Interaktif', 'Tutorial Daring', 'Belajar Mandiri'];
const PLATFORMS: OnlineMeetingPlatform[] = [
  'Google Meet',
  'Zoom Meeting',
  'YouTube Live',
  'Ruang Belajar Mandiri',
];
const STATUSES: OnlineClassStatus[] = ['Terjadwal', 'Live', 'Selesai'];
const MATERIAL_TYPES: OnlineMaterialType[] = [
  'Ringkasan Materi',
  'Video Pembelajaran',
  'Slide / PDF',
  'LKPD / Latihan',
];

function createEmptyMaterial(index: number): OnlineClassMaterial {
  return {
    id: `mat_${Date.now().toString(36)}_${index}`,
    title: '',
    type: 'Ringkasan Materi',
    durationMinutes: 20,
    summary: '',
    contentText: '',
    resourceUrl: '',
  };
}

export const OnlineClassFormModal: React.FC<OnlineClassFormModalProps> = ({
  open,
  onClose,
  editingSession,
  defaultPaket = 'Paket C',
  onSaved,
}) => {
  const { profile, effectiveRole } = useAuth();
  const { classes, subjects, teachers, assignments, saveOnlineClass } = useData();
  const { showToast } = useToast();

  const [paket, setPaket] = useState<PaketType>(defaultPaket);
  const [fase, setFase] = useState<string>(DEFAULT_FASE_BY_PAKET[defaultPaket]);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [modality, setModality] = useState<OnlineClassModality>('Live Interaktif');
  const [platform, setPlatform] = useState<OnlineMeetingPlatform>('Google Meet');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingCode, setMeetingCode] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:30');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [status, setStatus] = useState<OnlineClassStatus>('Terjadwal');
  const [description, setDescription] = useState('');
  const [objectivesText, setObjectivesText] = useState('');
  const [materials, setMaterials] = useState<OnlineClassMaterial[]>([createEmptyMaterial(1)]);
  const [isPublished, setIsPublished] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const currentTeacher = useMemo(() => {
    if (effectiveRole !== 'guru') return null;
    return (
      teachers.find((t) => t.id === profile?.linkedEntityId || t.ownerUid === profile?.uid) ||
      teachers[0] ||
      null
    );
  }, [effectiveRole, teachers, profile]);

  const teacherAssignments = useMemo(() => {
    if (effectiveRole !== 'guru' || !currentTeacher) return assignments;
    return assignments.filter(
      (a) => a.teacherId === currentTeacher.id || a.teacherUid === currentTeacher.ownerUid
    );
  }, [effectiveRole, currentTeacher, assignments]);

  const filteredClasses = useMemo(
    () => sortClassesByJenjang(classes.filter((c) => c.paket === paket && c.status === 'Aktif')),
    [classes, paket]
  );

  const filteredSubjects = useMemo(() => {
    if (effectiveRole === 'guru' && currentTeacher) {
      const teacherSubs = getTeacherSubjectsForClassOrPaket(
        currentTeacher,
        paket,
        classId || undefined,
        subjects,
        teacherAssignments
      );
      if (teacherSubs.length > 0) return teacherSubs;
    }
    return subjects.filter((s) => s.paket === paket && s.status === 'Aktif');
  }, [effectiveRole, currentTeacher, paket, classId, subjects, teacherAssignments]);

  useEffect(() => {
    if (!open) return;

    if (editingSession) {
      setPaket(editingSession.paket);
      setFase(editingSession.fase || DEFAULT_FASE_BY_PAKET[editingSession.paket]);
      setTitle(editingSession.title);
      setClassId(editingSession.classId);
      setSubjectId(editingSession.subjectId);
      setTeacherId(editingSession.teacherId);
      setModality(editingSession.modality);
      setPlatform(editingSession.platform);
      setMeetingUrl(editingSession.meetingUrl || '');
      setMeetingCode(editingSession.meetingCode || '');
      setRecordingUrl(editingSession.recordingUrl || '');
      setScheduleDate(editingSession.scheduleDate || new Date().toISOString().slice(0, 10));
      setStartTime(editingSession.startTime || '19:00');
      setEndTime(editingSession.endTime || '20:30');
      setDurationMinutes(editingSession.durationMinutes || 75);
      setStatus(editingSession.status);
      setDescription(editingSession.description || '');
      setObjectivesText((editingSession.learningObjectives || []).join('\n'));
      setMaterials(
        editingSession.materials.length > 0
          ? editingSession.materials.map((m) => ({ ...m }))
          : [createEmptyMaterial(1)]
      );
      setIsPublished(editingSession.isPublished !== false);
    } else {
      const initPaket = defaultPaket;
      const initClasses = sortClassesByJenjang(
        classes.filter((c) => c.paket === initPaket && c.status === 'Aktif')
      );
      const linkedTeacher =
        teachers.find((t) => t.id === profile?.linkedEntityId || t.ownerUid === profile?.uid) ||
        teachers[0];
      const initSubjects =
        effectiveRole === 'guru' && linkedTeacher
          ? getTeacherSubjectsForClassOrPaket(
              linkedTeacher,
              initPaket,
              initClasses[0]?.id,
              subjects,
              teacherAssignments
            )
          : subjects.filter((s) => s.paket === initPaket && s.status === 'Aktif');

      setPaket(initPaket);
      setFase(DEFAULT_FASE_BY_PAKET[initPaket]);
      setTitle('');
      setClassId(initClasses[0]?.id || classes[0]?.id || '');
      setSubjectId(initSubjects[0]?.id || subjects[0]?.id || '');
      setTeacherId(linkedTeacher?.id || '');
      setModality('Live Interaktif');
      setPlatform('Google Meet');
      setMeetingUrl('');
      setMeetingCode('');
      setRecordingUrl('');
      setScheduleDate(new Date().toISOString().slice(0, 10));
      setStartTime('19:00');
      setEndTime('20:30');
      setDurationMinutes(90);
      setStatus('Terjadwal');
      setDescription('');
      setObjectivesText('');
      setMaterials([createEmptyMaterial(1)]);
      setIsPublished(true);
    }
  }, [open, editingSession, defaultPaket, classes, subjects, teachers, profile, effectiveRole, teacherAssignments]);

  const handlePaketChange = (nextPaket: PaketType) => {
    setPaket(nextPaket);
    setFase(DEFAULT_FASE_BY_PAKET[nextPaket]);
    const nextClasses = sortClassesByJenjang(
      classes.filter((c) => c.paket === nextPaket && c.status === 'Aktif')
    );
    const nextSubjects =
      effectiveRole === 'guru' && currentTeacher
        ? getTeacherSubjectsForClassOrPaket(
            currentTeacher,
            nextPaket,
            nextClasses[0]?.id,
            subjects,
            teacherAssignments
          )
        : subjects.filter((s) => s.paket === nextPaket && s.status === 'Aktif');
    if (nextClasses.length > 0 && !nextClasses.some((c) => c.id === classId)) {
      setClassId(nextClasses[0].id);
    }
    if (nextSubjects.length > 0 && !nextSubjects.some((s) => s.id === subjectId)) {
      setSubjectId(nextSubjects[0].id);
    }
  };

  const updateMaterial = (idx: number, patch: Partial<OnlineClassMaterial>) => {
    setMaterials((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const addMaterial = () => {
    if (materials.length >= 10) {
      showToast('Maksimal 10 modul materi dalam satu ruang kelas online.', 'error');
      return;
    }
    setMaterials((prev) => [...prev, createEmptyMaterial(prev.length + 1)]);
  };

  const removeMaterial = (idx: number) => {
    if (materials.length <= 1) return;
    setMaterials((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 3) {
      showToast('Judul sesi kelas online minimal 3 karakter.', 'error');
      return;
    }

    const selectedClass =
      classes.find((c) => c.id === classId) || filteredClasses[0] || classes[0];
    const selectedSubject =
      subjects.find((s) => s.id === subjectId) || filteredSubjects[0] || subjects[0];
    const selectedTeacher = teachers.find((t) => t.id === teacherId);

    if (!selectedClass || !selectedSubject) {
      showToast('Pastikan Kelas/Rombel dan Mata Pelajaran tersedia terlebih dahulu.', 'error');
      return;
    }

    const validMaterials = materials
      .filter((m) => m.title.trim().length > 0)
      .map((m, idx) => ({
        ...m,
        id: m.id || `mat_${Date.now().toString(36)}_${idx}`,
        title: m.title.trim(),
        summary: m.summary.trim() || 'Materi pembelajaran terstruktur.',
        contentText:
          m.contentText.trim() ||
          m.summary.trim() ||
          'Silakan pelajari bahan ajar ini dan catat poin penting di kolom Catatan Belajar.',
        resourceUrl: (m.resourceUrl || '').trim(),
      }));

    if (validMaterials.length === 0) {
      showToast('Tambahkan minimal 1 modul materi belajar beserta judulnya.', 'error');
      return;
    }

    const parsedObjectives = objectivesText
      .split('\n')
      .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 10);

    setSubmitting(true);
    try {
      const saved = await saveOnlineClass({
        id: editingSession?.id,
        title: title.trim(),
        paket,
        fase: fase.trim() || DEFAULT_FASE_BY_PAKET[paket],
        classId: selectedClass.id,
        className: selectedClass.name,
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        teacherId: selectedTeacher?.id || profile?.linkedEntityId || 'guru_01',
        teacherName: selectedTeacher?.fullName || profile?.name || 'Tutor PKBM',
        teacherUid: selectedTeacher?.ownerUid || profile?.uid || 'demo_guru_01',
        modality,
        platform,
        meetingUrl: meetingUrl.trim(),
        meetingCode: meetingCode.trim(),
        recordingUrl: recordingUrl.trim(),
        scheduleDate,
        startTime,
        endTime,
        durationMinutes: Number(durationMinutes) || 75,
        status,
        description:
          description.trim() ||
          `Sesi kelas online ${paket} mata pelajaran ${selectedSubject.name} untuk rombel ${selectedClass.name}.`,
        learningObjectives:
          parsedObjectives.length > 0
            ? parsedObjectives
            : [`Memahami konsep inti materi ${title.trim()} sesuai capaian belajar ${paket}.`],
        materials: validMaterials,
        isPublished,
      });

      showToast(
        editingSession
          ? 'Ruang kelas online berhasil diperbarui.'
          : `Kelas online ${paket} berhasil dipublikasikan.`,
        'success'
      );
      onSaved?.(saved);
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Gagal menyimpan kelas online. Periksa kembali isian formulir.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      ariaLabelledBy="online-class-modal-title"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-emerald-950/10 dark:border-white/10 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
              Manajemen Ruang Belajar Daring
            </p>
            <h2
              id="online-class-modal-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              {editingSession ? 'Edit Kelas Online' : 'Buat Kelas Online Baru'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Program Paket Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Program Kesetaraan
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['Paket A', 'Paket B', 'Paket C'] as PaketType[]).map((p) => {
              const active = paket === p;
              const sub = p === 'Paket A' ? 'Setara SD/MI' : p === 'Paket B' ? 'Setara SMP/MTs' : 'Setara SMA/MA';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePaketChange(p)}
                  className={`min-h-[48px] px-3 py-2.5 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="text-sm font-bold">{p}</div>
                  <div className={`text-[11px] ${active ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Core Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Judul Pertemuan / Topik Kelas Online *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Persamaan Dasar Akuntansi UMKM & Praktik Jurnal Umum"
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Kelas / Rombel ({paket}) *
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {(filteredClasses.length > 0 ? filteredClasses : classes).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Mata Pelajaran ({paket}) *
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {(filteredSubjects.length > 0 ? filteredSubjects : subjects).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tutor Pengampu
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Fase Kurikulum Merdeka
            </label>
            <input
              type="text"
              value={fase}
              onChange={(e) => setFase(e.target.value)}
              placeholder="Fase F (Kelas 11–12)"
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        {/* Meeting & Schedule Section */}
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-950/50 p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <Video className="w-4 h-4" />
            Jadwal & Tautan Ruang Daring
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Moda Belajar
              </label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as OnlineClassModality)}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Platform Tatap Muka
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as OnlineMeetingPlatform)}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                {PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Status Sesi
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OnlineClassStatus)}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st === 'Live' ? 'Sedang Live' : st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Tanggal
              </label>
              <input
                type="date"
                required
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Jam Mulai
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Jam Selesai
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Durasi (Menit)
              </label>
              <input
                type="number"
                min={15}
                max={360}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Tautan Ruang Live (Meet / Zoom / YouTube)
              </label>
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Kode Ruang / Meeting ID
              </label>
              <input
                type="text"
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                placeholder="ann-urka-pktc1"
                className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Tautan Rekaman Kelas (Opsional — untuk siswa yang belajar ulang)
            </label>
            <input
              type="url"
              value={recordingUrl}
              onChange={(e) => setRecordingUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... atau tautan Google Drive"
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Description & Objectives */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Deskripsi Singkat Sesi
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Jelaskan fokus bahasan pertemuan ini dan persiapan yang perlu dibawa warga belajar..."
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tujuan Pembelajaran (1 baris = 1 poin)
            </label>
            <textarea
              rows={3}
              value={objectivesText}
              onChange={(e) => setObjectivesText(e.target.value)}
              placeholder={'Memahami konsep dasar materi\nMampu menyelesaikan studi kasus latihan'}
              className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        {/* Dynamic Learning Modules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <BookOpen className="w-4 h-4" />
              Daftar Modul & Bahan Belajar ({materials.length})
            </div>
            <button
              type="button"
              onClick={addMaterial}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Modul
            </button>
          </div>

          <div className="space-y-3">
            {materials.map((mat, idx) => (
              <div
                key={mat.id}
                className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-950/40 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Modul #{idx + 1}
                  </span>
                  {materials.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMaterial(idx)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6">
                    <input
                      type="text"
                      required
                      value={mat.title}
                      onChange={(e) => updateMaterial(idx, { title: e.target.value })}
                      placeholder="Judul modul (contoh: Modul 1 - Ringkasan Konsep)"
                      className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <select
                      value={mat.type}
                      onChange={(e) =>
                        updateMaterial(idx, { type: e.target.value as OnlineMaterialType })
                      }
                      className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    >
                      {MATERIAL_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={mat.durationMinutes}
                      onChange={(e) =>
                        updateMaterial(idx, { durationMinutes: Number(e.target.value) || 15 })
                      }
                      placeholder="Menit"
                      className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  value={mat.summary}
                  onChange={(e) => updateMaterial(idx, { summary: e.target.value })}
                  placeholder="Ringkasan 1 kalimat agar siswa langsung paham isi modul ini..."
                  className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />

                <textarea
                  rows={3}
                  value={mat.contentText}
                  onChange={(e) => updateMaterial(idx, { contentText: e.target.value })}
                  placeholder="Isi bahan bacaan lengkap, poin rumus, atau instruksi latihan yang dapat dibaca siswa langsung di dalam aplikasi..."
                  className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />

                <input
                  type="url"
                  value={mat.resourceUrl || ''}
                  onChange={(e) => updateMaterial(idx, { resourceUrl: e.target.value })}
                  placeholder="Tautan eksternal opsional (YouTube / PDF Google Drive / Slide)"
                  className="w-full rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Publish Switch + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-emerald-950/10 dark:border-white/10">
          <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Langsung tampilkan ke Warga Belajar {paket}</span>
          </label>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-emerald-950/15 dark:border-white/15 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              {submitting ? 'Menyimpan...' : editingSession ? 'Simpan Perubahan' : 'Publikasikan Kelas'}
            </button>
          </div>
        </div>
      </form>
    </MotionModal>
  );
};
