import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Filter } from 'lucide-react';
import { PaketType } from '../../types/siakad';
import { createDropdownVariants, useAdaptiveMotion } from '../../config/animations';

export type DashboardJenjangFilter = 'Semua' | PaketType;

interface JenjangFilterDropdownProps {
  value: DashboardJenjangFilter;
  onChange: (next: DashboardJenjangFilter) => void;
  counts: {
    all: number;
    'Paket A': number;
    'Paket B': number;
    'Paket C': number;
  };
  align?: 'left' | 'right';
  ariaLabel?: string;
}

interface FilterOption {
  value: DashboardJenjangFilter;
  label: string;
  sublabel: string;
  dotClass: string;
}

const OPTIONS: FilterOption[] = [
  {
    value: 'Semua',
    label: 'Semua Jenjang',
    sublabel: 'Paket A, B, dan C',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
  },
  {
    value: 'Paket A',
    label: 'Paket A',
    sublabel: 'Setara SD / MI',
    dotClass: 'bg-emerald-500',
  },
  {
    value: 'Paket B',
    label: 'Paket B',
    sublabel: 'Setara SMP / MTs',
    dotClass: 'bg-teal-700 dark:bg-teal-400',
  },
  {
    value: 'Paket C',
    label: 'Paket C',
    sublabel: 'Setara SMA / MA',
    dotClass: 'bg-amber-500',
  },
];

export const JenjangFilterDropdown: React.FC<JenjangFilterDropdownProps> = ({
  value,
  onChange,
  counts,
  align = 'right',
  ariaLabel = 'Filter jenjang pendidikan',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const motionProfile = useAdaptiveMotion();
  const dropdownVariants = createDropdownVariants(motionProfile);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const activeOption = OPTIONS.find((opt) => opt.value === value) || OPTIONS[0];
  const getCount = (optValue: DashboardJenjangFilter) =>
    optValue === 'Semua' ? counts.all : counts[optValue];

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-900 hover:border-emerald-600/60 dark:hover:border-emerald-500/60 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2.5 shadow-xs transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <Filter className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
        <span className={`w-2 h-2 rounded-xs shrink-0 ${activeOption.dotClass}`} />
        <span>{activeOption.label}</span>
        <span className="text-slate-400 dark:text-slate-500 font-medium tabular-nums">
          ({getCount(value)})
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
            open ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={ariaLabel}
            variants={dropdownVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`absolute z-40 mt-2 w-64 rounded-2xl border border-emerald-950/12 dark:border-white/12 bg-white dark:bg-slate-900 shadow-xl shadow-slate-950/10 dark:shadow-black/40 p-1.5 ${
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
            }`}
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Pilih Jenjang Kesetaraan
            </div>
            <div className="space-y-0.5">
              {OPTIONS.map((opt) => {
                const isSelected = opt.value === value;
                const count = getCount(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${opt.dotClass}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight truncate">
                          {opt.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {opt.sublabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                        {count}
                      </span>
                      <span className="w-4 h-4 flex items-center justify-center">
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
