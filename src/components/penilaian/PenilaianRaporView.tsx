import React, { useMemo, useState } from 'react';
import { Award, FileSpreadsheet, FileText, Radar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { GradeSpreadsheetPanel } from './GradeSpreadsheetPanel';
import { RaporA4Preview } from './RaporA4Preview';
import { StudentRadarProfile } from './StudentRadarProfile';

type StaffTab = 'spreadsheet' | 'radar' | 'rapor';
type StudentTab = 'radar' | 'rapor';

export const PenilaianRaporView: React.FC = () => {
  const { profile, effectiveRole } = useAuth();
  const { schoolSettings, classes, students } = useData();

  const isStudentRole = effectiveRole === 'murid';

  const currentStudent = useMemo(() => {
    if (!isStudentRole) return null;
    return (
      students.find(
        (s) =>
          s.id === profile?.linkedEntityId ||
          s.nis === profile?.nis ||
          s.ownerUid === profile?.uid
      ) ||
      students[0] ||
      null
    );
  }, [isStudentRole, students, profile]);

  // Guru mengajar di seluruh Paket (A, B, C) & semua kelas/rombel aktif
  const selectableStudents = useMemo(() => {
    return students.filter((s) => s.status === 'Aktif');
  }, [students]);

  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || 'cls_c12');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    selectableStudents[0]?.id || 'mrd_01'
  );
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(schoolSettings.semester);
  const [staffTab, setStaffTab] = useState<StaffTab>('spreadsheet');
  const [studentTab, setStudentTab] = useState<StudentTab>('radar');

  const activeInspectStudent = useMemo(() => {
    if (isStudentRole) return currentStudent;
    return (
      selectableStudents.find((s) => s.id === selectedStudentId) ||
      selectableStudents[0] ||
      null
    );
  }, [isStudentRole, currentStudent, selectableStudents, selectedStudentId]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="no-print rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight">
              {isStudentRole ? 'Nilai & Rapor Saya' : 'Penilaian & Rapor Akademik'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isStudentRole
                ? 'Pantau grafik capaian kompetensi per mata pelajaran dan unduh rapor resmi PKBM.'
                : 'Kelola nilai berbasis bobot & KKTP dalam tabel spreadsheet, buat deskripsi AI Gemini, dan cetak rapor resmi A4.'}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        {isStudentRole ? (
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setStudentTab('radar')}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all whitespace-nowrap ${
                studentTab === 'radar'
                  ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Radar className="w-4 h-4" />
              <span>Profil Radar &amp; Nilai</span>
            </button>
            <button
              type="button"
              onClick={() => setStudentTab('rapor')}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all whitespace-nowrap ${
                studentTab === 'rapor'
                  ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Rapor Resmi A4</span>
            </button>
          </div>
        ) : (
          <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 self-start lg:self-auto gap-1">
            <button
              type="button"
              onClick={() => setStaffTab('spreadsheet')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                staffTab === 'spreadsheet'
                  ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Spreadsheet Nilai</span>
            </button>
            <button
              type="button"
              onClick={() => setStaffTab('radar')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                staffTab === 'radar'
                  ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Radar className="w-4 h-4" />
              <span>Profil Radar Murid</span>
            </button>
            <button
              type="button"
              onClick={() => setStaffTab('rapor')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                staffTab === 'rapor'
                  ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Pratinjau Rapor A4</span>
            </button>
          </div>
        )}
      </section>

      {/* Active View Content */}
      {isStudentRole ? (
        studentTab === 'radar' ? (
          <StudentRadarProfile
            student={activeInspectStudent}
            semester={semester}
            isStudentRole
            onChangeSemester={setSemester}
            onOpenRapor={() => setStudentTab('rapor')}
          />
        ) : (
          <RaporA4Preview
            student={activeInspectStudent}
            semester={semester}
            isStudentRole
            onChangeSemester={setSemester}
          />
        )
      ) : staffTab === 'spreadsheet' ? (
        <GradeSpreadsheetPanel
          selectedClassId={selectedClassId}
          onSelectClassId={setSelectedClassId}
          semester={semester}
          onChangeSemester={setSemester}
          onInspectStudentRadar={(sid) => {
            setSelectedStudentId(sid);
            setStaffTab('radar');
          }}
          onOpenStudentRapor={(sid) => {
            setSelectedStudentId(sid);
            setStaffTab('rapor');
          }}
        />
      ) : staffTab === 'radar' ? (
        <StudentRadarProfile
          student={activeInspectStudent}
          semester={semester}
          selectableStudents={selectableStudents}
          onSelectStudentId={setSelectedStudentId}
          onChangeSemester={setSemester}
          onOpenRapor={() => setStaffTab('rapor')}
        />
      ) : (
        <RaporA4Preview
          student={activeInspectStudent}
          semester={semester}
          selectableStudents={selectableStudents}
          onSelectStudentId={setSelectedStudentId}
          onChangeSemester={setSemester}
        />
      )}
    </div>
  );
};
