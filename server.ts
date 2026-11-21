import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT =
  process.env.NODE_ENV === 'production'
    ? Number(process.env.PORT) || 3000
    : 3000;

app.use(express.json({ limit: '2mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('MISSING_API_KEY');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const PRIMARY_TEXT_MODEL = 'gemini-4-hydrogen';
const FALLBACK_TEXT_MODEL = 'gemini-3.1-flash-lite';
const PRIMARY_ATTEMPT_TIMEOUT_MS = 14_000;
const FALLBACK_ATTEMPT_TIMEOUT_MS = 48_000;
const PRIMARY_COOLDOWN_MS = 300_000;

let primaryCooldownUntil = 0;

function cleanHtmlResponse(raw: string): string {
  let text = String(raw || '')
    .replace(/^```(?:html|xml)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  if (!text) return '';

  // If the model wrapped output in a full HTML document, extract inner <body>
  const bodyMatch = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    text = bodyMatch[1].trim();
  }

  // Strip unsafe or document-wrapper tags
  text = text
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, '')
    .trim();

  // Convert accidental standalone Markdown headings / bold syntax into valid HTML
  text = text
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .trim();

  // Guarantee valid block-level HTML if model returned plain text
  if (!/<(?:h[1-6]|p|ul|ol|table|div|section|blockquote)\b/i.test(text)) {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`);
    return paragraphs.join('\n');
  }

  return text;
}

function safeParseJsonResponse<T>(raw: string, fallback: T): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!cleaned) return fallback;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('INVALID_JSON_RESPONSE');
  }
}

function isRetryableGeminiError(err: unknown): boolean {
  const errObj = err as { status?: number; message?: string };
  const status = typeof errObj?.status === 'number' ? errObj.status : undefined;
  const msg = String(errObj?.message || (err instanceof Error ? err.message : err)).toLowerCase();
  return (
    status === 503 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    status === 429 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('temporarily') ||
    msg.includes('request_timeout') ||
    msg.includes('empty_model_response') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`REQUEST_TIMEOUT_${timeoutMs}MS`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateContentWithResilience(
  ai: GoogleGenAI,
  params: {
    contents: string | Array<{ role: string; parts: Array<{ text: string }> }>;
    config?: Record<string, unknown>;
    primaryTimeoutMs?: number;
    fallbackTimeoutMs?: number;
  }
) {
  const now = Date.now();
  const primaryTimeout = params.primaryTimeoutMs ?? PRIMARY_ATTEMPT_TIMEOUT_MS;
  const fallbackTimeout = params.fallbackTimeoutMs ?? FALLBACK_ATTEMPT_TIMEOUT_MS;
  const attempts: Array<{
    model: string;
    delayMs: number;
    timeoutMs: number;
    dropThinking?: boolean;
    isPrimary?: boolean;
  }> = [];

  if (now >= primaryCooldownUntil) {
    attempts.push({
      model: PRIMARY_TEXT_MODEL,
      delayMs: 0,
      timeoutMs: primaryTimeout,
      isPrimary: true,
    });
  }

  attempts.push(
    {
      model: FALLBACK_TEXT_MODEL,
      delayMs: 0,
      timeoutMs: fallbackTimeout,
      dropThinking: true,
    },
    {
      model: FALLBACK_TEXT_MODEL,
      delayMs: 700,
      timeoutMs: fallbackTimeout,
      dropThinking: true,
    }
  );

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      const nextConfig = params.config ? { ...params.config } : undefined;
      if (attempt.dropThinking && nextConfig && 'thinkingConfig' in nextConfig) {
        delete nextConfig.thinkingConfig;
      }
      const response = await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents: params.contents as never,
          ...(nextConfig ? { config: nextConfig } : {}),
        }),
        attempt.timeoutMs
      );
      if (!response.text || !response.text.trim()) {
        throw new Error('EMPTY_MODEL_RESPONSE');
      }
      if (attempt.isPrimary) {
        primaryCooldownUntil = 0;
      }
      return { response, modelUsed: attempt.model };
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err)) {
        throw err;
      }
      if (attempt.isPrimary) {
        primaryCooldownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      }
      console.warn(
        `[Gemini Retry] Model ${attempt.model} mengalami gangguan sementara (${
          err instanceof Error ? err.message.slice(0, 120) : 'retryable'
        }), beralih ke jalur berikutnya...`
      );
    }
  }
  throw lastError;
}

function mapGeminiError(
  err: unknown,
  contextLabel = 'dokumen dengan AI'
): {
  status: number;
  message: string;
  code: string;
  detail?: string;
} {
  const errObj = err as { status?: number; message?: string; name?: string };
  const rawMsg = errObj?.message || (err instanceof Error ? err.message : String(err));
  const lower = rawMsg.toLowerCase();
  const httpStatus = typeof errObj?.status === 'number' ? errObj.status : undefined;

  if (
    rawMsg === 'MISSING_API_KEY' ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('api key')
  ) {
    return {
      status: 400,
      code: 'API_KEY_INVALID',
      message:
        'Kunci Gemini API belum dikonfigurasi atau tidak valid. Silakan periksa panel Settings > Secrets di AI Studio.',
    };
  }
  if (lower.includes('request_timeout') || lower.includes('etimedout')) {
    return {
      status: 504,
      code: 'REQUEST_TIMEOUT',
      message:
        'Permintaan ke layanan Gemini AI melebihi batas waktu tunggu. Silakan klik Generate kembali.',
    };
  }
  if (
    httpStatus === 503 ||
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      code: 'SERVICE_BUSY',
      message:
        'Server Gemini AI sedang mengalami lonjakan permintaan tinggi. Sistem sudah mencoba ulang otomatis — silakan klik Generate kembali beberapa detik lagi.',
    };
  }
  if (httpStatus === 429 || lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'Batas kuota permintaan Gemini API sedang tercapai. Mohon tunggu 30–60 detik lalu coba lagi.',
    };
  }
  if (httpStatus === 403 || lower.includes('403') || lower.includes('permission_denied')) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      message:
        'Akses ke Gemini API ditolak (403). Periksa izin kunci API pada panel Settings > Secrets.',
    };
  }
  if (httpStatus === 404 || lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message: 'Model AI yang diminta tidak tersedia saat ini. Silakan coba beberapa saat lagi.',
    };
  }
  return {
    status: httpStatus && httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500,
    code: 'GENERATION_FAILED',
    message: `Terjadi gangguan sementara saat menyusun ${contextLabel}. Silakan coba kembali.`,
    detail: rawMsg.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]').slice(0, 240),
  };
}

app.get('/api/perangkat-ajar/status', (_req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const configured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  res.json({
    apiKeyConfigured: configured,
    model: PRIMARY_TEXT_MODEL,
    fallbackModel: FALLBACK_TEXT_MODEL,
  });
});

const DOC_TYPE_STRUCTURES: Record<string, string> = {
  MODUL_AJAR: `Buat MODUL AJAR / RPP KURIKULUM MERDEKA KESETARAAN (PKBM) yang SANGAT LENGKAP dan siap pakai dengan urutan bagian persis sebagai berikut (gunakan tag <h3> untuk setiap judul bagian agar mudah diidentifikasi dan di-regenerate per bagian):
1. <h3>1. Identitas Modul</h3> (Tabel 2 kolom berisi: Satuan Pendidikan, Program/Fase, Kelas/Rombel, Mata Pelajaran, Topik/Materi, Tahun Ajaran & Semester, Jumlah Pertemuan, Alokasi Waktu, Penyusun)
2. <h3>2. Kompetensi Awal</h3> (Deskripsi pengetahuan/keterampilan prasyarat warga belajar)
3. <h3>3. Dimensi Profil Lulusan (8 Dimensi)</h3> (Tabel berisi dimensi yang dipilih beserta bentuk penerapannya dalam pembelajaran dari 8 dimensi: Keimanan & Ketakwaan terhadap Tuhan YME, Kewargaan, Penalaran Kritis, Kreativitas, Kolaborasi, Kemandirian, Kesehatan, Komunikasi)
4. <h3>4. Sarana dan Prasarana</h3> (Alat, bahan, sumber belajar kontekstual PKBM, media digital/cetak)
5. <h3>5. Target Peserta Didik</h3> (Karakteristik warga belajar program kesetaraan reguler/mandiri/beragam latar belakang)
6. <h3>6. Model dan Pendekatan Pembelajaran</h3> (Pendekatan Pembelajaran Mendalam / Deep Learning berbasis Mindful, Meaningful, dan Joyful Learning beserta model seperti Problem/Project Based Learning)
7. <h3>7. Tujuan Pembelajaran</h3> (Rumusan TP terukur dengan kata kerja operasional)
8. <h3>8. Pemahaman Bermakna</h3> (Manfaat nyata materi bagi kehidupan dan kemandirian warga belajar)
9. <h3>9. Pertanyaan Pemantik</h3> (3-4 pertanyaan terbuka yang membangkitkan rasa ingin tahu & kesadaran penuh)
10. <h3>10. Kegiatan Pembelajaran</h3> (Rincian setiap pertemuan sesuai jumlah pertemuan yang diminta. Setiap pertemuan wajib memuat: A. Kegiatan Pembuka / Mindful, B. Kegiatan Inti berbasis tahapan <strong>Memahami – Mengaplikasi – Merefleksi</strong> yang Meaningful & Joyful, C. Kegiatan Penutup, lengkap dengan estimasi menit)
11. <h3>11. Asesmen Pembelajaran</h3> (Diagnostik awal, Formatif selama proses, Sumatif akhir beserta tabel rubrik penilaian)
12. <h3>12. Pengayaan dan Remedial</h3> (Program tindak lanjut konkret untuk peserta didik yang melampaui dan yang membutuhkan pendampingan)
13. <h3>13. Refleksi Pendidik dan Peserta Didik</h3> (Daftar pertanyaan refleksi untuk guru dan warga belajar)
14. <h3>14. Lembar Kerja Peserta Didik (LKPD)</h3> (Judul LKPD, petunjuk kerja, aktivitas terstruktur, dan soal/tugas kontekstual siap dikerjakan)
15. <h3>15. Bahan Bacaan Pendidik dan Peserta Didik</h3> (Ringkasan materi esensial yang komunikatif dan aplikatif)
16. <h3>16. Glosarium</h3> (Minimal 6 istilah penting beserta definisinya)
17. <h3>17. Daftar Pustaka</h3> (Referensi resmi Kurikulum Merdeka / Kemendikbudristek / sumber relevan)`,

  CP: `Buat dokumen CAPAIAN PEMBELAJARAN (CP) KURIKULUM MERDEKA KESETARAAN dengan bagian <h3>:
1. <h3>1. Identitas Capaian Pembelajaran</h3> (Tabel identitas PKBM, Paket/Fase, Mapel)
2. <h3>2. Rasional Mata Pelajaran</h3> (Keterkaitan dengan Pembelajaran Mendalam dan 8 Dimensi Profil Lulusan)
3. <h3>3. Tujuan Mata Pelajaran</h3>
4. <h3>4. Karakteristik Mata Pelajaran</h3> (Tabel elemen dan deskripsi)
5. <h3>5. Capaian Pembelajaran Fase</h3> (Rumusan CP utuh serta pemetaan per elemen kompetensi)`,

  TP_ATP: `Buat dokumen TUJUAN PEMBELAJARAN & ALUR TUJUAN PEMBELAJARAN (TP/ATP) dengan bagian <h3>:
1. <h3>1. Identitas TP dan ATP</h3>
2. <h3>2. Rasional Alur Pembelajaran Mendalam</h3> (Integrasi Mindful, Meaningful, Joyful Learning & 8 Dimensi Profil Lulusan)
3. <h3>3. Pemetaan Elemen, CP, dan Tujuan Pembelajaran</h3> (Tabel berisi Elemen, Capaian Pembelajaran, Kompetensi, Lingkup Materi, Rumusan TP)
4. <h3>4. Alur Tujuan Pembelajaran (ATP) Per Pertemuan</h3> (Tabel urut kode TP, Alur Tujuan, Dimensi Profil Lulusan, Alokasi JP, Bentuk Asesmen)`,

  KKTP: `Buat dokumen KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP) dengan bagian <h3>:
1. <h3>1. Identitas KKTP</h3>
2. <h3>2. Pendekatan Kriteria Ketercapaian</h3>
3. <h3>3. Rubrik Penilaian 4 Tingkat</h3> (Tabel kriteria dengan 4 kolom level: Baru Berkembang, Layak, Cakap, Mahir)
4. <h3>4. Interval Nilai dan Tindak Lanjut</h3> (Tabel rentang nilai 0-100, predikat, dan strategi remedial/pengayaan)`,

  PROTA: `Buat dokumen PROGRAM TAHUNAN (PROTA) PKBM dengan bagian <h3>:
1. <h3>1. Identitas Program Tahunan</h3>
2. <h3>2. Rekapitulasi Minggu Efektif</h3> (Tabel rincian minggu efektif Semester Ganjil & Genap)
3. <h3>3. Matriks Program Tahunan</h3> (Tabel lengkap berisi Semester, No, Tujuan Pembelajaran / Materi Pokok, Pendekatan Pembelajaran Mendalam, Alokasi Waktu JP, Keterangan)`,

  PROSEM: `Buat dokumen PROGRAM SEMESTER (PROSEM) PKBM dengan bagian <h3>:
1. <h3>1. Identitas Program Semester</h3>
2. <h3>2. Perhitungan Jam Efektif Semester</h3>
3. <h3>3. Distribusi Materi dan Jadwal Mingguan</h3> (Tabel berisi No, Materi/TP, JP, dan kolom ceklis distribusi bulan & minggu ke-1 s.d. ke-4)`,

  KALDIK: `Buat dokumen KALENDER PENDIDIKAN PKBM dengan bagian <h3>:
1. <h3>1. Identitas Kalender Pendidikan</h3>
2. <h3>2. Ketentuan Umum Kegiatan Akademik Kesetaraan</h3>
3. <h3>3. Matriks Kegiatan Akademik Semester</h3> (Tabel berisi Bulan, Tanggal Perkiraan, Uraian Kegiatan Pembelajaran/Tutorial/Asesmen/Uji Kesetaraan, Keterangan)
4. <h3>4. Rekapitulasi Hari Efektif Belajar dan Libur</h3>`,
};

app.post('/api/perangkat-ajar/generate', async (req, res) => {
  try {
    const {
      docType = 'MODUL_AJAR',
      paket = 'Paket C',
      fase = 'Fase F',
      kelas = 'Kelas 12 IPS',
      mapel = 'Bahasa Indonesia',
      materi = '',
      deskripsiTambahan = '',
      jumlahPertemuan = 2,
      alokasiWaktu = '2 x 45 Menit',
      academicYear = '2026/2027',
      semester = 'Ganjil',
      schoolName = 'PKBM ANNUR KARISMA',
      teacherName = 'Tutor Pengampu',
      pendekatan = ['Mindful Learning', 'Meaningful Learning', 'Joyful Learning'],
      dimensiProfil = [
        'Keimanan dan Ketakwaan',
        'Penalaran Kritis',
        'Kreativitas',
        'Kolaborasi',
        'Kemandirian',
        'Komunikasi',
      ],
    } = req.body || {};

    if (!materi || !mapel) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Mata pelajaran dan topik materi wajib diisi sebelum menghasilkan dokumen.',
      });
    }

    const ai = getGeminiClient();
    const structureGuide = DOC_TYPE_STRUCTURES[docType] || DOC_TYPE_STRUCTURES.MODUL_AJAR;

    const systemInstruction = `Anda adalah ahli kurikulum pendidikan kesetaraan Indonesia (PKBM Paket A, B, dan C) dan pengembang perangkat ajar Kurikulum Merdeka berbasis Pembelajaran Mendalam (Deep Learning: Mindful, Meaningful, Joyful Learning) serta 8 Dimensi Profil Lulusan (keimanan dan ketakwaan terhadap Tuhan YME, kewargaan, penalaran kritis, kreativitas, kolaborasi, kemandirian, kesehatan, komunikasi).

ATURAN FORMAT OUTPUT (WAJIB):
1. Keluarkan HANYA potongan HTML bersih siap render di dalam editor dokumen A4 (JANGAN bungkus dengan <html>, <body>, <head>, atau markdown code fence \`\`\`html).
2. Gunakan tag semantik yang rapi: <h3> untuk judul bab/bagian, <h4> untuk subbagian, <p> untuk paragraf, <ul>/<ol> dengan <li> untuk daftar, <strong> untuk penekanan, dan <table> dengan <thead><tr><th> dan <tbody><tr><td> untuk tabel terstruktur.
3. Jangan membuat kop surat sekolah atau blok tanda tangan di output karena sudah dipasang otomatis oleh template A4 aplikasi.
4. Gunakan Bahasa Indonesia baku, pedagogis, konkret, operasional, dan kontekstual bagi warga belajar PKBM.`;

    const prompt = `Susun perangkat ajar resmi dengan rincian berikut:
- Jenis Dokumen: ${docType}
- Satuan Pendidikan: ${schoolName}
- Program / Fase: ${paket} / ${fase}
- Kelas / Rombel: ${kelas}
- Mata Pelajaran: ${mapel}
- Topik / Materi Pokok: ${materi}
- Tahun Ajaran / Semester: ${academicYear} / ${semester}
- Jumlah Pertemuan: ${jumlahPertemuan} pertemuan
- Alokasi Waktu per Pertemuan: ${alokasiWaktu}
- Pendidik / Penyusun: ${teacherName}
- Pendekatan Pembelajaran Mendalam: ${Array.isArray(pendekatan) ? pendekatan.join(', ') : pendekatan}
- Dimensi Profil Lulusan Fokus: ${Array.isArray(dimensiProfil) ? dimensiProfil.join(', ') : dimensiProfil}
${deskripsiTambahan ? `- Catatan Konteks Khusus: ${deskripsiTambahan}` : ''}

INSTRUKSI STRUKTUR DOKUMEN:
${structureGuide}`;

    const { response, modelUsed } = await generateContentWithResilience(ai, {
      contents: prompt,
      primaryTimeoutMs: 20_000,
      fallbackTimeoutMs: 55_000,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const html = cleanHtmlResponse(response.text || '');
    if (!html) {
      return res.status(502).json({
        code: 'EMPTY_RESPONSE',
        message: 'Model AI mengembalikan dokumen kosong. Silakan coba generate ulang.',
      });
    }

    return res.json({ html, modelUsed });
  } catch (err) {
    const mapped = mapGeminiError(err, 'perangkat ajar dengan AI');
    console.error('Error /api/perangkat-ajar/generate:', err);
    return res.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.detail ? { detail: mapped.detail } : {}),
    });
  }
});

app.post('/api/perangkat-ajar/regenerate-section', async (req, res) => {
  try {
    const {
      docType = 'MODUL_AJAR',
      paket = 'Paket C',
      mapel = '',
      materi = '',
      sectionTitle = '',
      currentSectionHtml = '',
      customInstruction = '',
    } = req.body || {};

    if (!sectionTitle) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Pilih bagian dokumen yang ingin di-regenerate terlebih dahulu.',
      });
    }

    const ai = getGeminiClient();

    const systemInstruction = `Anda adalah ahli kurikulum pendidikan kesetaraan PKBM (Kurikulum Merdeka & Pembelajaran Mendalam: Mindful, Meaningful, Joyful, Memahami-Mengaplikasi-Merefleksi, 8 Dimensi Profil Lulusan).
Tugas Anda: Menyempurnakan dan menulis ulang SATU BAGIAN spesifik dari dokumen perangkat ajar dalam format HTML bersih (<p>, <ul>, <ol>, <table>, <strong>, <h4>) diawali tepat dengan <h3>${sectionTitle}</h3>. Jangan sertakan markdown code fence atau kop surat.`;

    const prompt = `Tulis ulang dan tingkatkan kualitas bagian berikut untuk perangkat ajar (${docType}) mata pelajaran "${mapel}" (${paket}) materi "${materi}":

Judul Bagian: ${sectionTitle}
${customInstruction ? `Arahan Perbaikan Guru: ${customInstruction}` : 'Buat lebih operasional, aplikatif, mendalam (Memahami–Mengaplikasi–Merefleksi), dan kaya contoh konkret untuk warga belajar PKBM.'}

Isi Bagian Sebelumnya (untuk referensi):
${currentSectionHtml || '(Belum ada isi)'}

Keluarkan hanya HTML untuk bagian ini dimulai dari <h3>${sectionTitle}</h3> hingga tepat sebelum bagian berikutnya.`;

    const { response, modelUsed } = await generateContentWithResilience(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    let html = cleanHtmlResponse(response.text || '');
    if (!html) {
      return res.status(502).json({
        code: 'EMPTY_RESPONSE',
        message: 'Gagal menyusun ulang bagian ini. Silakan coba lagi.',
      });
    }
    if (!/^<h3\b/i.test(html)) {
      const safeHeading = String(sectionTitle).replace(/[<>]/g, '').trim();
      html = `<h3>${safeHeading}</h3>\n${html}`;
    }

    return res.json({ html, modelUsed });
  } catch (err) {
    const mapped = mapGeminiError(err, 'ulang bagian perangkat ajar');
    console.error('Error /api/perangkat-ajar/regenerate-section:', err);
    return res.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.detail ? { detail: mapped.detail } : {}),
    });
  }
});

const QUESTION_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      description: 'Harus salah satu dari: PG, PG_KOMPLEKS, BENAR_SALAH, MENJODOHKAN, ISIAN, URAIAN',
    },
    level: {
      type: Type.STRING,
      description: 'Harus salah satu dari: LOTS, MOTS, HOTS',
    },
    competency: {
      type: Type.STRING,
      description: 'Kompetensi Dasar / Tujuan Pembelajaran yang diukur',
    },
    indicator: {
      type: Type.STRING,
      description: 'Indikator soal operasional untuk tabel Kisi-kisi',
    },
    materi: {
      type: Type.STRING,
      description: 'Sub-materi spesifik butir soal',
    },
    prompt: {
      type: Type.STRING,
      description: 'Teks stimulus dan pertanyaan soal yang jelas dan baku',
    },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Daftar 4 atau 5 pilihan jawaban tanpa huruf awalan A/B/C/D untuk PG dan PG_KOMPLEKS; kosongkan array jika bukan PG',
    },
    correctOptionIndex: {
      type: Type.INTEGER,
      description: 'Indeks jawaban benar (0-based) untuk PG',
    },
    correctOptionIndices: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description: 'Daftar indeks jawaban benar (0-based, minimal 2) untuk PG_KOMPLEKS',
    },
    correctBoolean: {
      type: Type.BOOLEAN,
      description: 'Nilai true (Benar) atau false (Salah) untuk BENAR_SALAH',
    },
    matchingPairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          left: { type: Type.STRING },
          right: { type: Type.STRING },
        },
        required: ['left', 'right'],
      },
      description: '3 sampai 4 pasangan kiri-kanan yang cocok untuk tipe MENJODOHKAN',
    },
    shortAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '1 sampai 3 variasi jawaban singkat yang dianggap benar untuk tipe ISIAN',
    },
    essayAnswerKey: {
      type: Type.STRING,
      description: 'Kunci jawaban uraian lengkap beserta langkah penyelesaian untuk URAIAN',
    },
    scoringRubric: {
      type: Type.STRING,
      description: 'Pedoman penskoran rinci untuk soal ini',
    },
    maxScore: {
      type: Type.NUMBER,
      description: 'Bobot skor maksimal soal (misal 2 untuk PG, 4 untuk PG Kompleks/Menjodohkan, 10 untuk Uraian)',
    },
    explanation: {
      type: Type.STRING,
      description: 'Pembahasan singkat mengapa jawaban tersebut benar',
    },
  },
  required: ['type', 'level', 'competency', 'indicator', 'materi', 'prompt', 'scoringRubric', 'maxScore'],
};

function defaultMaxScoreForType(type: string): number {
  switch (type) {
    case 'URAIAN':
      return 10;
    case 'PG_KOMPLEKS':
    case 'MENJODOHKAN':
      return 4;
    case 'ISIAN':
      return 3;
    default:
      return 2;
  }
}

function cleanPlainText(value: unknown): string {
  return String(value ?? '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\r\n/g, '\n')
    .trim();
}

function normalizeGeneratedQuestion(
  q: Record<string, unknown>,
  opts: {
    resolvedType: string;
    resolvedLevel: string;
    materi: string;
    idx: number;
    defaultOptionsCount: number;
  }
) {
  const { resolvedType, resolvedLevel, materi, idx, defaultOptionsCount } = opts;

  const cleanedPrompt = cleanPlainText(q.prompt).replace(/^\d+[.)]\s+/, '').trim();
  const rawOptions = Array.isArray(q.options)
    ? q.options
        .map((opt) => cleanPlainText(opt).replace(/^[A-Ea-e][.)]\s+/, '').trim())
        .filter(Boolean)
    : [];

  const base: Record<string, unknown> = {
    id: `q_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    type: resolvedType,
    level: resolvedLevel,
    competency: cleanPlainText(q.competency) || `Memahami konsep ${materi}`,
    indicator: cleanPlainText(q.indicator) || `Peserta didik mampu menyelesaikan soal ${materi}`,
    materi: cleanPlainText(q.materi) || materi,
    prompt: cleanedPrompt || `Jawablah pertanyaan berikut terkait materi ${materi}.`,
    scoringRubric:
      cleanPlainText(q.scoringRubric) || 'Skor penuh untuk jawaban tepat dan lengkap.',
    maxScore:
      Number(q.maxScore) > 0 ? Number(q.maxScore) : defaultMaxScoreForType(resolvedType),
  };

  const explanation = cleanPlainText(q.explanation);
  if (explanation) {
    base.explanation = explanation;
  }

  if (resolvedType === 'PG') {
    const safeOptions =
      rawOptions.length >= 2
        ? rawOptions
        : Array.from({ length: defaultOptionsCount }, (_, i) => `Pilihan ${String.fromCharCode(65 + i)}`);
    const rawIdx = typeof q.correctOptionIndex === 'number' ? Math.trunc(q.correctOptionIndex) : 0;
    base.options = safeOptions;
    base.correctOptionIndex = Math.max(0, Math.min(safeOptions.length - 1, rawIdx));
  } else if (resolvedType === 'PG_KOMPLEKS') {
    const safeOptions =
      rawOptions.length >= 2
        ? rawOptions
        : Array.from({ length: defaultOptionsCount }, (_, i) => `Pernyataan ${i + 1}`);
    const parsedIndices = Array.isArray(q.correctOptionIndices)
      ? Array.from(
          new Set(
            q.correctOptionIndices
              .map((n) => Math.trunc(Number(n)))
              .filter((n) => !Number.isNaN(n) && n >= 0 && n < safeOptions.length)
          )
        ).sort((a, b) => a - b)
      : [];
    base.options = safeOptions;
    base.correctOptionIndices =
      parsedIndices.length > 0
        ? parsedIndices
        : safeOptions.length >= 2
          ? [0, 1]
          : [0];
  } else if (resolvedType === 'BENAR_SALAH') {
    base.correctBoolean = typeof q.correctBoolean === 'boolean' ? q.correctBoolean : true;
  } else if (resolvedType === 'MENJODOHKAN') {
    const pairs = Array.isArray(q.matchingPairs)
      ? q.matchingPairs
          .map((p) => {
            const pair = p as Record<string, unknown>;
            return {
              left: cleanPlainText(pair?.left),
              right: cleanPlainText(pair?.right),
            };
          })
          .filter((p) => p.left && p.right)
      : [];
    base.matchingPairs =
      pairs.length >= 2
        ? pairs
        : [
            { left: `Konsep 1 (${materi})`, right: 'Penjelasan pasangan 1' },
            { left: `Konsep 2 (${materi})`, right: 'Penjelasan pasangan 2' },
          ];
  } else if (resolvedType === 'ISIAN') {
    const answers = Array.isArray(q.shortAnswers)
      ? q.shortAnswers.map((s) => cleanPlainText(s)).filter(Boolean)
      : [];
    const fallbackEssay = cleanPlainText(q.essayAnswerKey);
    base.shortAnswers =
      answers.length > 0
        ? answers
        : fallbackEssay
          ? [fallbackEssay]
          : ['Jawaban sesuai konsep materi'];
  } else if (resolvedType === 'URAIAN') {
    const essayKey = cleanPlainText(q.essayAnswerKey);
    const shortFallback = Array.isArray(q.shortAnswers)
      ? q.shortAnswers.map((s) => cleanPlainText(s)).filter(Boolean).join('; ')
      : '';
    base.essayAnswerKey =
      essayKey ||
      shortFallback ||
      explanation ||
      'Jawaban uraian menjelaskan konsep inti secara runtut dan tepat.';
  }

  return base;
}

app.post('/api/ujian/generate', async (req, res) => {
  try {
    const {
      examType = 'ASTS',
      paket = 'Paket C',
      kelas = 'Paket C - Kelas 12 IPS',
      mapel = 'Bahasa Indonesia',
      materi = '',
      questionCount = 10,
      difficultyLevels = ['LOTS', 'MOTS', 'HOTS'],
      questionShapes = ['PG', 'URAIAN'],
      academicYear = '2026/2027',
      semester = 'Ganjil',
      extraNotes = '',
    } = req.body || {};

    if (!mapel || !materi) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Mata pelajaran dan materi ujian wajib diisi sebelum menyusun soal.',
      });
    }

    const safeCount = Math.max(3, Math.min(40, Number(questionCount) || 10));
    const safeLevels =
      Array.isArray(difficultyLevels) && difficultyLevels.length > 0
        ? difficultyLevels
        : ['LOTS', 'MOTS', 'HOTS'];
    const safeShapes =
      Array.isArray(questionShapes) && questionShapes.length > 0
        ? questionShapes
        : ['PG', 'URAIAN'];
    const defaultOptionsCount = String(paket).includes('C') ? 5 : 4;

    const ai = getGeminiClient();

    const systemInstruction = `Anda adalah pakar asesmen pendidikan kesetaraan Indonesia (PKBM Paket A, B, dan C) Kurikulum Merdeka.
Susun sekumpulan butir soal ujian berkualitas tinggi dalam Bahasa Indonesia baku, kontekstual, bebas bias, dan sesuai tingkat kognitif LOTS (mengingat/memahami), MOTS (menerapkan/menganalisis ringan), atau HOTS (analisis mendalam/evaluasi/kreasi berbasis stimulus kasus nyata).

ATURAN KETAT BENTUK SOAL (isi HANYA field yang relevan untuk tipe soal tersebut):
- PG: berikan tepat 4 opsi (untuk Paket A/B) atau 5 opsi (untuk Paket C) di "options" TANPA awalan huruf A./B./C., dan isi "correctOptionIndex" (0-based).
- PG_KOMPLEKS: berikan 4 atau 5 pernyataan/opsi di "options" dan isi "correctOptionIndices" dengan minimal 2 indeks jawaban benar.
- BENAR_SALAH: buat pernyataan tegas di "prompt" dan isi "correctBoolean" (true/false).
- MENJODOHKAN: isi "matchingPairs" sebanyak 3 atau 4 pasang {"left": "...", "right": "..."}.
- ISIAN: buat soal rumpang/pertanyaan singkat dan isi "shortAnswers" berisi jawaban singkat baku.
- URAIAN: buat pertanyaan analitis terbuka dan isi "essayAnswerKey" serta "scoringRubric" bertahap.`;

    // Bagi jumlah soal besar (> 8) menjadi beberapa batch paralel agar 20-40 soal selesai cepat & bebas timeout di HP
    const MAX_PER_BATCH = 8;
    const batchCount = Math.ceil(safeCount / MAX_PER_BATCH);
    const batchSizes: number[] = [];
    let remaining = safeCount;
    for (let b = 0; b < batchCount; b++) {
      const batchesLeft = batchCount - b;
      const size = Math.ceil(remaining / batchesLeft);
      batchSizes.push(size);
      remaining -= size;
    }

    const generateBatch = async (batchIndex: number, batchSize: number) => {
      const batchHint =
        batchCount > 1
          ? `\n- Ini adalah Bagian ${batchIndex + 1} dari ${batchCount} naskah ujian yang sama. Buat ${batchSize} butir soal dengan sudut pandang, stimulus, dan kasus unik untuk Bagian ${batchIndex + 1} agar tidak duplikat dengan bagian lain.`
          : '';

      const prompt = `Buat tepat ${batchSize} butir soal untuk ujian berikut:
- Jenis Ujian: ${examType}
- Program / Kelas: ${paket} / ${kelas}
- Mata Pelajaran: ${mapel}
- Materi Pokok: ${materi}
- Tahun Ajaran / Semester: ${academicYear} / ${semester}
- Distribusi Tingkat Kesulitan yang Diminta: ${safeLevels.join(', ')} (distribusikan merata)
- Bentuk Soal yang Diizinkan (gunakan hanya tipe ini dan distribusikan merata): ${safeShapes.join(', ')}
${extraNotes ? `- Catatan Khusus Guru: ${extraNotes}` : ''}${batchHint}

Pastikan setiap butir ringkas, tajam, memiliki kisi-kisi (competency, indicator), level kognitif valid, pedoman penskoran, dan kunci jawaban lengkap.`;

      const { response, modelUsed } = await generateContentWithResilience(ai, {
        contents: prompt,
        primaryTimeoutMs: 14_000,
        fallbackTimeoutMs: 45_000,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: QUESTION_ITEM_SCHEMA,
              },
            },
            required: ['questions'],
          },
        },
      });

      const rawText = (response.text || '{}').trim();
      const parsed = safeParseJsonResponse<{ questions?: Array<Record<string, unknown>> }>(
        rawText,
        { questions: [] }
      );
      const batchItems = Array.isArray(parsed.questions) ? parsed.questions : [];
      return { batchItems, modelUsed };
    };

    const batchResults: Array<{ batchItems: Array<Record<string, unknown>>; modelUsed: string }> =
      new Array(batchSizes.length);
    const maxConcurrency = Math.min(3, batchSizes.length);
    let nextBatchIdx = 0;

    await Promise.all(
      Array.from({ length: maxConcurrency }, async () => {
        while (nextBatchIdx < batchSizes.length) {
          const currentIdx = nextBatchIdx++;
          batchResults[currentIdx] = await generateBatch(currentIdx, batchSizes[currentIdx]);
        }
      })
    );

    const rawQuestions = batchResults.flatMap((r) => r?.batchItems || []);
    const modelUsed = batchResults.find((r) => r?.modelUsed)?.modelUsed || PRIMARY_TEXT_MODEL;

    if (rawQuestions.length === 0) {
      return res.status(502).json({
        code: 'EMPTY_RESPONSE',
        message: 'AI tidak menghasilkan butir soal. Silakan coba generate ulang.',
      });
    }

    const batchTimestamp = Date.now().toString(36);
    const questions = rawQuestions.slice(0, safeCount).map((q, idx) => {
      const resolvedType = safeShapes.includes(String(q.type))
        ? String(q.type)
        : safeShapes[idx % safeShapes.length];
      const resolvedLevel = safeLevels.includes(String(q.level))
        ? String(q.level)
        : safeLevels[idx % safeLevels.length];
      const normalized = normalizeGeneratedQuestion(q, {
        resolvedType,
        resolvedLevel,
        materi: String(materi),
        idx,
        defaultOptionsCount,
      });
      return {
        ...normalized,
        id: `q_ai_${batchTimestamp}_${idx + 1}`,
      };
    });

    return res.json({ questions, modelUsed });
  } catch (err) {
    const mapped = mapGeminiError(err, 'soal ujian dengan AI');
    console.error('Error /api/ujian/generate:', err);
    return res.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.detail ? { detail: mapped.detail } : {}),
    });
  }
});

app.post('/api/ujian/regenerate-question', async (req, res) => {
  try {
    const {
      paket = 'Paket C',
      mapel = '',
      materi = '',
      questionType = 'PG',
      cognitiveLevel = 'MOTS',
      previousPrompt = '',
      instruction = '',
    } = req.body || {};

    if (!mapel || !materi) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Informasi mapel dan materi dibutuhkan untuk mengganti soal.',
      });
    }

    const ai = getGeminiClient();
    const defaultOptionsCount = String(paket).includes('C') ? 5 : 4;

    const prompt = `Buat SATU butir soal BARU yang berbeda dari soal sebelumnya untuk menggantikan soal pada ujian PKBM:
- Program: ${paket}
- Mata Pelajaran: ${mapel}
- Materi: ${materi}
- Bentuk Soal Wajib: ${questionType}
- Tingkat Kognitif Wajib: ${cognitiveLevel}
- Soal Lama (hindari mengulang pertanyaan yang sama): ${previousPrompt}
${instruction ? `- Arahan Tambahan Guru: ${instruction}` : ''}

Pastikan format JSON sesuai tepat dengan bentuk soal "${questionType}" dan hanya mengisi field kunci jawaban yang relevan untuk "${questionType}".`;

    const { response, modelUsed } = await generateContentWithResilience(ai, {
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: QUESTION_ITEM_SCHEMA,
      },
    });

    const parsed = safeParseJsonResponse<Record<string, unknown>>(response.text || '{}', {});
    if (!parsed.prompt) {
      return res.status(502).json({
        code: 'EMPTY_RESPONSE',
        message: 'Gagal menyusun soal pengganti. Silakan coba lagi.',
      });
    }

    const question = normalizeGeneratedQuestion(parsed, {
      resolvedType: String(questionType),
      resolvedLevel: String(cognitiveLevel),
      materi: String(materi),
      idx: 0,
      defaultOptionsCount,
    });

    return res.json({ modelUsed, question });
  } catch (err) {
    const mapped = mapGeminiError(err, 'soal pengganti dengan AI');
    console.error('Error /api/ujian/regenerate-question:', err);
    return res.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.detail ? { detail: mapped.detail } : {}),
    });
  }
});

app.post('/api/penilaian/deskripsi-capaian', async (req, res) => {
  try {
    const {
      schoolName = 'PKBM ANNUR KARISMA',
      paket = 'Paket C',
      kelas = '',
      mapel = '',
      kkm = 75,
      semester = 'Ganjil',
      academicYear = '2026/2027',
      students = [],
    } = req.body || {};

    if (!mapel || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Mata pelajaran dan minimal satu data nilai murid wajib dikirim untuk menyusun deskripsi.',
      });
    }

    const safeStudents = students.slice(0, 40).map((s: Record<string, unknown>) => ({
      studentId: String(s.studentId || ''),
      studentName: String(s.studentName || 'Warga Belajar'),
      tugas: Number(s.tugas || 0),
      uh: Number(s.uh || 0),
      asts: Number(s.asts || 0),
      asat: Number(s.asat || 0),
      praktik: Number(s.praktik || 0),
      sikap: Number(s.sikap || 0),
      finalScore: Number(s.finalScore || 0),
      isPassed: Boolean(s.isPassed),
    }));

    const ai = getGeminiClient();

    const systemInstruction = `Anda adalah wali kelas dan pendidik Kurikulum Merdeka Kesetaraan pada ${schoolName}.
Tugas Anda adalah menyusun Deskripsi Capaian Kompetensi Rapor yang hangat, spesifik, objektif, dan memotivasi dalam Bahasa Indonesia baku untuk setiap warga belajar berdasarkan nilai komponen (Tugas, Ulangan Harian, ASTS, ASAT, Praktik, Sikap), Nilai Akhir, dan ambang KKTP (${kkm}).

ATURAN PENULISAN DESKRIPSI RAPOR:
1. Tulis tepat 2 kalimat singkat dan padat (sekitar 22–40 kata) per murid.
2. Kalimat pertama mengapresiasi aspek/komponen tertinggi yang menonjol pada mata pelajaran ${mapel} (misal: penguasaan konsep ujian, keaktifan tugas, keterampilan praktik, atau sikap belajar).
3. Kalimat kedua: jika nilai akhir >= KKTP (${kkm}), beri arahan pengayaan bermakna; jika nilai akhir < KKTP (${kkm}), beri umpan balik suportif pada komponen terendah agar meningkat pada semester berikutnya.
4. Hindari menyebut angka mentah terlalu teknis; fokus pada capaian kompetensi dan karakter.`;

    const STUDENT_BATCH_SIZE = 12;
    const studentChunks: Array<typeof safeStudents> = [];
    for (let i = 0; i < safeStudents.length; i += STUDENT_BATCH_SIZE) {
      studentChunks.push(safeStudents.slice(i, i + STUDENT_BATCH_SIZE));
    }

    const chunkResults = await Promise.all(
      studentChunks.map(async (chunk) => {
        const prompt = `Susun deskripsi capaian rapor untuk mata pelajaran "${mapel}" (${paket}${kelas ? `, ${kelas}` : ''}, Semester ${semester} TA ${academicYear}, KKTP = ${kkm}) bagi daftar warga belajar berikut:
${JSON.stringify(chunk, null, 2)}`;

        const { response, modelUsed } = await generateContentWithResilience(ai, {
          contents: prompt,
          primaryTimeoutMs: 14_000,
          fallbackTimeoutMs: 45_000,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                descriptions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      studentId: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ['studentId', 'description'],
                  },
                },
              },
              required: ['descriptions'],
            },
          },
        });

        const parsed = safeParseJsonResponse<{
          descriptions?: Array<{ studentId: string; description: string }>;
        }>(response.text || '{}', { descriptions: [] });
        return {
          descriptions: Array.isArray(parsed.descriptions) ? parsed.descriptions : [],
          modelUsed,
        };
      })
    );

    const allDescriptions = chunkResults.flatMap((r) => r.descriptions);
    const modelUsed = chunkResults[0]?.modelUsed || PRIMARY_TEXT_MODEL;

    if (allDescriptions.length === 0) {
      return res.status(502).json({
        code: 'EMPTY_RESPONSE',
        message: 'Gemini tidak mengembalikan deskripsi capaian. Silakan coba kembali.',
      });
    }

    return res.json({ descriptions: allDescriptions, modelUsed });
  } catch (err) {
    const mapped = mapGeminiError(err, 'deskripsi capaian rapor dengan AI');
    console.error('Error /api/penilaian/deskripsi-capaian:', err);
    return res.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.detail ? { detail: mapped.detail } : {}),
    });
  }
});

app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { messages = [], context = {}, stream: useStream = true } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Pertanyaan tidak boleh kosong.',
      });
    }

    const sanitizedHistory = messages
      .slice(-12)
      .map((m: Record<string, unknown>) => ({
        role: m.role === 'model' ? 'model' : 'user',
        text: String(m.text || '').trim().slice(0, 2000),
      }))
      .filter((m) => m.text.length > 0);

    if (sanitizedHistory.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Pesan percakapan tidak valid.',
      });
    }

    const ai = getGeminiClient();

    const school = (context.school || {}) as Record<string, unknown>;
    const user = (context.user || {}) as Record<string, unknown>;
    const schedules = Array.isArray(context.schedules) ? context.schedules.slice(0, 60) : [];
    const subjects = Array.isArray(context.subjects) ? context.subjects.slice(0, 60) : [];
    const announcements = Array.isArray(context.announcements)
      ? context.announcements.slice(0, 8)
      : [];
    const classesSummary = Array.isArray(context.classes) ? context.classes.slice(0, 25) : [];

    const scheduleBlock =
      schedules.length > 0
        ? schedules
            .map((s: Record<string, unknown>) => {
              return `- [${s.paket || '-'}] ${s.className || '-'} | ${s.scheduleDay || '-'} (${s.scheduleTime || '-'}) | Mapel: ${s.subjectName || '-'} | Tutor: ${s.teacherName || '-'}`;
            })
            .join('\n')
        : '- Belum ada jadwal pelajaran aktif yang tercatat di sistem saat ini.';

    const subjectBlock =
      subjects.length > 0
        ? subjects
            .map((sub: Record<string, unknown>) => {
              return `- [${sub.paket || '-'}] ${sub.code || ''} ${sub.name || '-'} (${sub.category || 'Wajib'}, ${sub.hoursPerWeek || 0} JP/minggu, KKTP/KKM: ${sub.kkm || 75})`;
            })
            .join('\n')
        : '- Data mata pelajaran belum dimuat.';

    const classBlock =
      classesSummary.length > 0
        ? classesSummary
            .map((c: Record<string, unknown>) => {
              return `- [${c.paket || '-'}] ${c.name || '-'} (${c.gradeLevel || '-'}, Wali Kelas: ${c.homeroomTeacherName || '-'})`;
            })
            .join('\n')
        : '';

    const announcementBlock =
      announcements.length > 0
        ? announcements
            .map((a: Record<string, unknown>) => {
              return `- [${a.category || 'Umum'}] ${a.title || '-'}: ${String(a.content || '').slice(0, 220)}`;
            })
            .join('\n')
        : '- Tidak ada pengumuman terbaru.';

    const schoolName = String(school.schoolName || 'PKBM ANNUR KARISMA');
    const npsn = String(school.npsn || 'P9984721');
    const address = String(school.address || 'Sekretariat PKBM Annur Karisma');
    const phone = String(school.phone || '-');
    const email = String(school.email || '-');
    const headmasterName = String(school.headmasterName || 'Kepala PKBM');
    const academicYear = String(school.academicYear || '2026/2027');
    const semester = String(school.semester || 'Ganjil');

    const userRole = String(user.role || 'murid');
    const userName = String(user.name || 'Warga Belajar');
    const userPaket = String(user.paket || '');
    const userClassName = String(user.className || '');

    const systemInstruction = `Anda adalah Asisten Siswa AI resmi untuk ${schoolName} (NPSN ${npsn}) pada aplikasi SIAKAD PKBM.
Tugas utama Anda adalah membantu warga belajar (siswa), tutor, dan pengelola sekolah menjawab pertanyaan dasar secara akurat, ramah, sopan, ringkas, dan mudah dipahami dalam Bahasa Indonesia.

CAKUPAN PENGETAHUAN UTAMA:
1. JADWAL PELAJARAN (berdasarkan data langsung SIAKAD di bawah):
   - Jawab pertanyaan tentang hari, jam belajar, mata pelajaran, dan nama tutor sesuai data aktual.
   - Jika pengguna adalah murid (${userClassName ? `kelas ${userClassName}, ${userPaket}` : 'kelas aktif'}), prioritaskan jadwal kelasnya terlebih dahulu kecuali ia menanyakan paket/kelas lain.
   - Jangan pernah mengarang jadwal atau nama tutor yang tidak ada di data.

2. KURIKULUM PENDIDIKAN KESETARAAN PAKET A, PAKET B, DAN PAKET C (Kurikulum Merdeka):
   - Paket A (setara SD/MI, Kelas 1–6 / Fase A, B, C): fokus penguatan literasi dasar, numerasi, karakter, dan kecakapan hidup.
   - Paket B (setara SMP/MTs, Kelas 7–9 / Fase D): penguatan akademik menengah, proyek pemberdayaan, dan keterampilan fungsional.
   - Paket C (setara SMA/MA, Kelas 10–12 / Fase E & F): peminatan/pendalaman materi akademik, kesiapan kerja/kuliah, pemberdayaan, dan keterampilan vokasional.
   - Beban belajar kesetaraan menggunakan SKK (Satuan Kredit Kompetensi) yang fleksibel melalui tiga moda: Tatap Muka, Tutorial, dan Belajar Mandiri.
   - Struktur kelompok mata pelajaran: Mata Pelajaran Wajib (Umum), Pemberdayaan, dan Keterampilan (mengacu data mapel di bawah beserta KKTP/KKM masing-masing).

3. PROSEDUR ADMINISTRASI SEKOLAH ${schoolName}:
   - Pendaftaran Warga Belajar Baru (PPDB): menyiapkan fotokopi Kartu Keluarga (KK), Akta Kelahiran, KTP/KIA, ijazah/SKL/rapor jenjang sebelumnya (untuk Paket B/C atau pindahan), pas foto 3x4, lalu verifikasi berkas di Sekretariat PKBM.
   - Surat Keterangan Siswa Aktif / Surat Keterangan Lainnya: dapat melihat pratinjau dan mengunduh melalui menu "Cetak Dokumen A4" di SIAKAD atau meminta pengesahan stempel basah di Sekretariat PKBM.
   - Presensi & Izin Tidak Masuk (Sakit/Izin): segera melapor ke Wali Kelas atau Tutor Pengampu sebelum sesi belajar dimulai dengan menyertakan alasan jelas/surat keterangan sakit; rekap kehadiran dapat dipantau di menu "Presensi".
   - Tugas, Ujian & Rapor: pengerjaan tugas melalui menu "Tugas", ujian online (UH/ASTS/ASAT) melalui menu "Ujian Online", dan pemantauan nilai/cetak rapor A4 di menu "Nilai & Rapor". Jika nilai di bawah KKTP, siswa dapat mengikuti program remedial bersama tutor pengampu.
   - Mutasi / Pindah Sekolah & Legalisir Ijazah: diajukan langsung ke Sekretariat PKBM dengan membawa dokumen asli dan surat permohonan orang tua/warga belajar.

PROFIL LEMBAGA SAAT INI:
- Nama Lembaga: ${schoolName} (NPSN: ${npsn})
- Kepala PKBM: ${headmasterName}
- Tahun Ajaran / Semester: ${academicYear} / Semester ${semester}
- Alamat: ${address}
- Telepon: ${phone} | Email: ${email}

KONTEKS PENGGUNA YANG SEDANG BERTANYA:
- Nama: ${userName} | Peran: ${userRole}${userPaket ? ` | Jenjang: ${userPaket}` : ''}${userClassName ? ` | Rombel: ${userClassName}` : ''}

DATA JADWAL PELAJARAN AKTIF DI SIAKAD:
${scheduleBlock}

DATA MATA PELAJARAN & KKTP DI SIAKAD:
${subjectBlock}
${classBlock ? `\nDAFTAR ROMBEL AKTIF:\n${classBlock}` : ''}

PENGUMUMAN SEKOLAH TERBARU:
${announcementBlock}

ATURAN JAWABAN:
- Jawab langsung pada intinya, terstruktur dengan poin pendek atau paragraf singkat (maksimal sekitar 150–250 kata kecuali pengguna meminta rincian lengkap).
- Gunakan **tebal** secukupnya untuk judul poin atau kata kunci penting, dan daftar dengan tanda "-" atau angka "1.". Hindari tabel Markdown yang rumit.
- Jika pertanyaan menyangkut data pribadi sensitif di luar konteks (misal ubah password, biaya khusus, dispensasi resmi), arahkan secara sopan ke Sekretariat ${schoolName} (${phone}) atau Wali Kelas.
- Tolak secara halus jika ditanya hal yang sama sekali di luar pendidikan/akademik/administrasi PKBM.`;

    const contents = sanitizedHistory.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    if (useStream === false) {
      const { response, modelUsed } = await generateContentWithResilience(ai, {
        contents,
        primaryTimeoutMs: 22_000,
        fallbackTimeoutMs: 40_000,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const text = (response.text || '').trim();
      if (!text) {
        return res.status(502).json({
          code: 'EMPTY_RESPONSE',
          message: 'Asisten AI tidak mengembalikan jawaban. Silakan coba kembali.',
        });
      }
      return res.json({ text, modelUsed });
    }

    const now = Date.now();
    const modelOrder =
      now >= primaryCooldownUntil
        ? [
            { model: PRIMARY_TEXT_MODEL, useThinking: true, isPrimary: true },
            { model: FALLBACK_TEXT_MODEL, useThinking: false, isPrimary: false },
          ]
        : [{ model: FALLBACK_TEXT_MODEL, useThinking: false, isPrimary: false }];

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    let streamedAnyText = false;
    let lastError: unknown;

    for (const candidate of modelOrder) {
      try {
        const config: Record<string, unknown> = {
          systemInstruction,
        };
        if (candidate.useThinking) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const stream = await withTimeout(
          ai.models.generateContentStream({
            model: candidate.model,
            contents,
            config,
          }),
          candidate.isPrimary ? PRIMARY_ATTEMPT_TIMEOUT_MS : FALLBACK_ATTEMPT_TIMEOUT_MS
        );

        for await (const chunk of stream) {
          const piece = chunk.text || '';
          if (piece) {
            streamedAnyText = true;
            res.write(`data: ${JSON.stringify({ text: piece })}\n\n`);
          }
        }

        if (!streamedAnyText) {
          throw new Error('EMPTY_MODEL_RESPONSE');
        }

        if (candidate.isPrimary) {
          primaryCooldownUntil = 0;
        }
        res.write(`data: ${JSON.stringify({ done: true, modelUsed: candidate.model })}\n\n`);
        res.end();
        return;
      } catch (err) {
        lastError = err;
        if (streamedAnyText || !isRetryableGeminiError(err)) {
          break;
        }
        if (candidate.isPrimary) {
          primaryCooldownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
        }
        console.warn(
          `[Gemini Assistant Retry] Model ${candidate.model} terkendala, beralih ke model cadangan...`
        );
      }
    }

    const mapped = mapGeminiError(lastError, 'jawaban Asisten Siswa AI');
    console.error('Error /api/assistant/chat:', lastError);
    if (!res.headersSent) {
      return res.status(mapped.status).json({
        code: mapped.code,
        message: mapped.message,
      });
    }
    res.write(
      `data: ${JSON.stringify({ error: mapped.message, code: mapped.code })}\n\n`
    );
    res.end();
  } catch (err) {
    const mapped = mapGeminiError(err, 'jawaban Asisten Siswa AI');
    console.error('Error /api/assistant/chat:', err);
    if (!res.headersSent) {
      return res.status(mapped.status).json({
        code: mapped.code,
        message: mapped.message,
      });
    }
    res.write(
      `data: ${JSON.stringify({ error: mapped.message, code: mapped.code })}\n\n`
    );
    res.end();
  }
});

async function startServer() {
  const httpServer = http.createServer(app);
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 70_000;
  httpServer.requestTimeout = 120_000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true' || Boolean(process.env.K_SERVICE);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : true,
        ws: disableHmr ? false : { server: httpServer },
      },
      plugins: disableHmr
        ? [
            {
              name: 'disable-vite-client-ws',
              enforce: 'post',
              transform(code: string, id: string) {
                if (id.includes('vite/dist/client/client.mjs')) {
                  return code.replace(
                    'transport.connect(createHMRHandler(handleMessage));',
                    '/* HMR WebSocket disabled in preview environment */'
                  );
                }
                return null;
              },
            },
          ]
        : [],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server SIAKAD PKBM ANNUR KARISMA berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
