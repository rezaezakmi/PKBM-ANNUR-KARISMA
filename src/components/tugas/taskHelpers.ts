import { TaskAttachment, TaskSubmissionStatus } from '../../types/siakad';

export interface SubjectTone {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentBar: string;
}

const SUBJECT_TONES: SubjectTone[] = [
  {
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800/70',
    accentBar: 'from-emerald-600 to-teal-500',
  },
  {
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    badgeText: 'text-amber-800 dark:text-amber-300',
    badgeBorder: 'border-amber-200 dark:border-amber-800/70',
    accentBar: 'from-amber-500 to-orange-500',
  },
  {
    badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
    badgeText: 'text-sky-800 dark:text-sky-300',
    badgeBorder: 'border-sky-200 dark:border-sky-800/70',
    accentBar: 'from-sky-600 to-cyan-500',
  },
  {
    badgeBg: 'bg-violet-50 dark:bg-violet-950/60',
    badgeText: 'text-violet-800 dark:text-violet-300',
    badgeBorder: 'border-violet-200 dark:border-violet-800/70',
    accentBar: 'from-violet-600 to-purple-500',
  },
  {
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
    badgeText: 'text-rose-800 dark:text-rose-300',
    badgeBorder: 'border-rose-200 dark:border-rose-800/70',
    accentBar: 'from-rose-600 to-pink-500',
  },
  {
    badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    badgeText: 'text-teal-800 dark:text-teal-300',
    badgeBorder: 'border-teal-200 dark:border-teal-800/70',
    accentBar: 'from-teal-600 to-emerald-500',
  },
];

export function getSubjectBadgeTone(subjectName: string): SubjectTone {
  const hash = subjectName
    .split('')
    .reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 1), 0);
  return SUBJECT_TONES[Math.abs(hash) % SUBJECT_TONES.length];
}

export interface CountdownInfo {
  label: string;
  shortLabel: string;
  isUrgent: boolean;
  isOverdue: boolean;
  diffMs: number;
}

export function getCountdownInfo(dueAt: string, nowMs: number): CountdownInfo {
  const targetMs = new Date(dueAt).getTime();
  if (Number.isNaN(targetMs)) {
    return {
      label: 'Tenggat belum diatur',
      shortLabel: '-',
      isUrgent: false,
      isOverdue: false,
      diffMs: 0,
    };
  }

  const diffMs = targetMs - nowMs;
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((absMs % 60000) / 1000);

  if (diffMs <= 0) {
    const overdueText =
      days > 0
        ? `Lewat ${days} hari ${hours} jam`
        : hours > 0
          ? `Lewat ${hours} jam ${minutes} mnt`
          : `Lewat ${Math.max(1, minutes)} menit`;
    return {
      label: overdueText,
      shortLabel: overdueText,
      isUrgent: false,
      isOverdue: true,
      diffMs,
    };
  }

  let label = '';
  if (days >= 1) {
    label = `${days} hari ${hours} jam lagi`;
  } else if (hours >= 1) {
    label = `${hours} jam ${minutes} mnt lagi`;
  } else {
    label = `${minutes} mnt ${seconds} dtk lagi`;
  }

  return {
    label,
    shortLabel: label,
    isUrgent: diffMs <= 36 * 60 * 60 * 1000, // <= 36 jam
    isOverdue: false,
    diffMs,
  };
}

export type DisplaySubmissionStatus = 'Belum' | TaskSubmissionStatus;

export function getSubmissionStatusMeta(status: DisplaySubmissionStatus) {
  switch (status) {
    case 'Sudah Dinilai':
      return {
        label: 'Sudah Dinilai',
        classes:
          'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70',
        dotClass: 'bg-emerald-500',
      };
    case 'Terkumpul':
      return {
        label: 'Terkumpul',
        classes:
          'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70',
        dotClass: 'bg-sky-500',
      };
    case 'Terlambat':
      return {
        label: 'Terlambat',
        classes:
          'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70',
        dotClass: 'bg-orange-500',
      };
    case 'Revisi':
      return {
        label: 'Perlu Revisi',
        classes:
          'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70',
        dotClass: 'bg-rose-500',
      };
    case 'Belum':
    default:
      return {
        label: 'Belum Dikumpulkan',
        classes:
          'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70',
        dotClass: 'bg-amber-500',
      };
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getDefaultDueAtInput(daysAhead = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T23:59`;
}

export function toDateTimeLocalInput(value: string): string {
  if (!value) return getDefaultDueAtInput();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 16);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return getDefaultDueAtInput();
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function formatIndonesianDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function downloadAttachment(att: TaskAttachment) {
  if (!att.url || att.url === '#') return;
  const a = document.createElement('a');
  a.href = att.url;
  a.download = att.name || 'lampiran';
  if (!att.url.startsWith('data:') && !att.url.startsWith('blob:')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function getIndonesianWeekday(date = new Date()): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[date.getDay()];
}

export function getGreetingByHour(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return 'Selamat Pagi';
  if (hour >= 11 && hour < 15) return 'Selamat Siang';
  if (hour >= 15 && hour < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}
