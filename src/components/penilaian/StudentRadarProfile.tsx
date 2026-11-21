import React, { useMemo } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  AlertTriangle,
  Award,
  BookOpenCheck,
  CalendarCheck2,
  CheckCircle2,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Student } from '../../types/siakad';
import { CountUpNumber } from '../ui/CountUpNumber';
import {
  computeStudentAttendanceSummary,
  getPredicateMeta,
  shortenSubjectName,
} from './gradeHelpers';

interface StudentRadarProfileProps {
  student: Student | null;
  semester: 'Ganjil' | 'Genap';
  isStudentRole?: boolean;
  selectableStudents?: Student[];
  onSelectStudentId?: (id: string) => void;
  onChangeSemester: (sem: 'Ganjil' | 'Genap') => void;
  onOpenRapor: () => void;
}

export const StudentRadarProfile: React.FC<StudentRadarProfileProps> = ({
  student,
  semester,
  isStudentRole = false,
  selectableStudents = [],
  onSelectStudentId,
  onChangeSemester,
  onOpenRapor,
}) => {
  const { subjects, gradeRecords, attendanceSessions } = useData();

  const packageSubjects = useMemo(() => {
    if (!student) return [];
    return subjects.filter((s) => s.paket === student.paket && s.status === 'Aktif');
  }, [subjects, student]);

  const studentGrades = useMemo(() => {
    if (!student) return [];
    return packageSubjects.map((sub) => {
      const rec = gradeRecords.find(
        (g) =>
          (g.studentId === student.id ||
            g.studentNis === student.nis ||
            g.studentUid === student.ownerUid) &&
          g.subjectId === sub.id &&
          g.semester === semester
      );
      return {
        subject: sub,
        record: rec || null,
        finalScore: rec?.finalScore ?? 0,
        kkm: rec?.kkm ?? sub.kkm,
        isPassed: rec ? rec.isPassed : false,
      };
    });
  }, [student, packageSubjects, gradeRecords, semester]);

  const recordedRows = useMemo(
    () => studentGrades.filter((item) => item.record !== null),
    [studentGrades]
  );

  const radarData = useMemo(() => {
    return studentGrades.map((item) => ({
      shortSubject: shortenSubjectName(item.subject.name),
      fullSubject: item.subject.name,
      nilaiAkhir: item.finalScore,
      kktp: item.kkm,
      hasData: Boolean(item.record),
    }));
  }, [studentGrades]);

  const kpi = useMemo(() => {
    if (recordedRows.length === 0) {
      return { average: 0, passedCount: 0, highestSubject: '-', highestScore: 0 };
    }
    const sum = recordedRows.reduce((acc, r) => acc + r.finalScore, 0);
    const passedCount = recordedRows.filter((r) => r.isPassed).length;
    const best = [...recordedRows].sort((a, b) => b.finalScore - a.finalScore)[0];
    return {
      average: Math.round(sum / recordedRows.length),
      passedCount,
      highestSubject: shortenSubjectName(best.subject.name),
      highestScore: best.finalScore,
    };
  }, [recordedRows]);

  const attendanceSummary = useMemo(
    () => computeStudentAttendanceSummary(student, attendanceSessions, semester),
    [student, attendanceSessions, semester]
  );

  if (!student) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-950/20 dark:border-white/15 bg-white dark:bg-slate-900 p-10 text-center">
        <p className="font-display font-bold text-base text-slate-900 dark:text-white">
          Belum ada data warga belajar yang dipilih
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selector & Header Card */}
      <section className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          {!isStudentRole && selectableStudents.length > 0 && onSelectStudentId ? (
            <div className="sm:w-80">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Pilih Warga Belajar
              </label>
              <select
                value={student.id}
                onChange={(e) => onSelectStudentId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
              >
                {selectableStudents.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.nis} — {st.fullName} ({st.className})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                Profil Capaian Belajar
              </p>
              <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
                {student.fullName} · {student.className}
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                NIS {student.nis} · {student.paket}
              </p>
            </div>
          )}

          <div className="sm:w-44">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Semester
            </label>
            <select
              value={semester}
              onChange={(e) => onChangeSemester(e.target.value as 'Ganjil' | 'Genap')}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenRapor}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>Pratinjau &amp; Unduh Rapor A4</span>
        </button>
      </section>

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-500 p-5 text-white shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-white/85 font-medium">Rata-Rata Nilai Akhir</p>
              <p className="mt-1.5 font-display font-extrabold text-3xl tabular-nums">
                <CountUpNumber value={kpi.average} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-white/85">
            Dari {recordedRows.length} mapel ternilai
          </p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-600 p-5 text-white shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-white/85 font-medium">Mapel Tuntas KKTP</p>
              <p className="mt-1.5 font-display font-extrabold text-3xl tabular-nums">
                <CountUpNumber value={kpi.passedCount} />
                <span className="text-lg font-bold text-white/80">/{recordedRows.length}</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <BookOpenCheck className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-white/85">
            {recordedRows.length - kpi.passedCount === 0
              ? 'Seluruh mapel tuntas KKTP'
              : `${recordedRows.length - kpi.passedCount} mapel perlu pendampingan`}
          </p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-amber-600 p-5 text-white shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-white/85 font-medium">Capaian Tertinggi</p>
              <p className="mt-1.5 font-display font-extrabold text-3xl tabular-nums">
                <CountUpNumber value={kpi.highestScore} />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-white/85 truncate">{kpi.highestSubject}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-amber-500 p-5 text-white shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-white/85 font-medium">Kehadiran Semester</p>
              <p className="mt-1.5 font-display font-extrabold text-3xl tabular-nums">
                <CountUpNumber value={attendanceSummary.pct} suffix="%" />
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-white/85">
            Hadir {attendanceSummary.hadir} · Izin {attendanceSummary.izin} · Sakit {attendanceSummary.sakit} · Alpa {attendanceSummary.alpa}
          </p>
        </div>
      </section>

      {/* Radar Chart + Highlight Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
          <div className="mb-3">
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              Grafik Radar Profil Nilai per Mata Pelajaran
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Perbandingan Nilai Akhir Warga Belajar terhadap batas KKTP setiap mata pelajaran {student.paket}
            </p>
          </div>

          {radarData.length < 3 ? (
            <div className="h-72 flex items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400">
              Minimal 3 mata pelajaran aktif diperlukan untuk membentuk grafik radar.
            </div>
          ) : (
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                  <PolarGrid stroke="#94a3b844" />
                  <PolarAngleAxis
                    dataKey="shortSubject"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Radar
                    name="Batas KKTP"
                    dataKey="kktp"
                    stroke="#D4A017"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fill="#F5C451"
                    fillOpacity={0.12}
                  />
                  <Radar
                    name="Nilai Akhir"
                    dataKey="nilaiAkhir"
                    stroke="#047857"
                    strokeWidth={2.5}
                    fill="#10B981"
                    fillOpacity={0.32}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Tooltip
                    formatter={(value, name) => [`${value ?? 0}`, String(name ?? '')]}
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload as
                        | { fullSubject?: string; hasData?: boolean }
                        | undefined;
                      if (!item) return '';
                      return item.hasData
                        ? item.fullSubject || ''
                        : `${item.fullSubject || ''} (Belum dinilai)`;
                    }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid rgba(4,120,87,0.18)',
                      fontSize: '12px',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Subject Breakdown List */}
        <section className="lg:col-span-6 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white mb-1">
              Rincian Capaian per Mata Pelajaran
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Sorotan ketuntasan dan deskripsi kompetensi Semester {semester}
            </p>

            <div className="space-y-3">
              {studentGrades.map(({ subject, record, finalScore, kkm, isPassed }) => {
                const predMeta = record ? getPredicateMeta(record.predicate, isPassed) : null;
                return (
                  <div
                    key={subject.id}
                    className={`rounded-xl border p-3.5 transition-colors ${
                      record && !isPassed
                        ? 'border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/35'
                        : 'border-slate-200/80 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {subject.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          Kode {subject.code} · KKTP {kkm}
                        </p>
                      </div>

                      {record && predMeta ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold ${predMeta.badgeClass}`}
                          >
                            {isPassed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {finalScore} ({record.predicate})
                            </span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-slate-400">Belum diinput</span>
                      )}
                    </div>

                    {record && (
                      <>
                        <div className="mt-2.5 grid grid-cols-6 gap-1.5 text-center text-[11px] font-mono">
                          {[
                            ['Tugas', record.tugas],
                            ['UH', record.uh],
                            ['ASTS', record.asts],
                            ['ASAT', record.asat],
                            ['Praktik', record.praktik],
                            ['Sikap', record.sikap],
                          ].map(([lbl, val]) => {
                            const low = Number(val) < kkm;
                            return (
                              <div
                                key={String(lbl)}
                                className={`rounded-lg py-1 px-1 border ${
                                  low
                                    ? 'bg-rose-100/80 border-rose-200 text-rose-900 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-200'
                                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {lbl}
                                </div>
                                <div className="font-bold tabular-nums">{val}</div>
                              </div>
                            );
                          })}
                        </div>
                        {record.achievementDescription && (
                          <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {record.achievementDescription}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
