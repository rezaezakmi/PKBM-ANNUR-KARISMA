import * as XLSX from 'xlsx';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import { resolveSchoolLogo } from '../assets/branding';
import { Classroom, SchoolSettings, Student, Teacher, TeachingAssignment } from '../types/siakad';

export type AdminDocumentTemplateId =
  | 'surat_aktif'
  | 'daftar_rombel'
  | 'surat_tugas'
  | 'biodata_murid';

export interface ExportAdminDocumentParams {
  templateId: AdminDocumentTemplateId;
  documentTitle: string;
  documentNumber: string;
  city: string;
  dateLabel?: string;
  schoolSettings: SchoolSettings;
  activeStudent?: Student;
  activeClass?: Classroom;
  studentsInActiveClass: Student[];
  activeTeacher?: Teacher;
  assignmentsForTeacher: TeachingAssignment[];
  teacherLabel?: string;
  teacherName?: string;
  teacherNip?: string;
  showTeacherSignature?: boolean;
}

function getFormattedDateLabel(dateLabel?: string): string {
  if (dateLabel && dateLabel.trim()) return dateLabel.trim();
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function loadImageForDocx(
  url?: string,
  maxDim = 900
): Promise<{
  bytes: Uint8Array;
  type: 'png';
  width: number;
  height: number;
} | null> {
  if (!url || !url.trim()) return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeoutId = window.setTimeout(() => resolve(null), 3500);

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
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1] || '';
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        resolve({ bytes, type: 'png', width, height });
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

const FORMAL_FONT = 'Times New Roman';
const FORMAL_LINE_SPACING = 360; // 1.5x line spacing (240 = single)

const NO_CELL_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const THIN_CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
};

function makeKeyValueWordTable(rows: Array<[string, string]>, bordered: boolean): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              borders: bordered ? THIN_CELL_BORDERS : NO_CELL_BORDERS,
              shading: bordered ? { fill: 'F1F5F9' } : undefined,
              margins: { top: 65, bottom: 65, left: bordered ? 100 : 40, right: 80 },
              children: [
                new Paragraph({
                  spacing: { line: 300 },
                  children: [
                    new TextRun({
                      text: label,
                      bold: bordered,
                      size: 24,
                      font: FORMAL_FONT,
                      color: '000000',
                    }),
                  ],
                }),
              ],
            }),
            ...(bordered
              ? []
              : [
                  new TableCell({
                    width: { size: 4, type: WidthType.PERCENTAGE },
                    borders: NO_CELL_BORDERS,
                    margins: { top: 65, bottom: 65, left: 20, right: 20 },
                    children: [
                      new Paragraph({
                        spacing: { line: 300 },
                        children: [
                          new TextRun({
                            text: ':',
                            size: 24,
                            font: FORMAL_FONT,
                            color: '000000',
                          }),
                        ],
                      }),
                    ],
                  }),
                ]),
            new TableCell({
              width: { size: bordered ? 66 : 62, type: WidthType.PERCENTAGE },
              borders: bordered ? THIN_CELL_BORDERS : NO_CELL_BORDERS,
              margins: { top: 65, bottom: 65, left: bordered ? 100 : 40, right: 80 },
              children: [
                new Paragraph({
                  spacing: { line: 300 },
                  children: [
                    new TextRun({
                      text: value || '-',
                      bold: !bordered && label.toLowerCase().includes('nama'),
                      size: 24,
                      font: FORMAL_FONT,
                      color: '000000',
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
    ),
  });
}

function makeGridWordTable(headers: string[], bodyRows: string[][], colWidths?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (header, idx) =>
            new TableCell({
              width: colWidths?.[idx]
                ? { size: colWidths[idx], type: WidthType.PERCENTAGE }
                : undefined,
              borders: THIN_CELL_BORDERS,
              shading: { fill: 'F1F5F9' },
              margins: { top: 80, bottom: 80, left: 90, right: 90 },
              children: [
                new Paragraph({
                  alignment: idx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                  spacing: { line: 276 },
                  children: [
                    new TextRun({
                      text: header,
                      bold: true,
                      size: 22,
                      font: FORMAL_FONT,
                      color: '000000',
                    }),
                  ],
                }),
              ],
            })
        ),
      }),
      ...bodyRows.map(
        (cells) =>
          new TableRow({
            children: cells.map(
              (cellText, idx) =>
                new TableCell({
                  width: colWidths?.[idx]
                    ? { size: colWidths[idx], type: WidthType.PERCENTAGE }
                    : undefined,
                  borders: THIN_CELL_BORDERS,
                  margins: { top: 65, bottom: 65, left: 90, right: 90 },
                  children: [
                    new Paragraph({
                      alignment: idx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                      spacing: { line: 276 },
                      children: [
                        new TextRun({
                          text: cellText,
                          size: 22,
                          font: FORMAL_FONT,
                          color: '000000',
                        }),
                      ],
                    }),
                  ],
                })
            ),
          })
      ),
    ],
  });
}

export async function exportAdministrativeDocumentToWord(
  params: ExportAdminDocumentParams
): Promise<void> {
  const {
    templateId,
    documentTitle,
    documentNumber,
    city,
    dateLabel,
    schoolSettings,
    activeStudent,
    activeClass,
    studentsInActiveClass,
    activeTeacher,
    assignmentsForTeacher,
    teacherLabel = 'Wali Kelas / Tutor',
    teacherName = '',
    teacherNip = '',
    showTeacherSignature = false,
  } = params;

  const formattedDate = getFormattedDateLabel(dateLabel);
  const [letterheadInfo, logoInfo, headmasterSigInfo, teacherSigInfo] = await Promise.all([
    schoolSettings.letterheadUrl
      ? loadImageForDocx(schoolSettings.letterheadUrl, 1200)
      : Promise.resolve(null),
    loadImageForDocx(resolveSchoolLogo(schoolSettings.logoUrl), 320),
    loadImageForDocx(schoolSettings.headmasterSignatureUrl, 400),
    loadImageForDocx(schoolSettings.teacherSignatureUrl, 400),
  ]);

  const headerTextParagraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: 'YAYASAN PENDIDIKAN MASYARAKAT ANNUR KARISMA',
          bold: true,
          size: 24,
          font: FORMAL_FONT,
          color: '000000',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: schoolSettings.schoolName.toUpperCase(),
          bold: true,
          size: 30,
          font: FORMAL_FONT,
          color: '000000',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: 'PROGRAM PENDIDIKAN KESETARAAN PAKET A (SD), PAKET B (SMP), DAN PAKET C (SMA)',
          bold: true,
          size: 21,
          font: FORMAL_FONT,
          color: '000000',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 15 },
      children: [
        new TextRun({
          text: schoolSettings.address,
          size: 20,
          font: FORMAL_FONT,
          color: '000000',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `NPSN: ${schoolSettings.npsn}${schoolSettings.phone ? ` · Telp: ${schoolSettings.phone}` : ''}${schoolSettings.email ? ` · Email: ${schoolSettings.email}` : ''}${schoolSettings.website ? ` · ${schoolSettings.website}` : ''}`,
          size: 20,
          font: FORMAL_FONT,
          color: '000000',
        }),
      ],
    }),
  ];

  const kopTable = letterheadInfo
    ? (() => {
        const targetW = 580;
        const ratio = letterheadInfo.height / Math.max(1, letterheadInfo.width);
        const targetH = Math.min(130, Math.max(58, Math.round(targetW * ratio)));
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '000000' },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: NO_CELL_BORDERS,
                  margins: { top: 20, bottom: 100, left: 0, right: 0 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new ImageRun({
                          data: letterheadInfo.bytes,
                          type: letterheadInfo.type,
                          transformation: { width: targetW, height: targetH },
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      })()
    : new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.DOUBLE, size: 12, color: '000000' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              ...(logoInfo
                ? [
                    new TableCell({
                      width: { size: 16, type: WidthType.PERCENTAGE },
                      borders: NO_CELL_BORDERS,
                      margins: { top: 40, bottom: 100, left: 20, right: 60 },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [
                            new ImageRun({
                              data: logoInfo.bytes,
                              type: logoInfo.type,
                              transformation: { width: 68, height: 68 },
                            }),
                          ],
                        }),
                      ],
                    }),
                  ]
                : []),
              new TableCell({
                width: { size: logoInfo ? 84 : 100, type: WidthType.PERCENTAGE },
                borders: NO_CELL_BORDERS,
                margins: { top: 20, bottom: 100, left: 30, right: 30 },
                children: headerTextParagraphs,
              }),
            ],
          }),
        ],
      });

  const bodyChildren: Array<Paragraph | Table> = [
    kopTable,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 280, after: 40 },
      children: [
        new TextRun({
          text: documentTitle,
          bold: true,
          size: 24,
          font: FORMAL_FONT,
          underline: { type: UnderlineType.SINGLE },
          color: '000000',
        }),
      ],
    }),
  ];

  if (documentNumber.trim()) {
    bodyChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 260 },
        children: [
          new TextRun({
            text: `Nomor: ${documentNumber}`,
            size: 24,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      })
    );
  }

  if (templateId === 'surat_aktif' && activeStudent) {
    bodyChildren.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 567 },
        spacing: { after: 180, line: FORMAL_LINE_SPACING },
        children: [
          new TextRun({
            text: `Yang bertanda tangan di bawah ini, Kepala ${schoolSettings.schoolName} (NPSN ${schoolSettings.npsn}), menerangkan dengan sesungguhnya bahwa:`,
            size: 24,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      }),
      makeKeyValueWordTable(
        [
          ['Nama Lengkap', activeStudent.fullName],
          ['NIS / NISN', `${activeStudent.nis} / ${activeStudent.nisn || '-'}`],
          ['Jenis Kelamin', activeStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
          ['Program Kesetaraan', activeStudent.paket],
          ['Kelas / Rombel', activeStudent.className],
          ['Nama Orang Tua / Wali', activeStudent.guardianName || '-'],
          ['Alamat', activeStudent.address || '-'],
        ],
        false
      ),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 567 },
        spacing: { before: 200, after: 140, line: FORMAL_LINE_SPACING },
        children: [
          new TextRun({
            text: `Adalah benar tercatat sebagai Warga Belajar berstatus ${activeStudent.status} pada ${schoolSettings.schoolName} Tahun Ajaran ${schoolSettings.academicYear} Semester ${schoolSettings.semester}.`,
            size: 24,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 567 },
        spacing: { after: 220, line: FORMAL_LINE_SPACING },
        children: [
          new TextRun({
            text: 'Demikian surat keterangan ini dibuat dengan sebenarnya agar dapat dipergunakan sebagaimana mestinya.',
            size: 24,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      })
    );
  } else if (templateId === 'biodata_murid' && activeStudent) {
    bodyChildren.push(
      new Paragraph({
        spacing: { after: 160, line: FORMAL_LINE_SPACING },
        children: [
          new TextRun({
            text: `Data Pokok Warga Belajar Pendidikan Kesetaraan — Tahun Ajaran ${schoolSettings.academicYear}`,
            size: 24,
            italics: true,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      }),
      makeKeyValueWordTable(
        [
          ['Nomor Induk Siswa (NIS)', activeStudent.nis],
          ['NISN', activeStudent.nisn || '-'],
          ['Nama Lengkap', activeStudent.fullName],
          ['Jenis Kelamin', activeStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
          ['Program Kesetaraan', activeStudent.paket],
          ['Rombongan Belajar', activeStudent.className],
          ['Email Terdaftar', activeStudent.email || '-'],
          ['Nomor Telepon', activeStudent.phone || '-'],
          ['Alamat Tempat Tinggal', activeStudent.address || '-'],
          ['Nama Orang Tua / Wali', activeStudent.guardianName || '-'],
          ['Status Kepesertaan', activeStudent.status],
        ],
        true
      )
    );
  } else if (templateId === 'daftar_rombel' && activeClass) {
    bodyChildren.push(
      makeKeyValueWordTable(
        [
          ['Rombel', activeClass.name],
          ['Program', activeClass.paket],
          ['Wali Kelas', activeClass.homeroomTeacherName || '-'],
          ['Tahun Ajaran', `${schoolSettings.academicYear} (${schoolSettings.semester})`],
          ['Jumlah Murid', `${studentsInActiveClass.length} Warga Belajar`],
        ],
        false
      ),
      new Paragraph({ spacing: { before: 140, after: 80 }, children: [] }),
      makeGridWordTable(
        ['No', 'NIS', 'Nama Lengkap', 'L/P', 'Status', 'Paraf'],
        studentsInActiveClass.length > 0
          ? studentsInActiveClass.map((st, idx) => [
              String(idx + 1),
              st.nis,
              st.fullName,
              st.gender,
              st.status,
              '',
            ])
          : [['-', '-', 'Belum ada murid terdaftar di rombel ini.', '-', '-', '']],
        [7, 17, 36, 8, 14, 18]
      )
    );
  } else if (templateId === 'surat_tugas' && activeTeacher) {
    bodyChildren.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 567 },
        spacing: { after: 160, line: FORMAL_LINE_SPACING },
        children: [
          new TextRun({
            text: `Kepala ${schoolSettings.schoolName} menugaskan kepada pendidik / tutor di bawah ini untuk melaksanakan kegiatan pembelajaran tutorial pada Tahun Ajaran ${schoolSettings.academicYear} Semester ${schoolSettings.semester}:`,
            size: 24,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      }),
      makeKeyValueWordTable(
        [
          ['Nama Tutor', activeTeacher.fullName],
          ['NIP / NUPTK', activeTeacher.nip || '-'],
          ['Bidang Keahlian', activeTeacher.specialization || '-'],
        ],
        false
      ),
      new Paragraph({ spacing: { before: 160, after: 80 }, children: [] }),
      makeGridWordTable(
        ['No', 'Mata Pelajaran', 'Kelas / Rombel', 'Jadwal'],
        assignmentsForTeacher.length > 0
          ? assignmentsForTeacher.map((asg, idx) => [
              String(idx + 1),
              asg.subjectName,
              asg.className,
              `${asg.scheduleDay}, ${asg.scheduleTime}`,
            ])
          : [['-', 'Belum ada penugasan kelas untuk tutor ini.', '-', '-']],
        [8, 34, 30, 28]
      ),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 567 },
        spacing: { before: 200, after: 140, line: FORMAL_LINE_SPACING },
        children: [
          new TextRun({
            text: 'Demikian surat tugas ini ditetapkan agar dilaksanakan dengan penuh tanggung jawab.',
            size: 24,
            font: FORMAL_FONT,
            color: '000000',
          }),
        ],
      })
    );
  }

  // Blok Tanda Tangan Resmi (Times New Roman 12pt)
  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_CELL_BORDERS,
            margins: { top: 300, bottom: 40, left: 40, right: 120 },
            children: showTeacherSignature
              ? [
                  new Paragraph({
                    spacing: { line: 300 },
                    children: [
                      new TextRun({
                        text: 'Mengetahui,',
                        size: 24,
                        font: FORMAL_FONT,
                        color: '000000',
                      }),
                    ],
                  }),
                  new Paragraph({
                    spacing: { after: teacherSigInfo ? 80 : 720, line: 300 },
                    children: [
                      new TextRun({
                        text: teacherLabel,
                        bold: true,
                        size: 24,
                        font: FORMAL_FONT,
                        color: '000000',
                      }),
                    ],
                  }),
                  ...(teacherSigInfo
                    ? [
                        new Paragraph({
                          spacing: { before: 40, after: 80 },
                          children: [
                            new ImageRun({
                              data: teacherSigInfo.bytes,
                              type: teacherSigInfo.type,
                              transformation: {
                                width: Math.min(
                                  130,
                                  Math.max(
                                    60,
                                    Math.round(
                                      52 * (teacherSigInfo.width / Math.max(1, teacherSigInfo.height))
                                    )
                                  )
                                ),
                                height: 52,
                              },
                            }),
                          ],
                        }),
                      ]
                    : []),
                  new Paragraph({
                    spacing: { line: 280 },
                    children: [
                      new TextRun({
                        text: teacherName || '-',
                        bold: true,
                        underline: { type: UnderlineType.SINGLE },
                        size: 24,
                        font: FORMAL_FONT,
                        color: '000000',
                      }),
                    ],
                  }),
                  new Paragraph({
                    spacing: { line: 280 },
                    children: [
                      new TextRun({
                        text: teacherNip ? `NIP. ${teacherNip}` : '',
                        size: 22,
                        font: FORMAL_FONT,
                        color: '000000',
                      }),
                    ],
                  }),
                ]
              : [
                  new Paragraph({
                    spacing: { line: 280 },
                    children: [
                      new TextRun({
                        text: `Tahun Ajaran ${schoolSettings.academicYear}`,
                        size: 22,
                        font: FORMAL_FONT,
                        color: '000000',
                      }),
                    ],
                  }),
                  new Paragraph({
                    spacing: { line: 280 },
                    children: [
                      new TextRun({
                        text: `Semester ${schoolSettings.semester}`,
                        size: 22,
                        font: FORMAL_FONT,
                        color: '000000',
                      }),
                    ],
                  }),
                ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_CELL_BORDERS,
            margins: { top: 300, bottom: 40, left: 240, right: 40 },
            children: [
              new Paragraph({
                spacing: { line: 300 },
                children: [
                  new TextRun({
                    text: `${city}, ${formattedDate}`,
                    size: 24,
                    font: FORMAL_FONT,
                    color: '000000',
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: headmasterSigInfo ? 80 : 720, line: 300 },
                children: [
                  new TextRun({
                    text: `Kepala ${schoolSettings.schoolName}`,
                    bold: true,
                    size: 24,
                    font: FORMAL_FONT,
                    color: '000000',
                  }),
                ],
              }),
              ...(headmasterSigInfo
                ? [
                    new Paragraph({
                      spacing: { before: 40, after: 80 },
                      children: [
                        new ImageRun({
                          data: headmasterSigInfo.bytes,
                          type: headmasterSigInfo.type,
                          transformation: {
                            width: Math.min(
                              140,
                              Math.max(
                                60,
                                Math.round(
                                  54 *
                                    (headmasterSigInfo.width /
                                      Math.max(1, headmasterSigInfo.height))
                                )
                              )
                            ),
                            height: 54,
                          },
                        }),
                      ],
                    }),
                  ]
                : []),
              new Paragraph({
                spacing: { line: 280 },
                children: [
                  new TextRun({
                    text: schoolSettings.headmasterName,
                    bold: true,
                    underline: { type: UnderlineType.SINGLE },
                    size: 24,
                    font: FORMAL_FONT,
                    color: '000000',
                  }),
                ],
              }),
              new Paragraph({
                spacing: { line: 280 },
                children: [
                  new TextRun({
                    text: schoolSettings.headmasterNip ? `NIP. ${schoolSettings.headmasterNip}` : '',
                    size: 22,
                    font: FORMAL_FONT,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  bodyChildren.push(signatureTable);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // 2.0 cm
              right: 1134, // 2.0 cm
              bottom: 1134, // 2.0 cm
              left: 1417, // 2.5 cm (standar surat dinas)
            },
          },
        },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeSlug = documentTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  triggerBlobDownload(blob, `${safeSlug || 'dokumen'}_${schoolSettings.schoolName.replace(/\s+/g, '_')}.docx`);
}

export function exportAdministrativeDocumentToExcel(params: ExportAdminDocumentParams): void {
  const {
    templateId,
    documentTitle,
    documentNumber,
    city,
    dateLabel,
    schoolSettings,
    activeStudent,
    activeClass,
    studentsInActiveClass,
    activeTeacher,
    assignmentsForTeacher,
    teacherLabel = 'Wali Kelas / Tutor',
    teacherName = '',
    teacherNip = '',
    showTeacherSignature = false,
  } = params;

  const formattedDate = getFormattedDateLabel(dateLabel);
  const aoa: Array<Array<string | number>> = [
    ['YAYASAN PENDIDIKAN MASYARAKAT ANNUR KARISMA'],
    [schoolSettings.schoolName.toUpperCase()],
    ['PROGRAM KESETARAAN PAKET A (SD) · PAKET B (SMP) · PAKET C (SMA)'],
    [schoolSettings.address],
    [
      `NPSN: ${schoolSettings.npsn}${schoolSettings.phone ? ` · Telp: ${schoolSettings.phone}` : ''}${schoolSettings.email ? ` · Email: ${schoolSettings.email}` : ''}`,
    ],
    [],
    [documentTitle],
    [documentNumber ? `Nomor: ${documentNumber}` : ''],
    [],
  ];

  let colWidths: Array<{ wch: number }> = [
    { wch: 28 },
    { wch: 4 },
    { wch: 46 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
  ];

  if (templateId === 'surat_aktif' && activeStudent) {
    aoa.push(
      [
        `Yang bertanda tangan di bawah ini, Kepala ${schoolSettings.schoolName} (NPSN ${schoolSettings.npsn}), menerangkan dengan sesungguhnya bahwa:`,
      ],
      [],
      ['Nama Lengkap', ':', activeStudent.fullName],
      ['NIS / NISN', ':', `${activeStudent.nis} / ${activeStudent.nisn || '-'}`],
      ['Jenis Kelamin', ':', activeStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
      ['Program Kesetaraan', ':', activeStudent.paket],
      ['Kelas / Rombel', ':', activeStudent.className],
      ['Nama Orang Tua / Wali', ':', activeStudent.guardianName || '-'],
      ['Alamat', ':', activeStudent.address || '-'],
      [],
      [
        `Adalah benar tercatat sebagai Warga Belajar berstatus ${activeStudent.status} pada ${schoolSettings.schoolName} Tahun Ajaran ${schoolSettings.academicYear} Semester ${schoolSettings.semester}.`,
      ],
      ['Demikian surat keterangan ini dibuat dengan sebenarnya agar dapat dipergunakan sebagaimana mestinya.']
    );
  } else if (templateId === 'biodata_murid' && activeStudent) {
    aoa.push(
      [`Data Pokok Warga Belajar Pendidikan Kesetaraan — Tahun Ajaran ${schoolSettings.academicYear}`],
      [],
      ['Keterangan', 'Nilai Data'],
      ['Nomor Induk Siswa (NIS)', activeStudent.nis],
      ['NISN', activeStudent.nisn || '-'],
      ['Nama Lengkap', activeStudent.fullName],
      ['Jenis Kelamin', activeStudent.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
      ['Program Kesetaraan', activeStudent.paket],
      ['Rombongan Belajar', activeStudent.className],
      ['Email Terdaftar', activeStudent.email || '-'],
      ['Nomor Telepon', activeStudent.phone || '-'],
      ['Alamat Tempat Tinggal', activeStudent.address || '-'],
      ['Nama Orang Tua / Wali', activeStudent.guardianName || '-'],
      ['Status Kepesertaan', activeStudent.status]
    );
    colWidths = [{ wch: 30 }, { wch: 48 }, { wch: 18 }, { wch: 18 }];
  } else if (templateId === 'daftar_rombel' && activeClass) {
    aoa.push(
      ['Rombel', activeClass.name, '', 'Program', activeClass.paket],
      [
        'Wali Kelas',
        activeClass.homeroomTeacherName || '-',
        '',
        'Tahun Ajaran',
        `${schoolSettings.academicYear} (${schoolSettings.semester})`,
      ],
      [],
      ['No', 'NIS', 'Nama Lengkap', 'L/P', 'Status', 'Paraf']
    );
    if (studentsInActiveClass.length === 0) {
      aoa.push(['-', '-', 'Belum ada murid terdaftar di rombel ini.', '-', '-', '']);
    } else {
      studentsInActiveClass.forEach((st, idx) => {
        aoa.push([idx + 1, st.nis, st.fullName, st.gender, st.status, '']);
      });
    }
    colWidths = [{ wch: 8 }, { wch: 18 }, { wch: 34 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
  } else if (templateId === 'surat_tugas' && activeTeacher) {
    aoa.push(
      [
        `Kepala ${schoolSettings.schoolName} menugaskan kepada pendidik / tutor berikut untuk Tahun Ajaran ${schoolSettings.academicYear} Semester ${schoolSettings.semester}:`,
      ],
      [],
      ['Nama Tutor', ':', activeTeacher.fullName],
      ['NIP / NUPTK', ':', activeTeacher.nip],
      ['Bidang Keahlian', ':', activeTeacher.specialization],
      [],
      ['No', 'Mata Pelajaran', 'Kelas / Rombel', 'Jadwal']
    );
    if (assignmentsForTeacher.length === 0) {
      aoa.push(['-', 'Belum ada penugasan kelas untuk tutor ini.', '-', '-']);
    } else {
      assignmentsForTeacher.forEach((asg, idx) => {
        aoa.push([idx + 1, asg.subjectName, asg.className, `${asg.scheduleDay}, ${asg.scheduleTime}`]);
      });
    }
    aoa.push([], ['Demikian surat tugas ini ditetapkan agar dilaksanakan dengan penuh tanggung jawab.']);
    colWidths = [{ wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 26 }];
  }

  aoa.push(
    [],
    showTeacherSignature
      ? ['Mengetahui,', '', '', `${city}, ${formattedDate}`]
      : [`Tahun Ajaran ${schoolSettings.academicYear} · Semester ${schoolSettings.semester}`, '', '', `${city}, ${formattedDate}`],
    showTeacherSignature
      ? [teacherLabel, '', '', `Kepala ${schoolSettings.schoolName}`]
      : ['', '', '', `Kepala ${schoolSettings.schoolName}`],
    [],
    [],
    showTeacherSignature
      ? [teacherName || '-', '', '', schoolSettings.headmasterName]
      : ['', '', '', schoolSettings.headmasterName],
    showTeacherSignature
      ? [teacherNip ? `NIP. ${teacherNip}` : '', '', '', schoolSettings.headmasterNip ? `NIP. ${schoolSettings.headmasterNip}` : '']
      : ['', '', '', schoolSettings.headmasterNip ? `NIP. ${schoolSettings.headmasterNip}` : '']
  );

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = colWidths;

  // Pastikan sel NIS/NIP/Telepon pada baris tertentu tidak kehilangan angka 0
  Object.keys(worksheet).forEach((addr) => {
    if (addr.startsWith('!')) return;
    const cell = worksheet[addr] as XLSX.CellObject;
    if (cell && typeof cell.v === 'string' && /^0\d+$/.test(cell.v.trim())) {
      cell.t = 's';
      cell.z = '@';
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dokumen');
  const safeSlug = documentTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  XLSX.writeFile(workbook, `${safeSlug || 'dokumen'}_${schoolSettings.schoolName.replace(/\s+/g, '_')}.xlsx`);
}
