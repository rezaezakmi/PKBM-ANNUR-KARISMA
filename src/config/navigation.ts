import {
  Award,
  BookOpen,
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  FileCheck2,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  MonitorPlay,
  NotebookPen,
  Settings,
  Users,
  LucideIcon,
} from 'lucide-react';
import { PageRoute, UserRole } from '../types/siakad';

export interface NavItemConfig {
  id: PageRoute;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin / Operator',
  kepala_pkbm: 'Kepala PKBM',
  guru: 'Guru / Tutor',
  murid: 'Warga Belajar (Murid)',
};

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Dasbor Utama',
    shortLabel: 'Dasbor',
    icon: LayoutDashboard,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'students',
    label: 'Data Murid',
    shortLabel: 'Murid',
    icon: GraduationCap,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'teachers',
    label: 'Guru & Tutor',
    shortLabel: 'Guru',
    icon: Users,
    roles: ['admin', 'kepala_pkbm'],
  },
  {
    id: 'subjects',
    label: 'Mata Pelajaran',
    shortLabel: 'Mapel',
    icon: BookOpen,
    roles: ['admin', 'kepala_pkbm'],
  },
  {
    id: 'classes',
    label: 'Kelas / Rombel',
    shortLabel: 'Kelas',
    icon: Building2,
    roles: ['admin', 'kepala_pkbm'],
  },
  {
    id: 'assignments',
    label: 'Penugasan & Jadwal',
    shortLabel: 'Jadwal',
    icon: ClipboardList,
    roles: ['admin', 'guru', 'murid'],
  },
  {
    id: 'online-classes',
    label: 'Kelas Online',
    shortLabel: 'Kelas Online',
    icon: MonitorPlay,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'attendance',
    label: 'Presensi',
    shortLabel: 'Presensi',
    icon: CalendarCheck2,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'tasks',
    label: 'Tugas',
    shortLabel: 'Tugas',
    icon: ClipboardPen,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'grades',
    label: 'Penilaian & Rapor',
    shortLabel: 'Rapor',
    icon: Award,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'generator',
    label: 'Perangkat Ajar AI',
    shortLabel: 'Perangkat',
    icon: NotebookPen,
    roles: ['admin', 'kepala_pkbm', 'guru'],
  },
  {
    id: 'exam-generator',
    label: 'Generator Soal Ujian',
    shortLabel: 'Soal Ujian',
    icon: ClipboardCheck,
    roles: ['admin', 'kepala_pkbm', 'guru'],
  },
  {
    id: 'online-exams',
    label: 'Ujian Online',
    shortLabel: 'Ujian',
    icon: FileCheck2,
    roles: ['murid'],
  },
  {
    id: 'documents',
    label: 'Cetak Dokumen A4',
    shortLabel: 'Dokumen',
    icon: FileText,
    roles: ['admin', 'kepala_pkbm', 'guru', 'murid'],
  },
  {
    id: 'accounts',
    label: 'Manajemen Akun',
    shortLabel: 'Akun',
    icon: KeyRound,
    roles: ['admin'],
  },
  {
    id: 'school-settings',
    label: 'Pengaturan Sekolah',
    shortLabel: 'Sekolah',
    icon: Settings,
    roles: ['admin'],
  },
];

export function getNavItemsForRole(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => {
    if (role === 'murid') {
      if (item.id === 'students') return { ...item, label: 'Data Diri Saya', shortLabel: 'Profil' };
      if (item.id === 'assignments') return { ...item, label: 'Jadwal Belajar', shortLabel: 'Jadwal' };
      if (item.id === 'online-classes') return { ...item, label: 'Kelas Online', shortLabel: 'Kelas Online' };
      if (item.id === 'attendance') return { ...item, label: 'Presensi Saya', shortLabel: 'Presensi' };
      if (item.id === 'tasks') return { ...item, label: 'Tugas & Beranda', shortLabel: 'Tugas' };
      if (item.id === 'grades') return { ...item, label: 'Nilai & Rapor Saya', shortLabel: 'Rapor' };
      if (item.id === 'documents') return { ...item, label: 'Kartu & Surat', shortLabel: 'Surat' };
    }
    if (role === 'guru') {
      if (item.id === 'assignments') return { ...item, label: 'Mapel & Kelas Saya', shortLabel: 'Mengajar' };
      if (item.id === 'students') return { ...item, label: 'Murid Ampuan', shortLabel: 'Murid' };
    }
    return item;
  });
}
