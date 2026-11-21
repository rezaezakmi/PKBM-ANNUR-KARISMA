import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  Download,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  RotateCcw,
  Users,
} from 'lucide-react';
import { Classroom, PaketType, SchoolSettings, Student, UserRole } from '../../types/siakad';
import {
  exportRecordsToExcel,
  getStudentsForClassroom,
  resolveStudentPlacement,
  sortClassesByJenjang,
  stripPaketPrefixFromClassName,
} from '../../utils/excelUtils';
import { generateStudentPaketRecapPdf } from '../../utils/recapPdfUtils';
import { CountUpNumber } from '../ui/CountUpNumber';
import { DashboardJenjangFilter, JenjangFilterDropdown } from './JenjangFilterDropdown';

interface StudentPaketRecapSectionProps {
  students: Student[];
  classes: Classroom[];
  schoolSettings: SchoolSettings;
  effectiveRole: UserRole;
  selectedProgram: DashboardJenjangFilter;
  onProgramChange: (program: DashboardJenjangFilter) => void;
  onDrillDown: (paket: DashboardJenjangFilter, route: 'students' | 'classes') => void;
  onExportSuccess: () => void;
  onPdfExportSuccess: (fileName: string) => void;
  onPdfExportError: (message: string) => void;
}

interface PaketMeta {
  paket: PaketType;
  setara: string;
  barClass: string;
  dotClass: string;
  accentTextClass: string;
  activeBgClass: string;
  rgb: [number, number, number];
}

const PAKET_CONFIG: PaketMeta[] = [
  {
    paket: 'Paket A',
    setara: 'Setara SD / MI',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-500',
    accentTextClass: 'text-emerald-700 dark:text-emerald-400',
    activeBgClass: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    rgb: [16, 185, 129],
  },
  {
    paket: 'Paket B',
    setara: 'Setara SMP / MTs',
    barClass: 'bg-teal-700 dark:bg-teal-500',
    dotClass: 'bg-teal-700 dark:bg-teal-500',
    accentTextClass: 'text-teal-800 dark:text-teal-300',
    activeBgClass: 'bg-teal-50/70 dark:bg-teal-950/30',
    rgb: [15, 118, 110],
  },
  {
    paket: 'Paket C',
    setara: 'Setara SMA / MA',
    barClass: 'bg-amber-500',
    dotClass: 'bg-amber-500',
    accentTextClass: 'text-amber-700 dark:text-amber-400',
    activeBgClass: 'bg-amber-50/70 dark:bg-amber-950/30',
    rgb: [217, 119, 6],
  },
];

interface RombelRecapRow {
  id: string;
  paket: PaketType;
  className: string;
  shortName: string;
  gradeLevel: string;
  homeroomTeacherName: string;
  total: number;
  male: number;
  female: number;
  active: number;
  nonActive: number;
  capacity: number;
}

interface PaketRecapSummary {
  meta: PaketMeta;
  total: number;
  male: number;
  female: number;
  active: number;
  nonActive: number;
  rombelCount: number;
  totalCapacity: number;
  percentage: number;
}

const SMOOTH_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function formatPercent(value: number): string {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export const StudentPaketRecapSection: React.FC<StudentPaketRecapSectionProps> = ({
  students,
  classes,
  schoolSettings,
  effectiveRole,
  selectedProgram,
  onProgramChange,
  onDrillDown,
  onExportSuccess,
  onPdfExportSuccess,
  onPdfExportError,
}) => {
  const [exportingPdf, setExportingPdf] = useState(false);

  const schoolName = schoolSettings.schoolName;
  const academicYear = schoolSettings.academicYear;
  const semester = schoolSettings.semester;

  const sortedClasses = useMemo(() => sortClassesByJenjang(classes), [classes]);

  // Hitung rekapitulasi akurat per Paket (A, B, C) menggunakan resolveStudentPlacement
  const { paketSummaries, rombelRows, totals, dropdownCounts } = useMemo(() => {
    const paketCounters: Record<
      PaketType,
      { total: number; male: number; female: number; active: number; nonActive: number }
    > = {
      'Paket A': { total: 0, male: 0, female: 0, active: 0, nonActive: 0 },
      'Paket B': { total: 0, male: 0, female: 0, active: 0, nonActive: 0 },
      'Paket C': { total: 0, male: 0, female: 0, active: 0, nonActive: 0 },
    };

    const assignedStudentIds = new Set<string>();
    const rows: RombelRecapRow[] = [];

    sortedClasses.forEach((cls) => {
      const members = getStudentsForClassroom(cls, students, sortedClasses);
      let male = 0;
      let female = 0;
      let active = 0;
      let nonActive = 0;

      members.forEach((stu) => {
        assignedStudentIds.add(stu.id);
        if (stu.gender === 'P') female += 1;
        else male += 1;
        if (stu.status === 'Aktif') active += 1;
        else nonActive += 1;
      });

      rows.push({
        id: cls.id,
        paket: cls.paket,
        className: cls.name,
        shortName: stripPaketPrefixFromClassName(cls.name),
        gradeLevel: cls.gradeLevel || '-',
        homeroomTeacherName: cls.homeroomTeacherName || 'Belum ditetapkan',
        total: members.length,
        male,
        female,
        active,
        nonActive,
        capacity: cls.capacity || Math.max(members.length, 30),
      });
    });

    const unassignedByPaket: Record<PaketType, Student[]> = {
      'Paket A': [],
      'Paket B': [],
      'Paket C': [],
    };

    students.forEach((stu) => {
      const placement = resolveStudentPlacement(stu, sortedClasses);
      const bucket = paketCounters[placement.paket];
      bucket.total += 1;
      if (stu.gender === 'P') bucket.female += 1;
      else bucket.male += 1;
      if (stu.status === 'Aktif') bucket.active += 1;
      else bucket.nonActive += 1;

      if (!assignedStudentIds.has(stu.id)) {
        unassignedByPaket[placement.paket].push(stu);
      }
    });

    (['Paket A', 'Paket B', 'Paket C'] as PaketType[]).forEach((paket) => {
      const orphans = unassignedByPaket[paket];
      if (orphans.length > 0) {
        let male = 0;
        let female = 0;
        let active = 0;
        let nonActive = 0;
        orphans.forEach((stu) => {
          if (stu.gender === 'P') female += 1;
          else male += 1;
          if (stu.status === 'Aktif') active += 1;
          else nonActive += 1;
        });
        rows.push({
          id: `unassigned_${paket}`,
          paket,
          className: `${paket} - Belum Masuk Rombel`,
          shortName: 'Belum Masuk Rombel',
          gradeLevel: '-',
          homeroomTeacherName: '-',
          total: orphans.length,
          male,
          female,
          active,
          nonActive,
          capacity: orphans.length,
        });
      }
    });

    const grandTotal = students.length;
    const totalMale =
      paketCounters['Paket A'].male +
      paketCounters['Paket B'].male +
      paketCounters['Paket C'].male;
    const totalFemale =
      paketCounters['Paket A'].female +
      paketCounters['Paket B'].female +
      paketCounters['Paket C'].female;
    const totalActive =
      paketCounters['Paket A'].active +
      paketCounters['Paket B'].active +
      paketCounters['Paket C'].active;
    const totalNonActive =
      paketCounters['Paket A'].nonActive +
      paketCounters['Paket B'].nonActive +
      paketCounters['Paket C'].nonActive;

    const summaries: PaketRecapSummary[] = PAKET_CONFIG.map((meta) => {
      const c = paketCounters[meta.paket];
      const paketRombels = rows.filter((r) => r.paket === meta.paket);
      const rombelCount = sortedClasses.filter((cls) => cls.paket === meta.paket).length;
      const totalCapacity = paketRombels.reduce((sum, r) => sum + r.capacity, 0);
      return {
        meta,
        total: c.total,
        male: c.male,
        female: c.female,
        active: c.active,
        nonActive: c.nonActive,
        rombelCount,
        totalCapacity,
        percentage: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0,
      };
    });

    return {
      paketSummaries: summaries,
      rombelRows: rows,
      totals: {
        grandTotal,
        totalMale,
        totalFemale,
        totalActive,
        totalNonActive,
        totalRombels: sortedClasses.length,
      },
      dropdownCounts: {
        all: grandTotal,
        'Paket A': paketCounters['Paket A'].total,
        'Paket B': paketCounters['Paket B'].total,
        'Paket C': paketCounters['Paket C'].total,
      },
    };
  }, [students, sortedClasses]);

  const focusedSummary = useMemo(() => {
    if (selectedProgram === 'Semua') return null;
    return paketSummaries.find((s) => s.meta.paket === selectedProgram) || null;
  }, [paketSummaries, selectedProgram]);

  const filteredRombelRows = useMemo(() => {
    if (selectedProgram === 'Semua') return rombelRows;
    return rombelRows.filter((row) => row.paket === selectedProgram);
  }, [rombelRows, selectedProgram]);

  const filteredTotals = useMemo(() => {
    return filteredRombelRows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        male: acc.male + r.male,
        female: acc.female + r.female,
        active: acc.active + r.active,
        nonActive: acc.nonActive + r.nonActive,
        capacity: acc.capacity + r.capacity,
      }),
      { total: 0, male: 0, female: 0, active: 0, nonActive: 0, capacity: 0 }
    );
  }, [filteredRombelRows]);

  const handleExportExcel = () => {
    const excelRows: Array<Record<string, unknown>> = [];

    const targetSummaries =
      selectedProgram === 'Semua'
        ? paketSummaries
        : paketSummaries.filter((s) => s.meta.paket === selectedProgram);

    targetSummaries.forEach((summary) => {
      const paketRombels = rombelRows.filter((r) => r.paket === summary.meta.paket);
      paketRombels.forEach((r) => {
        const fillPct = r.capacity > 0 ? Math.round((r.total / r.capacity) * 100) : 0;
        const sharePct =
          totals.grandTotal > 0 ? Number(((r.total / totals.grandTotal) * 100).toFixed(1)) : 0;
        excelRows.push({
          Kategori: 'Rombel',
          Jenjang: r.paket,
          Setara: summary.meta.setara,
          'Nama Rombel': r.className,
          'Wali Kelas': r.homeroomTeacherName,
          'Laki-laki (L)': r.male,
          'Perempuan (P)': r.female,
          Aktif: r.active,
          'Cuti/Lulus/Nonaktif': r.nonActive,
          'Total Siswa': r.total,
          Kapasitas: r.capacity,
          'Keterisian (%)': `${fillPct}%`,
          'Proporsi Lembaga (%)': `${sharePct}%`,
        });
      });

      excelRows.push({
        Kategori: `SUBTOTAL ${summary.meta.paket.toUpperCase()}`,
        Jenjang: summary.meta.paket,
        Setara: summary.meta.setara,
        'Nama Rombel': `${summary.rombelCount} Rombel`,
        'Wali Kelas': '-',
        'Laki-laki (L)': summary.male,
        'Perempuan (P)': summary.female,
        Aktif: summary.active,
        'Cuti/Lulus/Nonaktif': summary.nonActive,
        'Total Siswa': summary.total,
        Kapasitas: paketRombels.reduce((s, r) => s + r.capacity, 0),
        'Keterisian (%)': '-',
        'Proporsi Lembaga (%)': `${summary.percentage.toFixed(1)}%`,
      });
    });

    if (selectedProgram === 'Semua') {
      excelRows.push({
        Kategori: 'TOTAL KESELURUHAN PKBM',
        Jenjang: 'Paket A, B, C',
        Setara: schoolName,
        'Nama Rombel': `${totals.totalRombels} Rombel (TA ${academicYear} ${semester})`,
        'Wali Kelas': '-',
        'Laki-laki (L)': totals.totalMale,
        'Perempuan (P)': totals.totalFemale,
        Aktif: totals.totalActive,
        'Cuti/Lulus/Nonaktif': totals.totalNonActive,
        'Total Siswa': totals.grandTotal,
        Kapasitas: rombelRows.reduce((s, r) => s + r.capacity, 0),
        'Keterisian (%)': '-',
        'Proporsi Lembaga (%)': '100.0%',
      });
    }

    const scopeSlug =
      selectedProgram === 'Semua' ? 'Paket_ABC' : selectedProgram.replace(/\s+/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportRecordsToExcel(
      excelRows,
      `Rekap_Siswa_${scopeSlug}_${academicYear.replace(/[/\\]/g, '-')}_${dateStamp}`,
      selectedProgram === 'Semua' ? 'Rekap Paket A B C' : `Rekap ${selectedProgram}`
    );
    onExportSuccess();
  };

  const handleExportPdf = async () => {
    if (totals.grandTotal === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      const fileName = await generateStudentPaketRecapPdf({
        schoolSettings,
        paketSummaries: paketSummaries.map((s) => ({
          paket: s.meta.paket,
          setara: s.meta.setara,
          rombelCount: s.rombelCount,
          male: s.male,
          female: s.female,
          active: s.active,
          nonActive: s.nonActive,
          total: s.total,
          percentage: s.percentage,
          rgb: s.meta.rgb,
        })),
        rombelRows: filteredRombelRows.map((r) => ({
          paket: r.paket,
          className: r.className,
          homeroomTeacherName: r.homeroomTeacherName,
          male: r.male,
          female: r.female,
          active: r.active,
          nonActive: r.nonActive,
          total: r.total,
          capacity: r.capacity,
        })),
        activeFilter: selectedProgram,
        totals,
      });
      onPdfExportSuccess(fileName);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Terjadi kendala saat membuat dokumen PDF rekapitulasi.';
      onPdfExportError(msg);
    } finally {
      setExportingPdf(false);
    }
  };

  const canManageClasses = effectiveRole === 'admin' || effectiveRole === 'kepala_pkbm';

  return (
    <section
      aria-label="Rekapitulasi data siswa per paket A, B, dan C"
      className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm"
    >
      {/* Header Bar */}
      <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
            Rekapitulasi Siswa per Jenjang{' '}
            <span className="text-emerald-700 dark:text-emerald-400">
              ({selectedProgram === 'Semua' ? 'Paket A, B, C' : selectedProgram})
            </span>
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
            <span>
              {selectedProgram === 'Semua' ? 'Total' : `Tampilan ${selectedProgram}:`}{' '}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {focusedSummary ? focusedSummary.total : totals.grandTotal}
              </strong>{' '}
              warga belajar
            </span>
            <span aria-hidden="true">·</span>
            <span>{focusedSummary ? focusedSummary.active : totals.totalActive} aktif</span>
            <span aria-hidden="true">·</span>
            <span>
              L: {focusedSummary ? focusedSummary.male : totals.totalMale} / P:{' '}
              {focusedSummary ? focusedSummary.female : totals.totalFemale}
            </span>
            <span aria-hidden="true">·</span>
            <span>{focusedSummary ? focusedSummary.rombelCount : totals.totalRombels} rombel</span>
            <span aria-hidden="true">·</span>
            <span>
              TA {academicYear} ({semester})
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <JenjangFilterDropdown
            value={selectedProgram}
            onChange={onProgramChange}
            counts={dropdownCounts}
            align="right"
            ariaLabel="Filter rekapitulasi siswa per jenjang"
          />

          {selectedProgram !== 'Semua' && (
            <button
              type="button"
              onClick={() => onProgramChange('Semua')}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Semua</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={totals.grandTotal === 0}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-emerald-950/15 dark:border-white/15 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Export Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={totals.grandTotal === 0 || exportingPdf}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{exportingPdf ? 'Menyiapkan PDF...' : 'Cetak Rekap PDF'}</span>
          </button>
        </div>
      </div>

      {totals.grandTotal === 0 ? (
        <div className="px-6 py-12 border-t border-slate-100 dark:border-slate-800 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
            <GraduationCap className="w-6 h-6" />
          </div>
          <p className="mt-3 font-display font-bold text-base text-slate-900 dark:text-white">
            Belum Ada Data Siswa Terdaftar
          </p>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Tambahkan data warga belajar atau impor file Excel agar rekapitulasi distribusi Paket A,
            Paket B, dan Paket C tampil otomatis di sini.
          </p>
          <button
            type="button"
            onClick={() => onDrillDown('Semua', 'students')}
            className="mt-4 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <span>Buka Data Murid</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Proportional Stacked Distribution Bar */}
          <div className="px-5 sm:px-6 pb-5">
            <div
              className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800"
              role="img"
              aria-label={paketSummaries
                .map((s) => `${s.meta.paket} ${s.total} siswa (${formatPercent(s.percentage)}%)`)
                .join(', ')}
            >
              {paketSummaries.map((summary) =>
                summary.total > 0 ? (
                  <button
                    key={summary.meta.paket}
                    type="button"
                    title={`${summary.meta.paket}: ${summary.total} siswa (${formatPercent(summary.percentage)}%)`}
                    onClick={() =>
                      onProgramChange(
                        selectedProgram === summary.meta.paket ? 'Semua' : summary.meta.paket
                      )
                    }
                    style={{ width: `${Math.max(summary.percentage, 1.5)}%` }}
                    className={`${summary.meta.barClass} h-full transition-opacity duration-200 focus:outline-none ${
                      selectedProgram !== 'Semua' && selectedProgram !== summary.meta.paket
                        ? 'opacity-25 hover:opacity-70'
                        : 'opacity-100 hover:opacity-85'
                    }`}
                  />
                ) : null
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              {paketSummaries.map((summary) => {
                const isDimmed =
                  selectedProgram !== 'Semua' && selectedProgram !== summary.meta.paket;
                const isSelected = selectedProgram === summary.meta.paket;
                return (
                  <button
                    key={summary.meta.paket}
                    type="button"
                    onClick={() =>
                      onProgramChange(isSelected ? 'Semua' : summary.meta.paket)
                    }
                    className={`inline-flex items-center gap-2 transition-all duration-200 hover:text-slate-900 dark:hover:text-white ${
                      isSelected
                        ? 'font-bold text-slate-900 dark:text-white'
                        : isDimmed
                          ? 'opacity-50 hover:opacity-100 font-medium'
                          : 'font-medium'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-xs shrink-0 ${summary.meta.dotClass}`}
                    />
                    <span>{summary.meta.paket}</span>
                    <span className="text-slate-900 dark:text-white font-semibold">
                      {summary.total}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">
                      ({formatPercent(summary.percentage)}%)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Animated Summary Area: 3-Column Overview (Semua) vs Focused Single-Paket Detail */}
          <div className="border-t border-slate-100 dark:border-slate-800 overflow-hidden">
            <AnimatePresence mode="wait">
              {focusedSummary ? (
                <motion.div
                  key={`focused-${focusedSummary.meta.paket}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: SMOOTH_EASE }}
                  className={`p-5 sm:p-6 ${focusedSummary.meta.activeBgClass}`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    {/* Primary Metric */}
                    <div className="lg:col-span-5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-xs shrink-0 ${focusedSummary.meta.dotClass}`}
                        />
                        <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                          {focusedSummary.meta.paket}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {focusedSummary.meta.setara}
                        </span>
                      </div>

                      <div className="mt-3 flex items-baseline gap-2.5">
                        <span className="font-display font-extrabold text-4xl tracking-tight text-slate-900 dark:text-white tabular-nums">
                          <CountUpNumber value={focusedSummary.total} />
                        </span>
                        <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">
                          warga belajar ({formatPercent(focusedSummary.percentage)}% dari total PKBM)
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span>{focusedSummary.rombelCount} Rombel Terdaftar</span>
                        <span aria-hidden="true">·</span>
                        <span>{focusedSummary.active} Aktif</span>
                        {focusedSummary.nonActive > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{focusedSummary.nonActive} Cuti/Lulus/Nonaktif</span>
                          </>
                        )}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
                        <button
                          type="button"
                          onClick={() => onDrillDown(focusedSummary.meta.paket, 'students')}
                          className={`font-semibold inline-flex items-center gap-1 hover:underline whitespace-nowrap ${focusedSummary.meta.accentTextClass}`}
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>Lihat Daftar Murid {focusedSummary.meta.paket}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                        {canManageClasses && (
                          <button
                            type="button"
                            onClick={() => onDrillDown(focusedSummary.meta.paket, 'classes')}
                            className="font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5 shrink-0" />
                            <span>Kelola Rombel</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Gender & Capacity Breakdown */}
                    <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5 lg:border-l lg:border-slate-200/70 dark:lg:border-slate-700/70 lg:pl-6">
                      {/* Gender Split */}
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            Komposisi Gender
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                            L: {focusedSummary.male} · P: {focusedSummary.female}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full overflow-hidden flex bg-slate-200/70 dark:bg-slate-800">
                          <div
                            className="bg-emerald-600 h-full transition-all duration-300"
                            style={{
                              width: `${
                                focusedSummary.total > 0
                                  ? (focusedSummary.male / focusedSummary.total) * 100
                                  : 0
                              }%`,
                            }}
                          />
                          <div
                            className="bg-amber-500 h-full transition-all duration-300"
                            style={{
                              width: `${
                                focusedSummary.total > 0
                                  ? (focusedSummary.female / focusedSummary.total) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>
                            Laki-laki:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {formatPercent(
                                focusedSummary.total > 0
                                  ? (focusedSummary.male / focusedSummary.total) * 100
                                  : 0
                              )}
                              %
                            </strong>
                          </span>
                          <span>
                            Perempuan:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {formatPercent(
                                focusedSummary.total > 0
                                  ? (focusedSummary.female / focusedSummary.total) * 100
                                  : 0
                              )}
                              %
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Capacity Utilization */}
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            Keterisian Kapasitas Rombel
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                            {focusedSummary.total} / {focusedSummary.totalCapacity}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full overflow-hidden bg-slate-200/70 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${focusedSummary.meta.barClass} transition-all duration-300`}
                            style={{
                              width: `${
                                focusedSummary.totalCapacity > 0
                                  ? Math.min(
                                      100,
                                      (focusedSummary.total / focusedSummary.totalCapacity) * 100
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>
                            Okupansi:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {formatPercent(
                                focusedSummary.totalCapacity > 0
                                  ? (focusedSummary.total / focusedSummary.totalCapacity) * 100
                                  : 0
                              )}
                              %
                            </strong>
                          </span>
                          <span>
                            Sisa kursi:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {Math.max(0, focusedSummary.totalCapacity - focusedSummary.total)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="overview-all"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: SMOOTH_EASE }}
                  className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800"
                >
                  {paketSummaries.map((summary) => (
                    <div
                      key={summary.meta.paket}
                      className="p-5 sm:p-6 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => onProgramChange(summary.meta.paket)}
                          className="text-left group"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-xs shrink-0 ${summary.meta.dotClass}`}
                            />
                            <span className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white group-hover:underline">
                              {summary.meta.paket}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {summary.meta.setara}
                          </p>
                        </button>
                        <span
                          className={`text-sm font-bold tabular-nums ${summary.meta.accentTextClass}`}
                        >
                          {formatPercent(summary.percentage)}%
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline gap-2">
                        <span className="font-display font-extrabold text-3xl tracking-tight text-slate-900 dark:text-white tabular-nums">
                          <CountUpNumber value={summary.total} />
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          warga belajar
                        </span>
                      </div>

                      {/* Unboxed Metadata Line */}
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span>{summary.rombelCount} Rombel</span>
                        <span aria-hidden="true">·</span>
                        <span>{summary.active} Aktif</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          L: {summary.male} / P: {summary.female}
                        </span>
                        {summary.nonActive > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{summary.nonActive} Lainnya</span>
                          </>
                        )}
                      </p>

                      {/* Share Progress Bar */}
                      <div className="mt-3.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${summary.meta.barClass} transition-all duration-300`}
                          style={{ width: `${summary.percentage}%` }}
                        />
                      </div>

                      {/* Interactive Drill-Down Links */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => onDrillDown(summary.meta.paket, 'students')}
                          className={`font-semibold inline-flex items-center gap-1 hover:underline whitespace-nowrap ${summary.meta.accentTextClass}`}
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>Lihat Murid</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                        </button>

                        {canManageClasses && (
                          <button
                            type="button"
                            onClick={() => onDrillDown(summary.meta.paket, 'classes')}
                            className="font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5 shrink-0" />
                            <span>Rombel</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Detailed Rombel Distribution Table with Smooth Transition */}
          <div className="border-t border-slate-100 dark:border-slate-800 rounded-b-2xl overflow-hidden">
            <div className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/40">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Rincian Distribusi per Rombel{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  (
                  {selectedProgram === 'Semua'
                    ? 'Seluruh Jenjang Paket A, B & C'
                    : `Filter ${selectedProgram}`}
                  )
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredRombelRows.length} rombel · {filteredTotals.total} warga belajar
              </p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`rombel-table-${selectedProgram}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: SMOOTH_EASE }}
              >
                {filteredRombelRows.length === 0 ? (
                  <div className="px-6 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    Belum ada rombel terdaftar untuk {selectedProgram}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-y border-slate-100 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 pl-5 sm:pl-6 pr-3">Jenjang & Rombel</th>
                          <th className="py-2.5 px-3 hidden sm:table-cell">Wali Kelas</th>
                          <th className="py-2.5 px-3 text-right">L</th>
                          <th className="py-2.5 px-3 text-right">P</th>
                          <th className="py-2.5 px-3 text-right">Aktif</th>
                          <th className="py-2.5 px-3 text-right">Total / Kapasitas</th>
                          <th className="py-2.5 px-3 text-right hidden md:table-cell">Porsi</th>
                          <th className="py-2.5 pl-3 pr-5 sm:pr-6 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                        {filteredRombelRows.map((row, idx) => {
                          const meta =
                            PAKET_CONFIG.find((p) => p.paket === row.paket) || PAKET_CONFIG[2];
                          const occupancyPct =
                            row.capacity > 0
                              ? Math.min(100, Math.round((row.total / row.capacity) * 100))
                              : 0;
                          const sharePct =
                            totals.grandTotal > 0 ? (row.total / totals.grandTotal) * 100 : 0;

                          return (
                            <motion.tr
                              key={row.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.18,
                                delay: Math.min(idx * 0.025, 0.16),
                                ease: SMOOTH_EASE,
                              }}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-2.5 pl-5 sm:pl-6 pr-3">
                                <div className="flex items-center gap-2.5 min-w-[180px]">
                                  <span
                                    className={`w-2 h-2 rounded-xs shrink-0 ${meta.dotClass}`}
                                  />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                                      {row.className}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:hidden truncate">
                                      Wali: {row.homeroomTeacherName}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 hidden sm:table-cell whitespace-nowrap">
                                {row.homeroomTeacherName}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                                {row.male}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                                {row.female}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {row.active}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-2.5">
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {row.total}
                                    <span className="font-normal text-slate-400 dark:text-slate-500">
                                      /{row.capacity}
                                    </span>
                                  </span>
                                  <div className="hidden lg:block w-14 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${meta.barClass}`}
                                      style={{ width: `${occupancyPct}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 tabular-nums hidden md:table-cell">
                                {formatPercent(sharePct)}%
                              </td>
                              <td className="py-2.5 pl-3 pr-5 sm:pr-6 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => onDrillDown(row.paket, 'students')}
                                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                                >
                                  <span>Murid</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          <td className="py-3 pl-5 sm:pl-6 pr-3">
                            Total {selectedProgram === 'Semua' ? 'Semua Jenjang' : selectedProgram}
                          </td>
                          <td className="py-3 px-3 hidden sm:table-cell font-normal text-xs text-slate-500 dark:text-slate-400">
                            {filteredRombelRows.length} rombel
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            {filteredTotals.male}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            {filteredTotals.female}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {filteredTotals.active}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                            {filteredTotals.total}
                            <span className="font-normal text-slate-400 dark:text-slate-500">
                              /{filteredTotals.capacity}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums hidden md:table-cell">
                            {formatPercent(
                              totals.grandTotal > 0
                                ? (filteredTotals.total / totals.grandTotal) * 100
                                : 0
                            )}
                            %
                          </td>
                          <td className="py-3 pl-3 pr-5 sm:pr-6 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onDrillDown(selectedProgram, 'students')}
                              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>Semua</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </section>
  );
};
