import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Check,
  Edit3,
  GripVertical,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { CognitiveLevel, ExamQuestion } from '../../types/siakad';
import { formatAnswerKeyText, QUESTION_SHAPE_LABELS } from '../../utils/examUtils';

interface QuestionCardEditorProps {
  question: ExamQuestion;
  index: number;
  totalCount: number;
  isDragging: boolean;
  isRegenerating: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onMove: (dir: -1 | 1) => void;
  onUpdate: (updated: ExamQuestion) => void;
  onRegenerate: () => Promise<void>;
  onSaveToBank: () => Promise<void>;
  onDelete: () => void;
}

const LEVEL_STYLES: Record<CognitiveLevel, string> = {
  LOTS: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/50',
  MOTS: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50',
  HOTS: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/50',
};

export const QuestionCardEditor: React.FC<QuestionCardEditorProps> = ({
  question,
  index,
  totalCount,
  isDragging,
  isRegenerating,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMove,
  onUpdate,
  onRegenerate,
  onSaveToBank,
  onDelete,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExamQuestion>(question);
  const letters = ['A', 'B', 'C', 'D', 'E'];

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(question)));
    setEditing(true);
  };

  const commitEdit = () => {
    onUpdate(draft);
    setEditing(false);
  };

  return (
    <article
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-2xl border bg-white dark:bg-slate-900 p-4 sm:p-5 transition-all ${
        isDragging
          ? 'opacity-50 border-emerald-600 shadow-lg scale-[0.99]'
          : 'border-emerald-950/10 dark:border-white/10 shadow-sm hover:border-emerald-600/35'
      }`}
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span
            title="Seret untuk mengurutkan soal"
            className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-800"
          >
            <GripVertical className="w-4 h-4" />
          </span>

          <span className="w-7 h-7 rounded-lg bg-emerald-700 text-white font-display font-extrabold text-xs flex items-center justify-center tabular-nums">
            {index + 1}
          </span>

          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold">
            {QUESTION_SHAPE_LABELS[question.type]}
          </span>

          <span
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ${
              LEVEL_STYLES[question.level]
            }`}
          >
            {question.level}
          </span>

          <span className="px-2 py-1 rounded-lg bg-[#FAFAF7] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300">
            Skor: {question.maxScore}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0 || editing}
            title="Naikkan urutan"
            aria-label="Naikkan urutan soal"
            className="min-h-[36px] min-w-[36px] rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === totalCount - 1 || editing}
            title="Turunkan urutan"
            aria-label="Turunkan urutan soal"
            className="min-h-[36px] min-w-[36px] rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={editing ? commitEdit : startEdit}
            className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
          >
            {editing ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Edit3 className="w-3.5 h-3.5" />}
            <span>{editing ? 'Selesai' : 'Edit'}</span>
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 hover:bg-slate-50 inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Batal</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isRegenerating || editing}
            title="Ganti soal ini dengan AI"
            className="min-h-[36px] px-2.5 rounded-xl border border-emerald-700/25 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRegenerating ? 'Mengganti...' : 'Regenerate'}</span>
          </button>
          <button
            type="button"
            onClick={onSaveToBank}
            disabled={editing}
            title="Simpan ke Bank Soal"
            className="min-h-[36px] min-w-[36px] rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 flex items-center justify-center"
          >
            <BookmarkPlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={editing}
            title="Hapus butir soal"
            aria-label="Hapus butir soal"
            className="min-h-[36px] min-w-[36px] rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: Edit Form vs Display */}
      {editing ? (
        <div className="pt-4 space-y-3.5 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Level Kognitif
              </label>
              <select
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as CognitiveLevel })}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold"
              >
                <option value="LOTS">LOTS</option>
                <option value="MOTS">MOTS</option>
                <option value="HOTS">HOTS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Bobot Skor Maksimal
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.maxScore}
                onChange={(e) => setDraft({ ...draft, maxScore: Number(e.target.value) || 1 })}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Sub-Materi
              </label>
              <input
                type="text"
                value={draft.materi}
                onChange={(e) => setDraft({ ...draft, materi: e.target.value })}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Teks Pertanyaan / Stimulus
            </label>
            <textarea
              rows={3}
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
            />
          </div>

          {/* PG & PG Kompleks options editor */}
          {(draft.type === 'PG' || draft.type === 'PG_KOMPLEKS') && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Opsi Jawaban &amp; Kunci ({draft.type === 'PG' ? 'Pilih 1 benar' : 'Centang jawaban benar'}):
              </p>
              {(draft.options || []).map((opt, optIdx) => {
                const isChecked =
                  draft.type === 'PG'
                    ? draft.correctOptionIndex === optIdx
                    : (draft.correctOptionIndices || []).includes(optIdx);
                return (
                  <div key={optIdx} className="flex items-center gap-2">
                    <input
                      type={draft.type === 'PG' ? 'radio' : 'checkbox'}
                      name={`correct_${draft.id}`}
                      checked={isChecked}
                      onChange={() => {
                        if (draft.type === 'PG') {
                          setDraft({ ...draft, correctOptionIndex: optIdx });
                        } else {
                          const prev = draft.correctOptionIndices || [];
                          const next = prev.includes(optIdx)
                            ? prev.filter((x) => x !== optIdx)
                            : [...prev, optIdx].sort((a, b) => a - b);
                          setDraft({ ...draft, correctOptionIndices: next });
                        }
                      }}
                      className="w-4 h-4 accent-emerald-700"
                    />
                    <span className="font-mono text-xs font-bold w-5">{letters[optIdx]}.</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const nextOpts = [...(draft.options || [])];
                        nextOpts[optIdx] = e.target.value;
                        setDraft({ ...draft, options: nextOpts });
                      }}
                      className="flex-1 min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Benar Salah */}
          {draft.type === 'BENAR_SALAH' && (
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Kunci Jawaban:</span>
              {[true, false].map((val) => (
                <label key={String(val)} className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name={`bs_${draft.id}`}
                    checked={draft.correctBoolean === val}
                    onChange={() => setDraft({ ...draft, correctBoolean: val })}
                    className="accent-emerald-700"
                  />
                  <span>{val ? 'Benar' : 'Salah'}</span>
                </label>
              ))}
            </div>
          )}

          {/* Menjodohkan */}
          {draft.type === 'MENJODOHKAN' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Pasangan Kiri &amp; Kanan
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      matchingPairs: [...(draft.matchingPairs || []), { left: '', right: '' }],
                    })
                  }
                  className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Pasangan
                </button>
              </div>
              {(draft.matchingPairs || []).map((pair, pIdx) => (
                <div key={pIdx} className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={pair.left}
                    placeholder="Pernyataan kiri"
                    onChange={(e) => {
                      const next = [...(draft.matchingPairs || [])];
                      next[pIdx] = { ...next[pIdx], left: e.target.value };
                      setDraft({ ...draft, matchingPairs: next });
                    }}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <input
                    type="text"
                    value={pair.right}
                    placeholder="Pasangan kanan"
                    onChange={(e) => {
                      const next = [...(draft.matchingPairs || [])];
                      next[pIdx] = { ...next[pIdx], right: e.target.value };
                      setDraft({ ...draft, matchingPairs: next });
                    }}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Isian */}
          {draft.type === 'ISIAN' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Jawaban Singkat Diterima (pisahkan dengan koma)
              </label>
              <input
                type="text"
                value={(draft.shortAnswers || []).join(', ')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    shortAnswers: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
          )}

          {/* Uraian */}
          {draft.type === 'URAIAN' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Kunci Jawaban Uraian
              </label>
              <textarea
                rows={2}
                value={draft.essayAnswerKey || ''}
                onChange={(e) => setDraft({ ...draft, essayAnswerKey: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Indikator Soal (Kisi-kisi)
              </label>
              <input
                type="text"
                value={draft.indicator}
                onChange={(e) => setDraft({ ...draft, indicator: e.target.value })}
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Pedoman Penskoran
              </label>
              <input
                type="text"
                value={draft.scoringRubric}
                onChange={(e) => setDraft({ ...draft, scoringRubric: e.target.value })}
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-3.5 space-y-3">
          <p className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
            {question.prompt}
          </p>

          {(question.type === 'PG' || question.type === 'PG_KOMPLEKS') && question.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {question.options.map((opt, oIdx) => {
                const isCorrect =
                  question.type === 'PG'
                    ? question.correctOptionIndex === oIdx
                    : (question.correctOptionIndices || []).includes(oIdx);
                return (
                  <div
                    key={oIdx}
                    className={`px-3 py-2 rounded-xl border text-xs flex items-start gap-2 ${
                      isCorrect
                        ? 'border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="font-mono font-bold shrink-0">{letters[oIdx]}.</span>
                    <span>{opt}</span>
                  </div>
                );
              })}
            </div>
          )}

          {question.type === 'MENJODOHKAN' && question.matchingPairs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {question.matchingPairs.map((pair, pIdx) => (
                <div
                  key={pIdx}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/40 text-xs flex items-center justify-between gap-2"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {pair.left}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">→</span>
                  <span className="text-slate-700 dark:text-slate-300 text-right">{pair.right}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              <strong className="text-emerald-800 dark:text-emerald-400">Kunci:</strong>{' '}
              {formatAnswerKeyText(question)}
            </span>
            <span className="truncate max-w-md">
              <strong>Indikator:</strong> {question.indicator}
            </span>
          </div>
        </div>
      )}
    </article>
  );
};
