import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileCheck2, FileSpreadsheet, FileText, Loader2, Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { SchoolSettings } from '../../types/siakad';
import {
  exportAdministrativeDocumentToExcel,
  exportAdministrativeDocumentToWord,
} from '../../utils/documentExportUtils';
import { generateAdminDocumentPdf } from '../../utils/academicPdfUtils';
import {
  getStudentsForClassroom,
  resolveStudentPlacement,
} from '../../utils/excelUtils';
import { PkbmKopSuratHeader } from './PkbmKopSuratHeader';

export interface A4DocumentSheetProps {
  schoolSettings: SchoolSettings;
  documentTitle: string;
  documentNumber?: string;
  city?: string;
  dateLabel?: string;
  showTeacherSignature?: boolean;
  teacherLabel?: string;
  teacherName?: string;
  teacherNip?: string;
  children: React.ReactNode;
}

/**
 * Komponen Kertas A4 Resmi SIAKAD PKBM ANNUR KARISMA.
 * Menggunakan standar tata naskah dinas: Times New Roman 12pt, spasi 1.5, tinta hitam pekat.
 */
export const A4DocumentSheet: React.FC<A4DocumentSheetProps> = ({
  schoolSettings,
  documentTitle,
  documentNumber = '421.9/048/PKBM-AK/XI/2026',
  city = 'Cianjur',
  dateLabel,
  showTeacherSignature = false,
  teacherLabel = 'Wali Kelas / Tutor',
  teacherName = 'Reny Febriyani, S.Sos.',
  teacherNip = 'TUTOR-PKBM-003',
  children,
}) => {
  const formattedToday =
    dateLabel ||
    new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

  return (
    <div className="print-only-sheet formal-doc-sheet w-full max-w-[794px] min-h-[1122px] mx-auto bg-white text-black px-10 py-10 sm:px-[25mm] sm:py-[20mm] shadow-2xl border border-slate-300 rounded-sm flex flex-col justify-between">
      <div>
        {/* KOP SURAT RESMI PKBM (Komponen Konsisten) */}
        <PkbmKopSuratHeader schoolSettings={schoolSettings} />

        {/* JUDUL & NOMOR SURAT */}
        <div className="text-center mb-6">
          <h3 className="!text-[12pt] !leading-snug font-bold uppercase underline underline-offset-4 tracking-wide text-black">
            {documentTitle}
          </h3>
          {documentNumber && (
            <p className="mt-1 !text-[12pt] !leading-snug text-black">
              Nomor: {documentNumber}
            </p>
          )}
        </div>

        {/* ISI DOKUMEN (Times New Roman 12pt, Spasi 1.5) */}
        <div className="text-[12pt] leading-[1.5] text-black">{children}</div>
      </div>

      {/* BLOK TANDA TANGAN RESMI */}
      <footer className="mt-12 pt-4 text-[12pt] leading-[1.45] text-black">
        <div className="grid grid-cols-2 gap-8 items-end">
          {/* Kolom Kiri: TTD Wali Kelas / Tutor (jika aktif) atau Keterangan TA */}
          {showTeacherSignature ? (
            <div className="text-left">
              <p className="!text-[12pt] !leading-[1.4]">Mengetahui,</p>
              <p className="!text-[12pt] !leading-[1.4] font-bold">{teacherLabel}</p>
              <div className="relative h-20 my-1 flex items-center justify-start">
                {schoolSettings.teacherSignatureUrl && (
                  <img
                    src={schoolSettings.teacherSignatureUrl}
                    alt="Tanda Tangan Guru"
                    referrerPolicy="no-referrer"
                    className="h-18 object-contain"
                  />
                )}
              </div>
              <p className="!text-[12pt] !leading-[1.35] font-bold underline underline-offset-2">
                {teacherName}
              </p>
              {teacherNip && teacherNip !== '—' && (
                <p className="!text-[11pt] !leading-[1.35]">NIP. {teacherNip}</p>
              )}
            </div>
          ) : (
            <div className="text-left">
              <p className="!text-[11pt] !leading-[1.4]">Tahun Ajaran {schoolSettings.academicYear}</p>
              <p className="!text-[11pt] !leading-[1.4]">Semester {schoolSettings.semester}</p>
            </div>
          )}

          {/* Kolom Kanan: TTD Kepala PKBM */}
          <div className="text-left pl-6 sm:pl-10">
            <p className="!text-[12pt] !leading-[1.4]">
              {city}, {formattedToday}
            </p>
            <p className="!text-[12pt] !leading-[1.4] font-bold">Kepala {schoolSettings.schoolName}</p>
            <div className="relative h-20 my-1 flex items-center justify-start">
              {schoolSettings.stampUrl && (
                <img
                  src={schoolSettings.stampUrl}
                  alt="Stempel Lembaga"
                  referrerPolicy="no-referrer"
                  className="absolute -left-6 top-0 h-20 w-20 object-contain opacity-85 pointer-events-none"
                />
              )}
              {schoolSettings.headmasterSignatureUrl && (
                <img
                  src={schoolSettings.headmasterSignatureUrl}
                  alt="Tanda Tangan Kepala PKBM"
                  referrerPolicy="no-referrer"
                  className="relative z-10 h-20 max-h-20 object-contain"
                />
              )}
            </div>
            <p className="!text-[12pt] !leading-[1.35] font-bold underline underline-offset-2">
              {schoolSettings.headmasterName}
            </p>
            {schoolSettings.headmasterNip && (
              <p className="!text-[11pt] !leading-[1.35]">
                NIP. {schoolSettings.headmasterNip}
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

type DocumentTemplateId =
  | 'surat_aktif'
  | 'daftar_rombel'
  | 'surat_tugas'
  | 'biodata_murid';

export const DocumentsView: React.FC = () => {
  const { profile, effectiveRole } = useAuth();
  const { schoolSettings, students, teachers, classes, assignments, selectedProgram } = useData();
  const { showToast } = useToast();

  const [templateId, setTemplateId] = useState<DocumentTemplateId>(
    effectiveRole === 'guru' ? 'surat_tugas' : 'surat_aktif'
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || '');
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [docNumber, setDocNumber] = useState('421.9/104/PKBM-AK/XI/2026');
  const [city, setCity] = useState('Cianjur');
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const selectableStudents = useMemo(() => {
    if (selectedProgram === 'Semua') return students;
    const filtered = students.filter(
      (s) => resolveStudentPlacement(s, classes).paket === selectedProgram
    );
    return filtered.length > 0 ? filtered : students;
  }, [students, classes, selectedProgram]);

  const selectableClasses = useMemo(() => {
    if (selectedProgram === 'Semua') return classes;
    const filtered = classes.filter((c) => c.paket === selectedProgram);
    return filtered.length > 0 ? filtered : classes;
  }, [classes, selectedProgram]);

  useEffect(() => {
    if (selectableStudents.length > 0 && !selectableStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(selectableStudents[0].id);
    }
  }, [selectableStudents, selectedStudentId]);

  useEffect(() => {
    if (selectableClasses.length > 0 && !selectableClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(selectableClasses[0].id);
    }
  }, [selectableClasses, selectedClassId]);

  const activeStudent = useMemo(() => {
    if (effectiveRole === 'murid') {
      return (
        students.find(
          (s) =>
            s.id === profile?.linkedEntityId ||
            s.ownerUid === profile?.uid ||
            (Boolean(profile?.nis) && s.nis === profile?.nis)
        ) || students[0]
      );
    }
    return selectableStudents.find((s) => s.id === selectedStudentId) || selectableStudents[0];
  }, [effectiveRole, students, selectableStudents, selectedStudentId, profile]);

  const activeStudentPlacement = useMemo(
    () => (activeStudent ? resolveStudentPlacement(activeStudent, classes) : null),
    [activeStudent, classes]
  );

  const activeClass = useMemo(
    () => selectableClasses.find((c) => c.id === selectedClassId) || selectableClasses[0],
    [selectableClasses, selectedClassId]
  );

  const activeTeacher = useMemo(() => {
    if (effectiveRole === 'guru') {
      return (
        teachers.find(
          (t) =>
            t.id === profile?.linkedEntityId ||
            t.ownerUid === profile?.uid ||
            (Boolean(profile?.nip) && t.nip === profile?.nip) ||
            (Boolean(profile?.email) && t.email === profile?.email)
        ) || teachers[0]
      );
    }
    return teachers.find((t) => t.id === selectedTeacherId) || teachers[0];
  }, [effectiveRole, teachers, selectedTeacherId, profile]);

  const studentsInActiveClass = useMemo(() => {
    if (!activeClass) return [];
    return getStudentsForClassroom(activeClass, students, classes).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'id-ID')
    );
  }, [students, activeClass, classes]);

  const assignmentsForTeacher = useMemo(
    () => assignments.filter((a) => a.teacherId === activeTeacher?.id),
    [assignments, activeTeacher]
  );

  const activeClassHomeroomTeacher = useMemo(() => {
    if (!activeClass) return teachers[0];
    return (
      teachers.find(
        (t) =>
          t.id === activeClass.homeroomTeacherId ||
          t.fullName.trim().toLowerCase() === (activeClass.homeroomTeacherName || '').trim().toLowerCase()
      ) || teachers[0]
    );
  }, [activeClass, teachers]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      const fileName = await generateAdminDocumentPdf(buildExportPayload());
      showToast('Dokumen PDF resmi berkop PKBM berhasil diunduh', 'success', fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat berkas PDF resmi.';
      showToast(msg, 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const titleByTemplate: Record<DocumentTemplateId, string> = {
    surat_aktif: 'SURAT KETERANGAN AKTIF BELAJAR',
    daftar_rombel: 'DAFTAR PESERTA DIDIK ROMBONGAN BELAJAR',
    surat_tugas: 'SURAT TUGAS MENGAJAR TUTOR KESETARAAN',
    biodata_murid: 'LEMBAR BIODATA INDUK WARGA BELAJAR',
  };

  const resolvedActiveStudent = useMemo(() => {
    if (!activeStudent || !activeStudentPlacement) return activeStudent;
    return {
      ...activeStudent,
      paket: activeStudentPlacement.paket,
      classId: activeStudentPlacement.classId || activeStudent.classId,
      className: activeStudentPlacement.fullClassLabel || activeStudent.className,
    };
  }, [activeStudent, activeStudentPlacement]);

  const buildExportPayload = () => ({
    templateId,
    documentTitle: titleByTemplate[templateId],
    documentNumber: docNumber,
    city,
    schoolSettings,
    activeStudent: resolvedActiveStudent,
    activeClass,
    studentsInActiveClass,
    activeTeacher,
    assignmentsForTeacher,
    showTeacherSignature: templateId === 'daftar_rombel' || templateId === 'biodata_murid',
    teacherLabel: templateId === 'daftar_rombel' ? 'Wali Kelas / Pembimbing' : 'Tutor Pengampu',
    teacherName:
      templateId === 'daftar_rombel'
        ? activeClass?.homeroomTeacherName || activeClassHomeroomTeacher?.fullName || 'Wali Kelas'
        : activeClassHomeroomTeacher?.fullName || teachers[0]?.fullName || '',
    teacherNip:
      templateId === 'daftar_rombel'
        ? activeClassHomeroomTeacher?.nip || ''
        : teachers[0]?.nip || '',
  });

  const handleDownloadWord = async () => {
    setExportingWord(true);
    try {
      await exportAdministrativeDocumentToWord(buildExportPayload());
      showToast('Dokumen Word (.docx) Times New Roman 12pt berhasil diunduh', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat file Word.';
      showToast(msg, 'error');
    } finally {
      setExportingWord(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
      exportAdministrativeDocumentToExcel(buildExportPayload());
      showToast('Dokumen Excel (.xlsx) siap diedit berhasil diunduh', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat file Excel.';
      showToast(msg, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Toolbar (Hidden when printing) */}
      <div className="no-print rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-extrabold text-xl text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <span>Pusat Cetak &amp; Ekspor Dokumen Resmi</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Format surat menyurat resmi Times New Roman ukuran 12pt, spasi 1,5. Kop surat, logo, dan tanda tangan terpasang otomatis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={exportingWord}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-sky-500/35 bg-sky-50 dark:bg-sky-950/40 text-xs sm:text-sm font-bold text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {exportingWord ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>Unduh Word (.docx)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-emerald-500/35 bg-emerald-50 dark:bg-emerald-950/40 text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 inline-flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Unduh Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{exportingPdf ? 'Menyusun PDF...' : 'Unduh PDF'}</span>
            </button>
          </div>
        </div>

        {/* Template & Parameter Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Jenis Dokumen
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as DocumentTemplateId)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            >
              <option value="surat_aktif">Surat Keterangan Aktif</option>
              <option value="biodata_murid">Biodata Induk Murid</option>
              {effectiveRole !== 'murid' && (
                <>
                  <option value="daftar_rombel">Daftar Rombel &amp; Murid</option>
                  <option value="surat_tugas">Surat Tugas Tutor</option>
                </>
              )}
            </select>
          </div>

          {(templateId === 'surat_aktif' || templateId === 'biodata_murid') &&
            effectiveRole !== 'murid' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Pilih Warga Belajar
                </label>
                <select
                  value={activeStudent?.id || ''}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  {selectableStudents.map((s) => {
                    const placed = resolveStudentPlacement(s, classes);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.fullName} ({placed.paket} · {placed.shortClassLabel})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

          {templateId === 'daftar_rombel' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Pilih Rombel
              </label>
              <select
                value={activeClass?.id || ''}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                {selectableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.studentCount} murid)
                  </option>
                ))}
              </select>
            </div>
          )}

          {templateId === 'surat_tugas' && effectiveRole !== 'guru' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Pilih Guru / Tutor
              </label>
              <select
                value={activeTeacher?.id || ''}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Nomor Surat
            </label>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Kota Penerbitan
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Authentic Paper Preview Backdrop */}
      <div className="rounded-2xl bg-slate-200/75 dark:bg-slate-950/75 p-3 sm:p-8 overflow-x-auto border border-emerald-950/10 dark:border-white/10">
        <A4DocumentSheet
          schoolSettings={schoolSettings}
          documentTitle={titleByTemplate[templateId]}
          documentNumber={docNumber}
          city={city}
          showTeacherSignature={templateId === 'daftar_rombel' || templateId === 'biodata_murid'}
          teacherLabel={templateId === 'daftar_rombel' ? 'Wali Kelas / Pembimbing' : 'Tutor Pengampu'}
          teacherName={
            templateId === 'daftar_rombel'
              ? activeClass?.homeroomTeacherName || activeClassHomeroomTeacher?.fullName || 'Wali Kelas'
              : activeClassHomeroomTeacher?.fullName || teachers[0]?.fullName
          }
          teacherNip={
            templateId === 'daftar_rombel'
              ? activeClassHomeroomTeacher?.nip || ''
              : teachers[0]?.nip || ''
          }
        >
          {templateId === 'surat_aktif' && resolvedActiveStudent && (
            <div className="space-y-4 text-[12pt] leading-[1.5] text-black">
              <p className="text-justify indent-8">
                Yang bertanda tangan di bawah ini, Kepala <strong>{schoolSettings.schoolName}</strong>{' '}
                (NPSN {schoolSettings.npsn}), menerangkan dengan sesungguhnya bahwa:
              </p>

              <table className="w-full my-3 text-[12pt] leading-[1.45] text-black">
                <tbody>
                  <tr>
                    <td className="py-1 w-52 align-top">Nama Lengkap</td>
                    <td className="py-1 w-5 align-top">:</td>
                    <td className="py-1 font-bold align-top">{resolvedActiveStudent.fullName}</td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top">NIS / NISN</td>
                    <td className="py-1 align-top">:</td>
                    <td className="py-1 align-top">
                      {resolvedActiveStudent.nis} / {resolvedActiveStudent.nisn || '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top">Jenis Kelamin</td>
                    <td className="py-1 align-top">:</td>
                    <td className="py-1 align-top">
                      {resolvedActiveStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top">Program Kesetaraan</td>
                    <td className="py-1 align-top">:</td>
                    <td className="py-1 font-bold align-top">{resolvedActiveStudent.paket}</td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top">Kelas / Rombel</td>
                    <td className="py-1 align-top">:</td>
                    <td className="py-1 align-top">{resolvedActiveStudent.className}</td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top">Nama Orang Tua / Wali</td>
                    <td className="py-1 align-top">:</td>
                    <td className="py-1 align-top">{resolvedActiveStudent.guardianName || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top">Alamat</td>
                    <td className="py-1 align-top">:</td>
                    <td className="py-1 align-top">{resolvedActiveStudent.address || '-'}</td>
                  </tr>
                </tbody>
              </table>

              <p className="text-justify indent-8">
                Adalah benar tercatat sebagai Warga Belajar berstatus{' '}
                <strong>{resolvedActiveStudent.status}</strong> pada {schoolSettings.schoolName} Tahun Ajaran{' '}
                <strong>{schoolSettings.academicYear}</strong> Semester{' '}
                <strong>{schoolSettings.semester}</strong>.
              </p>
              <p className="text-justify indent-8">
                Demikian surat keterangan ini dibuat dengan sebenarnya agar dapat dipergunakan
                sebagaimana mestinya.
              </p>
            </div>
          )}

          {templateId === 'biodata_murid' && resolvedActiveStudent && (
            <div className="space-y-4 text-[12pt] leading-[1.5] text-black">
              <p className="italic">
                Data Pokok Warga Belajar Pendidikan Kesetaraan — Tahun Ajaran{' '}
                {schoolSettings.academicYear}
              </p>
              <table className="w-full border-collapse border border-black text-[12pt] leading-[1.4]">
                <tbody>
                  {[
                    ['Nomor Induk Siswa (NIS)', resolvedActiveStudent.nis],
                    ['NISN', resolvedActiveStudent.nisn || '-'],
                    ['Nama Lengkap', resolvedActiveStudent.fullName],
                    ['Jenis Kelamin', resolvedActiveStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
                    ['Program Kesetaraan', resolvedActiveStudent.paket],
                    ['Rombongan Belajar', resolvedActiveStudent.className],
                    ['Email Terdaftar', resolvedActiveStudent.email || '-'],
                    ['Nomor Telepon', resolvedActiveStudent.phone || '-'],
                    ['Alamat Tempat Tinggal', resolvedActiveStudent.address || '-'],
                    ['Nama Orang Tua / Wali', resolvedActiveStudent.guardianName || '-'],
                    ['Status Kepesertaan', resolvedActiveStudent.status],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="border border-black bg-slate-100 px-3 py-1.5 font-bold w-60 align-top">
                        {k}
                      </td>
                      <td className="border border-black px-3 py-1.5 align-top">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {templateId === 'daftar_rombel' && activeClass && (
            <div className="space-y-4 text-[12pt] leading-[1.45] text-black">
              <table className="w-full text-[12pt] leading-[1.4]">
                <tbody>
                  <tr>
                    <td className="py-0.5 w-36">Rombel</td>
                    <td className="py-0.5 w-4">:</td>
                    <td className="py-0.5 font-bold">{activeClass.name}</td>
                    <td className="py-0.5 w-32 pl-4">Program</td>
                    <td className="py-0.5 w-4">:</td>
                    <td className="py-0.5 font-bold">{activeClass.paket}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5">Wali Kelas</td>
                    <td className="py-0.5">:</td>
                    <td className="py-0.5 font-bold">{activeClass.homeroomTeacherName || '-'}</td>
                    <td className="py-0.5 pl-4">Tahun Ajaran</td>
                    <td className="py-0.5">:</td>
                    <td className="py-0.5 font-bold">
                      {schoolSettings.academicYear} ({schoolSettings.semester})
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5">Jumlah Murid</td>
                    <td className="py-0.5">:</td>
                    <td className="py-0.5 font-bold" colSpan={4}>
                      {studentsInActiveClass.length} Warga Belajar
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full border-collapse border border-black text-[11pt] leading-[1.35]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-2 py-2 w-10 text-center font-bold">No</th>
                    <th className="border border-black px-2.5 py-2 text-left font-bold">NIS</th>
                    <th className="border border-black px-2.5 py-2 text-left font-bold">Nama Lengkap</th>
                    <th className="border border-black px-2 py-2 text-center w-12 font-bold">L/P</th>
                    <th className="border border-black px-2.5 py-2 text-left font-bold">Status</th>
                    <th className="border border-black px-2.5 py-2 text-center w-28 font-bold">Paraf</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsInActiveClass.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="border border-black px-3 py-6 text-center italic">
                        Belum ada murid terdaftar di rombel ini.
                      </td>
                    </tr>
                  ) : (
                    studentsInActiveClass.map((st, idx) => (
                      <tr key={st.id}>
                        <td className="border border-black px-2 py-1.5 text-center">{idx + 1}</td>
                        <td className="border border-black px-2.5 py-1.5">{st.nis}</td>
                        <td className="border border-black px-2.5 py-1.5 font-bold">{st.fullName}</td>
                        <td className="border border-black px-2 py-1.5 text-center">{st.gender}</td>
                        <td className="border border-black px-2.5 py-1.5">{st.status}</td>
                        <td className="border border-black px-2.5 py-1.5" />
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {templateId === 'surat_tugas' && activeTeacher && (
            <div className="space-y-4 text-[12pt] leading-[1.5] text-black">
              <p className="text-justify indent-8">
                Kepala {schoolSettings.schoolName} menugaskan kepada pendidik / tutor di bawah ini
                untuk melaksanakan kegiatan pembelajaran tutorial pada Tahun Ajaran{' '}
                <strong>{schoolSettings.academicYear}</strong> Semester{' '}
                <strong>{schoolSettings.semester}</strong>:
              </p>

              <table className="w-full text-[12pt] leading-[1.45] my-3">
                <tbody>
                  <tr>
                    <td className="py-1 w-48">Nama Tutor</td>
                    <td className="py-1 w-5">:</td>
                    <td className="py-1 font-bold">{activeTeacher.fullName}</td>
                  </tr>
                  <tr>
                    <td className="py-1">NIP / NUPTK</td>
                    <td className="py-1">:</td>
                    <td className="py-1">{activeTeacher.nip || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Bidang Keahlian</td>
                    <td className="py-1">:</td>
                    <td className="py-1">{activeTeacher.specialization || '-'}</td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full border-collapse border border-black text-[11pt] leading-[1.35]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-2 py-2 w-10 text-center font-bold">No</th>
                    <th className="border border-black px-2.5 py-2 text-left font-bold">Mata Pelajaran</th>
                    <th className="border border-black px-2.5 py-2 text-left font-bold">Kelas / Rombel</th>
                    <th className="border border-black px-2.5 py-2 text-left font-bold">Jadwal</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentsForTeacher.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="border border-black px-3 py-5 text-center italic">
                        Belum ada penugasan kelas untuk tutor ini.
                      </td>
                    </tr>
                  ) : (
                    assignmentsForTeacher.map((asg, idx) => (
                      <tr key={asg.id}>
                        <td className="border border-black px-2 py-1.5 text-center">{idx + 1}</td>
                        <td className="border border-black px-2.5 py-1.5 font-bold">
                          {asg.subjectName}
                        </td>
                        <td className="border border-black px-2.5 py-1.5">{asg.className}</td>
                        <td className="border border-black px-2.5 py-1.5">
                          {asg.scheduleDay}, {asg.scheduleTime}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <p className="text-justify indent-8">
                Demikian surat tugas ini ditetapkan agar dilaksanakan dengan penuh tanggung jawab.
              </p>
            </div>
          )}
        </A4DocumentSheet>
      </div>
    </div>
  );
};

