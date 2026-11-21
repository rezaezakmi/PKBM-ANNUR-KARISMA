import React from 'react';
import { Award, CheckCircle2, Clock, PauseCircle, XCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalized = status.toLowerCase();

  if (normalized === 'aktif' || normalized === 'selesai') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (normalized === 'cuti') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60 whitespace-nowrap">
        <PauseCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (normalized === 'lulus') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200/80 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60 whitespace-nowrap">
        <Award className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (normalized === 'arsip') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60 whitespace-nowrap">
      <XCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};
