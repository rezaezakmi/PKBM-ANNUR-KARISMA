import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-emerald-900/15 dark:border-white/15 bg-white/70 dark:bg-slate-900/50">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-amber-500/15 border border-emerald-500/20 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-emerald-700 dark:text-emerald-400" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-semibold shadow-sm hover:brightness-105 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
