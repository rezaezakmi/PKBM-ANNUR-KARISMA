import { jsPDF } from 'jspdf';
import { resolveSchoolLogo } from '../assets/branding';
import { ROLE_LABELS } from '../config/navigation';
import { PaketType, SchoolSettings, UserRole } from '../types/siakad';
import { loadImageForPdf } from './pdfKopSuratUtils';

export interface LoginCardPdfEntry {
  uid: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  nis?: string;
  nip?: string;
  paket?: PaketType;
  shortClassLabel: string;
}

/**
 * Menghasilkan berkas PDF A4 berisi Kartu Login SIAKAD (2 kartu per baris, 8 kartu per halaman).
 * Username dan Password dicetak terbuka secara jelas (tidak pernah disembunyikan atau disensor).
 */
export async function generateLoginCardsPdf(params: {
  cards: LoginCardPdfEntry[];
  schoolSettings: SchoolSettings;
  websiteUrl: string;
  scopeLabel?: string;
}): Promise<string> {
  const { cards, schoolSettings, websiteUrl, scopeLabel = 'SIAKAD' } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 11;
  const marginTop = 12;
  const gapX = 6;
  const gapY = 6;
  const cols = 2;
  const rowsPerPage = 4;
  const cardsPerPage = cols * rowsPerPage;

  const cardWidth = (pageWidth - marginX * 2 - gapX) / cols; // ~91mm
  const cardHeight = 64; // 4 rows * 64 + 3 * 6 = 274mm <= 297mm

  const logoSrc = resolveSchoolLogo(schoolSettings.logoUrl);
  const logoAsset = await loadImageForPdf(logoSrc, 220);

  cards.forEach((card, index) => {
    const slotOnPage = index % cardsPerPage;
    if (index > 0 && slotOnPage === 0) {
      doc.addPage();
    }

    const col = slotOnPage % cols;
    const row = Math.floor(slotOnPage / cols);
    const x = marginX + col * (cardWidth + gapX);
    const y = marginTop + row * (cardHeight + gapY);

    // Outer card border & white background
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');

    // Header band (Emerald PKBM)
    const headerH = 14.5;
    doc.setFillColor(6, 78, 59); // emerald-900
    doc.roundedRect(x, y, cardWidth, headerH, 2.5, 2.5, 'F');
    // Straighten bottom corners of header
    doc.rect(x, y + headerH - 3, cardWidth, 3, 'F');
    // Gold accent line under header
    doc.setFillColor(245, 158, 11); // amber-500
    doc.rect(x, y + headerH, cardWidth, 0.9, 'F');

    // Logo box
    const logoBoxSize = 9.5;
    const logoX = x + 3;
    const logoY = y + 2.5;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(logoX, logoY, logoBoxSize, logoBoxSize, 1.5, 1.5, 'F');
    if (logoAsset) {
      const pad = 0.8;
      const boxInner = logoBoxSize - pad * 2;
      const ratio = logoAsset.width / Math.max(1, logoAsset.height);
      const drawW = ratio >= 1 ? boxInner : boxInner * ratio;
      const drawH = ratio >= 1 ? boxInner / ratio : boxInner;
      const offsetX = logoX + pad + (boxInner - drawW) / 2;
      const offsetY = logoY + pad + (boxInner - drawH) / 2;
      doc.addImage(logoAsset.dataUrl, 'PNG', offsetX, offsetY, drawW, drawH);
    }

    // Header text
    const titleX = logoX + logoBoxSize + 2.5;
    const badgeW = 22;
    const maxTitleW = cardWidth - (titleX - x) - badgeW - 3.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(253, 224, 71); // amber-300
    const cardSubtitle =
      card.role === 'murid'
        ? 'KARTU LOGIN PESERTA DIDIK'
        : card.role === 'guru'
          ? 'KARTU LOGIN PENDIDIK'
          : 'KARTU AKUN SIAKAD';
    doc.text(cardSubtitle, titleX, y + 4.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(255, 255, 255);
    const schoolTitleLines = doc.splitTextToSize(schoolSettings.schoolName.toUpperCase(), maxTitleW);
    doc.text(schoolTitleLines[0] || schoolSettings.schoolName, titleX, y + 8.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(209, 250, 229);
    doc.text(
      `NPSN ${schoolSettings.npsn} · TA ${schoolSettings.academicYear}`,
      titleX,
      y + 12.2
    );

    // Header right badge (Program / Role)
    const badgeX = x + cardWidth - badgeW - 2.5;
    const badgeY = y + 2.8;
    doc.setFillColor(4, 120, 87);
    doc.setDrawColor(252, 211, 77);
    doc.setLineWidth(0.25);
    doc.roundedRect(badgeX, badgeY, badgeW, 9, 1.3, 1.3, 'FD');

    const headerTag =
      card.role === 'murid' && card.paket
        ? card.paket.toUpperCase()
        : ROLE_LABELS[card.role].split('/')[0].trim().toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(254, 240, 138);
    doc.text(headerTag.slice(0, 14), badgeX + badgeW / 2, badgeY + 4.2, { align: 'center' });

    const subTag =
      card.role === 'murid' && card.shortClassLabel && card.shortClassLabel !== '—'
        ? card.shortClassLabel.toUpperCase().slice(0, 15)
        : '';
    if (subTag) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(255, 255, 255);
      doc.text(subTag, badgeX + badgeW / 2, badgeY + 7.5, { align: 'center' });
    }

    // Body: Nama Lengkap + NIS/NIP
    let curY = y + headerH + 4.8;
    const innerX = x + 3.5;
    const innerW = cardWidth - 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text('NAMA LENGKAP', innerX, curY);
    if (card.nis || card.nip) {
      doc.text(card.nis ? 'NIS' : 'NIP', x + cardWidth - 3.5, curY, { align: 'right' });
    }

    curY += 3.8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(15, 23, 42);
    const nameMaxW = card.nis || card.nip ? innerW - 24 : innerW;
    const nameLines = doc.splitTextToSize(card.name || '-', nameMaxW);
    doc.text(nameLines[0] || '-', innerX, curY);

    if (card.nis || card.nip) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(30, 41, 59);
      doc.text(String(card.nis || card.nip), x + cardWidth - 3.5, curY, { align: 'right' });
    }

    // Divider + Program & Kelas
    curY += 2.3;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(innerX, curY, innerX + innerW, curY);

    curY += 3.4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(100, 116, 139);
    doc.text(card.role === 'murid' ? 'PROGRAM PAKET' : 'PERAN AKUN', innerX, curY);
    doc.text(
      card.role === 'murid' ? 'KELAS / ROMBEL' : 'BIDANG / MAPEL',
      x + cardWidth - 3.5,
      curY,
      { align: 'right' }
    );

    curY += 3.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(6, 78, 59);
    const leftMeta =
      card.role === 'murid'
        ? card.paket || 'Kesetaraan'
        : card.paket
          ? `${ROLE_LABELS[card.role]} · ${card.paket}`
          : ROLE_LABELS[card.role];
    doc.text(leftMeta.slice(0, 26), innerX, curY);

    doc.setTextColor(15, 23, 42);
    doc.text((card.shortClassLabel || '—').slice(0, 28), x + cardWidth - 3.5, curY, {
      align: 'right',
    });

    // Credential Box: Username & Password (TERBUKA & JELAS — TIDAK PERNAH DISEMBUNYIKAN)
    curY += 2.6;
    const boxH = 16.2;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.roundedRect(innerX, curY, innerW, boxH, 1.6, 1.6, 'FD');

    // Row 1: Username
    const row1Y = curY + 5.2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text('Username', innerX + 2.5, row1Y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(6, 78, 59);
    doc.text(card.username || '-', innerX + innerW - 2.5, row1Y, { align: 'right' });

    // Separator inside credential box
    const midLineY = curY + 8.1;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(innerX + 2, midLineY, innerX + innerW - 2, midLineY);

    // Row 2: Password (selalu tampil jelas dalam teks polos monospace tebal)
    const row2Y = curY + 13.4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text('Password', innerX + 2.5, row2Y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const pwdDisplay = card.password && card.password.trim().length > 0 ? card.password : '(Belum Diatur)';
    doc.text(pwdDisplay, innerX + innerW - 2.5, row2Y, { align: 'right' });

    // Footer
    const footerY = y + cardHeight - 3.1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text(websiteUrl.slice(0, 34), innerX, footerY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Jaga kerahasiaan akun', x + cardWidth - 3.5, footerY, { align: 'right' });
  });

  // Page footer timestamp
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Kartu Login ${schoolSettings.schoolName} · Dicetak melalui SIAKAD · Halaman ${p}/${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  const safeScope = scopeLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'SIAKAD';
  const fileName = `Kartu_Login_${safeScope}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
  return fileName;
}
