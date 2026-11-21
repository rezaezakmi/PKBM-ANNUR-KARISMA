import { jsPDF } from 'jspdf';
import { resolveSchoolLogo } from '../assets/branding';
import { SchoolSettings } from '../types/siakad';

export const PKBM_FOUNDATION_NAME = 'YAYASAN PENDIDIKAN MASYARAKAT ANNUR KARISMA';
export const PKBM_PROGRAM_SUBTITLE =
  'PROGRAM PENDIDIKAN KESETARAAN PAKET A (SD), PAKET B (SMP), DAN PAKET C (SMA)';

export interface PdfLoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfKopSuratAssets {
  letterheadImg: PdfLoadedImage | null;
  logoImg: PdfLoadedImage | null;
  headmasterSigImg: PdfLoadedImage | null;
  teacherSigImg: PdfLoadedImage | null;
  stampImg: PdfLoadedImage | null;
}

export async function loadImageForPdf(url?: string, maxDim = 960): Promise<PdfLoadedImage | null> {
  if (!url || !url.trim()) return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeoutId = window.setTimeout(() => resolve(null), 3000);

    img.onload = () => {
      window.clearTimeout(timeoutId);
      try {
        const natW = img.naturalWidth || 200;
        const natH = img.naturalHeight || 200;
        const scale = Math.min(1, maxDim / Math.max(natW, natH));
        const width = Math.max(1, Math.round(natW * scale));
        const height = Math.max(1, Math.round(natH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timeoutId);
      resolve(null);
    };

    img.src = url;
  });
}

export async function loadPkbmPdfAssets(
  schoolSettings: SchoolSettings
): Promise<PdfKopSuratAssets> {
  const resolvedLogoUrl = resolveSchoolLogo(schoolSettings.logoUrl);
  const [letterheadImg, logoImg, headmasterSigImg, teacherSigImg, stampImg] = await Promise.all([
    schoolSettings.letterheadUrl
      ? loadImageForPdf(schoolSettings.letterheadUrl, 1200)
      : Promise.resolve(null),
    loadImageForPdf(resolvedLogoUrl, 320),
    loadImageForPdf(schoolSettings.headmasterSignatureUrl, 400),
    loadImageForPdf(schoolSettings.teacherSignatureUrl, 400),
    loadImageForPdf(schoolSettings.stampUrl, 320),
  ]);

  return {
    letterheadImg,
    logoImg,
    headmasterSigImg,
    teacherSigImg,
    stampImg,
  };
}

export function extractCityFromAddress(address?: string): string {
  if (!address) return 'Cianjur';
  const lower = address.toLowerCase();
  if (lower.includes('cipanas')) return 'Cipanas';
  if (lower.includes('cianjur')) return 'Cianjur';
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[parts.length - 2].replace(/^(kab\.?|kabupaten|kota|kec\.?)\s+/i, '').trim() ||
      'Cianjur'
    );
  }
  return 'Cianjur';
}

export interface DrawPkbmKopSuratOptions {
  marginX?: number;
  topY?: number;
}

/**
 * Komponen Header Kop Surat Resmi PKBM yang konsisten untuk seluruh cetak/ekspor PDF jsPDF.
 * - Mendukung gambar Kop Surat kustom (`schoolSettings.letterheadUrl`) jika diunggah di Pengaturan Sekolah.
 * - Secara bawaan menampilkan Logo PKBM, Nama Yayasan, Nama Satuan Pendidikan, Program Kesetaraan,
 *   Alamat, NPSN, Kontak, serta garis ganda resmi standar Tata Naskah Dinas (Times New Roman).
 * @returns Posisi Y berikutnya (mm) untuk mulai menulis judul/isi dokumen.
 */
export function drawPkbmKopSuratHeader(
  doc: jsPDF,
  schoolSettings: SchoolSettings,
  assets: Pick<PdfKopSuratAssets, 'letterheadImg' | 'logoImg'>,
  options: DrawPkbmKopSuratOptions = {}
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = options.marginX ?? 16;
  const topY = options.topY ?? 12;
  const contentWidth = pageWidth - marginX * 2;

  // 1. Jika pengelola mengunggah gambar Kop Surat penuh, gunakan secara proporsional
  if (assets.letterheadImg) {
    const ratio = assets.letterheadImg.height / Math.max(1, assets.letterheadImg.width);
    const drawH = Math.min(34, Math.max(18, contentWidth * ratio));
    try {
      doc.addImage(assets.letterheadImg.dataUrl, 'PNG', marginX, topY, contentWidth, drawH);
      const lineY = topY + drawH + 2;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(marginX, lineY, pageWidth - marginX, lineY);
      doc.setLineWidth(0.25);
      doc.line(marginX, lineY + 1.2, pageWidth - marginX, lineY + 1.2);
      return lineY + 6.5;
    } catch {
      // Fallback ke Kop Surat standar PKBM jika gambar gagal dirender
    }
  }

  // 2. Kop Surat Resmi Standar PKBM (Times New Roman, Logo + Identitas Resmi + Garis Ganda)
  const hasLogo = Boolean(assets.logoImg);
  const logoSize = 21;
  const textCenterX = hasLogo ? pageWidth / 2 + 7.5 : pageWidth / 2;
  const maxTextW = hasLogo ? contentWidth - 26 : contentWidth;

  if (assets.logoImg) {
    try {
      doc.addImage(assets.logoImg.dataUrl, 'PNG', marginX, topY + 0.5, logoSize, logoSize);
    } catch {
      // Abaikan jika logo tidak dapat dirender
    }
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text(PKBM_FOUNDATION_NAME, textCenterX, topY + 4, { align: 'center' });

  doc.setFontSize(15);
  doc.text((schoolSettings.schoolName || 'PKBM ANNUR KARISMA').toUpperCase(), textCenterX, topY + 10, {
    align: 'center',
  });

  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.text(PKBM_PROGRAM_SUBTITLE, textCenterX, topY + 14.8, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  const addressLine = [
    schoolSettings.address || 'Jl. Pendidikan No. 1, Cianjur',
    schoolSettings.npsn ? `NPSN: ${schoolSettings.npsn}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  const wrappedAddress = doc.splitTextToSize(addressLine, maxTextW);
  doc.text(wrappedAddress, textCenterX, topY + 19, { align: 'center' });

  let cursorY = topY + 19 + Math.max(1, wrappedAddress.length) * 3.7;

  const contactLine = [
    schoolSettings.phone ? `Telp. ${schoolSettings.phone}` : '',
    schoolSettings.email ? `Email: ${schoolSettings.email}` : '',
    schoolSettings.website ? schoolSettings.website : '',
  ]
    .filter(Boolean)
    .join('  |  ');

  if (contactLine) {
    doc.setFontSize(8.5);
    doc.text(contactLine, textCenterX, cursorY, { align: 'center' });
    cursorY += 3.5;
  }

  const lineY = Math.max(cursorY + 0.5, topY + logoSize + 2.5);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(marginX, lineY, pageWidth - marginX, lineY);
  doc.setLineWidth(0.25);
  doc.line(marginX, lineY + 1.2, pageWidth - marginX, lineY + 1.2);

  return lineY + 6.5;
}

/**
 * Menggambar judul dokumen resmi (bold uppercase + garis bawah) beserta opsional nomor surat & subjudul.
 */
export function drawPkbmDocumentTitle(
  doc: jsPDF,
  title: string,
  options: {
    startY: number;
    documentNumber?: string;
    subtitle?: string;
    marginX?: number;
  }
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = options.marginX ?? 16;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = options.startY;

  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize((title || 'DOKUMEN AKADEMIK').toUpperCase(), contentWidth);
  doc.text(titleLines, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += (titleLines.length - 1) * 5;

  const underlineW = Math.min(contentWidth - 8, doc.getTextWidth(titleLines[0] || title));
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.line(
    pageWidth / 2 - underlineW / 2,
    cursorY + 1.2,
    pageWidth / 2 + underlineW / 2,
    cursorY + 1.2
  );

  if (options.documentNumber) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(25, 25, 25);
    doc.text(`Nomor: ${options.documentNumber}`, pageWidth / 2, cursorY + 5.8, {
      align: 'center',
    });
    cursorY += 5.8;
  }

  if (options.subtitle) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    const subLines = doc.splitTextToSize(options.subtitle, contentWidth);
    doc.text(subLines, pageWidth / 2, cursorY + 5.2, { align: 'center' });
    cursorY += 5.2 + (subLines.length - 1) * 4.2;
  }

  return cursorY + 6;
}

export function drawOfficialSignatureBlock(
  doc: jsPDF,
  schoolSettings: SchoolSettings,
  assets: Pick<PdfKopSuratAssets, 'headmasterSigImg' | 'teacherSigImg' | 'stampImg'>,
  options: {
    startY: number;
    marginX?: number;
    showTeacherSignature?: boolean;
    teacherLabel?: string;
    teacherName?: string;
    teacherNip?: string;
    city?: string;
    dateLabel?: string;
  }
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = options.marginX ?? 16;
  const contentWidth = pageWidth - marginX * 2;

  let sigY = options.startY;
  if (sigY + 46 > pageHeight - 16) {
    doc.addPage();
    sigY = 22;
  }

  const cityLabel = options.city || extractCityFromAddress(schoolSettings.address);
  const dateLongId =
    options.dateLabel ||
    new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

  const leftX = marginX + 6;
  const rightX = marginX + contentWidth * 0.56;

  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  if (options.showTeacherSignature) {
    doc.text('Mengetahui,', leftX, sigY);
    doc.setFont('times', 'bold');
    doc.text(options.teacherLabel || 'Guru / Tutor Pengampu', leftX, sigY + 5);

    if (assets.teacherSigImg) {
      try {
        doc.addImage(assets.teacherSigImg.dataUrl, 'PNG', leftX, sigY + 6.5, 34, 15);
      } catch {
        // Abaikan jika gagal tempel
      }
    }

    const tName = options.teacherName || 'Tutor PKBM';
    const tNameY = sigY + 26;
    doc.setFont('times', 'bold');
    doc.text(tName, leftX, tNameY);
    const tNameW = doc.getTextWidth(tName);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(leftX, tNameY + 0.9, leftX + tNameW, tNameY + 0.9);

    if (options.teacherNip && options.teacherNip !== '—') {
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.text(`NIP. ${options.teacherNip}`, leftX, tNameY + 4.8);
    }
  } else {
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text(`Tahun Ajaran ${schoolSettings.academicYear}`, leftX, sigY + 22);
    doc.text(`Semester ${schoolSettings.semester}`, leftX, sigY + 27);
  }

  // Kolom Kanan: Kepala PKBM
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(`${cityLabel}, ${dateLongId}`, rightX, sigY);
  doc.setFont('times', 'bold');
  doc.text(`Kepala ${schoolSettings.schoolName || 'PKBM ANNUR KARISMA'}`, rightX, sigY + 5);

  if (assets.stampImg) {
    try {
      doc.addImage(assets.stampImg.dataUrl, 'PNG', rightX - 9, sigY + 6, 20, 20);
    } catch {
      // Abaikan jika gagal tempel
    }
  }
  if (assets.headmasterSigImg) {
    try {
      doc.addImage(assets.headmasterSigImg.dataUrl, 'PNG', rightX + 2, sigY + 6.5, 36, 15);
    } catch {
      // Abaikan jika gagal tempel
    }
  }

  const hmName = schoolSettings.headmasterName || 'Kepala PKBM';
  const hmNameY = sigY + 26;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text(hmName, rightX, hmNameY);
  const hmNameW = doc.getTextWidth(hmName);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(rightX, hmNameY + 0.9, rightX + hmNameW, hmNameY + 0.9);

  if (schoolSettings.headmasterNip) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text(`NIP. ${schoolSettings.headmasterNip}`, rightX, hmNameY + 4.8);
  }
}

export function addPageNumbersFooter(
  doc: jsPDF,
  leftFooterText: string,
  marginX = 16
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);

    doc.setFont('times', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(leftFooterText, marginX, pageHeight - 8.5);
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8.5, {
      align: 'right',
    });
  }
}
