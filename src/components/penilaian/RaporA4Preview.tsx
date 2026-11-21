import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileCheck2, Loader2, Printer, Save } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Student } from '../../types/siakad';
import { generateRaporPdf } from '../../utils/academicPdfUtils';
import { A4DocumentSheet } from '../documents/A4DocumentPrinter';
import { computeStudentAttendanceSummary, getPredicateMeta } from './gradeHelpers';

interface RaporA4PreviewProps {
  student: Student | null;
  semester: 'Ganjil' | 'Genap';
  isStudentRole?: boolean;
  selectableStudents?: Student[];
  onSelectStudentId?: (id: string) => void;
  onChangeSemester: (sem: 'Ganjil' | 'Genap') => void;
}

export const RaporA4Preview: React.FC<RaporA4PreviewProps> = ({
  student,
  semester,
  isStudentRole = false,
  selectableStudents = [],
  onSelectStudentId,
  onChangeSemester,
}) => {
  const {
    schoolSettings,
    classes,
    teachers,
    subjects,
    gradeRecords,
    attendanceSessions,
    saveGradeRecordsBatch,
  } = useData();
  const { showToast } = useToast();

  const [city, setCity] = useState('Cianjur');
  const [reportNumber, setReportNumber] = useState(
    `421.9/RPR-${student?.nis || '2026'}/PKBM-AK/${semester === 'Ganjil' ? 'I' : 'II'}/2026`
  );
  const [homeroomNoteDraft, setHomeroomNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const studentClass = useMemo(
    () => classes.find((c) => c.id === student?.classId) || null,
    [classes, student]
  );

  const homeroomTeacher = useMemo(() => {
    if (!studentClass) return teachers[0] || null;
    return (
      teachers.find(
        (t) =>
          t.id === studentClass.homeroomTeacherId ||
          t.fullName === studentClass.homeroomTeacherName
      ) ||
      teachers[0] ||
      null
    );
  }, [studentClass, teachers]);

  const subjectRows = useMemo(() => {
    if (!student) return [];
    const paketSubjects = subjects.filter(
      (s) => s.paket === student.paket && s.status === 'Aktif'
    );
    return paketSubjects.map((sub) => {
      const rec = gradeRecords.find(
        (g) =>
          (g.studentId === student.id ||
            g.studentNis === student.nis ||
            g.studentUid === student.ownerUid) &&
          g.subjectId === sub.id &&
          g.semester === semester
      );
      return { subject: sub, record: rec || null };
    });
  }, [student, subjects, gradeRecords, semester]);

  const existingHomeroomNote = useMemo(() => {
    const withNote = subjectRows.find((r) => Boolean(r.record?.homeroomNote?.trim()));
    return (
      withNote?.record?.homeroomNote ||
      `${student?.fullName || 'Warga belajar'} menunjukkan kesungguhan dalam mengikuti program tutorial ${student?.paket || ''} dan aktif berpartisipasi dalam kegiatan belajar.`
    );
  }, [subjectRows, student]);

  useEffect(() => {
    setHomeroomNoteDraft(existingHomeroomNote);
    if (student) {
      setReportNumber(
        `421.9/RPR-${student.nis}/PKBM-AK/${semester === 'Ganjil' ? 'I' : 'II'}/2026`
      );
    }
  }, [existingHomeroomNote, student, semester]);

  const attendance = useMemo(
    () => computeStudentAttendanceSummary(student, attendanceSessions, semester),
    [student, attendanceSessions, semester]
  );

  const averageScore = useMemo(() => {
    const graded = subjectRows.filter((r) => r.record !== null);
    if (graded.length === 0) return 0;
    return Math.round(
      graded.reduce((acc, r) => acc + (r.record?.finalScore || 0), 0) / graded.length
    );
  }, [subjectRows]);

  const allPassed = useMemo(() => {
    const graded = subjectRows.filter((r) => r.record !== null);
    return graded.length > 0 && graded.every((r) => r.record?.isPassed);
  }, [subjectRows]);

  const handleSaveHomeroomNote = async () => {
    if (!student) return;
    const firstRecord = subjectRows.find((r) => r.record !== null)?.record;
    if (!firstRecord) {
      showToast(
        'Belum ada nilai tersimpan',
        'warning',
        'Simpan minimal satu nilai mata pelajaran di tab Spreadsheet agar catatan wali kelas dapat disimpan ke rapor.'
      );
      return;
    }
    setSavingNote(true);
    try {
      await saveGradeRecordsBatch([
        {
          studentId: firstRecord.studentId,
          studentUid: firstRecord.studentUid,
          studentName: firstRecord.studentName,
          studentNis: firstRecord.studentNis,
          classId: firstRecord.classId,
          className: firstRecord.className,
          paket: firstRecord.paket,
          subjectId: firstRecord.subjectId,
          subjectName: firstRecord.subjectName,
          kkm: firstRecord.kkm,
          teacherId: firstRecord.teacherId,
          teacherName: firstRecord.teacherName,
          academicYear: firstRecord.academicYear,
          semester: firstRecord.semester,
          tugas: firstRecord.tugas,
          uh: firstRecord.uh,
          asts: firstRecord.asts,
          asat: firstRecord.asat,
          praktik: firstRecord.praktik,
          sikap: firstRecord.sikap,
          finalScore: firstRecord.finalScore,
          predicate: firstRecord.predicate,
          isPassed: firstRecord.isPassed,
          achievementDescription: firstRecord.achievementDescription,
          homeroomNote: homeroomNoteDraft.trim(),
        },
      ]);
      showToast('Catatan wali kelas disimpan', 'success');
    } catch (err) {
      showToast(
        'Gagal menyimpan catatan',
        'error',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan catatan.'
      );
    } finally {
      setSavingNote(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!student) return;
    setExportingPdf(true);
    try {
      const fileName = await generateRaporPdf({
        schoolSettings,
        student,
        semester,
        reportNumber,
        city,
        teacherName:
          studentClass?.homeroomTeacherName || homeroomTeacher?.fullName || 'Wali Kelas',
        teacherNip: homeroomTeacher?.nip || '',
        subjectRows: subjectRows.map(({ subject, record }) => ({
          subject,
          record: record ?? undefined,
          predicateShort: record ? getPredicateMeta(record.predicate, record.isPassed).short : undefined,
        })),
        averageScore,
        allPassed,
        attendance,
        homeroomNote: homeroomNoteDraft || existingHomeroomNote,
      });
      showToast('Rapor PDF resmi berkop PKBM berhasil diunduh', 'success', fileName);
    } catch (err) {
      showToast(
        'Gagal mengunduh PDF Rapor',
        'error',
        err instanceof Error ? err.message : 'Silakan coba kembali.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  if (!student) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-950/20 dark:border-white/15 bg-white dark:bg-slate-900 p-10 text-center">
        <p className="font-display font-bold text-base text-slate-900 dark:text-white">
          Data warga belajar belum tersedia untuk pratinjau rapor
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control Toolbar (Hidden on Print) */}
      <section className="no-print rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <span>Pratinjau Rapor Resmi A4</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Menggunakan kop surat, logo, dan blok tanda tangan resmi sesuai Pengaturan Sekolah.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Cetak Rapor</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-60 inline-flex items-center gap-2 whitespace-nowrap"
            >
              {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{exportingPdf ? 'Menyusun PDF...' : 'Unduh PDF'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {!isStudentRole && selectableStudents.length > 0 && onSelectStudentId && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Warga Belajar
              </label>
              <select
                value={student.id}
                onChange={(e) => onSelectStudentId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              >
                {selectableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nis} — {s.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Semester Rapor
            </label>
            <select
              value={semester}
              onChange={(e) => onChangeSemester(e.target.value as 'Ganjil' | 'Genap')}
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Nomor Rapor
            </label>
            <input
              type="text"
              value={reportNumber}
              onChange={(e) => setReportNumber(e.target.value)}
              disabled={isStudentRole}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white disabled:opacity-70"
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
              disabled={isStudentRole}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
            />
          </div>
        </div>

        {!isStudentRole && (
          <div className="pt-2 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Catatan Wali Kelas di Rapor
              </label>
              <textarea
                rows={2}
                value={homeroomNoteDraft}
                onChange={(e) => setHomeroomNoteDraft(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveHomeroomNote}
              disabled={savingNote}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{savingNote ? 'Menyimpan...' : 'Simpan Catatan'}</span>
            </button>
          </div>
        )}
      </section>

      {/* Authentic Paper A4 Rapor Sheet */}
      <div className="rounded-2xl bg-slate-200/75 dark:bg-slate-950/75 p-3 sm:p-8 overflow-x-auto border border-emerald-950/10 dark:border-white/10">
        <A4DocumentSheet
          schoolSettings={schoolSettings}
          documentTitle="LAPORAN HASIL BELAJAR WARGA BELAJAR (RAPOR)"
          documentNumber={reportNumber}
          city={city}
          showTeacherSignature
          teacherLabel="Wali Kelas / Pembimbing"
          teacherName={
            studentClass?.homeroomTeacherName || homeroomTeacher?.fullName || 'Reny Febriyani, S.Sos.'
          }
          teacherNip={homeroomTeacher?.nip || 'TUTOR-PKBM-003'}
        >
          <div className="space-y-5 text-black text-[12pt] leading-[1.45]">
            {/* Identitas Warga Belajar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[11.5pt] border border-black p-3">
              <div className="flex justify-between gap-2 border-b border-dotted border-black/40 pb-0.5">
                <span>Nama Warga Belajar</span>
                <strong className="text-right">{student.fullName}</strong>
              </div>
              <div className="flex justify-between gap-2 border-b border-dotted border-black/40 pb-0.5">
                <span>Program Kesetaraan</span>
                <strong className="text-right">{student.paket}</strong>
              </div>
              <div className="flex justify-between gap-2 border-b border-dotted border-black/40 pb-0.5">
                <span>NIS / NISN</span>
                <strong className="text-right">
                  {student.nis} / {student.nisn || '-'}
                </strong>
              </div>
              <div className="flex justify-between gap-2 border-b border-dotted border-black/40 pb-0.5">
                <span>Kelas / Rombel</span>
                <strong className="text-right">{student.className}</strong>
              </div>
              <div className="flex justify-between gap-2">
                <span>Tahun Ajaran</span>
                <strong className="text-right">{schoolSettings.academicYear}</strong>
              </div>
              <div className="flex justify-between gap-2">
                <span>Semester</span>
                <strong className="text-right">{semester}</strong>
              </div>
            </div>

            {/* Tabel Capaian Mata Pelajaran */}
            <div>
              <h4 className="font-bold text-[12pt] uppercase text-black mb-2">
                A. Capaian Kompetensi Mata Pelajaran
              </h4>
              <table className="w-full border-collapse border border-black text-[10.5pt] leading-[1.35]">
                <thead>
                  <tr className="bg-slate-100 text-black">
                    <th className="border border-black px-2 py-1.5 w-8 text-center font-bold">No</th>
                    <th className="border border-black px-2.5 py-1.5 text-left w-44 font-bold">
                      Mata Pelajaran
                    </th>
                    <th className="border border-black px-2 py-1.5 w-12 text-center font-bold">KKTP</th>
                    <th className="border border-black px-2 py-1.5 w-14 text-center font-bold">Nilai</th>
                    <th className="border border-black px-2 py-1.5 w-14 text-center font-bold">Pred.</th>
                    <th className="border border-black px-2.5 py-1.5 text-left font-bold">
                      Deskripsi Capaian Kompetensi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map(({ subject, record }, idx) => {
                    const predMeta = record
                      ? getPredicateMeta(record.predicate, record.isPassed)
                      : null;
                    return (
                      <tr key={subject.id}>
                        <td className="border border-black px-2 py-1.5 text-center align-top">
                          {idx + 1}
                        </td>
                        <td className="border border-black px-2.5 py-1.5 align-top">
                          <div className="font-bold text-black">{subject.name}</div>
                          <div className="text-[9.5pt] italic">{subject.category}</div>
                        </td>
                        <td className="border border-black px-2 py-1.5 text-center align-top">
                          {record?.kkm ?? subject.kkm}
                        </td>
                        <td
                          className={`border border-black px-2 py-1.5 text-center font-bold align-top ${
                            record && !record.isPassed ? 'text-rose-800 bg-rose-50' : ''
                          }`}
                        >
                          {record ? record.finalScore : '-'}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-center font-bold align-top">
                          {record ? (
                            <div>
                              <span>{record.predicate}</span>
                              <div className="text-[9pt] font-normal">
                                {predMeta?.short}
                              </div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="border border-black px-2.5 py-1.5 text-black leading-snug align-top">
                          {record?.achievementDescription ||
                            'Nilai capaian mata pelajaran sedang dalam proses rekapitulasi tutor.'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={3} className="border border-black px-2.5 py-1.5 text-right">
                      Rata-Rata Capaian Akademik
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center">
                      {averageScore}
                    </td>
                    <td colSpan={2} className="border border-black px-2.5 py-1.5">
                      Status Ketuntasan:{' '}
                      <span>
                        {allPassed
                          ? 'Seluruh mata pelajaran ternilai telah memenuhi KKTP'
                          : 'Memerlukan penguatan pada beberapa mata pelajaran'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Ketidakhadiran & Catatan Wali Kelas */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-5">
                <h4 className="font-bold text-[12pt] uppercase text-black mb-2">
                  B. Rekapitulasi Kehadiran
                </h4>
                <table className="w-full border-collapse border border-black text-[11pt] leading-[1.35]">
                  <tbody>
                    <tr>
                      <td className="border border-black px-2.5 py-1.5 bg-slate-50">
                        Hadir Mengikuti Tutorial
                      </td>
                      <td className="border border-black px-2.5 py-1.5 text-right font-bold w-20">
                        {attendance.hadir} kali
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2.5 py-1.5 bg-slate-50">Sakit</td>
                      <td className="border border-black px-2.5 py-1.5 text-right font-bold">
                        {attendance.sakit} hari
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2.5 py-1.5 bg-slate-50">Izin</td>
                      <td className="border border-black px-2.5 py-1.5 text-right font-bold">
                        {attendance.izin} hari
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2.5 py-1.5 bg-slate-50">
                        Tanpa Keterangan (Alpa)
                      </td>
                      <td className="border border-black px-2.5 py-1.5 text-right font-bold">
                        {attendance.alpa} hari
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="sm:col-span-7 flex flex-col">
                <h4 className="font-bold text-[12pt] uppercase text-black mb-2">
                  C. Catatan Wali Kelas &amp; Pembinaan
                </h4>
                <div className="flex-1 border border-black p-3 text-[11.5pt] leading-[1.45] text-justify">
                  {homeroomNoteDraft || existingHomeroomNote}
                </div>
              </div>
            </div>
          </div>
        </A4DocumentSheet>
      </div>
    </div>
  );
};
