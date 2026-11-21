import {
  ExamPackage,
  ExamPaketVariant,
  ExamQuestion,
  QuestionShape,
  SchoolSettings,
  StudentQuestionAnswer,
} from '../types/siakad';
import { resolveSchoolLogo } from '../assets/branding';

export const QUESTION_SHAPE_LABELS: Record<QuestionShape, string> = {
  PG: 'Pilihan Ganda',
  PG_KOMPLEKS: 'PG Kompleks',
  BENAR_SALAH: 'Benar - Salah',
  MENJODOHKAN: 'Menjodohkan',
  ISIAN: 'Isian Singkat',
  URAIAN: 'Uraian',
};

export const EXAM_TYPE_LABELS: Record<string, string> = {
  ASTS: 'Asesmen Sumatif Tengah Semester (ASTS)',
  ASAT: 'Asesmen Sumatif Akhir Tahun (ASAT)',
  PAS: 'Penilaian Akhir Semester (PAS)',
  UH: 'Ulangan Harian',
};

export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDeterministicShuffle<T>(items: T[], seedInput: string): T[] {
  if (items.length <= 1) return [...items];
  let seed = 2166136261;
  for (let i = 0; i < seedInput.length; i++) {
    seed ^= seedInput.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const isIdentical = copy.every((item, idx) => item === items[idx]);
  if (isIdentical && copy.length >= 2) {
    const first = copy.shift()!;
    copy.push(first);
  }
  return copy;
}

function buildDistinctOrder(ids: string[], avoidOrders: string[][] = []): string[] {
  if (ids.length <= 1) return [...ids];
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = shuffleArray(ids);
    const matchesOriginal = candidate.every((id, idx) => id === ids[idx]);
    const matchesAvoid = avoidOrders.some(
      (avoid) => avoid.length === candidate.length && candidate.every((id, idx) => id === avoid[idx])
    );
    if (!matchesOriginal && !matchesAvoid) {
      return candidate;
    }
  }
  // Fallback rotasi deterministik jika jumlah soal sangat sedikit (mis. 2 soal)
  const rotated = [...ids.slice(1), ids[0]];
  if (
    avoidOrders.some(
      (avoid) => avoid.length === rotated.length && rotated.every((id, idx) => id === avoid[idx])
    )
  ) {
    return [...ids].reverse();
  }
  return rotated;
}

export function buildPaketBMapping(questions: ExamQuestion[]): {
  paketBOrder: string[];
  paketBOptionMaps: Record<string, number[]>;
} {
  const baseIds = questions.map((q) => q.id);
  const paketBOrder = buildDistinctOrder(baseIds);
  const paketBOptionMaps: Record<string, number[]> = {};
  questions.forEach((q) => {
    if ((q.type === 'PG' || q.type === 'PG_KOMPLEKS') && q.options && q.options.length > 1) {
      paketBOptionMaps[q.id] = shuffleArray(q.options.map((_, idx) => idx));
    }
  });
  return { paketBOrder, paketBOptionMaps };
}

export function buildPaketCMapping(
  questions: ExamQuestion[],
  paketBOrder: string[] = []
): {
  paketCOrder: string[];
  paketCOptionMaps: Record<string, number[]>;
} {
  const baseIds = questions.map((q) => q.id);
  const paketCOrder = buildDistinctOrder(baseIds, paketBOrder.length > 0 ? [paketBOrder] : []);
  const paketCOptionMaps: Record<string, number[]> = {};
  questions.forEach((q) => {
    if ((q.type === 'PG' || q.type === 'PG_KOMPLEKS') && q.options && q.options.length > 1) {
      paketCOptionMaps[q.id] = shuffleArray(q.options.map((_, idx) => idx));
    }
  });
  return { paketCOrder, paketCOptionMaps };
}

export function buildExamVariantMappings(questions: ExamQuestion[]): {
  paketBOrder: string[];
  paketBOptionMaps: Record<string, number[]>;
  paketCOrder: string[];
  paketCOptionMaps: Record<string, number[]>;
} {
  const b = buildPaketBMapping(questions);
  const c = buildPaketCMapping(questions, b.paketBOrder);
  return {
    ...b,
    ...c,
  };
}

/**
 * Menghasilkan daftar soal terurut dan opsi teracak (untuk Paket B atau Paket C)
 * dengan indeks kunci jawaban yang sudah disesuaikan agar Kisi-kisi, Naskah,
 * Kunci Jawaban, dan Penskoran selalu sinkron 100%.
 */
export function resolveExamQuestionsForVariant(
  exam: Pick<
    ExamPackage,
    'questions' | 'paketBOrder' | 'paketBOptionMaps' | 'paketCOrder' | 'paketCOptionMaps'
  >,
  variant: ExamPaketVariant
): ExamQuestion[] {
  if (variant === 'A') return exam.questions;

  const byId = new Map(exam.questions.map((q) => [q.id, q]));
  const rawOrder = variant === 'C' ? exam.paketCOrder : exam.paketBOrder;
  const optionMaps = variant === 'C' ? exam.paketCOptionMaps : exam.paketBOptionMaps;

  let orderedIds: string[];
  if (rawOrder && rawOrder.length > 0) {
    orderedIds = rawOrder.filter((id) => byId.has(id));
  } else {
    // Fallback deterministik yang stabil untuk naskah lama yang belum menyimpan paketCOrder
    orderedIds = buildDeterministicShuffle(
      exam.questions.map((q) => q.id),
      `variant_${variant}_${exam.questions.map((q) => q.id).join('_')}`
    );
  }

  // Include any newly added questions not yet in stored order
  exam.questions.forEach((q) => {
    if (!orderedIds.includes(q.id)) orderedIds.push(q.id);
  });

  return orderedIds.map((id) => {
    const base = byId.get(id)!;
    const storedMap = optionMaps?.[id];
    const optMap =
      storedMap && base.options && storedMap.length === base.options.length
        ? storedMap
        : (base.type === 'PG' || base.type === 'PG_KOMPLEKS') &&
            base.options &&
            base.options.length > 1
          ? buildDeterministicShuffle(
              base.options.map((_, idx) => idx),
              `opt_${variant}_${id}`
            )
          : undefined;

    if (!optMap || !base.options || optMap.length !== base.options.length) {
      return base;
    }
    const shuffledOptions = optMap.map((origIdx) => base.options![origIdx]);
    const newCorrectIdx =
      typeof base.correctOptionIndex === 'number'
        ? optMap.indexOf(base.correctOptionIndex)
        : undefined;
    const newCorrectIndices = Array.isArray(base.correctOptionIndices)
      ? base.correctOptionIndices
          .map((orig) => optMap.indexOf(orig))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b)
      : undefined;

    return {
      ...base,
      options: shuffledOptions,
      correctOptionIndex: newCorrectIdx,
      correctOptionIndices: newCorrectIndices,
    };
  });
}

export function gradeObjectiveQuestions(
  questions: ExamQuestion[],
  answers: Record<string, StudentQuestionAnswer>
): {
  autoScore: number;
  maxObjectiveScore: number;
  maxTotalScore: number;
  hasEssay: boolean;
  finalScoreWithoutEssay: number;
} {
  let autoScore = 0;
  let maxObjectiveScore = 0;
  let maxTotalScore = 0;
  let hasEssay = false;

  questions.forEach((q) => {
    const weight = q.maxScore || (q.type === 'URAIAN' ? 10 : 2);
    maxTotalScore += weight;

    if (q.type === 'URAIAN') {
      hasEssay = true;
      return;
    }

    maxObjectiveScore += weight;
    const ans = answers[q.id];
    if (!ans) return;

    if (q.type === 'PG') {
      if (typeof ans.selectedIndex === 'number' && ans.selectedIndex === q.correctOptionIndex) {
        autoScore += weight;
      }
    } else if (q.type === 'PG_KOMPLEKS') {
      const expected = [...(q.correctOptionIndices || [])].sort((a, b) => a - b);
      const selected = [...(ans.selectedIndices || [])].sort((a, b) => a - b);
      if (expected.length > 0 && selected.length > 0) {
        const correctSelected = selected.filter((i) => expected.includes(i)).length;
        const wrongSelected = selected.filter((i) => !expected.includes(i)).length;
        const rawRatio = Math.max(0, (correctSelected - wrongSelected * 0.5) / expected.length);
        autoScore += Math.round(weight * rawRatio * 10) / 10;
      }
    } else if (q.type === 'BENAR_SALAH') {
      if (typeof ans.booleanValue === 'boolean' && ans.booleanValue === q.correctBoolean) {
        autoScore += weight;
      }
    } else if (q.type === 'MENJODOHKAN') {
      const pairs = q.matchingPairs || [];
      const userMap = ans.matchingMap || {};
      if (pairs.length > 0) {
        let matchedCount = 0;
        pairs.forEach((p, idx) => {
          if ((userMap[idx] || '').trim().toLowerCase() === p.right.trim().toLowerCase()) {
            matchedCount++;
          }
        });
        autoScore += Math.round((weight * (matchedCount / pairs.length)) * 10) / 10;
      }
    } else if (q.type === 'ISIAN') {
      const userText = (ans.textValue || '').trim().toLowerCase();
      const accepted = (q.shortAnswers || []).map((s) => s.trim().toLowerCase());
      if (userText && accepted.some((a) => a === userText)) {
        autoScore += weight;
      }
    }
  });

  const roundedAuto = Math.round(autoScore * 10) / 10;
  const finalScoreWithoutEssay =
    maxTotalScore > 0 ? Math.round((roundedAuto / maxTotalScore) * 100 * 10) / 10 : 0;

  return {
    autoScore: roundedAuto,
    maxObjectiveScore,
    maxTotalScore,
    hasEssay,
    finalScoreWithoutEssay,
  };
}

export function formatAnswerKeyText(q: ExamQuestion): string {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  switch (q.type) {
    case 'PG': {
      const idx = q.correctOptionIndex ?? 0;
      const label = letters[idx] || String(idx + 1);
      const optText = q.options?.[idx] || '';
      return `${label}. ${optText}`;
    }
    case 'PG_KOMPLEKS': {
      const indices = q.correctOptionIndices || [];
      return indices
        .map((i) => `${letters[i] || i + 1}. ${q.options?.[i] || ''}`)
        .join(' | ');
    }
    case 'BENAR_SALAH':
      return q.correctBoolean ? 'Benar' : 'Salah';
    case 'MENJODOHKAN':
      return (q.matchingPairs || []).map((p) => `${p.left} → ${p.right}`).join('; ');
    case 'ISIAN':
      return (q.shortAnswers || []).join(' / ');
    case 'URAIAN':
      return q.essayAnswerKey || q.scoringRubric;
    default:
      return '-';
  }
}

export function getDeterministicShuffledRights(
  questionId: string,
  pairs: Array<{ left: string; right: string }>
): string[] {
  const rights = pairs.map((p) => p.right);
  if (rights.length <= 1) return rights;
  // Deterministic hash-based rotation/shuffle so print preview never flickers and answers aren't aligned 1-to-1
  let seed = 0;
  for (let i = 0; i < questionId.length; i++) {
    seed = (seed * 31 + questionId.charCodeAt(i)) >>> 0;
  }
  const copy = [...rights];
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  // Ensure at least one position differs from original order if all elements are distinct
  const isIdentical = copy.every((val, idx) => val === rights[idx]);
  if (isIdentical && copy.length >= 2) {
    const first = copy.shift()!;
    copy.push(first);
  }
  return copy;
}

export type ExamExportTab = 'kisi_kisi' | 'naskah_soal' | 'kunci_jawaban' | 'pedoman_penskoran';

export function exportExamToWord({
  schoolSettings,
  exam,
  variant,
  questions,
  activeTab = 'naskah_soal',
  teacherNip = '',
}: {
  schoolSettings: SchoolSettings;
  exam: ExamPackage;
  variant: ExamPaketVariant;
  questions: ExamQuestion[];
  activeTab?: ExamExportTab;
  teacherNip?: string;
}): void {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const totalMaxScore = questions.reduce((sum, q) => sum + (q.maxScore || 2), 0);
  const dateLongId = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const tabHeadingMap: Record<ExamExportTab, string> = {
    kisi_kisi: `KISI-KISI PENULISAN SOAL ${exam.examType} — PAKET ${variant}`,
    naskah_soal: `${EXAM_TYPE_LABELS[exam.examType] || exam.examType} — PAKET ${variant}`,
    kunci_jawaban: `KUNCI JAWABAN & PEMBAHASAN ${exam.examType} — PAKET ${variant}`,
    pedoman_penskoran: `PEDOMAN PENSKORAN & RUBRIK PENILAIAN — PAKET ${variant}`,
  };

  let bodySectionHtml = '';

  if (activeTab === 'naskah_soal') {
    const questionsHtml = questions
      .map((q, idx) => {
        let bodyHtml = '';
        if ((q.type === 'PG' || q.type === 'PG_KOMPLEKS') && q.options) {
          bodyHtml = `<div style="margin-left:18pt;margin-top:4pt;">${q.options
            .map(
              (opt, i) =>
                `<div><strong>${q.type === 'PG_KOMPLEKS' ? '[ &nbsp; ]' : `${letters[i] || i + 1}.`}</strong> ${opt}</div>`
            )
            .join('')}</div>`;
        } else if (q.type === 'BENAR_SALAH') {
          bodyHtml = `<div style="margin-left:18pt;margin-top:4pt;">[ &nbsp; ] Benar &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [ &nbsp; ] Salah</div>`;
        } else if (q.type === 'MENJODOHKAN' && q.matchingPairs) {
          const shuffledRights = getDeterministicShuffledRights(q.id, q.matchingPairs);
          bodyHtml = `<table style="width:94%;margin-left:18pt;margin-top:4pt;border-collapse:collapse;">
            <tr style="background:#f1f5f9;"><th style="border:1px solid #000;padding:4pt;text-align:left;">Premis / Pernyataan</th><th style="border:1px solid #000;padding:4pt;text-align:left;">Pasangan Jawaban</th></tr>
            ${q.matchingPairs
              .map(
                (p, i) =>
                  `<tr><td style="border:1px solid #000;padding:4pt;">${i + 1}. ${p.left}</td><td style="border:1px solid #000;padding:4pt;">${letters[i] || i + 1}. ${shuffledRights[i] || ''}</td></tr>`
              )
              .join('')}
          </table>`;
        } else if (q.type === 'ISIAN') {
          bodyHtml = `<div style="margin-left:18pt;margin-top:6pt;">Jawaban: ......................................................................</div>`;
        } else if (q.type === 'URAIAN') {
          bodyHtml = `<div style="margin-left:18pt;margin-top:6pt;border:1px dashed #64748b;height:52pt;"></div>`;
        }

        return `<div style="margin-bottom:10pt;">
          <p style="margin:0;text-align:justify;"><strong>${idx + 1}.</strong> <em>[${QUESTION_SHAPE_LABELS[q.type]}]</em> ${q.prompt}</p>
          ${bodyHtml}
        </div>`;
      })
      .join('');

    bodySectionHtml = `
      <table class="id-table">
        <tr><td width="50%">Mata Pelajaran: <strong>${exam.mapel}</strong></td><td width="50%">Program / Rombel: <strong>${exam.kelas}</strong></td></tr>
        <tr><td>Tahun Ajaran: <strong>${exam.academicYear} (${exam.semester})</strong></td><td>Alokasi Waktu: <strong>${exam.durationMinutes} Menit · Paket ${variant}</strong></td></tr>
      </table>
      <table class="id-table">
        <tr><td width="50%"><strong>Nama Lengkap Siswa:</strong> ...........................................</td><td width="50%"><strong>NIS / NISN:</strong> .................................</td></tr>
        <tr><td><strong>Hari / Tanggal:</strong> ...............................................</td><td><strong>Nilai / Paraf Tutor:</strong> .......................</td></tr>
      </table>
      <p style="font-size:11pt;font-style:italic;border-bottom:1px solid #000;padding-bottom:6pt;margin-bottom:12pt;">
        Petunjuk: Berdoalah sebelum mengerjakan. Baca setiap stimulus dengan saksama dan kerjakan soal secara jujur dan mandiri.
      </p>
      ${questionsHtml}
    `;
  } else if (activeTab === 'kisi_kisi') {
    bodySectionHtml = `
      <table class="id-table">
        <tr><td width="50%">Mata Pelajaran: <strong>${exam.mapel}</strong></td><td width="50%">Kelas / Paket: <strong>${exam.kelas}</strong></td></tr>
        <tr><td>Materi Pokok: <strong>${exam.materi}</strong></td><td>Jumlah Soal: <strong>${questions.length} Butir (${totalMaxScore} Poin)</strong></td></tr>
      </table>
      <table class="data-table">
        <thead>
          <tr style="background:#f1f5f9;">
            <th width="6%">No</th><th>Kompetensi / TP</th><th>Materi</th><th>Indikator Soal</th><th width="10%">Level</th><th width="15%">Bentuk</th>
          </tr>
        </thead>
        <tbody>
          ${questions
            .map(
              (q, idx) => `<tr>
                <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
                <td>${q.competency}</td>
                <td>${q.materi}</td>
                <td>${q.indicator}</td>
                <td style="text-align:center;font-weight:bold;">${q.level}</td>
                <td>${QUESTION_SHAPE_LABELS[q.type]}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else if (activeTab === 'kunci_jawaban') {
    bodySectionHtml = `
      <table class="id-table">
        <tr><td width="50%">Mata Pelajaran: <strong>${exam.mapel}</strong></td><td width="50%">Kelas / Paket: <strong>${exam.kelas}</strong></td></tr>
        <tr><td>Materi Pokok: <strong>${exam.materi}</strong></td><td>Jumlah Soal: <strong>${questions.length} Butir (${totalMaxScore} Poin)</strong></td></tr>
      </table>
      <table class="data-table">
        <thead>
          <tr style="background:#f1f5f9;">
            <th width="6%">No</th><th width="18%">Bentuk Soal</th><th width="34%">Kunci Jawaban</th><th>Pembahasan Ringkas</th>
          </tr>
        </thead>
        <tbody>
          ${questions
            .map(
              (q, idx) => `<tr>
                <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
                <td>${QUESTION_SHAPE_LABELS[q.type]}</td>
                <td style="font-weight:bold;">${formatAnswerKeyText(q)}</td>
                <td>${q.explanation || '-'}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else {
    bodySectionHtml = `
      <table class="id-table">
        <tr><td width="50%">Mata Pelajaran: <strong>${exam.mapel}</strong></td><td width="50%">Kelas / Paket: <strong>${exam.kelas}</strong></td></tr>
        <tr><td>Materi Pokok: <strong>${exam.materi}</strong></td><td>Total Skor Maks: <strong>${totalMaxScore} Poin</strong></td></tr>
      </table>
      <table class="data-table">
        <thead>
          <tr style="background:#f1f5f9;">
            <th width="6%">No</th><th width="16%">Bentuk</th><th width="10%">Level</th><th>Kriteria / Rubrik Penskoran</th><th width="12%">Skor Maks</th>
          </tr>
        </thead>
        <tbody>
          ${questions
            .map(
              (q, idx) => `<tr>
                <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
                <td>${QUESTION_SHAPE_LABELS[q.type]}</td>
                <td style="text-align:center;font-weight:bold;">${q.level}</td>
                <td>${q.scoringRubric}</td>
                <td style="text-align:center;font-weight:bold;">${q.maxScore}</td>
              </tr>`
            )
            .join('')}
          <tr style="background:#f1f5f9;font-weight:bold;">
            <td colspan="4" style="text-align:right;">Total Skor Maksimal</td>
            <td style="text-align:center;">${totalMaxScore}</td>
          </tr>
        </tbody>
      </table>
      <div style="border:1px solid #000;padding:8pt;margin-top:10pt;font-size:11pt;">
        <strong>Rumus Nilai Akhir:</strong> Nilai Akhir = (Jumlah Skor Perolehan ÷ ${totalMaxScore}) × 100
      </div>
    `;
  }

  const contactLine = [
    schoolSettings.phone ? `Telp. ${schoolSettings.phone}` : '',
    schoolSettings.email ? `Email: ${schoolSettings.email}` : '',
    schoolSettings.website ? schoolSettings.website : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const resolvedLogoUrl = resolveSchoolLogo(schoolSettings.logoUrl);
  const kopSectionHtml = schoolSettings.letterheadUrl
    ? `<div class="kop">
        <img src="${schoolSettings.letterheadUrl}" alt="Kop Surat ${schoolSettings.schoolName}" style="max-width:100%;max-height:110pt;object-fit:contain;" />
      </div>`
    : `<table class="kop-table" cellspacing="0" cellpadding="0">
        <tr>
          ${
            resolvedLogoUrl
              ? `<td style="width:70pt;vertical-align:middle;text-align:center;padding-right:8pt;border:none;">
                   <img src="${resolvedLogoUrl}" alt="Logo ${schoolSettings.schoolName}" width="62" height="62" style="width:62pt;height:62pt;object-fit:contain;" />
                 </td>`
              : ''
          }
          <td style="text-align:center;vertical-align:middle;border:none;">
            <div style="font-size:11.5pt;font-weight:bold;text-transform:uppercase;">YAYASAN PENDIDIKAN MASYARAKAT ANNUR KARISMA</div>
            <div style="font-size:15pt;font-weight:bold;text-transform:uppercase;color:#000000;">${schoolSettings.schoolName}</div>
            <div style="font-size:10pt;font-weight:bold;">PROGRAM PENDIDIKAN KESETARAAN PAKET A (SD), PAKET B (SMP), DAN PAKET C (SMA)</div>
            <div style="font-size:10pt;">${schoolSettings.address} · NPSN: ${schoolSettings.npsn}</div>
            ${contactLine ? `<div style="font-size:9.5pt;">${contactLine}</div>` : ''}
          </td>
        </tr>
      </table>`;

  const teacherSigHtml = schoolSettings.teacherSignatureUrl
    ? `<div style="min-height:48pt;margin:4pt 0;"><img src="${schoolSettings.teacherSignatureUrl}" alt="TTD Guru" style="max-height:46pt;max-width:140pt;object-fit:contain;" /></div>`
    : `<div style="height:46pt;"></div>`;

  const headmasterSigHtml = schoolSettings.headmasterSignatureUrl
    ? `<div style="min-height:48pt;margin:4pt 0;"><img src="${schoolSettings.headmasterSignatureUrl}" alt="TTD Kepala PKBM" style="max-height:48pt;max-width:145pt;object-fit:contain;" /></div>`
    : `<div style="height:46pt;"></div>`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${tabHeadingMap[activeTab]}</title>
  <style>
    @page { size: A4 portrait; margin: 2cm 2cm 2cm 2.5cm; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #000000; }
    .kop { text-align: center; border-bottom: 3pt double #000000; padding-bottom: 8pt; margin-bottom: 12pt; }
    .kop-table { width: 100%; border-collapse: collapse; border-bottom: 3pt double #000000; padding-bottom: 8pt; margin-bottom: 12pt; }
    .id-table { width: 100%; border-collapse: collapse; margin-bottom: 10pt; font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
    .id-table td { border: 1px solid #000000; padding: 4pt 6pt; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; }
    .data-table th, .data-table td { border: 1px solid #000000; padding: 4pt 6pt; vertical-align: top; }
    .sig-table { width: 100%; border-collapse: collapse; margin-top: 28pt; font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; }
    .sig-table td { border: none; text-align: center; vertical-align: top; width: 50%; }
  </style>
</head>
<body>
  ${kopSectionHtml}
  <h3 style="text-align:center;font-size:12pt;margin:6pt 0 2pt;text-transform:uppercase;text-decoration:underline;">${tabHeadingMap[activeTab]}</h3>
  <p style="text-align:center;font-size:10.5pt;margin:0 0 10pt;">Nomor: UJN/${exam.examType}/${exam.academicYear}/PKT-${variant}</p>
  ${bodySectionHtml}
  <table class="sig-table">
    <tr>
      <td>
        <div>&nbsp;</div>
        <div>Mengetahui,</div>
        <div>Guru / Tutor Penyusun Soal</div>
        ${teacherSigHtml}
        <div style="font-weight:bold;text-decoration:underline;">${exam.authorName}</div>
        ${teacherNip ? `<div style="font-size:10pt;">NIP / NUPTK. ${teacherNip}</div>` : ''}
      </td>
      <td>
        <div>Cianjur, ${dateLongId}</div>
        <div>Menyetujui,</div>
        <div>Kepala ${schoolSettings.schoolName}</div>
        ${headmasterSigHtml}
        <div style="font-weight:bold;text-decoration:underline;">${schoolSettings.headmasterName}</div>
        ${schoolSettings.headmasterNip ? `<div style="font-size:10pt;">NIP / NUPTK. ${schoolSettings.headmasterNip}</div>` : ''}
      </td>
    </tr>
  </table>
</body>
</html>`;

  const tabSlugMap: Record<ExamExportTab, string> = {
    naskah_soal: 'Naskah_Soal',
    kisi_kisi: 'Kisi_Kisi',
    kunci_jawaban: 'Kunci_Jawaban',
    pedoman_penskoran: 'Pedoman_Penskoran',
  };

  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exam.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${tabSlugMap[activeTab]}_Paket_${variant}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
