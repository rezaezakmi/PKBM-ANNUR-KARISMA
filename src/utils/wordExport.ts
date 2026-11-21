import { resolveSchoolLogo } from '../assets/branding';
import { SchoolSettings } from '../types/siakad';

export interface WordExportOptions {
  schoolSettings: SchoolSettings;
  documentTitle: string;
  documentNumber?: string;
  contentHtml: string;
  city?: string;
  teacherName?: string;
  teacherNip?: string;
  showTeacherSignature?: boolean;
  fileName?: string;
}

export function exportA4HtmlToWord({
  schoolSettings,
  documentTitle,
  documentNumber,
  contentHtml,
  city = 'Cianjur',
  teacherName = 'Tutor Pengampu',
  teacherNip = '',
  showTeacherSignature = true,
  fileName,
}: WordExportOptions): void {
  const formattedToday = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const safeTitle = documentTitle || 'Perangkat_Ajar';
  const resolvedFileName =
    (fileName || safeTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '') + '.doc';

  const resolvedLogoUrl = resolveSchoolLogo(schoolSettings.logoUrl);
  const contactLine = [
    `NPSN: ${schoolSettings.npsn}`,
    schoolSettings.phone ? `Telp: ${schoolSettings.phone}` : '',
    schoolSettings.email ? `Email: ${schoolSettings.email}` : '',
    schoolSettings.website ? schoolSettings.website : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const kopHtml = schoolSettings.letterheadUrl
    ? `<table class="kop-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="kop-center">
        <img src="${schoolSettings.letterheadUrl}" alt="Kop Surat ${schoolSettings.schoolName}" style="max-width:100%;max-height:110pt;object-fit:contain;" />
      </td>
    </tr>
  </table>`
    : `<table class="kop-table" cellspacing="0" cellpadding="0">
    <tr>
      ${
        resolvedLogoUrl
          ? `<td style="width:72pt;vertical-align:middle;text-align:center;padding-right:8pt;">
               <img src="${resolvedLogoUrl}" alt="Logo ${schoolSettings.schoolName}" width="64" height="64" style="width:64pt;height:64pt;object-fit:contain;" />
             </td>`
          : ''
      }
      <td class="kop-center" style="vertical-align:middle;">
        <p class="kop-yayasan">YAYASAN PENDIDIKAN MASYARAKAT ANNUR KARISMA</p>
        <p class="kop-school">${schoolSettings.schoolName}</p>
        <p class="kop-program">PROGRAM PENDIDIKAN KESETARAAN PAKET A (SD), PAKET B (SMP), DAN PAKET C (SMA)</p>
        <p class="kop-address">${schoolSettings.address}</p>
        <p class="kop-address">${contactLine}</p>
      </td>
    </tr>
  </table>`;

  const teacherSigBlock = schoolSettings.teacherSignatureUrl
    ? `<div class="ttd-space"><img src="${schoolSettings.teacherSignatureUrl}" alt="TTD Guru" style="max-height:50pt;max-width:140pt;object-fit:contain;" /></div>`
    : `<div class="ttd-space"></div>`;

  const headmasterSigBlock = schoolSettings.headmasterSignatureUrl
    ? `<div class="ttd-space"><img src="${schoolSettings.headmasterSignatureUrl}" alt="TTD Kepala PKBM" style="max-height:52pt;max-width:150pt;object-fit:contain;" /></div>`
    : `<div class="ttd-space"></div>`;

  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40" lang="id">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 2cm 2cm 2cm 2.5cm;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000000;
    }
    .kop-table {
      width: 100%;
      border-bottom: 3pt double #000000;
      margin-bottom: 14pt;
      padding-bottom: 8pt;
    }
    .kop-center {
      text-align: center;
    }
    .kop-yayasan {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.3pt;
      margin: 0;
      color: #000000;
    }
    .kop-school {
      font-size: 15pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 2pt 0;
      color: #000000;
    }
    .kop-program {
      font-size: 10.5pt;
      font-weight: bold;
      color: #000000;
      margin: 1pt 0;
    }
    .kop-address {
      font-size: 10pt;
      color: #000000;
      margin: 1pt 0;
    }
    .doc-header {
      text-align: center;
      margin: 12pt 0 16pt;
    }
    .doc-title {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      text-decoration: underline;
      margin: 0;
      color: #000000;
    }
    .doc-num {
      font-size: 12pt;
      color: #000000;
      margin-top: 2pt;
    }
    .content h3 {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #000000;
      border-bottom: 1pt solid #000000;
      padding-bottom: 2pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }
    .content h4 {
      font-size: 12pt;
      font-weight: bold;
      color: #000000;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }
    .content p {
      margin: 0 0 6pt;
      font-size: 12pt;
      line-height: 1.5;
      text-align: justify;
    }
    .content ul, .content ol {
      margin: 0 0 8pt 18pt;
      font-size: 12pt;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 6pt 0 10pt;
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.35;
    }
    .content th, .content td {
      border: 1px solid #000000;
      padding: 4pt 6pt;
      vertical-align: top;
      text-align: left;
      color: #000000;
    }
    .content th {
      background-color: #f1f5f9;
      color: #000000;
      font-weight: bold;
    }
    .ttd-table {
      width: 100%;
      margin-top: 28pt;
      border-collapse: collapse;
    }
    .ttd-table td {
      width: 50%;
      vertical-align: top;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.45;
      color: #000000;
    }
    .ttd-space {
      min-height: 54pt;
      margin: 4pt 0;
    }
  </style>
</head>
<body>
  ${kopHtml}

  <div class="doc-header">
    <p class="doc-title">${safeTitle}</p>
    ${documentNumber ? `<p class="doc-num">Nomor: ${documentNumber}</p>` : ''}
  </div>

  <div class="content">
    ${contentHtml}
  </div>

  <table class="ttd-table" cellspacing="0" cellpadding="0">
    <tr>
      <td>
        ${
          showTeacherSignature
            ? `<p>Mengetahui,<br/><strong>Guru / Tutor Pengampu</strong></p>
               ${teacherSigBlock}
               <p><u><strong>${teacherName}</strong></u><br/>${teacherNip ? `NIP. ${teacherNip}` : ''}</p>`
            : `<p>Tahun Ajaran ${schoolSettings.academicYear}<br/>Semester ${schoolSettings.semester}</p>`
        }
      </td>
      <td style="padding-left: 36pt;">
        <p>${city}, ${formattedToday}<br/><strong>Kepala ${schoolSettings.schoolName}</strong></p>
        ${headmasterSigBlock}
        <p><u><strong>${schoolSettings.headmasterName}</strong></u><br/>${schoolSettings.headmasterNip ? `NIP. ${schoolSettings.headmasterNip}` : ''}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const blob = new Blob(['\ufeff', wordHtml], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = resolvedFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
