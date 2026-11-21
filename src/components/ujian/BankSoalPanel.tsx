import React, { useMemo, useState } from 'react';
import {
  Check,
  Database,
  LayoutGrid,
  List,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { CognitiveLevel, ExamQuestion, QuestionBankItem, QuestionShape } from '../../types/siakad';
import { formatAnswerKeyText, QUESTION_SHAPE_LABELS } from '../../utils/examUtils';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';

interface BankSoalPanelProps {
  items: QuestionBankItem[];
  activeQuestionIds: Set<string>;
  onAddToExam: (question: ExamQuestion) => void;
  onDeleteItem: (id: string) => Promise<void>;
}

const LEVEL_BADGE: Record<CognitiveLevel, string> = {
  LOTS: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  MOTS: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  HOTS: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
};

export const BankSoalPanel: React.FC<BankSoalPanelProps> = ({
  items,
  activeQuestionIds,
  onAddToExam,
  onDeleteItem,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [filterMapel, setFilterMapel] = useState('Semua');
  const [filterMateri, setFilterMateri] = useState('Semua');
  const [filterLevel, setFilterLevel] = useState<'Semua' | CognitiveLevel>('Semua');
  const [filterShape, setFilterShape] = useState<'Semua' | QuestionShape>('Semua');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const uniqueMapels = useMemo(
    () => Array.from(new Set(items.map((i) => i.mapel))).sort(),
    [items]
  );
  const uniqueMateris = useMemo(
    () => Array.from(new Set(items.map((i) => i.materi))).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterMapel !== 'Semua' && item.mapel !== filterMapel) return false;
      if (filterMateri !== 'Semua' && item.materi !== filterMateri) return false;
      if (filterLevel !== 'Semua' && item.cognitiveLevel !== filterLevel) return false;
      if (filterShape !== 'Semua' && item.questionType !== filterShape) return false;
      if (q) {
        const haystack = `${item.mapel} ${item.materi} ${item.question.prompt} ${item.authorName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, filterMapel, filterMateri, filterLevel, filterShape]);

  return (
    <div className="space-y-5">
      {/* Filter & View Switch Bar */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <span>Bank Soal PKBM Annur Karisma</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Pilih butir soal tervalidasi lintas mapel dan level kognitif untuk ditambahkan ke ujian aktif.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#FAFAF7] dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-start">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Tampilan Grid"
              className={`min-h-[38px] px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Tampilan Tabel"
              className={`min-h-[38px] px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <List className="w-4 h-4" />
              <span>Tabel</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari teks soal atau materi..."
              className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={filterMapel}
            onChange={(e) => setFilterMapel(e.target.value)}
            aria-label="Filter Mata Pelajaran"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="Semua">Semua Mapel</option>
            {uniqueMapels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterMateri}
            onChange={(e) => setFilterMateri(e.target.value)}
            aria-label="Filter Materi"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="Semua">Semua Materi</option>
            {uniqueMateris.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as 'Semua' | CognitiveLevel)}
            aria-label="Filter Level Kognitif"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="Semua">Semua Level (LOTS/MOTS/HOTS)</option>
            <option value="LOTS">LOTS (Mudah / Pemahaman)</option>
            <option value="MOTS">MOTS (Sedang / Aplikasi)</option>
            <option value="HOTS">HOTS (Tinggi / Analisis)</option>
          </select>

          <select
            value={filterShape}
            onChange={(e) => setFilterShape(e.target.value as 'Semua' | QuestionShape)}
            aria-label="Filter Bentuk Soal"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="Semua">Semua Bentuk Soal</option>
            {Object.entries(QUESTION_SHAPE_LABELS).map(([k, lbl]) => (
              <option key={k} value={k}>
                {lbl}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Belum Ada Soal yang Sesuai Filter"
          description="Coba ubah filter mapel/level atau simpan butir soal baru dari hasil Generator Soal AI."
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const alreadyAdded = activeQuestionIds.has(item.question.id);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between gap-4 hover:-translate-y-0.5 transition-transform"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {QUESTION_SHAPE_LABELS[item.questionType]}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold ${
                          LEVEL_BADGE[item.cognitiveLevel]
                        }`}
                      >
                        {item.cognitiveLevel}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      {item.paket}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400">
                      {item.mapel} · {item.materi}
                    </p>
                    <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-100 line-clamp-4 leading-relaxed whitespace-pre-line">
                      {item.question.prompt}
                    </p>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 line-clamp-2">
                    <strong>Kunci:</strong> {formatAnswerKeyText(item.question)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAddToExam(item.question)}
                    className={`flex-1 min-h-[42px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      alreadyAdded
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-600/30'
                        : 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white hover:brightness-105'
                    }`}
                  >
                    {alreadyAdded ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Sudah di Ujian (+ Salin Lagi)</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Tambahkan ke ujian</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(item.id)}
                    aria-label="Hapus dari Bank Soal"
                    className="min-h-[42px] min-w-[42px] rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#FAFAF7] dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">Mapel &amp; Materi</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">Pertanyaan</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">Bentuk</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">Level</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((item) => {
                const alreadyAdded = activeQuestionIds.has(item.question.id);
                return (
                  <tr key={item.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 align-top max-w-[200px]">
                      <p className="font-bold text-slate-900 dark:text-white">{item.mapel}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.materi}</p>
                      <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        {item.paket}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top max-w-md">
                      <p className="text-slate-800 dark:text-slate-200 line-clamp-3 whitespace-pre-line">
                        {item.question.prompt}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                        {QUESTION_SHAPE_LABELS[item.questionType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                          LEVEL_BADGE[item.cognitiveLevel]
                        }`}
                      >
                        {item.cognitiveLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onAddToExam(item.question)}
                          className="min-h-[38px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{alreadyAdded ? 'Tambah Lagi' : 'Tambahkan ke ujian'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(item.id)}
                          aria-label="Hapus dari Bank Soal"
                          className="min-h-[38px] min-w-[38px] rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Hapus Soal dari Bank Soal?"
        description="Butir soal akan dihapus dari Bank Soal sekolah, namun tidak menghapus soal yang sudah disalin ke naskah ujian."
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            await onDeleteItem(deleteId);
            setDeleteId(null);
          }
        }}
      />
    </div>
  );
};
