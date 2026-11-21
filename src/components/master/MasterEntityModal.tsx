import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';
import {
  Classroom,
  PaketType,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from '../../types/siakad';
import { useData } from '../../context/DataContext';
import { ERROR_SHAKE_VARIANTS } from '../../config/animations';
import { AnimatedSaveCheck, MotionModal } from '../ui/MotionPrimitives';
import {
  SCHEDULE_SLOTS,
  detectSubjectGroupFromSubject,
  findSubjectForGroupInPaket,
  getSubjectGroupDefinition,
} from '../../data/kurikulumMerdeka';
import { sortClassesByJenjang } from '../../utils/excelUtils';

export type MasterTabType = 'students' | 'teachers' | 'subjects' | 'classes' | 'assignments';

interface MasterEntityModalProps {
  open: boolean;
  entityType: MasterTabType;
  editingItem: unknown | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface SelectableTeacherOption {
  id: string;
  fullName: string;
  nip: string;
  specialization: string;
  ownerUid: string;
  status: Teacher['status'];
  fromAccountOnly?: boolean;
  accountUid?: string;
}

const PKBM_CLASS_PRESETS: Array<{
  id: string;
  paket: PaketType;
  name: string;
  gradeLevel: string;
  label: string;
}> = [
  { id: 'a6', paket: 'Paket A', name: 'Paket A - Kelas 6 CIPANAS', gradeLevel: 'Setara Kelas VI SD', label: 'Paket A — Kelas 6 CIPANAS' },
  { id: 'b7', paket: 'Paket B', name: 'Paket B - Kelas 7 CIPANAS', gradeLevel: 'Setara Kelas VII SMP', label: 'Paket B — Kelas 7 CIPANAS' },
  { id: 'b8', paket: 'Paket B', name: 'Paket B - Kelas 8 CIPANAS', gradeLevel: 'Setara Kelas VIII SMP', label: 'Paket B — Kelas 8 CIPANAS' },
  { id: 'b9', paket: 'Paket B', name: 'Paket B - Kelas 9 CIPANAS', gradeLevel: 'Setara Kelas IX SMP', label: 'Paket B — Kelas 9 CIPANAS' },
  { id: 'c10', paket: 'Paket C', name: 'Paket C - Kelas 10 CIPANAS', gradeLevel: 'Setara Kelas X SMA', label: 'Paket C — Kelas 10 CIPANAS' },
  { id: 'c10_2', paket: 'Paket C', name: 'Paket C - Kelas 10 CIPANAS 2', gradeLevel: 'Setara Kelas X SMA', label: 'Paket C — Kelas 10 CIPANAS 2' },
  { id: 'c11', paket: 'Paket C', name: 'Paket C - Kelas 11 CIPANAS', gradeLevel: 'Setara Kelas XI SMA', label: 'Paket C — Kelas 11 CIPANAS' },
  { id: 'c12', paket: 'Paket C', name: 'Paket C - Kelas 12 CIPANAS', gradeLevel: 'Setara Kelas XII SMA', label: 'Paket C — Kelas 12 CIPANAS' },
  { id: 'c12_2', paket: 'Paket C', name: 'Paket C - Kelas 12 CIPANAS 2', gradeLevel: 'Setara Kelas XII SMA', label: 'Paket C — Kelas 12 CIPANAS 2' },
];

export const MasterEntityModal: React.FC<MasterEntityModalProps> = ({
  open,
  entityType,
  editingItem,
  onClose,
  onSaved,
}) => {
  const {
    classes,
    teachers,
    subjects,
    assignments,
    accounts,
    schoolSettings,
    selectedProgram,
    setSelectedProgram,
    saveStudent,
    saveTeacher,
    saveSubject,
    saveClassroom,
    saveAssignment,
  } = useData();

  const [saving, setSaving] = useState(false);
  const [savedCheck, setSavedCheck] = useState(false);
  const [formError, setFormError] = useState('');

  // Student form state
  const [nis, setNis] = useState('');
  const [nisn, setNisn] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [paket, setPaket] = useState<PaketType>('Paket C');
  const [classId, setClassId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [status, setStatus] = useState<string>('Aktif');

  // Teacher extra state
  const [nip, setNip] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [education, setEducation] = useState('');

  // Subject state
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subCategory, setSubCategory] = useState<Subject['category']>('Wajib');
  const [hoursPerWeek, setHoursPerWeek] = useState(3);
  const [kkm, setKkm] = useState(75);

  // Classroom state
  const [clsPreset, setClsPreset] = useState('');
  const [clsName, setClsName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [homeroomId, setHomeroomId] = useState('');
  const [capacity, setCapacity] = useState(30);
  const [studentCount, setStudentCount] = useState(0);

  // Assignment state
  const [asgTeacherId, setAsgTeacherId] = useState('');
  const [asgSubjectId, setAsgSubjectId] = useState('');
  const [asgClassId, setAsgClassId] = useState('');
  const [assignAllClasses, setAssignAllClasses] = useState(true);
  const [scheduleDay, setScheduleDay] = useState('Sabtu');
  const [scheduleTime, setScheduleTime] = useState('08:00 - 09:30');

  // Gabungkan semua guru dari Data Master Guru + akun login guru yang belum tertaut agar semua guru bisa dipilih sebagai Wali Kelas
  const selectableTeachers = useMemo<SelectableTeacherOption[]>(() => {
    const list: SelectableTeacherOption[] = teachers.map((t) => ({
      id: t.id,
      fullName: t.fullName,
      nip: t.nip,
      specialization: t.specialization,
      ownerUid: t.ownerUid,
      status: t.status,
    }));

    accounts
      .filter((acc) => acc.role === 'guru' && acc.status === 'Aktif')
      .forEach((acc) => {
        const alreadyInTeachers = list.some(
          (t) =>
            (acc.linkedEntityId && t.id === acc.linkedEntityId) ||
            t.ownerUid === acc.uid ||
            t.fullName.trim().toLowerCase() === acc.name.trim().toLowerCase()
        );
        if (!alreadyInTeachers) {
          list.push({
            id: `acc_guru_${acc.uid}`,
            fullName: acc.name,
            nip: acc.nip || `GURU-${acc.username.slice(0, 12).toUpperCase()}`,
            specialization: acc.classLabel || 'Tutor Kesetaraan PKBM',
            ownerUid: acc.uid,
            status: 'Aktif',
            fromAccountOnly: true,
            accountUid: acc.uid,
          });
        }
      });

    return list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
  }, [teachers, accounts]);

  // Cegah reset form di tengah pengetikan saat Firestore mengirim update snapshot
  const initSessionKeyRef = useRef<string>('');

  useEffect(() => {
    if (!open) {
      initSessionKeyRef.current = '';
      setFormError('');
      return;
    }

    const editingId =
      editingItem && typeof editingItem === 'object' && 'id' in editingItem
        ? String((editingItem as { id?: string }).id || 'edit')
        : 'new';
    const sessionKey = `${entityType}:${editingId}`;
    if (initSessionKeyRef.current === sessionKey) {
      return;
    }
    initSessionKeyRef.current = sessionKey;
    setFormError('');

    const defaultProgram: PaketType =
      selectedProgram !== 'Semua' ? selectedProgram : 'Paket C';

    if (entityType === 'students') {
      const s = editingItem as Student | null;
      const defaultClass =
        (selectedProgram !== 'Semua'
          ? classes.find((c) => c.paket === selectedProgram)
          : classes.find((c) => c.paket === 'Paket C')) || classes[0];
      setNis(s?.nis || '');
      setNisn(s?.nisn || '');
      setFullName(s?.fullName || '');
      setGender(s?.gender || 'L');
      setPaket(s?.paket || defaultClass?.paket || defaultProgram);
      setClassId(s?.classId || defaultClass?.id || '');
      setEmail(s?.email || '');
      setPhone(s?.phone || '');
      setAddress(s?.address || '');
      setGuardianName(s?.guardianName || '');
      setStatus(s?.status || 'Aktif');
    } else if (entityType === 'teachers') {
      const t = editingItem as Teacher | null;
      setNip(t?.nip || '');
      setFullName(t?.fullName || '');
      setGender(t?.gender || 'L');
      setEmail(t?.email || '');
      setPhone(t?.phone || '');
      setSpecialization(t?.specialization || '');
      setEducation(t?.education || '');
      setStatus(t?.status || 'Aktif');
    } else if (entityType === 'subjects') {
      const m = editingItem as Subject | null;
      setSubCode(m?.code || '');
      setSubName(m?.name || '');
      setPaket(m?.paket || defaultProgram);
      setSubCategory(m?.category || 'Wajib');
      setHoursPerWeek(m?.hoursPerWeek || 3);
      setKkm(m?.kkm || 75);
      setStatus(m?.status || 'Aktif');
    } else if (entityType === 'classes') {
      const c = editingItem as Classroom | null;
      const fallbackPresetId =
        defaultProgram === 'Paket A' ? 'a6' : defaultProgram === 'Paket B' ? 'b7' : 'c10';
      const fallbackPreset = PKBM_CLASS_PRESETS.find((p) => p.id === fallbackPresetId);
      const matchedPreset = c
        ? PKBM_CLASS_PRESETS.find((p) => p.gradeLevel.toLowerCase() === c.gradeLevel.toLowerCase())?.id || ''
        : fallbackPresetId;
      setClsPreset(matchedPreset);
      setClsName(c?.name || '');
      setPaket(c?.paket || fallbackPreset?.paket || defaultProgram);
      setGradeLevel(c?.gradeLevel || fallbackPreset?.gradeLevel || 'Setara Kelas X SMA');
      const matchedTeacherId =
        c?.homeroomTeacherId && selectableTeachers.some((t) => t.id === c.homeroomTeacherId)
          ? c.homeroomTeacherId
          : c?.homeroomTeacherName
            ? selectableTeachers.find(
                (t) => t.fullName.toLowerCase() === c.homeroomTeacherName.toLowerCase()
              )?.id || ''
            : selectableTeachers[0]?.id || '';
      setHomeroomId(matchedTeacherId);
      setCapacity(c?.capacity || 30);
      setStudentCount(c?.studentCount || 0);
      setStatus(c?.status || 'Aktif');
    } else if (entityType === 'assignments') {
      const a = editingItem as TeachingAssignment | null;
      const defaultSubject =
        (selectedProgram !== 'Semua'
          ? subjects.find((sub) => sub.paket === selectedProgram)
          : undefined) || subjects[0];
      const defaultClass =
        (selectedProgram !== 'Semua'
          ? classes.find((cls) => cls.paket === selectedProgram)
          : undefined) || classes[0];
      setAsgTeacherId(a?.teacherId || selectableTeachers[0]?.id || '');
      setAsgSubjectId(a?.subjectId || defaultSubject?.id || '');
      setAsgClassId(a?.classId || defaultClass?.id || '');
      setAssignAllClasses(!a);
      setScheduleDay(a?.scheduleDay || 'Sabtu');
      setScheduleTime(a?.scheduleTime || '08:00 - 09:30');
      setStatus(a?.status || 'Aktif');
    }
  }, [open, entityType, editingItem, classes, selectableTeachers, subjects, selectedProgram]);

  const titleMap: Record<MasterTabType, string> = {
    students: editingItem ? 'Edit Data Murid' : 'Tambah Murid Baru',
    teachers: editingItem ? 'Edit Data Guru / Tutor' : 'Tambah Guru / Tutor Baru',
    subjects: editingItem ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran',
    classes: editingItem ? 'Edit Kelas / Rombel' : 'Tambah Kelas / Rombel',
    assignments: editingItem ? 'Edit Penugasan Mengajar' : 'Tambah Penugasan Guru',
  };

  const resolveOrCreateSelectedTeacher = async (selectedId: string): Promise<SelectableTeacherOption | undefined> => {
    const picked = selectableTeachers.find((t) => t.id === selectedId);
    if (!picked) return undefined;
    if (!picked.fromAccountOnly) return picked;

    const safeNip =
      (picked.nip || '').trim().length >= 3
        ? picked.nip.trim().slice(0, 32)
        : `GURU${Date.now().toString().slice(-6)}`;
    const safeFullName =
      (picked.fullName || '').trim().length >= 2
        ? picked.fullName.trim().slice(0, 120)
        : 'Tutor PKBM';
    const safeSpec =
      (picked.specialization || '').trim().length >= 2
        ? picked.specialization.trim().slice(0, 120)
        : 'Tutor Kesetaraan PKBM';

    const created = await saveTeacher({
      nip: safeNip,
      fullName: safeFullName,
      gender: 'L',
      email: '',
      phone: '',
      specialization: safeSpec,
      education: '',
      status: 'Aktif',
      ownerUid: picked.accountUid || picked.ownerUid,
    });
    return {
      id: created.id,
      fullName: created.fullName,
      nip: created.nip,
      specialization: created.specialization,
      ownerUid: created.ownerUid,
      status: created.status,
    };
  };

  const handleApplyClassPreset = (presetId: string) => {
    setClsPreset(presetId);
    const preset = PKBM_CLASS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setPaket(preset.paket);
    setGradeLevel(preset.gradeLevel);
    const wasPresetOrEmpty =
      !clsName.trim() || PKBM_CLASS_PRESETS.some((p) => p.name === clsName.trim());
    if (wasPresetOrEmpty) {
      setClsName(preset.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (entityType === 'students') {
        const s = editingItem as Student | null;
        if (nis.trim().length < 3) {
          throw new Error('NIS minimal harus terdiri dari 3 karakter.');
        }
        if (fullName.trim().length < 2) {
          throw new Error('Nama lengkap murid minimal 2 karakter.');
        }
        const selectedClass = classes.find((c) => c.id === classId) || classes[0];
        if (!selectedClass) {
          throw new Error('Belum ada data Kelas/Rombel. Tambahkan kelas terlebih dahulu.');
        }
        await saveStudent({
          id: s?.id,
          nis: nis.trim(),
          nisn: nisn.trim(),
          fullName: fullName.trim(),
          gender,
          paket: selectedClass.paket || paket,
          classId: selectedClass.id,
          className: selectedClass.name,
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          guardianName: guardianName.trim(),
          status: status as Student['status'],
        });
        onSaved(s ? 'Data murid berhasil diperbarui' : 'Murid baru berhasil ditambahkan');
      } else if (entityType === 'teachers') {
        const t = editingItem as Teacher | null;
        if (nip.trim().length < 3) {
          throw new Error('NIP / NUPTK minimal harus terdiri dari 3 karakter.');
        }
        if (fullName.trim().length < 2) {
          throw new Error('Nama lengkap guru minimal 2 karakter.');
        }
        if (specialization.trim().length < 2) {
          throw new Error('Bidang keahlian guru minimal 2 karakter.');
        }
        await saveTeacher({
          id: t?.id,
          nip: nip.trim(),
          fullName: fullName.trim(),
          gender,
          email: email.trim(),
          phone: phone.trim(),
          specialization: specialization.trim(),
          education: education.trim(),
          status: status as Teacher['status'],
        });
        if (!t && selectedProgram !== 'Semua') {
          setSelectedProgram('Semua');
        }
        onSaved(t ? 'Data guru berhasil diperbarui' : 'Guru/tutor baru berhasil ditambahkan');
      } else if (entityType === 'subjects') {
        const m = editingItem as Subject | null;
        if (subCode.trim().length < 2) {
          throw new Error('Kode mata pelajaran minimal 2 karakter.');
        }
        if (subName.trim().length < 2) {
          throw new Error('Nama mata pelajaran minimal 2 karakter.');
        }
        await saveSubject({
          id: m?.id,
          code: subCode.trim().toUpperCase(),
          name: subName.trim(),
          paket,
          category: subCategory,
          hoursPerWeek: Math.max(1, Math.min(20, Number(hoursPerWeek) || 2)),
          kkm: Math.max(0, Math.min(100, Number(kkm) || 75)),
          status: status as Subject['status'],
        });
        onSaved(m ? 'Mata pelajaran diperbarui' : 'Mata pelajaran baru ditambahkan');
      } else if (entityType === 'classes') {
        const c = editingItem as Classroom | null;
        if (clsName.trim().length < 2) {
          throw new Error('Nama kelas / rombel minimal 2 karakter.');
        }
        if (gradeLevel.trim().length < 1) {
          throw new Error('Tingkat setara wajib diisi (contoh: Setara Kelas VII SMP).');
        }
        const hrTeacher = homeroomId ? await resolveOrCreateSelectedTeacher(homeroomId) : undefined;
        await saveClassroom({
          id: c?.id,
          name: clsName.trim().slice(0, 80),
          paket,
          gradeLevel: gradeLevel.trim().slice(0, 40),
          homeroomTeacherId: hrTeacher?.id || '',
          homeroomTeacherName: hrTeacher?.fullName || 'Belum Ditentukan',
          academicYear: schoolSettings.academicYear,
          capacity: Math.max(1, Math.min(100, Number(capacity) || 30)),
          studentCount: Math.max(0, Math.min(100, Number(studentCount) || 0)),
          status: status as Classroom['status'],
        });
        if (selectedProgram !== 'Semua' && selectedProgram !== paket) {
          setSelectedProgram(paket);
        }
        onSaved(c ? 'Data kelas/rombel diperbarui' : 'Kelas/rombel baru ditambahkan');
      } else if (entityType === 'assignments') {
        const a = editingItem as TeachingAssignment | null;
        if (!asgTeacherId) {
          throw new Error('Silakan pilih Guru / Tutor pengampu terlebih dahulu.');
        }
        if (!asgSubjectId) {
          throw new Error('Silakan pilih Mata Pelajaran terlebih dahulu.');
        }
        const t = await resolveOrCreateSelectedTeacher(asgTeacherId);
        const sub = subjects.find((x) => x.id === asgSubjectId);
        if (!t || !sub) {
          throw new Error('Data guru atau mata pelajaran tidak ditemukan.');
        }

        if (!a && assignAllClasses) {
          const activeClasses = sortClassesByJenjang(classes.filter((c) => c.status === 'Aktif'));
          if (activeClasses.length === 0) {
            throw new Error('Belum ada kelas/rombel aktif untuk ditugaskan.');
          }
          const groupKey = detectSubjectGroupFromSubject(sub);
          const teacherIdx = Math.max(
            0,
            selectableTeachers.findIndex((opt) => opt.id === asgTeacherId)
          );
          let createdCount = 0;

          for (let clsIdx = 0; clsIdx < activeClasses.length; clsIdx += 1) {
            const cls = activeClasses[clsIdx];
            const matchedSub =
              (groupKey ? findSubjectForGroupInPaket(groupKey, cls.paket, subjects) : null) || sub;
            const existingSame = assignments.find(
              (ex) => ex.teacherId === t.id && ex.classId === cls.id
            );
            const slot = SCHEDULE_SLOTS[(teacherIdx + clsIdx) % SCHEDULE_SLOTS.length];
            await saveAssignment({
              id: existingSame?.id,
              teacherId: t.id,
              teacherName: t.fullName,
              teacherUid: t.ownerUid,
              subjectId: matchedSub.id,
              subjectName: matchedSub.name,
              classId: cls.id,
              className: cls.name,
              paket: cls.paket,
              academicYear: schoolSettings.academicYear,
              semester: schoolSettings.semester,
              scheduleDay: existingSame?.scheduleDay || slot.day,
              scheduleTime: existingSame?.scheduleTime || slot.time,
              status: status as TeachingAssignment['status'],
            });
            createdCount += 1;
          }
          onSaved(
            `${t.fullName} berhasil ditugaskan ke seluruh ${createdCount} kelas/rombel (Paket A, B, C)`
          );
        } else {
          if (!asgClassId) {
            throw new Error('Silakan pilih Kelas / Rombel terlebih dahulu.');
          }
          const cls = classes.find((x) => x.id === asgClassId);
          if (!cls) {
            throw new Error('Data kelas/rombel tidak ditemukan.');
          }
          await saveAssignment({
            id: a?.id,
            teacherId: t.id,
            teacherName: t.fullName,
            teacherUid: t.ownerUid,
            subjectId: sub.id,
            subjectName: sub.name,
            classId: cls.id,
            className: cls.name,
            paket: cls.paket,
            academicYear: schoolSettings.academicYear,
            semester: schoolSettings.semester,
            scheduleDay,
            scheduleTime: scheduleTime.trim() || '08:00 - 09:30',
            status: status as TeachingAssignment['status'],
          });
          onSaved(a ? 'Penugasan guru diperbarui' : 'Penugasan mengajar berhasil dibuat');
        }
      }
      setSavedCheck(true);
      await new Promise((r) => window.setTimeout(r, 340));
      setSavedCheck(false);
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : 'Gagal menyimpan data. Pastikan semua kolom terisi benar dan Anda masuk sebagai Admin.'
      );
    } finally {
      setSaving(false);
    }
  };

  const assignmentDayOptions =
    scheduleDay && scheduleDay !== 'Sabtu' && scheduleDay !== 'Minggu'
      ? ['Sabtu', 'Minggu', scheduleDay]
      : ['Sabtu', 'Minggu'];

  return (
    <MotionModal open={open} onClose={onClose} maxWidthClass="max-w-xl" zIndexClass="z-50">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
          {titleMap[entityType]}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup modal"
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <AnimatePresence mode="wait">
          {formError && (
            <motion.div
              key={formError}
              variants={ERROR_SHAKE_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              role="alert"
              className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </motion.div>
          )}
        </AnimatePresence>

          {entityType === 'students' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NIS *
                  </label>
                  <input
                    type="text"
                    required
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    placeholder="2026015"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NISN
                  </label>
                  <input
                    type="text"
                    value={nisn}
                    onChange={(e) => setNisn(e.target.value)}
                    placeholder="010xxxxxxx"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama lengkap sesuai ijazah"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kelas / Rombel *
                  </label>
                  <select
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      const cls = classes.find((c) => c.id === e.target.value);
                      if (cls) setPaket(cls.paket);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.paket})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status Warga Belajar
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Cuti">Cuti</option>
                    <option value="Lulus">Lulus</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Orang Tua / Wali
                  </label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alamat Lengkap
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </>
          )}

          {entityType === 'teachers' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NIP / NUPTK *
                  </label>
                  <input
                    type="text"
                    required
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap & Gelar *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Didah Dahlia, S.Pd."
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bidang Keahlian / Ampuan *
                  </label>
                  <input
                    type="text"
                    required
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="Contoh: Matematika & Numerasi"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pendidikan Terakhir
                  </label>
                  <input
                    type="text"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    placeholder="S1 Pendidikan"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Telepon
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Cuti">Cuti</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {entityType === 'subjects' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kode Mapel *
                  </label>
                  <input
                    type="text"
                    required
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value)}
                    placeholder="PC-MTK"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Mata Pelajaran *
                  </label>
                  <input
                    type="text"
                    required
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Program
                  </label>
                  <select
                    value={paket}
                    onChange={(e) => setPaket(e.target.value as PaketType)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Paket A">Paket A</option>
                    <option value="Paket B">Paket B</option>
                    <option value="Paket C">Paket C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kelompok
                  </label>
                  <select
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value as Subject['category'])}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Wajib">Wajib</option>
                    <option value="Pemberdayaan">Pemberdayaan</option>
                    <option value="Keterampilan">Keterampilan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jam/Minggu
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={hoursPerWeek}
                    onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    KKM
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={kkm}
                    onChange={(e) => setKkm(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status Kurikulum
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Arsip">Arsip</option>
                </select>
              </div>
            </>
          )}

          {entityType === 'classes' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Jenjang / Tingkat Kelas PKBM
                </label>
                <select
                  value={clsPreset}
                  onChange={(e) => handleApplyClassPreset(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 text-sm font-medium text-slate-900 dark:text-white"
                >
                  <option value="">-- Kustom / Pilih Paket & Kelas --</option>
                  {PKBM_CLASS_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Rombel *
                  </label>
                  <input
                    type="text"
                    required
                    value={clsName}
                    onChange={(e) => setClsName(e.target.value)}
                    placeholder="Contoh: Paket B - Kelas 7 CIPANAS"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Program Kesetaraan
                  </label>
                  <select
                    value={paket}
                    onChange={(e) => setPaket(e.target.value as PaketType)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Paket A">Paket A (Kelas 6)</option>
                    <option value="Paket B">Paket B (Kelas 7, 8, 9)</option>
                    <option value="Paket C">Paket C (Kelas 10, 11, 12)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tingkat Setara *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    placeholder="Setara Kelas VII SMP"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Wali Kelas / Tutor Pembimbing
                  </label>
                  <select
                    value={homeroomId}
                    onChange={(e) => setHomeroomId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">-- Belum Ditentukan (Pilih Wali Kelas) --</option>
                    {selectableTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                        {t.status !== 'Aktif' ? ` (${t.status})` : ''}
                        {t.fromAccountOnly ? ' [Akun Guru]' : ''}
                      </option>
                    ))}
                  </select>
                  {selectableTeachers.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      Belum ada guru terinput. Tambahkan guru di menu Data Guru atau Manajemen Akun.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kapasitas
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Terisi
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={studentCount}
                    onChange={(e) => setStudentCount(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Arsip">Arsip</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {entityType === 'assignments' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Guru / Tutor *
                </label>
                <select
                  required
                  value={asgTeacherId}
                  onChange={(e) => setAsgTeacherId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">-- Pilih Guru / Tutor --</option>
                  {selectableTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} — {t.specialization}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Mata Pelajaran *
                </label>
                <select
                  required
                  value={asgSubjectId}
                  onChange={(e) => setAsgSubjectId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">-- Pilih Mata Pelajaran --</option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      [{sub.code}] {sub.name} ({sub.paket})
                    </option>
                  ))}
                </select>
              </div>
              {(() => {
                const selectedSub = subjects.find((s) => s.id === asgSubjectId);
                const selectedGroup = selectedSub ? detectSubjectGroupFromSubject(selectedSub) : null;
                const otherTeachersSameSubject = selectedSub
                  ? Array.from(
                      new Set(
                        assignments
                          .filter((ex) => {
                            if (ex.status !== 'Aktif' || ex.teacherId === asgTeacherId) return false;
                            if (ex.subjectId === selectedSub.id) return true;
                            if (!selectedGroup) return false;
                            const exSub = subjects.find((s) => s.id === ex.subjectId);
                            return exSub ? detectSubjectGroupFromSubject(exSub) === selectedGroup : false;
                          })
                          .map((ex) => ex.teacherName)
                      )
                    )
                  : [];
                const activeClassesCount = classes.filter((c) => c.status === 'Aktif').length;
                const groupDef = selectedGroup ? getSubjectGroupDefinition(selectedGroup) : null;

                return (
                  <>
                    {otherTeachersSameSubject.length > 0 && (
                      <div className="rounded-xl border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          Perhatian: Mata pelajaran / rumpun ini sudah diampu oleh{' '}
                          <strong>{otherTeachersSameSubject.join(', ')}</strong>. Disarankan
                          memilih mata pelajaran Kurikulum Merdeka yang berbeda agar tiap guru
                          mengampu mapel unik.
                        </span>
                      </div>
                    )}

                    {!editingItem && (
                      <label className="flex items-start gap-2.5 rounded-xl border border-emerald-600/25 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={assignAllClasses}
                          onChange={(e) => setAssignAllClasses(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                          <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                            Tugaskan otomatis ke semua kelas/rombel aktif ({activeClassesCount} rombel Paket A, B, C)
                          </span>
                          {groupDef
                            ? `Otomatis memetakan rumpun ${groupDef.label} ke mapel Kurikulum Merdeka yang sesuai di Paket A, Paket B, dan Paket C.`
                            : 'Guru akan langsung ditugaskan mengajar di seluruh kelas/rombel aktif.'}
                        </span>
                      </label>
                    )}

                    {(Boolean(editingItem) || !assignAllClasses) && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Pilih Kelas / Rombel *
                        </label>
                        <select
                          required
                          value={asgClassId}
                          onChange={(e) => setAsgClassId(e.target.value)}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                        >
                          <option value="">-- Pilih Kelas / Rombel --</option>
                          {sortClassesByJenjang(classes).map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Hari Sekolah (Sabtu – Minggu)
                  </label>
                  <select
                    value={scheduleDay}
                    onChange={(e) => setScheduleDay(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {assignmentDayOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jam Belajar
                  </label>
                  <input
                    type="text"
                    required
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    placeholder="08:00 - 09:30"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Selesai">Selesai</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-ripple min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <AnimatedSaveCheck visible={savedCheck} />
              <span>{savedCheck ? 'Tersimpan!' : saving ? 'Menyimpan...' : 'Simpan Data'}</span>
            </button>
          </div>
        </form>
    </MotionModal>
  );
};
