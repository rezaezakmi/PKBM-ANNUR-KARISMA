import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { MotionModal } from './MotionPrimitives';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Ya, Hapus Data',
  cancelLabel = 'Batal',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <MotionModal
      open={open}
      onClose={onCancel}
      ariaLabelledBy="confirm-dialog-title"
      maxWidthClass="max-w-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Tutup konfirmasi"
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <h3
        id="confirm-dialog-title"
        className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100"
      >
        {title}
      </h3>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {description}
      </p>

      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="btn-ripple min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          <Trash2 className="w-4 h-4" />
          {loading ? 'Menghapus...' : confirmLabel}
        </button>
      </div>
    </MotionModal>
  );
};
