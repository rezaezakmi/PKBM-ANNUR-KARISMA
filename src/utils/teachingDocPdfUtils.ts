import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SchoolSettings } from '../types/siakad';
import {
  addPageNumbersFooter,
  drawOfficialSignatureBlock,
  drawPkbmDocumentTitle,
  drawPkbmKopSuratHeader,
  loadPkbmPdfAssets,
} from './pdfKopSuratUtils';

export interface GenerateTeachingDocPdfParams {
  schoolSettings: SchoolSettings;
  documentTitle: string;
  documentNumber?: string;
  contentHtml: string;
  city?: string;
  teacherName?: string;
  teacherNip?: string;
  showTeacherSignature?: boolean;
}

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function cleanText(raw?: string | null): string {
  return (raw || '').replace(/\s+/g, ' ').trim();
}

export async function generateTeachingDocPdf({
  schoolSettings,
  documentTitle,
  documentNumber,
  contentHtml,
  city,
  teacherName,
  teacherNip,
  showTeacherSignature = true,
}: GenerateTeachingDocPdfParams): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 20;

  const assets = await loadPkbmPdfAssets(schoolSettings);

  let cursorY = drawPkbmKopSuratHeader(doc, schoolSettings, assets, { marginX });
  cursorY = drawPkbmDocumentTitle(doc, documentTitle || 'PERANGKAT AJAR', {
    startY: cursorY,
    documentNumber,
    marginX,
  });

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > bottomLimit) {
      doc.addPage();
      cursorY = 18;
    }
  };

  const renderLines = (
    text: string,
    opts: {
      fontStyle?: 'normal' | 'bold' | 'italic';
      fontSize?: number;
      indent?: number;
      lineHeight?: number;
      spaceAfter?: number;
      bulletPrefix?: string;
    } = {}
  ) => {
    const clean = cleanText(text);
    if (!clean) return;
    const fontStyle = opts.fontStyle || 'normal';
    const fontSize = opts.fontSize || 11;
    const indent = opts.indent || 0;
    const lineHeight = opts.lineHeight || 5;
    const spaceAfter = opts.spaceAfter ?? 2;

    doc.setFont('times', fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);

    const prefixW = opts.bulletPrefix ? 6 : 0;
    const maxW = Math.max(40, contentWidth - indent - prefixW);
    const lines: string[] = doc.splitTextToSize(clean, maxW);

    lines.forEach((line, idx) => {
      ensureSpace(lineHeight + 1);
      if (idx === 0 && opts.bulletPrefix) {
        doc.setFont('times', 'bold');
        doc.text(opts.bulletPrefix, marginX + indent, cursorY);
        doc.setFont('times', fontStyle);
      }
      doc.text(line, marginX + indent + prefixW, cursorY);
      cursorY += lineHeight;
    });
    cursorY += spaceAfter;
  };

  const renderHtmlNode = (node: Element) => {
    const tag = node.tagName.toLowerCase();

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      ensureSpace(12);
      cursorY += 2;
      renderLines(node.textContent, {
        fontStyle: 'bold',
        fontSize: tag === 'h3' ? 11.5 : 12,
        lineHeight: 5.2,
        spaceAfter: 2.2,
      });
      return;
    }

    if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
      ensureSpace(9);
      renderLines(node.textContent, {
        fontStyle: 'bold',
        fontSize: 11,
        lineHeight: 5,
        spaceAfter: 1.5,
      });
      return;
    }

    if (tag === 'p') {
      renderLines(node.textContent, {
        fontStyle: 'normal',
        fontSize: 11,
        lineHeight: 5,
        spaceAfter: 2.2,
      });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.children).filter((c) => c.tagName.toLowerCase() === 'li');
      items.forEach((li, idx) => {
        const prefix = tag === 'ol' ? `${idx + 1}.` : '•';
        renderLines(li.textContent, {
          fontStyle: 'normal',
          fontSize: 10.8,
          indent: 3,
          lineHeight: 4.8,
          spaceAfter: 1.2,
          bulletPrefix: prefix,
        });
      });
      cursorY += 1.5;
      return;
    }

    if (tag === 'table') {
      const headRows: string[][] = [];
      const bodyRows: string[][] = [];

      const thead = node.querySelector('thead');
      if (thead) {
        thead.querySelectorAll('tr').forEach((tr) => {
          const cells = Array.from(tr.children).map((c) => cleanText(c.textContent));
          if (cells.length > 0) headRows.push(cells);
        });
      }

      const tbody = node.querySelector('tbody');
      const trSource = tbody ? tbody.querySelectorAll('tr') : node.querySelectorAll('tr');
      trSource.forEach((tr, rowIdx) => {
        if (!tbody && thead && tr.closest('thead')) return;
        const cells = Array.from(tr.children).map((c) => cleanText(c.textContent));
        if (cells.length === 0) return;
        if (headRows.length === 0 && rowIdx === 0 && tr.querySelector('th')) {
          headRows.push(cells);
        } else {
          bodyRows.push(cells);
        }
      });

      if (headRows.length > 0 || bodyRows.length > 0) {
        ensureSpace(16);
        autoTable(doc, {
          startY: cursorY,
          margin: { left: marginX, right: marginX, bottom: 18 },
          theme: 'grid',
          styles: {
            font: 'times',
            fontSize: 9.5,
            cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.25,
            valign: 'top',
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
          },
          ...(headRows.length > 0 ? { head: headRows } : {}),
          body: bodyRows,
        });
        cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 20) + 4.5;
      }
      return;
    }

    // Container elements (div, section, article, blockquote)
    const childElements = Array.from(node.children);
    if (childElements.length > 0) {
      childElements.forEach((child) => renderHtmlNode(child));
    } else if (cleanText(node.textContent)) {
      renderLines(node.textContent);
    }
  };

  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(`<div>${contentHtml}</div>`, 'text/html');
    const root = parsed.body.firstElementChild;
    if (root) {
      Array.from(root.children).forEach((child) => renderHtmlNode(child));
      if (root.children.length === 0 && cleanText(root.textContent)) {
        renderLines(root.textContent);
      }
    }
  } else {
    renderLines(contentHtml.replace(/<[^>]+>/g, ' '));
  }

  drawOfficialSignatureBlock(
    doc,
    schoolSettings,
    assets,
    {
      startY: cursorY + 6,
      marginX,
      showTeacherSignature,
      teacherLabel: 'Pendidik / Tutor Pengampu',
      teacherName,
      teacherNip,
      city,
    }
  );

  addPageNumbersFooter(
    doc,
    `${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'} · ${documentTitle}`,
    marginX
  );

  const safeSlug = (documentTitle || 'Perangkat_Ajar')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 65);
  const fileName = `${safeSlug}.pdf`;
  doc.save(fileName);
  return fileName;
}
