import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bold,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  Italic,
  List,
  ListOrdered,
  Printer,
  Redo2,
  RefreshCw,
  Save,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react';
import { SchoolSettings } from '../../types/siakad';
import { A4DocumentSheet } from '../documents/A4DocumentPrinter';
import { useToast } from '../../context/ToastContext';
import { exportA4HtmlToWord } from '../../utils/wordExport';
import { generateTeachingDocPdf } from '../../utils/teachingDocPdfUtils';
import { ANIMATION_EASE, scaledDuration, useAdaptiveMotion } from '../../config/animations';
import { AnimatedSaveCheck } from '../ui/MotionPrimitives';

export interface ParsedDocumentSection {
  index: number;
  title: string;
  html: string;
}

export function extractSectionsFromHtml(html: string): ParsedDocumentSection[] {
  if (!html.trim() || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [];

  const sections: ParsedDocumentSection[] = [];
  const children = Array.from(root.children);
  let currentTitle = '';
  let buffer: string[] = [];

  children.forEach((el) => {
    if (el.tagName.toLowerCase() === 'h3') {
      if (currentTitle) {
        sections.push({
          index: sections.length,
          title: currentTitle,
          html: buffer.join('\n'),
        });
      }
      currentTitle = el.textContent?.trim() || `Bagian ${sections.length + 1}`;
      buffer = [el.outerHTML];
    } else if (currentTitle) {
      buffer.push(el.outerHTML);
    }
  });

  if (currentTitle) {
    sections.push({
      index: sections.length,
      title: currentTitle,
      html: buffer.join('\n'),
    });
  }

  return sections;
}

export function replaceSectionInHtml(
  fullHtml: string,
  sectionIndex: number,
  replacementHtml: string
): string {
  if (typeof DOMParser === 'undefined') return fullHtml;
  const doc = new DOMParser().parseFromString(`<div>${fullHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return fullHtml;

  const children = Array.from(root.children);
  const h3Indices: number[] = [];
  children.forEach((el, idx) => {
    if (el.tagName.toLowerCase() === 'h3') {
      h3Indices.push(idx);
    }
  });

  if (sectionIndex < 0 || sectionIndex >= h3Indices.length) {
    return fullHtml;
  }

  const startIdx = h3Indices[sectionIndex];
  const endIdx =
    sectionIndex + 1 < h3Indices.length ? h3Indices[sectionIndex + 1] : children.length;

  const before = children.slice(0, startIdx).map((e) => e.outerHTML);
  const after = children.slice(endIdx).map((e) => e.outerHTML);

  return [...before, replacementHtml.trim(), ...after].join('\n');
}

interface RichTextA4EditorProps {
  schoolSettings: SchoolSettings;
  documentTitle: string;
  documentNumber: string;
  city: string;
  contentHtml: string;
  onContentChange: (html: string) => void;
  isGenerating: boolean;
  generationStage: string;
  generationProgress: number;
  isRegeneratingSection: boolean;
  onRegenerateSection: (
    sectionIndex: number,
    sectionTitle: string,
    currentSectionHtml: string,
    customInstruction: string
  ) => Promise<void>;
  onSave: () => Promise<void>;
  isSaving: boolean;
  saveSuccess?: boolean;
  showTeacherSignature: boolean;
  teacherName: string;
  teacherNip?: string;
}

export const RichTextA4Editor: React.FC<RichTextA4EditorProps> = ({
  schoolSettings,
  documentTitle,
  documentNumber,
  city,
  contentHtml,
  onContentChange,
  isGenerating,
  generationStage,
  generationProgress,
  isRegeneratingSection,
  onRegenerateSection,
  onSave,
  isSaving,
  saveSuccess = false,
  showTeacherSignature,
  teacherName,
  teacherNip,
}) => {
  const { showToast } = useToast();
  const motionProfile = useAdaptiveMotion();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedHtmlRef = useRef<string>('');

  const sections = useMemo(() => extractSectionsFromHtml(contentHtml), [contentHtml]);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);
  const [customInstruction, setCustomInstruction] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Keep selected section index within bounds when sections change
  useEffect(() => {
    if (sections.length === 0) {
      setSelectedSectionIdx(0);
    } else if (selectedSectionIdx >= sections.length) {
      setSelectedSectionIdx(0);
    }
  }, [sections.length, selectedSectionIdx]);

  // Synchronize external HTML updates into contentEditable without breaking caret while typing
  useEffect(() => {
    if (!editorRef.current) return;
    if (contentHtml !== lastSyncedHtmlRef.current) {
      editorRef.current.innerHTML = contentHtml;
      lastSyncedHtmlRef.current = contentHtml;
    }
  }, [contentHtml]);

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastSyncedHtmlRef.current = html;
    onContentChange(html);
  };

  const applyFormat = (command: string, value?: string) => {
    if (!editorRef.current || !contentHtml) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const insertSampleTable = () => {
    if (!editorRef.current || !contentHtml) return;
    editorRef.current.focus();
    const tableMarkup = `
      <table>
        <thead>
          <tr>
            <th>Aspek / Komponen</th>
            <th>Indikator Pencapaian</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pemahaman Konsep</td>
            <td>Mampu menjelaskan inti materi</td>
            <td>Sesuai rubrik</td>
          </tr>
          <tr>
            <td>Aplikasi Kontekstual</td>
            <td>Mampu menerapkan pada studi kasus</td>
            <td>Mandiri / Kelompok</td>
          </tr>
        </tbody>
      </table><p><br/></p>
    `;
    document.execCommand('insertHTML', false, tableMarkup);
    handleEditorInput();
    showToast('Tabel berhasil disisipkan ke dalam dokumen', 'info');
  };

  const handlePrint = () => {
    if (!contentHtml.trim()) {
      showToast('Belum ada isi dokumen untuk dicetak', 'warning');
      return;
    }
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!contentHtml.trim()) {
      showToast('Belum ada isi dokumen untuk diunduh', 'warning');
      return;
    }
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const fileName = await generateTeachingDocPdf({
        schoolSettings,
        documentTitle,
        documentNumber,
        contentHtml,
        city,
        teacherName,
        teacherNip,
        showTeacherSignature,
      });
      showToast('Dokumen PDF berkop PKBM berhasil diunduh', 'success', fileName);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat berkas PDF perangkat ajar',
        'error'
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadWord = () => {
    if (!contentHtml.trim()) {
      showToast('Belum ada isi dokumen untuk diunduh', 'warning');
      return;
    }
    exportA4HtmlToWord({
      schoolSettings,
      documentTitle,
      documentNumber,
      contentHtml,
      city,
      teacherName,
      teacherNip,
      showTeacherSignature,
      fileName: documentTitle,
    });
    showToast('Berkas Word (.doc) berhasil diunduh', 'success');
  };

  const selectedSection = sections[selectedSectionIdx];

  return (
    <div className="space-y-4">
      {/* Rich Text & Export Toolbar */}
      <div className="no-print rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Text formatting controls */}
          <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Format Teks Dokumen">
            <button
              type="button"
              onClick={() => applyFormat('bold')}
              disabled={!contentHtml || isGenerating}
              title="Tebal (Bold)"
              aria-label="Tebal"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('italic')}
              disabled={!contentHtml || isGenerating}
              title="Miring (Italic)"
              aria-label="Miring"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('underline')}
              disabled={!contentHtml || isGenerating}
              title="Garis Bawah (Underline)"
              aria-label="Garis Bawah"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <Underline className="w-4 h-4" />
            </button>

            <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

            <button
              type="button"
              onClick={() => applyFormat('insertUnorderedList')}
              disabled={!contentHtml || isGenerating}
              title="Daftar Poin"
              aria-label="Daftar Poin"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('insertOrderedList')}
              disabled={!contentHtml || isGenerating}
              title="Daftar Bernomor"
              aria-label="Daftar Bernomor"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={insertSampleTable}
              disabled={!contentHtml || isGenerating}
              title="Sisipkan Tabel"
              className="min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
            >
              <Table2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span className="hidden sm:inline">Tabel</span>
            </button>

            <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

            <button
              type="button"
              onClick={() => applyFormat('undo')}
              disabled={!contentHtml || isGenerating}
              title="Urungkan (Undo)"
              aria-label="Undo"
              className="min-h-[40px] min-w-[40px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('redo')}
              disabled={!contentHtml || isGenerating}
              title="Ulangi (Redo)"
              aria-label="Redo"
              className="min-h-[40px] min-w-[40px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Document Actions: Simpan, Cetak, PDF, Word */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!contentHtml.trim() || isGenerating || isSaving}
              className="btn-ripple min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {saveSuccess ? (
                <AnimatedSaveCheck visible={saveSuccess} />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saveSuccess ? 'Tersimpan!' : isSaving ? 'Menyimpan...' : 'Simpan'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!contentHtml.trim() || isGenerating}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!contentHtml.trim() || isGenerating || isExportingPdf}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
              <span>{isExportingPdf ? 'Menyusun PDF...' : 'Unduh PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={!contentHtml.trim() || isGenerating}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-bold hover:bg-amber-100 dark:hover:bg-amber-950/50 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <FileDown className="w-4 h-4" />
              <span>Unduh Word</span>
            </button>
          </div>
        </div>

        {/* Per-Section Regenerate Bar */}
        {sections.length > 0 && !isGenerating && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div className="md:col-span-4">
              <label className="sr-only" htmlFor="section-selector">
                Pilih Bagian untuk Disempurnakan
              </label>
              <select
                id="section-selector"
                value={selectedSectionIdx}
                onChange={(e) => setSelectedSectionIdx(Number(e.target.value))}
                disabled={isRegeneratingSection}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white font-medium"
              >
                {sections.map((sec) => (
                  <option key={sec.index} value={sec.index}>
                    {sec.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-5">
              <input
                type="text"
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                disabled={isRegeneratingSection}
                placeholder="Arahan opsional (mis. tambahkan contoh UMKM lokal)..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="button"
                disabled={isRegeneratingSection || !selectedSection}
                onClick={async () => {
                  if (!selectedSection) return;
                  await onRegenerateSection(
                    selectedSection.index,
                    selectedSection.title,
                    selectedSection.html,
                    customInstruction
                  );
                }}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRegeneratingSection ? 'animate-spin' : ''}`}
                />
                <span>
                  {isRegeneratingSection ? 'Menyusun Ulang...' : 'Regenerate bagian ini'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Authentic A4 Paper Preview & Editable Canvas */}
      <div className="rounded-2xl bg-slate-200/80 dark:bg-slate-950/80 p-3 sm:p-6 lg:p-8 overflow-x-auto border border-emerald-950/10 dark:border-white/10">
        <A4DocumentSheet
          schoolSettings={schoolSettings}
          documentTitle={documentTitle}
          documentNumber={documentNumber}
          city={city}
          showTeacherSignature={showTeacherSignature}
          teacherLabel="Guru / Tutor Pengampu"
          teacherName={teacherName}
          teacherNip={teacherNip}
        >
          {isGenerating ? (
            <div className="space-y-6 py-2">
              {/* Staged Generation Progress Card with Animated Cycling Text */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <motion.div
                      animate={motionProfile.reducedMotion ? {} : { rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
                      className="shrink-0"
                    >
                      <RefreshCw className="w-5 h-5 text-emerald-700" />
                    </motion.div>
                    <div className="min-w-0 flex-1">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={generationStage}
                          initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                          animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                          exit={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          transition={{
                            duration: scaledDuration(0.24),
                            ease: ANIMATION_EASE.smoothOut,
                          }}
                          className="font-display font-bold text-sm text-emerald-950"
                        >
                          {generationStage}
                        </motion.p>
                      </AnimatePresence>
                      <p className="text-xs text-emerald-800">
                        Menyesuaikan Kurikulum Merdeka Kesetaraan &amp; Pembelajaran Mendalam...
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-800 tabular-nums shrink-0">
                    {generationProgress}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-emerald-200/80 overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0.1 }}
                    animate={{ scaleX: Math.max(0.08, Math.min(1, generationProgress / 100)) }}
                    transition={{ duration: scaledDuration(0.45), ease: ANIMATION_EASE.smoothOut }}
                    style={{ transformOrigin: '0% 50%' }}
                    className="h-full w-full rounded-full bg-gradient-to-r from-emerald-700 via-emerald-500 to-amber-500"
                  />
                </div>
              </div>

              {/* A4 Skeleton Paper Blocks */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="h-5 w-48 rounded-md skeleton-shimmer" />
                  <div className="h-24 w-full rounded-lg skeleton-shimmer" />
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-56 rounded-md skeleton-shimmer" />
                  <div className="h-4 w-full rounded skeleton-shimmer" />
                  <div className="h-4 w-11/12 rounded skeleton-shimmer" />
                  <div className="h-4 w-4/5 rounded skeleton-shimmer" />
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-64 rounded-md skeleton-shimmer" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-lg skeleton-shimmer" />
                    <div className="h-16 rounded-lg skeleton-shimmer" />
                    <div className="h-16 rounded-lg skeleton-shimmer" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-52 rounded-md skeleton-shimmer" />
                  <div className="h-32 w-full rounded-lg skeleton-shimmer" />
                </div>
              </div>
            </div>
          ) : !contentHtml.trim() ? (
            <div className="py-12 px-4 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <FileText className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h4 className="font-display font-bold text-base text-slate-900">
                  Pratinjau Kertas A4 Siap Diisi
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Lengkapi langkah wizard di panel kiri lalu tekan tombol{' '}
                  <strong>Generate Perangkat Ajar</strong>. Kop surat, logo, tanda tangan, dan cap
                  lembaga telah terpasang otomatis pada lembar cetak ini.
                </p>
              </div>
              <div className="inline-flex flex-wrap items-center justify-center gap-3 text-[11px] text-emerald-800 font-semibold pt-2">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Kurikulum Merdeka Kesetaraan
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pembelajaran Mendalam
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 8 Dimensi Profil Lulusan
                </span>
              </div>
            </div>
          ) : (
            <div
              ref={editorRef}
              contentEditable={!isRegeneratingSection}
              suppressContentEditableWarning
              onInput={handleEditorInput}
              aria-label="Editor Teks Kaya Dokumen Perangkat Ajar A4"
              className="a4-prose min-h-[460px] rounded-lg focus:ring-2 focus:ring-emerald-600/20 p-1 -m-1 transition-shadow"
            />
          )}
        </A4DocumentSheet>
      </div>
    </div>
  );
};
