import React from 'react';
import { SchoolSettings } from '../../types/siakad';
import { A4DocumentSheet } from '../documents/A4DocumentPrinter';

export interface AttendanceRecapRow {
  studentId: string;
  studentNis: string;
  studentName: string;
  className: string;
  meetings: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  percentage: number;
  belowThreshold: boolean;
}

interface AttendancePrintSheetProps {
  schoolSettings: SchoolSettings;
  recapScope: 'Bulanan' | 'Semester';
  periodLabel: string;
  classLabel: string;
  subjectLabel: string;
  teacherName: string;
  totalSessions: number;
  minThreshold: number;
  rows: AttendanceRecapRow[];
}

export const AttendancePrintSheet: React.FC<AttendancePrintSheetProps> = ({
  schoolSettings,
  recapScope,
  periodLabel,
  classLabel,
  subjectLabel,
  teacherName,
  totalSessions,
  minThreshold,
  rows,
}) => {
  const totalHadir = rows.reduce((acc, r) => acc + r.hadir, 0);
  const totalIzin = rows.reduce((acc, r) => acc + r.izin, 0);
  const totalSakit = rows.reduce((acc, r) => acc + r.sakit, 0);
  const totalAlpa = rows.reduce((acc, r) => acc + r.alpa, 0);
  const totalEntries = totalHadir + totalIzin + totalSakit + totalAlpa;
  const overallRate = totalEntries > 0 ? Math.round((totalHadir / totalEntries) * 1000) / 10 : 0;

  return (
    <A4DocumentSheet
      schoolSettings={schoolSettings}
      documentTitle={`REKAPITULASI PRESENSI WARGA BELAJAR (${recapScope.toUpperCase()})`}
      documentNumber={`421.9/PRES/${schoolSettings.semester.toUpperCase()}/${new Date().getFullYear()}`}
      showTeacherSignature
      teacherLabel="Tutor / Pengampu Mata Pelajaran"
      teacherName={teacherName || 'Reny Febriyani, S.Sos.'}
      teacherNip="—"
    >
      {/* Ringkasan Identitas Laporan */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-5 p-3 border border-black text-[11.5pt] leading-[1.4] text-black">
        <div className="flex justify-between gap-2">
          <span>Kelas / Rombel</span>
          <span className="font-bold">{classLabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Periode Rekap</span>
          <span className="font-bold">{periodLabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Mata Pelajaran</span>
          <span className="font-bold">{subjectLabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Tahun Ajaran / Semester</span>
          <span className="font-bold">
            {schoolSettings.academicYear} ({schoolSettings.semester})
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Jumlah Pertemuan Tercatat</span>
          <span className="font-bold">{totalSessions} Sesi</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Batas Minimal Kehadiran</span>
          <span className="font-bold">{minThreshold}%</span>
        </div>
      </div>

      {/* Tabel Rekap Presensi */}
      <table className="w-full border-collapse border border-black text-[10.5pt] leading-[1.35] text-black">
        <thead>
          <tr className="bg-slate-100 text-black">
            <th className="border border-black px-2 py-2 text-center w-9 font-bold">No</th>
            <th className="border border-black px-2.5 py-2 text-left w-24 font-bold">NIS</th>
            <th className="border border-black px-2.5 py-2 text-left font-bold">Nama Warga Belajar</th>
            <th className="border border-black px-2 py-2 text-center w-12 font-bold">Sesi</th>
            <th className="border border-black px-2 py-2 text-center w-10 font-bold">H</th>
            <th className="border border-black px-2 py-2 text-center w-10 font-bold">I</th>
            <th className="border border-black px-2 py-2 text-center w-10 font-bold">S</th>
            <th className="border border-black px-2 py-2 text-center w-10 font-bold">A</th>
            <th className="border border-black px-2 py-2 text-center w-16 font-bold">% Hadir</th>
            <th className="border border-black px-2.5 py-2 text-center w-28 font-bold">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="border border-black px-3 py-6 text-center italic">
                Belum ada data presensi pada periode dan filter yang dipilih.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.studentId}>
                <td className="border border-black px-2 py-1.5 text-center">{index + 1}</td>
                <td className="border border-black px-2.5 py-1.5">{row.studentNis}</td>
                <td className="border border-black px-2.5 py-1.5 font-bold">
                  {row.studentName}
                </td>
                <td className="border border-black px-2 py-1.5 text-center">{row.meetings}</td>
                <td className="border border-black px-2 py-1.5 text-center font-bold">{row.hadir}</td>
                <td className="border border-black px-2 py-1.5 text-center">{row.izin}</td>
                <td className="border border-black px-2 py-1.5 text-center">{row.sakit}</td>
                <td className="border border-black px-2 py-1.5 text-center font-bold">{row.alpa}</td>
                <td className="border border-black px-2 py-1.5 text-center font-bold">
                  {row.percentage}%
                </td>
                <td className="border border-black px-2 py-1.5 text-center">
                  {row.belowThreshold ? (
                    <span className="font-bold">Di Bawah {minThreshold}%</span>
                  ) : (
                    <span>Memenuhi</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td colSpan={4} className="border border-black px-2.5 py-2 text-right">
                Total Akumulasi Kehadiran
              </td>
              <td className="border border-black px-2 py-2 text-center">{totalHadir}</td>
              <td className="border border-black px-2 py-2 text-center">{totalIzin}</td>
              <td className="border border-black px-2 py-2 text-center">{totalSakit}</td>
              <td className="border border-black px-2 py-2 text-center">{totalAlpa}</td>
              <td className="border border-black px-2 py-2 text-center">{overallRate}%</td>
              <td className="border border-black px-2 py-2 text-center">
                {rows.filter((r) => r.belowThreshold).length} Pembinaan
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* Catatan Kaki Resmi */}
      <div className="mt-4 text-[11pt] text-black leading-[1.45] text-justify">
        <p className="!text-[11pt] !leading-[1.45]">
          <strong>Keterangan:</strong> H = Hadir, I = Izin, S = Sakit, A = Alpa (Tanpa Keterangan).
          Warga belajar dengan persentase kehadiran di bawah <strong>{minThreshold}%</strong> direkomendasikan
          mendapat pembinaan atau tugas remedial tutorial sesuai tata tertib {schoolSettings.schoolName}.
        </p>
      </div>
    </A4DocumentSheet>
  );
};
