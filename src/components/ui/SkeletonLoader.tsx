import React from 'react';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6" aria-label="Memuat data SIAKAD">
      {/* Welcome Banner Skeleton */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-3">
        <div className="h-4 w-48 rounded-lg skeleton-shimmer" />
        <div className="h-8 w-72 max-w-full rounded-xl skeleton-shimmer" />
        <div className="h-4 w-96 max-w-full rounded-lg skeleton-shimmer" />
      </div>

      {/* 4 KPI Stat Card Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2.5 flex-1">
                <div className="h-3.5 w-24 rounded-md skeleton-shimmer" />
                <div className="h-8 w-20 rounded-lg skeleton-shimmer" />
              </div>
              <div className="w-11 h-11 rounded-xl skeleton-shimmer shrink-0" />
            </div>
            <div className="h-3 w-32 rounded-md skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Chart + Sidebar Panel Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="space-y-2">
            <div className="h-5 w-44 rounded-lg skeleton-shimmer" />
            <div className="h-3.5 w-56 rounded-md skeleton-shimmer" />
          </div>
          <div className="h-56 flex items-end justify-around gap-4 pt-6 px-4">
            <div className="w-14 h-24 rounded-t-xl skeleton-shimmer" />
            <div className="w-14 h-36 rounded-t-xl skeleton-shimmer" />
            <div className="w-14 h-48 rounded-t-xl skeleton-shimmer" />
          </div>
        </div>
        <div className="lg:col-span-7 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="space-y-2">
            <div className="h-5 w-52 rounded-lg skeleton-shimmer" />
            <div className="h-3.5 w-64 rounded-md skeleton-shimmer" />
          </div>
          <div className="h-56 rounded-xl skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div
      className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden"
      aria-label="Memuat daftar data"
    >
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4">
        <div className="h-4 w-28 rounded-md skeleton-shimmer" />
        <div className="h-4 w-40 rounded-md skeleton-shimmer" />
        <div className="h-4 w-24 rounded-md skeleton-shimmer ml-auto" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="px-5 py-3.5 flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl skeleton-shimmer shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="h-4 w-44 max-w-[70%] rounded-md skeleton-shimmer" />
              <div className="h-3 w-32 max-w-[50%] rounded-md skeleton-shimmer" />
            </div>
            <div className="h-6 w-20 rounded-lg skeleton-shimmer shrink-0" />
            <div className="h-8 w-16 rounded-lg skeleton-shimmer shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Memuat kartu">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="h-5 w-24 rounded-lg skeleton-shimmer" />
            <div className="h-5 w-16 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-5 w-3/4 rounded-lg skeleton-shimmer" />
          <div className="h-3.5 w-full rounded-md skeleton-shimmer" />
          <div className="h-3.5 w-2/3 rounded-md skeleton-shimmer" />
          <div className="pt-2 flex items-center justify-between">
            <div className="h-4 w-28 rounded-md skeleton-shimmer" />
            <div className="h-9 w-24 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const LoginAuthSkeleton: React.FC = () => {
  return (
    <div
      className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-5"
      aria-label="Memeriksa status autentikasi"
    >
      <div className="space-y-2.5">
        <div className="h-5 w-36 rounded-lg skeleton-shimmer" />
        <div className="h-8 w-52 rounded-xl skeleton-shimmer" />
        <div className="h-4 w-64 max-w-full rounded-md skeleton-shimmer" />
      </div>
      <div className="space-y-3.5">
        <div className="space-y-1.5">
          <div className="h-3.5 w-20 rounded-md skeleton-shimmer" />
          <div className="h-12 w-full rounded-xl skeleton-shimmer" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3.5 w-20 rounded-md skeleton-shimmer" />
          <div className="h-12 w-full rounded-xl skeleton-shimmer" />
        </div>
        <div className="h-12 w-full rounded-xl skeleton-shimmer" />
      </div>
    </div>
  );
};
