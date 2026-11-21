import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PaketType, SchoolSettings } from '../types/siakad';
import {
  addPageNumbersFooter,
  drawOfficialSignatureBlock,
  drawPkbmDocumentTitle,
  drawPkbmKopSuratHeader,
  loadPkbmPdfAssets,
} from './pdfKopSuratUtils';

export interface PdfPaketSummaryRow {
  paket: PaketType;
  setara: string;
  rombelCount: number;
  male: number;
  female: number;
  active: number;
  nonActive: number;
  total: number;
  percentage: number;
  rgb: [number, number, number];
}

export interface PdfRombelRow {
  paket: PaketType;
  className: string;
  homeroomTeacherName: string;
  male: number;
  female: number;
  active: number;
  nonActive: number;
  total: number;
  capacity: number;
}

export interface GenerateStudentPaketRecapPdfParams {
  schoolSettings: SchoolSettings;
  paketSummaries: PdfPaketSummaryRow[];
  rombelRows: PdfRombelRow[];
  activeFilter: 'Semua' | PaketType;
  totals: {
    grandTotal: number;
    totalMale: number;
    totalFemale: number;
    totalActive: number;
    totalNonActive: number;
    totalRombels: number;
  };
}

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function formatPct(value: number): string {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export async function generateStudentPaketRecapPdf({
  schoolSettings,
  paketSummaries,
  rombelRows,
  activeFilter,
  totals,
}: GenerateStudentPaketRecapPdfParams): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;

  const assets = await loadPkbmPdfAssets(schoolSettings);

  const now = new Date();
  const dateLongId = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const dateTimeId = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  // =========================================================
  // 1. KOP SURAT RESMI PKBM (Konsisten & Mendukung Logo/Kop Kustom)
  // =========================================================
  let cursorY = drawPkbmKopSuratHeader(doc, schoolSettings, assets, { marginX });

  // =========================================================
  // 2. JUDUL LAPORAN & RINGKASAN EKSEKUTIF
  // =========================================================
  cursorY = drawPkbmDocumentTitle(doc, 'LAPORAN REKAPITULASI DATA WARGA BELAJAR', {
    startY: cursorY,
    subtitle: 'Distribusi Peserta Didik Berdasarkan Jenjang Paket A, Paket B, dan Paket C',
    marginX,
  });
  cursorY -= 3;

  // Kotak Metadata Ringkas
  cursorY += 5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, cursorY, contentWidth, 16, 1.8, 1.8, 'FD');

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Tahun Ajaran`, marginX + 4, cursorY + 5.8);
  doc.text(`: ${schoolSettings.academicYear} (Semester ${schoolSettings.semester})`, marginX + 28, cursorY + 5.8);

  doc.text(`Tanggal Cetak`, marginX + 4, cursorY + 11.8);
  doc.text(`: ${dateLongId}`, marginX + 28, cursorY + 11.8);

  const rightColX = marginX + contentWidth / 2 + 4;
  doc.text(`Total Warga Belajar`, rightColX, cursorY + 5.8);
  doc.setFont('times', 'bold');
  doc.setTextColor(6, 95, 70);
  doc.text(
    `: ${totals.grandTotal} Siswa (${totals.totalActive} Aktif)`,
    rightColX + 34,
    cursorY + 5.8
  );

  doc.setFont('times', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Komposisi / Rombel`, rightColX, cursorY + 11.8);
  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `: L: ${totals.totalMale} / P: ${totals.totalFemale}  ·  ${totals.totalRombels} Rombel`,
    rightColX + 34,
    cursorY + 11.8
  );

  // =========================================================
  // 3. BAGIAN I: TABEL REKAPITULASI PER JENJANG (PAKET A, B, C)
  // =========================================================
  cursorY += 23;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('I. Ringkasan Distribusi Siswa per Jenjang (Paket A, B, C)', marginX, cursorY);

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9.5,
      cellPadding: { top: 2.6, right: 3, bottom: 2.6, left: 3 },
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [6, 95, 70],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [236, 253, 245],
      textColor: [6, 78, 59],
      fontStyle: 'bold',
      lineColor: [6, 95, 70],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 24 },
      2: { halign: 'left', cellWidth: 34 },
      3: { halign: 'right', cellWidth: 17 },
      4: { halign: 'right', cellWidth: 13 },
      5: { halign: 'right', cellWidth: 13 },
      6: { halign: 'right', cellWidth: 16 },
      7: { halign: 'right', cellWidth: 17 },
      8: { halign: 'right', fontStyle: 'bold', cellWidth: 16 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 18 },
    },
    head: [
      [
        'No',
        'Jenjang',
        'Kesetaraan',
        'Rombel',
        'L',
        'P',
        'Aktif',
        'Lainnya',
        'Total',
        'Porsi (%)',
      ],
    ],
    body: paketSummaries.map((s, idx) => [
      String(idx + 1),
      s.paket,
      s.setara,
      String(s.rombelCount),
      String(s.male),
      String(s.female),
      String(s.active),
      String(s.nonActive),
      String(s.total),
      `${formatPct(s.percentage)}%`,
    ]),
    foot: [
      [
        '',
        'TOTAL',
        'Seluruh Jenjang PKBM',
        String(totals.totalRombels),
        String(totals.totalMale),
        String(totals.totalFemale),
        String(totals.totalActive),
        String(totals.totalNonActive),
        String(totals.grandTotal),
        totals.grandTotal > 0 ? '100,0%' : '0,0%',
      ],
    ],
  });

  // =========================================================
  // 4. VISUALISASI BILAH PROPORSI PAKET A, B, C
  // =========================================================
  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 34) + 5;
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Proporsi Visual Distribusi Siswa per Jenjang:', marginX, cursorY);

  const barY = cursorY + 2.5;
  const barHeight = 5.5;
  doc.setFillColor(226, 232, 240);
  doc.rect(marginX, barY, contentWidth, barHeight, 'F');

  let segX = marginX;
  if (totals.grandTotal > 0) {
    paketSummaries.forEach((s, idx) => {
      if (s.total <= 0) return;
      const isLastNonZero = paketSummaries
        .slice(idx + 1)
        .every((next) => next.total <= 0);
      const rawWidth = (s.total / totals.grandTotal) * contentWidth;
      const segW = isLastNonZero ? Math.max(0.5, marginX + contentWidth - segX) : Math.max(1.5, rawWidth);
      doc.setFillColor(s.rgb[0], s.rgb[1], s.rgb[2]);
      doc.rect(segX, barY, segW, barHeight, 'F');
      segX += segW;
    });
  }

  // Legenda bilah proporsi
  const legendY = barY + barHeight + 4.5;
  let legendX = marginX;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  paketSummaries.forEach((s) => {
    doc.setFillColor(s.rgb[0], s.rgb[1], s.rgb[2]);
    doc.rect(legendX, legendY - 2.6, 3, 3, 'F');
    const label = `${s.paket}: ${s.total} siswa (${formatPct(s.percentage)}%)`;
    doc.setTextColor(30, 41, 59);
    doc.text(label, legendX + 4.5, legendY);
    legendX += doc.getTextWidth(label) + 11;
  });

  // =========================================================
  // 5. BAGIAN II: TABEL RINCIAN PER ROMBEL
  // =========================================================
  cursorY = legendY + 8;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const scopeLabel =
    activeFilter === 'Semua'
      ? 'Seluruh Jenjang Paket A, B, dan C'
      : `Filter Jenjang ${activeFilter}`;
  doc.text(`II. Rincian Distribusi Siswa per Rombel (${scopeLabel})`, marginX, cursorY);

  const filteredRombelTotals = rombelRows.reduce(
    (acc, r) => ({
      male: acc.male + r.male,
      female: acc.female + r.female,
      active: acc.active + r.active,
      total: acc.total + r.total,
      capacity: acc.capacity + r.capacity,
    }),
    { male: 0, female: 0, active: 0, total: 0, capacity: 0 }
  );

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 9,
      cellPadding: { top: 2.3, right: 2.5, bottom: 2.3, left: 2.5 },
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [6, 95, 70],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [236, 253, 245],
      textColor: [6, 78, 59],
      fontStyle: 'bold',
      lineColor: [6, 95, 70],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: 50 },
      3: { halign: 'left', cellWidth: 33 },
      4: { halign: 'right', cellWidth: 10 },
      5: { halign: 'right', cellWidth: 10 },
      6: { halign: 'right', cellWidth: 13 },
      7: { halign: 'right', fontStyle: 'bold', cellWidth: 19 },
      8: { halign: 'right', cellWidth: 16 },
    },
    head: [
      [
        'No',
        'Jenjang',
        'Nama Rombel',
        'Wali Kelas',
        'L',
        'P',
        'Aktif',
        'Total / Kap.',
        'Porsi (%)',
      ],
    ],
    body: rombelRows.map((row, idx) => {
      const share = totals.grandTotal > 0 ? (row.total / totals.grandTotal) * 100 : 0;
      return [
        String(idx + 1),
        row.paket,
        row.className,
        row.homeroomTeacherName || '-',
        String(row.male),
        String(row.female),
        String(row.active),
        `${row.total} / ${row.capacity}`,
        `${formatPct(share)}%`,
      ];
    }),
    foot: [
      [
        '',
        'TOTAL',
        `${rombelRows.length} Rombel (${activeFilter === 'Semua' ? 'Semua Paket' : activeFilter})`,
        '',
        String(filteredRombelTotals.male),
        String(filteredRombelTotals.female),
        String(filteredRombelTotals.active),
        `${filteredRombelTotals.total} / ${filteredRombelTotals.capacity}`,
        `${formatPct(
          totals.grandTotal > 0 ? (filteredRombelTotals.total / totals.grandTotal) * 100 : 0
        )}%`,
      ],
    ],
  });

  // =========================================================
  // 6. BLOK TANDA TANGAN PENGESAHAN KEPALA PKBM & FOOTER
  // =========================================================
  const sigStartY = (doc.lastAutoTable?.finalY ?? 180) + 12;
  drawOfficialSignatureBlock(doc, schoolSettings, assets, {
    startY: sigStartY,
    marginX,
    showTeacherSignature: false,
    dateLabel: dateLongId,
  });

  addPageNumbersFooter(
    doc,
    `SIAKAD ${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'} · Dicetak pada ${dateTimeId}`,
    marginX
  );

  const safeYear = (schoolSettings.academicYear || '2026-2027').replace(/[/\\]/g, '-');
  const scopeSlug = activeFilter === 'Semua' ? 'Paket_ABC' : activeFilter.replace(/\s+/g, '_');
  const dateSlug = now.toISOString().slice(0, 10);
  const fileName = `Rekap_Siswa_${scopeSlug}_${safeYear}_${dateSlug}.pdf`;

  doc.save(fileName);
  return fileName;
}
