import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExamPackage, ExamPaketVariant, ExamQuestion, SchoolSettings } from '../types/siakad';
import {
  EXAM_TYPE_LABELS,
  formatAnswerKeyText,
  getDeterministicShuffledRights,
  QUESTION_SHAPE_LABELS,
} from './examUtils';
import {
  addPageNumbersFooter,
  drawOfficialSignatureBlock,
  drawPkbmDocumentTitle,
  drawPkbmKopSuratHeader,
  loadPkbmPdfAssets,
  PdfKopSuratAssets,
} from './pdfKopSuratUtils';

export type ExamPdfMode =
  | 'kisi_kisi'
  | 'naskah_soal'
  | 'kunci_jawaban'
  | 'pedoman_penskoran'
  | 'semua';

export interface GenerateExamPdfParams {
  schoolSettings: SchoolSettings;
  exam: ExamPackage;
  variant: ExamPaketVariant;
  questions: ExamQuestion[];
  mode: ExamPdfMode;
  teacherNip?: string;
}

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export {
  addPageNumbersFooter,
  drawOfficialSignatureBlock,
  drawPkbmKopSuratHeader as drawPkbmLetterhead,
  extractCityFromAddress,
  loadImageForPdf,
} from './pdfKopSuratUtils';

function renderExamMetadataAndIdentity(
  doc: JsPdfWithAutoTable,
  exam: ExamPackage,
  variant: ExamPaketVariant,
  questions: ExamQuestion[],
  tab: Exclude<ExamPdfMode, 'semua'>,
  startY: number,
  marginX: number
): number {
  const totalMaxScore = questions.reduce((sum, q) => sum + (q.maxScore || 2), 0);

  if (tab === 'naskah_soal') {
    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 10,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 'auto' },
      },
      body: [
        [
          `Mata Pelajaran : ${exam.mapel}`,
          `Program / Rombel : ${exam.kelas}`,
        ],
        [
          `Tahun Ajaran   : ${exam.academicYear} (${exam.semester})`,
          `Alokasi Waktu    : ${exam.durationMinutes} Menit (Paket ${variant})`,
        ],
      ],
    });

    const afterMetaY = (doc.lastAutoTable?.finalY ?? startY + 14) + 2.5;

    autoTable(doc, {
      startY: afterMetaY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 10,
        cellPadding: { top: 2.3, right: 3, bottom: 2.3, left: 3 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      body: [
        [
          'Nama Lengkap Siswa : ...................................................',
          'NIS / NISN : ........................................',
        ],
        [
          'Hari / Tanggal     : ...................................................',
          'Nilai / Paraf Tutor : ..............................',
        ],
      ],
    });

    const afterIdY = (doc.lastAutoTable?.finalY ?? afterMetaY + 14) + 4.5;
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const instrLines = doc.splitTextToSize(
      'Petunjuk: Berdoalah sebelum mengerjakan. Baca setiap stimulus dan soal dengan saksama, lalu kerjakan secara jujur dan mandiri.',
      doc.internal.pageSize.getWidth() - marginX * 2
    );
    doc.text(instrLines, marginX, afterIdY);
    const ruleY = afterIdY + instrLines.length * 4.2 + 1;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(marginX, ruleY, doc.internal.pageSize.getWidth() - marginX, ruleY);
    return ruleY + 5.5;
  }

  autoTable(doc, {
    startY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: 10,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    body: [
      [`Mata Pelajaran : ${exam.mapel}`, `Program / Rombel : ${exam.kelas}`],
      [
        `Materi Pokok   : ${exam.materi}`,
        `Jumlah Soal / Skor : ${questions.length} Butir (${totalMaxScore} Poin)`,
      ],
    ],
  });

  return (doc.lastAutoTable?.finalY ?? startY + 14) + 5;
}

function renderNaskahSoalContent(
  doc: JsPdfWithAutoTable,
  questions: ExamQuestion[],
  startY: number,
  marginX: number
): number {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 20;

  let cursorY = startY;

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > bottomLimit) {
      doc.addPage();
      cursorY = 18;
    }
  };

  questions.forEach((q, idx) => {
    const numText = `${idx + 1}.`;
    const bodyX = marginX + 7.5;
    const bodyW = contentWidth - 7.5;

    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    const promptPrefix = `[${QUESTION_SHAPE_LABELS[q.type]}] `;
    const promptLines = doc.splitTextToSize(`${promptPrefix}${q.prompt}`, bodyW);
    const promptHeight = Math.max(1, promptLines.length) * 4.8;

    // Estimasi tinggi minimum agar nomor soal + teks awal + opsi pertama tidak terpotong aneh
    const estimatedBlockHeader = promptHeight + (q.type === 'URAIAN' ? 22 : 14);
    ensureSpace(Math.min(estimatedBlockHeader, 52));

    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(numText, marginX, cursorY);

    doc.setFont('times', 'normal');
    doc.text(promptLines, bodyX, cursorY);
    cursorY += promptHeight + 1.4;

    if ((q.type === 'PG' || q.type === 'PG_KOMPLEKS') && q.options && q.options.length > 0) {
      const optX = bodyX + 2;
      const optTextX = optX + (q.type === 'PG_KOMPLEKS' ? 8.5 : 6);
      const optW = pageWidth - marginX - optTextX;

      q.options.forEach((opt, oIdx) => {
        const cleanOpt = String(opt || '').replace(/^[A-Ea-e][.)]\s+/, '');
        const optLines = doc.splitTextToSize(cleanOpt, optW);
        const optH = Math.max(1, optLines.length) * 4.6;
        ensureSpace(optH + 1.5);

        doc.setFont('times', 'bold');
        doc.setFontSize(10.8);
        doc.text(q.type === 'PG_KOMPLEKS' ? '[  ]' : `${letters[oIdx] || oIdx + 1}.`, optX, cursorY);

        doc.setFont('times', 'normal');
        doc.text(optLines, optTextX, cursorY);
        cursorY += optH + 1;
      });
    } else if (q.type === 'BENAR_SALAH') {
      ensureSpace(7);
      doc.setFont('times', 'normal');
      doc.setFontSize(10.8);
      doc.text('[   ] Benar          [   ] Salah', bodyX + 2, cursorY + 1);
      cursorY += 6.5;
    } else if (q.type === 'MENJODOHKAN' && q.matchingPairs && q.matchingPairs.length > 0) {
      const shuffledRights = getDeterministicShuffledRights(q.id, q.matchingPairs);
      ensureSpace(Math.min(48, 12 + q.matchingPairs.length * 8));
      autoTable(doc, {
        startY: cursorY,
        margin: { left: bodyX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 10,
          cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        head: [['Premis / Pernyataan', 'Pasangan Jawaban']],
        body: q.matchingPairs.map((pair, pIdx) => [
          `${pIdx + 1}. ${pair.left}`,
          `${letters[pIdx] || pIdx + 1}. ${shuffledRights[pIdx] || ''}`,
        ]),
      });
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 24) + 3.5;
    } else if (q.type === 'ISIAN') {
      ensureSpace(8);
      doc.setFont('times', 'normal');
      doc.setFontSize(10.8);
      doc.text(
        'Jawaban: ..........................................................................................................',
        bodyX + 2,
        cursorY + 1.5
      );
      cursorY += 7.5;
    } else if (q.type === 'URAIAN') {
      ensureSpace(24);
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.25);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.rect(bodyX + 1, cursorY, bodyW - 1, 20);
      doc.setLineDashPattern([], 0);
      cursorY += 23.5;
    }

    cursorY += 3.2;
  });

  return cursorY;
}

function renderTabSection(
  doc: JsPdfWithAutoTable,
  schoolSettings: SchoolSettings,
  exam: ExamPackage,
  variant: ExamPaketVariant,
  questions: ExamQuestion[],
  tab: Exclude<ExamPdfMode, 'semua'>,
  assets: PdfKopSuratAssets,
  teacherNip?: string
): void {
  const marginX = 16;
  const totalMaxScore = questions.reduce((sum, q) => sum + (q.maxScore || 2), 0);

  const tabHeadingMap: Record<Exclude<ExamPdfMode, 'semua'>, string> = {
    kisi_kisi: `KISI-KISI PENULISAN SOAL ${exam.examType} — PAKET ${variant}`,
    naskah_soal: `${EXAM_TYPE_LABELS[exam.examType] || exam.examType} — PAKET ${variant}`,
    kunci_jawaban: `KUNCI JAWABAN & PEMBAHASAN ${exam.examType} — PAKET ${variant}`,
    pedoman_penskoran: `PEDOMAN PENSKORAN & RUBRIK PENILAIAN — PAKET ${variant}`,
  };

  let cursorY = drawPkbmKopSuratHeader(doc, schoolSettings, assets, { marginX });
  cursorY = drawPkbmDocumentTitle(doc, tabHeadingMap[tab], {
    startY: cursorY,
    documentNumber: `UJN/${exam.examType}/${exam.academicYear}/PKT-${variant}`,
    marginX,
  });
  cursorY = renderExamMetadataAndIdentity(doc, exam, variant, questions, tab, cursorY, marginX);

  if (tab === 'naskah_soal') {
    cursorY = renderNaskahSoalContent(doc, questions, cursorY, marginX);
  } else if (tab === 'kisi_kisi') {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, bottom: 18 },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 9.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        valign: 'top',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
        1: { cellWidth: 42 },
        2: { cellWidth: 30 },
        3: { cellWidth: 56 },
        4: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
        5: { cellWidth: 24 },
      },
      head: [['No', 'Kompetensi / TP', 'Materi', 'Indikator Soal', 'Level', 'Bentuk']],
      body: questions.map((q, idx) => [
        String(idx + 1),
        q.competency,
        q.materi,
        q.indicator,
        q.level,
        QUESTION_SHAPE_LABELS[q.type],
      ]),
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 40) + 8;
  } else if (tab === 'kunci_jawaban') {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, bottom: 18 },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 9.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        valign: 'top',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
        1: { cellWidth: 28 },
        2: { cellWidth: 62, fontStyle: 'bold' },
        3: { cellWidth: 78 },
      },
      head: [['No', 'Bentuk Soal', 'Kunci Jawaban', 'Pembahasan Ringkas']],
      body: questions.map((q, idx) => [
        String(idx + 1),
        QUESTION_SHAPE_LABELS[q.type],
        formatAnswerKeyText(q),
        q.explanation || '-',
      ]),
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 40) + 8;
  } else if (tab === 'pedoman_penskoran') {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, bottom: 18 },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 9.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        valign: 'top',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
        1: { cellWidth: 26 },
        2: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
        3: { cellWidth: 106 },
        4: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
      },
      head: [['No', 'Bentuk', 'Level', 'Kriteria / Rubrik Penskoran', 'Skor Maks']],
      body: questions.map((q, idx) => [
        String(idx + 1),
        QUESTION_SHAPE_LABELS[q.type],
        q.level,
        q.scoringRubric,
        String(q.maxScore || 2),
      ]),
      foot: [['', '', '', 'Total Skor Maksimal', String(totalMaxScore)]],
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 40) + 5;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - marginX * 2;
    if (cursorY + 18 > doc.internal.pageSize.getHeight() - 18) {
      doc.addPage();
      cursorY = 18;
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(marginX, cursorY, contentWidth, 14);
    doc.setFont('times', 'bold');
    doc.setFontSize(10.5);
    doc.text('Rumus Nilai Akhir:', marginX + 3, cursorY + 5.2);
    doc.setFont('times', 'normal');
    doc.text(
      `Nilai Akhir = (Jumlah Skor Perolehan ÷ ${totalMaxScore}) × 100`,
      marginX + 3,
      cursorY + 10.6
    );
    cursorY += 20;
  }

  drawOfficialSignatureBlock(doc, schoolSettings, assets, {
    startY: cursorY + 2,
    marginX,
    showTeacherSignature: true,
    teacherLabel: 'Guru / Tutor Penyusun Soal',
    teacherName: exam.authorName,
    teacherNip,
  });
}

export async function generateExamPdf({
  schoolSettings,
  exam,
  variant,
  questions,
  mode,
  teacherNip = '',
}: GenerateExamPdfParams): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const assets = await loadPkbmPdfAssets(schoolSettings);

  const tabsToRender: Array<Exclude<ExamPdfMode, 'semua'>> =
    mode === 'semua'
      ? ['naskah_soal', 'kisi_kisi', 'kunci_jawaban', 'pedoman_penskoran']
      : [mode];

  tabsToRender.forEach((tab, idx) => {
    if (idx > 0) {
      doc.addPage();
    }
    renderTabSection(doc, schoolSettings, exam, variant, questions, tab, assets, teacherNip);
  });

  const modeLabelMap: Record<ExamPdfMode, string> = {
    naskah_soal: 'Naskah_Soal',
    kisi_kisi: 'Kisi_Kisi',
    kunci_jawaban: 'Kunci_Jawaban',
    pedoman_penskoran: 'Pedoman_Penskoran',
    semua: 'Paket_Lengkap_4in1',
  };

  addPageNumbersFooter(
    doc,
    `${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'} · ${exam.title} (Paket ${variant})`
  );

  const safeTitle = (exam.title || `${exam.examType}_${exam.mapel}`)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  const fileName = `${safeTitle}_${modeLabelMap[mode]}_Paket_${variant}.pdf`;
  doc.save(fileName);
  return fileName;
}
