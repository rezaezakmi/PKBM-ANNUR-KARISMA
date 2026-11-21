import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ClipboardList,
  Clock,
  GraduationCap,
  MessageSquare,
  MonitorPlay,
  Plus,
  Search,
  UserCheck,
  Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  OnlineClassSession,
  OnlineClassStatus,
  PageRoute,
  PaketType,
} from '../../types/siakad';
import { OnlineClassFormModal } from './OnlineClassFormModal';
import { OnlineClassRoomDetail } from './OnlineClassRoomDetail';

const PROGRAM_META: Array<{
  paket: PaketType;
  subtitle: string;
  fase: string;
  focus: string;
}> = [
  {
    paket: 'Paket A',
    subtitle: 'Setara SD / MI',
    fase: 'Fase A–C · Kelas 1–6',
    focus: 'Literasi dasar, numerasi harian, dan pembiasaan belajar aktif.',
  },
  {
    paket: 'Paket B',
    subtitle: 'Setara SMP / MTs',
    fase: 'Fase D · Kelas 7–9',
    focus: 'Eksplorasi sains, bahasa Inggris komunikatif, dan penguatan konsep.',
  },
  {
    paket: 'Paket C',
    subtitle: 'Setara SMA / MA',
    fase: 'Fase E–F · Kelas 10–12',
    focus: 'Karya ilmiah, akuntansi UMKM, statistika, dan kesiapan karier/kuliah.',
  },
];

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

interface KelasOnlineViewProps {
  onNavigate?: (route: PageRoute) => void;
}

export const KelasOnlineView: React.FC<KelasOnlineViewProps> = ({ onNavigate }) => {
  const { profile, effectiveRole, firebaseUser } = useAuth();
  const {
    students,
    tasks,
    onlineClasses,
    onlineClassProgress,
    onlineClassComments,
    selectedProgram,
  } = useData();

  const currentUid = firebaseUser?.uid || profile?.uid || 'demo_murid_01';
  const canManage =
    effectiveRole === 'admin' || effectiveRole === 'kepala_pkbm' || effectiveRole === 'guru';

  const currentStudent = useMemo(() => {
    if (effectiveRole !== 'murid') return null;
    return (
      students.find(
        (s) =>
          s.ownerUid === currentUid ||
          (profile?.linkedEntityId && s.id === profile.linkedEntityId)
      ) || null
    );
  }, [effectiveRole, students, currentUid, profile?.linkedEntityId]);

  const [paketFilter, setPaketFilter] = useState<'Semua' | PaketType>(() => {
    if (effectiveRole === 'murid' && currentStudent?.paket) return currentStudent.paket;
    return selectedProgram || 'Semua';
  });
  const [statusFilter, setStatusFilter] = useState<'Semua' | OnlineClassStatus>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<OnlineClassSession | null>(null);

  // Sync with global header program switcher for non-student roles
  useEffect(() => {
    if (effectiveRole !== 'murid') {
      setPaketFilter(selectedProgram);
    } else if (currentStudent?.paket) {
      setPaketFilter(currentStudent.paket);
    }
  }, [selectedProgram, effectiveRole, currentStudent?.paket]);

  const activeSession = useMemo(
    () => onlineClasses.find((oc) => oc.id === activeSessionId) || null,
    [onlineClasses, activeSessionId]
  );

  const progressBySession = useMemo(() => {
    const map = new Map<string, { myPercent: number; myJoined: boolean; participantCount: number }>();
    onlineClasses.forEach((oc) => {
      const list = onlineClassProgress.filter((p) => p.sessionId === oc.id);
      const mine = list.find((p) => p.studentUid === currentUid);
      map.set(oc.id, {
        myPercent: mine?.progressPercent || 0,
        myJoined: Boolean(mine?.joinedLive),
        participantCount: list.length,
      });
    });
    return map;
  }, [onlineClasses, onlineClassProgress, currentUid]);

  const commentCountBySession = useMemo(() => {
    const counts = new Map<string, number>();
    onlineClassComments.forEach((c) => {
      counts.set(c.sessionId, (counts.get(c.sessionId) || 0) + 1);
    });
    return counts;
  }, [onlineClassComments]);

  const taskCountBySession = useMemo(() => {
    const counts = new Map<string, number>();
    onlineClasses.forEach((oc) => {
      const matched = tasks.filter(
        (t) =>
          (t.onlineClassId && t.onlineClassId === oc.id) ||
          (t.deliveryMode === 'online' &&
            !t.onlineClassId &&
            t.paket === oc.paket &&
            (!t.subjectId || t.subjectId === oc.subjectId))
      ).length;
      counts.set(oc.id, matched);
    });
    return counts;
  }, [onlineClasses, tasks]);

  const programStats = useMemo(() => {
    return PROGRAM_META.map((meta) => {
      const list = onlineClasses.filter((oc) => oc.paket === meta.paket);
      const liveCount = list.filter((oc) => oc.status === 'Live').length;
      const totalModules = list.reduce((sum, oc) => sum + oc.materials.length, 0);
      return {
        ...meta,
        totalClasses: list.length,
        liveCount,
        totalModules,
      };
    });
  }, [onlineClasses]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const statusWeight: Record<OnlineClassStatus, number> = {
      Live: 0,
      Terjadwal: 1,
      Selesai: 2,
    };

    return onlineClasses
      .filter((oc) => {
        if (paketFilter !== 'Semua' && oc.paket !== paketFilter) return false;
        if (statusFilter !== 'Semua' && oc.status !== statusFilter) return false;
        if (q) {
          const hay = `${oc.title} ${oc.subjectName} ${oc.className} ${oc.teacherName} ${oc.paket} ${oc.platform}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (statusWeight[a.status] !== statusWeight[b.status]) {
          return statusWeight[a.status] - statusWeight[b.status];
        }
        return b.scheduleDate.localeCompare(a.scheduleDate);
      });
  }, [onlineClasses, paketFilter, statusFilter, searchQuery]);

  const liveTotalCount = useMemo(
    () => onlineClasses.filter((oc) => oc.status === 'Live').length,
    [onlineClasses]
  );

  const openCreateModal = () => {
    setEditingSession(null);
    setFormOpen(true);
  };

  const openEditModal = (session: OnlineClassSession) => {
    setEditingSession(session);
    setFormOpen(true);
  };

  if (activeSession) {
    return (
      <>
        <OnlineClassRoomDetail
          session={activeSession}
          onBack={() => setActiveSessionId(null)}
          onEdit={(sess) => openEditModal(sess)}
          onDeleted={() => setActiveSessionId(null)}
          onOpenTasks={onNavigate ? () => onNavigate('tasks') : undefined}
        />
        <OnlineClassFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          editingSession={editingSession}
          defaultPaket={paketFilter === 'Semua' ? 'Paket C' : paketFilter}
          onSaved={(saved) => setActiveSessionId(saved.id)}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
            Ruang Pembelajaran Daring Terpadu
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Kelas Online Paket A, B &amp; C
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            Ikuti sesi tatap muka daring, pelajari modul belajar mandiri terstruktur, catat rangkuman, dan berdiskusi langsung bersama tutor pengampu.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buat Kelas Online
          </button>
        )}
      </div>

      {/* Program Kesetaraan Cards (Paket A, B, C) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {programStats.map((item) => {
          const isSelected = paketFilter === item.paket;
          const isStudentOwnProgram = effectiveRole === 'murid' && currentStudent?.paket === item.paket;

          return (
            <button
              key={item.paket}
              type="button"
              onClick={() => setPaketFilter(isSelected ? 'Semua' : item.paket)}
              className={`group text-left rounded-2xl border p-5 transition-all ${
                isSelected
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
                  : 'border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 hover:border-emerald-500/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      isSelected ? 'text-emerald-100' : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {item.subtitle} · {item.fase}
                  </div>
                  <h2
                    className={`mt-1 font-display text-xl font-extrabold ${
                      isSelected ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {item.paket}
                    {isStudentOwnProgram && (
                      <span
                        className={`ml-2 text-xs font-semibold ${
                          isSelected ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        (Program Anda)
                      </span>
                    )}
                  </h2>
                </div>

                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isSelected
                      ? 'bg-white/15 text-white'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  <GraduationCap className="w-5 h-5" />
                </div>
              </div>

              <p
                className={`mt-2 text-xs leading-relaxed ${
                  isSelected ? 'text-emerald-50/90' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.focus}
              </p>

              <div
                className={`mt-4 pt-3 border-t flex items-center justify-between text-xs font-semibold ${
                  isSelected
                    ? 'border-white/20 text-white'
                    : 'border-emerald-950/10 dark:border-white/10 text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>
                  {item.totalClasses} Ruang Kelas · {item.totalModules} Modul
                </span>
                {item.liveCount > 0 ? (
                  <span
                    className={`inline-flex items-center gap-1.5 font-bold ${
                      isSelected ? 'text-amber-200' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {item.liveCount} Live
                  </span>
                ) : (
                  <span className={isSelected ? 'text-emerald-100' : 'text-slate-400'}>
                    Klik filter
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Paket Segmented Control */}
          <div className="inline-flex rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-950/70 p-1">
            {(['Semua', 'Paket A', 'Paket B', 'Paket C'] as const).map((p) => {
              const active = paketFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPaketFilter(p)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {p === 'Semua' ? 'Semua Paket' : p}
                </button>
              );
            })}
          </div>

          {/* Status Segmented Control */}
          <div className="inline-flex rounded-xl border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-950/70 p-1">
            {(
              [
                { id: 'Semua', label: 'Semua Status' },
                { id: 'Live', label: `Live (${liveTotalCount})` },
                { id: 'Terjadwal', label: 'Terjadwal' },
                { id: 'Selesai', label: 'Rekaman' },
              ] as const
            ).map((st) => {
              const active = statusFilter === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? st.id === 'Live'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari mapel, topik, atau tutor..."
            className="w-full min-h-[42px] rounded-xl border border-emerald-950/15 dark:border-white/15 bg-[#FAFAF7] dark:bg-slate-950/70 pl-10 pr-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
      </div>

      {/* Classroom Cards Grid */}
      {filteredSessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-emerald-950/15 dark:border-white/15 bg-white/70 dark:bg-slate-900/40 p-10 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
            <MonitorPlay className="w-6 h-6" />
          </div>
          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Belum ada kelas online yang cocok
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Coba ubah filter Paket A/B/C atau kata kunci pencarian.{' '}
            {canManage && 'Anda juga dapat membuat ruang kelas online baru sekarang.'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {(paketFilter !== 'Semua' || statusFilter !== 'Semua' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setPaketFilter('Semua');
                  setStatusFilter('Semua');
                  setSearchQuery('');
                }}
                className="min-h-[40px] rounded-xl border border-emerald-950/15 dark:border-white/15 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                Reset Filter
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={openCreateModal}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
              >
                <Plus className="w-4 h-4" />
                Buat Kelas Online
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredSessions.map((oc) => {
            const stats = progressBySession.get(oc.id) || {
              myPercent: 0,
              myJoined: false,
              participantCount: 0,
            };
            const cmtCount = commentCountBySession.get(oc.id) || 0;

            return (
              <article
                key={oc.id}
                className="group flex flex-col justify-between rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900/80 p-5 shadow-sm hover:border-emerald-500/45 hover:shadow-md transition-all"
              >
                <div className="space-y-3.5">
                  {/* Top unboxed metadata row */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300 truncate">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {oc.paket}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="truncate">{oc.subjectName}</span>
                    </div>

                    {oc.status === 'Live' ? (
                      <span className="shrink-0 inline-flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
                        </span>
                        Live
                      </span>
                    ) : (
                      <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                        {oc.status === 'Selesai' ? 'Rekaman' : 'Terjadwal'}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white leading-snug group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                      {oc.title}
                    </h3>
                    <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {oc.description}
                    </p>
                  </div>

                  {/* Structured Session Details */}
                  <div className="space-y-1.5 pt-2 border-t border-emerald-950/10 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {oc.className}
                      </span>
                      <span className="shrink-0 text-slate-500 dark:text-slate-400">
                        {oc.modality}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        {formatShortDate(oc.scheduleDate)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        {oc.startTime}–{oc.endTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
                      <span className="truncate">Tutor: {oc.teacherName}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                        <Video className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        {oc.platform}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Progress & Action */}
                <div className="mt-5 pt-3.5 border-t border-emerald-950/10 dark:border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        {oc.materials.length} Modul
                      </span>
                      {(taskCountBySession.get(oc.id) || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                          <ClipboardList className="w-3.5 h-3.5" />
                          {taskCountBySession.get(oc.id)} Tugas
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {cmtCount}
                      </span>
                      {canManage && (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {stats.participantCount}
                        </span>
                      )}
                    </div>

                    {effectiveRole === 'murid' && (
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {stats.myPercent}% selesai
                      </span>
                    )}
                  </div>

                  {effectiveRole === 'murid' && (
                    <div className="h-1.5 w-full rounded-full bg-emerald-950/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-300"
                        style={{ width: `${stats.myPercent}%` }}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveSessionId(oc.id)}
                    className={`min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                      oc.status === 'Live'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                        : 'border border-emerald-600/30 bg-emerald-50/70 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white'
                    }`}
                  >
                    {oc.status === 'Live' ? 'Masuk Ruang Live & Materi' : 'Buka Ruang Kelas & Modul'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <OnlineClassFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editingSession={editingSession}
        defaultPaket={paketFilter === 'Semua' ? 'Paket C' : paketFilter}
      />
    </div>
  );
};
