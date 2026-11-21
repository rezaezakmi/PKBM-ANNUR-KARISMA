import React from 'react';
import { ExamPackage, ExamPaketVariant, ExamQuestion, SchoolSettings } from '../../types/siakad';
import { A4DocumentSheet } from '../documents/A4DocumentPrinter';
import {
  EXAM_TYPE_LABELS,
  formatAnswerKeyText,
  getDeterministicShuffledRights,
  QUESTION_SHAPE_LABELS,
} from '../../utils/examUtils';

export type ExamPrintTab = 'kisi_kisi' | 'naskah_soal' | 'kunci_jawaban' | 'pedoman_penskoran';

interface ExamPrintSheetProps {
  schoolSettings: SchoolSettings;
  exam: ExamPackage;
  variant: ExamPaketVariant;
  questions: ExamQuestion[];
  activeTab: ExamPrintTab;
  teacherNip?: string;
}

export const ExamPrintSheet: React.FC<ExamPrintSheetProps> = ({
  schoolSettings,
  exam,
  variant,
  questions,
  activeTab,
  teacherNip = '',
}) => {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const totalMaxScore = questions.reduce((sum, q) => sum + (q.maxScore || 2), 0);

  const tabHeadingMap: Record<ExamPrintTab, string> = {
    kisi_kisi: `KISI-KISI PENULISAN SOAL ${exam.examType} — PAKET ${variant}`,
    naskah_soal: `${EXAM_TYPE_LABELS[exam.examType] || exam.examType} — PAKET ${variant}`,
    kunci_jawaban: `KUNCI JAWABAN & PEMBAHASAN ${exam.examType} — PAKET ${variant}`,
    pedoman_penskoran: `PEDOMAN PENSKORAN & RUBRIK PENILAIAN — PAKET ${variant}`,
  };

  return (
    <A4DocumentSheet
      schoolSettings={schoolSettings}
      documentTitle={tabHeadingMap[activeTab]}
      documentNumber={`UJN/${exam.examType}/${exam.academicYear}/PKT-${variant}`}
      showTeacherSignature={true}
      teacherLabel="Guru / Tutor Penyusun Soal"
      teacherName={exam.authorName}
      teacherNip={teacherNip}
    >
      {/* Metadata & Kolom Identitas Siswa (Khusus Naskah Soal, otomatis ikut tercetak!) */}
      {activeTab === 'naskah_soal' ? (
        <div className="mb-6 space-y-3 text-black">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5pt] border border-black p-3">
            <div>
              Mata Pelajaran: <strong>{exam.mapel}</strong>
            </div>
            <div>
              Program / Rombel: <strong>{exam.kelas}</strong>
            </div>
            <div>
              Tahun Ajaran:{' '}
              <strong>
                {exam.academicYear} ({exam.semester})
              </strong>
            </div>
            <div>
              Alokasi Waktu:{' '}
              <strong>{exam.durationMinutes} Menit · Paket Soal {variant}</strong>
            </div>
          </div>

          <table className="w-full border-collapse border border-black text-[11.5pt]">
            <tbody>
              <tr>
                <td className="border border-black px-3 py-1.5 w-1/2">
                  <strong>Nama Lengkap Siswa:</strong>{' '}
                  <span>............................................</span>
                </td>
                <td className="border border-black px-3 py-1.5 w-1/2">
                  <strong>NIS / NISN:</strong>{' '}
                  <span>.....................................</span>
                </td>
              </tr>
              <tr>
                <td className="border border-black px-3 py-1.5">
                  <strong>Hari / Tanggal:</strong>{' '}
                  <span>................................................</span>
                </td>
                <td className="border border-black px-3 py-1.5">
                  <strong>Nilai / Paraf Tutor:</strong>{' '}
                  <span>.............................</span>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="!text-[11pt] italic border-b border-black pb-2">
            Petunjuk: Berdoalah sebelum mengerjakan. Baca setiap stimulus dengan saksama dan kerjakan
            soal secara jujur dan mandiri.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-[11.5pt] border border-black p-3 mb-5 text-black">
          <div>
            Mata Pelajaran: <strong>{exam.mapel}</strong>
          </div>
          <div>
            Kelas / Paket: <strong>{exam.kelas}</strong>
          </div>
          <div>
            Materi Pokok: <strong>{exam.materi}</strong>
          </div>
          <div>
            Jumlah Soal / Skor Maks:{' '}
            <strong>
              {questions.length} Butir ({totalMaxScore} Poin)
            </strong>
          </div>
        </div>
      )}

      {/* TAB 1: KISI-KISI */}
      {activeTab === 'kisi_kisi' && (
        <table className="w-full border-collapse border border-black text-[10.5pt] leading-[1.35] text-black">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black px-2 py-2 text-center w-9 font-bold">No</th>
              <th className="border border-black px-2.5 py-2 text-left font-bold">Kompetensi / TP</th>
              <th className="border border-black px-2.5 py-2 text-left font-bold">Materi</th>
              <th className="border border-black px-2.5 py-2 text-left font-bold">Indikator Soal</th>
              <th className="border border-black px-2 py-2 text-center w-14 font-bold">Level</th>
              <th className="border border-black px-2 py-2 text-left w-24 font-bold">Bentuk</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, idx) => (
              <tr key={q.id}>
                <td className="border border-black px-2 py-1.5 text-center font-bold">{idx + 1}</td>
                <td className="border border-black px-2.5 py-1.5">{q.competency}</td>
                <td className="border border-black px-2.5 py-1.5">{q.materi}</td>
                <td className="border border-black px-2.5 py-1.5">{q.indicator}</td>
                <td className="border border-black px-2 py-1.5 text-center font-bold">{q.level}</td>
                <td className="border border-black px-2 py-1.5">{QUESTION_SHAPE_LABELS[q.type]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* TAB 2: NASKAH SOAL */}
      {activeTab === 'naskah_soal' && (
        <div className="space-y-4 text-[12pt] leading-[1.5] text-black">
          {questions.map((q, idx) => (
            <div key={q.id} className="break-inside-avoid space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="font-bold min-w-[24px]">{idx + 1}.</span>
                <div className="flex-1 space-y-1.5">
                  <p className="whitespace-pre-line text-justify">
                    <span className="text-[10.5pt] italic mr-1.5">
                      [{QUESTION_SHAPE_LABELS[q.type]}]
                    </span>
                    {q.prompt}
                  </p>

                  {(q.type === 'PG' || q.type === 'PG_KOMPLEKS') && q.options && (
                    <div className="grid grid-cols-1 gap-1 pl-2 text-[12pt]">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-start gap-2">
                          <span className="font-bold">
                            {q.type === 'PG_KOMPLEKS' ? '[  ]' : `${letters[oIdx]}.`}
                          </span>
                          <span>{opt}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === 'BENAR_SALAH' && (
                    <div className="pl-2 text-[12pt] flex items-center gap-6 pt-0.5">
                      <span>[ &nbsp; ] Benar</span>
                      <span>[ &nbsp; ] Salah</span>
                    </div>
                  )}

                  {q.type === 'MENJODOHKAN' && q.matchingPairs && (() => {
                    const shuffledRights = getDeterministicShuffledRights(q.id, q.matchingPairs);
                    return (
                      <table className="w-full border-collapse border border-black text-[11pt] mt-1">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="border border-black px-2 py-1 text-left font-bold">
                              Premis / Pernyataan
                            </th>
                            <th className="border border-black px-2 py-1 text-left font-bold">
                              Pasangan Jawaban
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.matchingPairs.map((pair, pIdx) => (
                            <tr key={pIdx}>
                              <td className="border border-black px-2 py-1">
                                {pIdx + 1}. {pair.left}
                              </td>
                              <td className="border border-black px-2 py-1">
                                {letters[pIdx] || pIdx + 1}. {shuffledRights[pIdx] || ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}

                  {q.type === 'ISIAN' && (
                    <p className="pl-2 pt-1">
                      Jawaban: ....................................................................................
                    </p>
                  )}

                  {q.type === 'URAIAN' && (
                    <div className="ml-2 mt-1 h-16 border border-dashed border-black/60" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: KUNCI JAWABAN */}
      {activeTab === 'kunci_jawaban' && (
        <table className="w-full border-collapse border border-black text-[11pt] leading-[1.35] text-black">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black px-2 py-2 w-10 text-center font-bold">No</th>
              <th className="border border-black px-2.5 py-2 text-left w-28 font-bold">Bentuk Soal</th>
              <th className="border border-black px-2.5 py-2 text-left font-bold">Kunci Jawaban</th>
              <th className="border border-black px-2.5 py-2 text-left font-bold">Pembahasan Ringkas</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, idx) => (
              <tr key={q.id}>
                <td className="border border-black px-2 py-1.5 text-center font-bold">{idx + 1}</td>
                <td className="border border-black px-2.5 py-1.5">{QUESTION_SHAPE_LABELS[q.type]}</td>
                <td className="border border-black px-2.5 py-1.5 font-bold">
                  {formatAnswerKeyText(q)}
                </td>
                <td className="border border-black px-2.5 py-1.5">{q.explanation || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* TAB 4: PEDOMAN PENSKORAN */}
      {activeTab === 'pedoman_penskoran' && (
        <div className="space-y-4 text-black">
          <table className="w-full border-collapse border border-black text-[11pt] leading-[1.35]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black px-2 py-2 w-10 text-center font-bold">No</th>
                <th className="border border-black px-2.5 py-2 text-left w-24 font-bold">Bentuk</th>
                <th className="border border-black px-2 py-2 text-center w-16 font-bold">Level</th>
                <th className="border border-black px-2.5 py-2 text-left font-bold">
                  Kriteria / Rubrik Penskoran
                </th>
                <th className="border border-black px-2 py-2 text-center w-20 font-bold">Skor Maks</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, idx) => (
                <tr key={q.id}>
                  <td className="border border-black px-2 py-1.5 text-center font-bold">{idx + 1}</td>
                  <td className="border border-black px-2.5 py-1.5">{QUESTION_SHAPE_LABELS[q.type]}</td>
                  <td className="border border-black px-2 py-1.5 text-center font-bold">{q.level}</td>
                  <td className="border border-black px-2.5 py-1.5">{q.scoringRubric}</td>
                  <td className="border border-black px-2 py-1.5 text-center font-bold">
                    {q.maxScore}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold">
                <td colSpan={4} className="border border-black px-3 py-2 text-right">
                  Total Skor Maksimal
                </td>
                <td className="border border-black px-2 py-2 text-center">{totalMaxScore}</td>
              </tr>
            </tbody>
          </table>

          <div className="p-3 border border-black text-[11.5pt] space-y-1">
            <p className="font-bold !text-[11.5pt]">Rumus Nilai Akhir:</p>
            <p className="!text-[11.5pt]">
              Nilai Akhir = (Jumlah Skor Perolehan ÷ {totalMaxScore}) × 100
            </p>
          </div>
        </div>
      )}
    </A4DocumentSheet>
  );
};
