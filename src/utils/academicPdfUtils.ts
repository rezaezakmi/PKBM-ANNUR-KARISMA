import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Classroom,
  GradeRecord,
  SchoolSettings,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from '../types/siakad';
import { AttendanceRecapRow } from '../components/presensi/AttendancePrintSheet';
import {
  addPageNumbersFooter,
  drawOfficialSignatureBlock,
  drawPkbmDocumentTitle,
  drawPkbmKopSuratHeader,
  loadPkbmPdfAssets,
} from './pdfKopSuratUtils';

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function sanitizeFileSlug(raw: string): string {
  return (raw || 'Dokumen')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

// =====================================================================
// 1. DOKUMEN ADMINISTRASI RESMI (Surat Aktif, Biodata, Daftar Rombel, Surat Tugas)
// =====================================================================
export type AdminPdfTemplateId =
  | 'surat_aktif'
  | 'daftar_rombel'
  | 'surat_tugas'
  | 'biodata_murid';

export interface GenerateAdminDocumentPdfParams {
  templateId: AdminPdfTemplateId;
  documentTitle: string;
  documentNumber: string;
  city: string;
  schoolSettings: SchoolSettings;
  activeStudent?: Student;
  activeClass?: Classroom;
  studentsInActiveClass?: Student[];
  activeTeacher?: Teacher;
  assignmentsForTeacher?: TeachingAssignment[];
  showTeacherSignature?: boolean;
  teacherLabel?: string;
  teacherName?: string;
  teacherNip?: string;
}

export async function generateAdminDocumentPdf({
  templateId,
  documentTitle,
  documentNumber,
  city,
  schoolSettings,
  activeStudent,
  activeClass,
  studentsInActiveClass = [],
  activeTeacher,
  assignmentsForTeacher = [],
  showTeacherSignature = false,
  teacherLabel = 'Wali Kelas / Pembimbing',
  teacherName = '',
  teacherNip = '',
}: GenerateAdminDocumentPdfParams): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 20;
  const contentWidth = pageWidth - marginX * 2;
  const assets = await loadPkbmPdfAssets(schoolSettings);

  let cursorY = drawPkbmKopSuratHeader(doc, schoolSettings, assets, { marginX });
  cursorY = drawPkbmDocumentTitle(doc, documentTitle, {
    startY: cursorY,
    documentNumber,
    marginX,
  });

  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);

  if (templateId === 'surat_aktif' && activeStudent) {
    const openingText = `Yang bertanda tangan di bawah ini, Kepala ${schoolSettings.schoolName} (NPSN ${schoolSettings.npsn}), menerangkan dengan sesungguhnya bahwa:`;
    const openingLines = doc.splitTextToSize(`        ${openingText}`, contentWidth);
    doc.text(openingLines, marginX, cursorY);
    cursorY += openingLines.length * 6 + 3;

    const infoRows: Array<[string, string]> = [
      ['Nama Lengkap', activeStudent.fullName],
      ['NIS / NISN', `${activeStudent.nis} / ${activeStudent.nisn || '-'}`],
      ['Jenis Kelamin', activeStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
      ['Program Kesetaraan', activeStudent.paket],
      ['Kelas / Rombel', activeStudent.className || '-'],
      ['Nama Orang Tua / Wali', activeStudent.guardianName || '-'],
      ['Alamat', activeStudent.address || '-'],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX + 4, right: marginX },
      theme: 'plain',
      styles: {
        font: 'times',
        fontSize: 12,
        textColor: [0, 0, 0],
        cellPadding: { top: 1.4, bottom: 1.4, left: 1, right: 1 },
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 5, halign: 'center' },
        2: { cellWidth: contentWidth - 57 },
      },
      body: infoRows.map(([label, val], idx) => [
        label,
        ':',
        {
          content: val,
          styles: idx === 0 || idx === 3 ? { fontStyle: 'bold' } : {},
        },
      ]),
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 42) + 6;

    const body1 = `        Adalah benar tercatat sebagai Warga Belajar berstatus ${activeStudent.status} pada ${schoolSettings.schoolName} Tahun Ajaran ${schoolSettings.academicYear} Semester ${schoolSettings.semester}.`;
    const body1Lines = doc.splitTextToSize(body1, contentWidth);
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.text(body1Lines, marginX, cursorY);
    cursorY += body1Lines.length * 6 + 4;

    const body2 =
      '        Demikian surat keterangan ini dibuat dengan sebenarnya agar dapat dipergunakan sebagaimana mestinya.';
    const body2Lines = doc.splitTextToSize(body2, contentWidth);
    doc.text(body2Lines, marginX, cursorY);
    cursorY += body2Lines.length * 6 + 6;
  } else if (templateId === 'biodata_murid' && activeStudent) {
    doc.setFont('times', 'italic');
    doc.setFontSize(11.5);
    doc.text(
      `Data Pokok Warga Belajar Pendidikan Kesetaraan — Tahun Ajaran ${schoolSettings.academicYear}`,
      marginX,
      cursorY
    );
    cursorY += 5;

    const rows: Array<[string, string]> = [
      ['Nomor Induk Siswa (NIS)', activeStudent.nis],
      ['NISN', activeStudent.nisn || '-'],
      ['Nama Lengkap', activeStudent.fullName],
      ['Jenis Kelamin', activeStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
      ['Program Kesetaraan', activeStudent.paket],
      ['Rombongan Belajar', activeStudent.className || '-'],
      ['Email Terdaftar', activeStudent.email || '-'],
      ['Nomor Telepon', activeStudent.phone || '-'],
      ['Alamat Tempat Tinggal', activeStudent.address || '-'],
      ['Nama Orang Tua / Wali', activeStudent.guardianName || '-'],
      ['Status Kepesertaan', activeStudent.status],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 11.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 2.5,
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold', fillColor: [241, 245, 249] },
        1: { cellWidth: contentWidth - 62 },
      },
      body: rows,
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 80) + 8;
  } else if (templateId === 'daftar_rombel' && activeClass) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'plain',
      styles: {
        font: 'times',
        fontSize: 11.5,
        textColor: [0, 0, 0],
        cellPadding: { top: 1, bottom: 1, left: 0.5, right: 1 },
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 4 },
        2: { cellWidth: 56, fontStyle: 'bold' },
        3: { cellWidth: 28 },
        4: { cellWidth: 4 },
        5: { cellWidth: contentWidth - 120, fontStyle: 'bold' },
      },
      body: [
        ['Rombel', ':', activeClass.name, 'Program', ':', activeClass.paket],
        [
          'Wali Kelas',
          ':',
          activeClass.homeroomTeacherName || '-',
          'Tahun Ajaran',
          ':',
          `${schoolSettings.academicYear} (${schoolSettings.semester})`,
        ],
        ['Jumlah Murid', ':', `${studentsInActiveClass.length} Warga Belajar`, '', '', ''],
      ],
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 18) + 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 10.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 2.2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 64, fontStyle: 'bold' },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 24 },
        5: { cellWidth: contentWidth - 138, halign: 'center' },
      },
      head: [['No', 'NIS', 'Nama Lengkap', 'L/P', 'Status', 'Paraf']],
      body:
        studentsInActiveClass.length > 0
          ? studentsInActiveClass.map((st, idx) => [
              String(idx + 1),
              st.nis,
              st.fullName,
              st.gender,
              st.status,
              '',
            ])
          : [['', '', 'Belum ada murid terdaftar di rombel ini.', '', '', '']],
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 40) + 8;
  } else if (templateId === 'surat_tugas' && activeTeacher) {
    const intro = `        Kepala ${schoolSettings.schoolName} menugaskan kepada pendidik / tutor di bawah ini untuk melaksanakan kegiatan pembelajaran tutorial pada Tahun Ajaran ${schoolSettings.academicYear} Semester ${schoolSettings.semester}:`;
    const introLines = doc.splitTextToSize(intro, contentWidth);
    doc.text(introLines, marginX, cursorY);
    cursorY += introLines.length * 6 + 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX + 4, right: marginX },
      theme: 'plain',
      styles: {
        font: 'times',
        fontSize: 12,
        textColor: [0, 0, 0],
        cellPadding: { top: 1.2, bottom: 1.2, left: 1, right: 1 },
      },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 5, halign: 'center' },
        2: { cellWidth: contentWidth - 51 },
      },
      body: [
        ['Nama Tutor', ':', { content: activeTeacher.fullName, styles: { fontStyle: 'bold' } }],
        ['NIP / NUPTK', ':', activeTeacher.nip || '-'],
        ['Bidang Keahlian', ':', activeTeacher.specialization || '-'],
      ],
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 20) + 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 10.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 2.2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 54, fontStyle: 'bold' },
        2: { cellWidth: 54 },
        3: { cellWidth: contentWidth - 118 },
      },
      head: [['No', 'Mata Pelajaran', 'Kelas / Rombel', 'Jadwal']],
      body:
        assignmentsForTeacher.length > 0
          ? assignmentsForTeacher.map((asg, idx) => [
              String(idx + 1),
              asg.subjectName,
              asg.className,
              `${asg.scheduleDay}, ${asg.scheduleTime}`,
            ])
          : [['', 'Belum ada penugasan kelas untuk tutor ini.', '', '']],
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 32) + 6;

    const closing =
      '        Demikian surat tugas ini ditetapkan agar dilaksanakan dengan penuh tanggung jawab.';
    const closingLines = doc.splitTextToSize(closing, contentWidth);
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.text(closingLines, marginX, cursorY);
    cursorY += closingLines.length * 6 + 6;
  }

  drawOfficialSignatureBlock(doc, schoolSettings, assets, {
    startY: cursorY + 4,
    marginX,
    showTeacherSignature,
    teacherLabel,
    teacherName,
    teacherNip,
    city,
  });

  addPageNumbersFooter(
    doc,
    `${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'} · ${documentTitle}`,
    marginX
  );

  const fileName = `${sanitizeFileSlug(templateId)}_${sanitizeFileSlug(
    activeStudent?.fullName || activeClass?.name || activeTeacher?.fullName || schoolSettings.schoolName
  )}.pdf`;
  doc.save(fileName);
  return fileName;
}

// =====================================================================
// 2. RAPOR RESMI WARGA BELAJAR A4 (PDF)
// =====================================================================
export interface GenerateRaporPdfParams {
  schoolSettings: SchoolSettings;
  student: Student;
  semester: 'Ganjil' | 'Genap';
  reportNumber: string;
  city: string;
  teacherName: string;
  teacherNip?: string;
  subjectRows: Array<{
    subject: Subject;
    record?: GradeRecord;
    predicateShort?: string;
  }>;
  averageScore: number;
  allPassed: boolean;
  attendance: {
    hadir: number;
    sakit: number;
    izin: number;
    alpa: number;
  };
  homeroomNote: string;
}

export async function generateRaporPdf({
  schoolSettings,
  student,
  semester,
  reportNumber,
  city,
  teacherName,
  teacherNip,
  subjectRows,
  averageScore,
  allPassed,
  attendance,
  homeroomNote,
}: GenerateRaporPdfParams): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  const assets = await loadPkbmPdfAssets(schoolSettings);

  let cursorY = drawPkbmKopSuratHeader(doc, schoolSettings, assets, { marginX });
  cursorY = drawPkbmDocumentTitle(doc, 'LAPORAN HASIL BELAJAR WARGA BELAJAR (RAPOR)', {
    startY: cursorY,
    documentNumber: reportNumber,
    marginX,
  });

  // Kotak Identitas Warga Belajar
  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [40, 40, 40],
      lineWidth: 0.25,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 34, fillColor: [248, 250, 252] },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 34, fillColor: [248, 250, 252] },
      3: { cellWidth: contentWidth - 123, fontStyle: 'bold' },
    },
    body: [
      ['Nama Warga Belajar', student.fullName, 'Program Kesetaraan', student.paket],
      [
        'NIS / NISN',
        `${student.nis} / ${student.nisn || '-'}`,
        'Kelas / Rombel',
        student.className || '-',
      ],
      ['Tahun Ajaran', schoolSettings.academicYear, 'Semester', semester],
    ],
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 24) + 6;

  // Bagian A: Capaian Kompetensi Mata Pelajaran
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('A. CAPAIAN KOMPETENSI MATA PELAJARAN', marginX, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 2.2,
      valign: 'top',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: contentWidth - 94 },
    },
    head: [['No', 'Mata Pelajaran', 'KKTP', 'Nilai', 'Predikat', 'Deskripsi Capaian Kompetensi']],
    body: [
      ...subjectRows.map(({ subject, record, predicateShort }, idx) => [
        String(idx + 1),
        `${subject.name}\n(${subject.category})`,
        String(record?.kkm ?? subject.kkm),
        record ? String(record.finalScore) : '-',
        record ? `${record.predicate}${predicateShort ? `\n(${predicateShort})` : ''}` : '-',
        record?.achievementDescription ||
          'Nilai capaian mata pelajaran sedang dalam proses rekapitulasi tutor.',
      ]),
      [
        {
          content: 'Rata-Rata Capaian Akademik',
          colSpan: 3,
          styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] },
        },
        {
          content: String(averageScore),
          styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] },
        },
        {
          content: `Status Ketuntasan: ${
            allPassed
              ? 'Seluruh mata pelajaran ternilai telah memenuhi KKTP'
              : 'Memerlukan penguatan pada beberapa mata pelajaran'
          }`,
          colSpan: 2,
          styles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
        },
      ],
    ],
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 60) + 6;

  // Bagian B & C: Kehadiran + Catatan Wali Kelas
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + 42 > pageHeight - 20) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text('B. REKAPITULASI KEHADIRAN & C. CATATAN WALI KELAS', marginX, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 2.5,
      valign: 'top',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 46, fillColor: [248, 250, 252] },
      1: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: contentWidth - 70 },
    },
    head: [['Rekap Kehadiran', 'Jumlah', 'Catatan Wali Kelas & Pembinaan']],
    body: [
      [
        'Hadir Mengikuti Tutorial',
        `${attendance.hadir} kali`,
        {
          content: homeroomNote || '-',
          rowSpan: 4,
          styles: { valign: 'top' },
        },
      ],
      ['Sakit', `${attendance.sakit} hari`],
      ['Izin', `${attendance.izin} hari`],
      ['Tanpa Keterangan (Alpa)', `${attendance.alpa} hari`],
    ],
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 34) + 8;

  drawOfficialSignatureBlock(doc, schoolSettings, assets, {
    startY: cursorY,
    marginX,
    showTeacherSignature: true,
    teacherLabel: 'Wali Kelas / Pembimbing',
    teacherName,
    teacherNip,
    city,
  });

  addPageNumbersFooter(
    doc,
    `${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'} · Rapor ${student.fullName} · Semester ${semester} TA ${schoolSettings.academicYear}`,
    marginX
  );

  const safeYear = (schoolSettings.academicYear || '2026-2027').replace(/[/\\]/g, '-');
  const fileName = `Rapor_${sanitizeFileSlug(student.fullName)}_${semester}_${safeYear}.pdf`;
  doc.save(fileName);
  return fileName;
}

// =====================================================================
// 3. REKAPITULASI PRESENSI WARGA BELAJAR A4 (PDF)
// =====================================================================
export interface GenerateAttendanceRecapPdfParams {
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

export async function generateAttendanceRecapPdf({
  schoolSettings,
  recapScope,
  periodLabel,
  classLabel,
  subjectLabel,
  teacherName,
  totalSessions,
  minThreshold,
  rows,
}: GenerateAttendanceRecapPdfParams): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  const assets = await loadPkbmPdfAssets(schoolSettings);

  let cursorY = drawPkbmKopSuratHeader(doc, schoolSettings, assets, { marginX });
  cursorY = drawPkbmDocumentTitle(
    doc,
    `REKAPITULASI PRESENSI WARGA BELAJAR (${recapScope.toUpperCase()})`,
    {
      startY: cursorY,
      documentNumber: `421.9/PRES/${schoolSettings.semester.toUpperCase()}/${new Date().getFullYear()}`,
      marginX,
    }
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [40, 40, 40],
      lineWidth: 0.25,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 36, fillColor: [248, 250, 252] },
      1: { cellWidth: 53, fontStyle: 'bold' },
      2: { cellWidth: 38, fillColor: [248, 250, 252] },
      3: { cellWidth: contentWidth - 127, fontStyle: 'bold' },
    },
    body: [
      ['Kelas / Rombel', classLabel, 'Periode Rekap', periodLabel],
      [
        'Mata Pelajaran',
        subjectLabel,
        'Tahun Ajaran',
        `${schoolSettings.academicYear} (${schoolSettings.semester})`,
      ],
      ['Pertemuan Tercatat', `${totalSessions} Sesi`, 'Batas Minimal Hadir', `${minThreshold}%`],
    ],
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 24) + 5;

  const totalHadir = rows.reduce((acc, r) => acc + r.hadir, 0);
  const totalIzin = rows.reduce((acc, r) => acc + r.izin, 0);
  const totalSakit = rows.reduce((acc, r) => acc + r.sakit, 0);
  const totalAlpa = rows.reduce((acc, r) => acc + r.alpa, 0);
  const totalEntries = totalHadir + totalIzin + totalSakit + totalAlpa;
  const overallRate = totalEntries > 0 ? Math.round((totalHadir / totalEntries) * 1000) / 10 : 0;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 23 },
      2: { cellWidth: 50, fontStyle: 'bold' },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 10, halign: 'center' },
      6: { cellWidth: 10, halign: 'center' },
      7: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      8: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      9: { cellWidth: contentWidth - 149, halign: 'center' },
    },
    head: [['No', 'NIS', 'Nama Warga Belajar', 'Sesi', 'H', 'I', 'S', 'A', '% Hadir', 'Keterangan']],
    body:
      rows.length > 0
        ? rows.map((row, idx) => [
            String(idx + 1),
            row.studentNis,
            row.studentName,
            String(row.meetings),
            String(row.hadir),
            String(row.izin),
            String(row.sakit),
            String(row.alpa),
            `${row.percentage}%`,
            row.belowThreshold ? `Di Bawah ${minThreshold}%` : 'Memenuhi',
          ])
        : [['', '', 'Belum ada data presensi pada periode yang dipilih.', '', '', '', '', '', '', '']],
    foot:
      rows.length > 0
        ? [
            [
              { content: 'Total Akumulasi Kehadiran', colSpan: 4, styles: { halign: 'right' } },
              { content: String(totalHadir), styles: { halign: 'center' } },
              { content: String(totalIzin), styles: { halign: 'center' } },
              { content: String(totalSakit), styles: { halign: 'center' } },
              { content: String(totalAlpa), styles: { halign: 'center' } },
              { content: `${overallRate}%`, styles: { halign: 'center' } },
              {
                content: `${rows.filter((r) => r.belowThreshold).length} Pembinaan`,
                styles: { halign: 'center' },
              },
            ],
          ]
        : undefined,
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 45) + 5;

  doc.setFont('times', 'italic');
  doc.setFontSize(9.5);
  doc.setTextColor(35, 35, 35);
  const noteText = `Keterangan: H = Hadir, I = Izin, S = Sakit, A = Alpa. Warga belajar dengan persentase kehadiran di bawah ${minThreshold}% direkomendasikan mendapat pembinaan atau tugas remedial tutorial sesuai tata tertib ${schoolSettings.schoolName}.`;
  const noteLines = doc.splitTextToSize(noteText, contentWidth);
  doc.text(noteLines, marginX, cursorY);
  cursorY += noteLines.length * 4.5 + 6;

  drawOfficialSignatureBlock(doc, schoolSettings, assets, {
    startY: cursorY,
    marginX,
    showTeacherSignature: true,
    teacherLabel: 'Tutor / Pengampu Mata Pelajaran',
    teacherName: teacherName || 'Tutor PKBM',
  });

  addPageNumbersFooter(
    doc,
    `${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'} · Rekap Presensi ${recapScope} · ${classLabel}`,
    marginX
  );

  const fileName = `Rekap_Presensi_${recapScope}_${sanitizeFileSlug(classLabel)}.pdf`;
  doc.save(fileName);
  return fileName;
}
