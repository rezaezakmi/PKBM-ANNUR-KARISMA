import { ActivityGalleryPhoto, GallerySlotId } from '../types/siakad';

export const GALLERY_SLOT_IDS: GallerySlotId[] = [
  'slot_1',
  'slot_2',
  'slot_3',
  'slot_4',
  'slot_5',
];

export const PUBLIC_GALLERY_CACHE_KEY = 'siakad_public_kbm_gallery_v1';

export const GALLERY_PAKET_LABELS = [
  'Paket A',
  'Paket B',
  'Paket C',
  'Kelas Online',
  'Projek P5',
  'Kegiatan PKBM',
] as const;

export const DEFAULT_ACTIVITY_GALLERY_PHOTOS: ActivityGalleryPhoto[] = [
  {
    id: 'slot_1',
    slotIndex: 1,
    title: 'Pendampingan Literasi & Numerasi Paket A',
    caption:
      'Tutor membimbing warga belajar Paket A dalam membaca pemahaman dan latihan numerasi dasar secara hangat di ruang kelas.',
    paketLabel: 'Paket A',
    imageUrl: '/src/assets/images/kbm_paket_a_literasi_1795259573250.jpg',
    isCustom: false,
  },
  {
    id: 'slot_2',
    slotIndex: 2,
    title: 'Praktik Matematika & Sains Paket B',
    caption:
      'Warga belajar Paket B mengeksplorasi konsep geometri dan ilmu pengetahuan alam bersama tutor menggunakan alat peraga visual.',
    paketLabel: 'Paket B',
    imageUrl: '/src/assets/images/kbm_paket_b_sains_1795259572393.jpg',
    isCustom: false,
  },
  {
    id: 'slot_3',
    slotIndex: 3,
    title: 'Diskusi Modul & Presentasi Paket C',
    caption:
      'Pembelajaran kolaboratif warga belajar Paket C membahas studi kasus Kurikulum Merdeka dengan modul ajar dan perangkat digital.',
    paketLabel: 'Paket C',
    imageUrl: '/src/assets/images/kbm_paket_c_diskusi_1795259572176.jpg',
    isCustom: false,
  },
  {
    id: 'slot_4',
    slotIndex: 4,
    title: 'Sesi Interaktif Kelas Online PKBM',
    caption:
      'Tutor memandu pembelajaran daring fleksibel lintas Paket A, B, dan C sehingga warga belajar tetap terhubung dari mana saja.',
    paketLabel: 'Kelas Online',
    imageUrl: '/src/assets/images/kbm_kelas_online_1795259572173.jpg',
    isCustom: false,
  },
  {
    id: 'slot_5',
    slotIndex: 5,
    title: 'Workshop Projek P5 & Keterampilan Digital',
    caption:
      'Kegiatan penguatan profil pelajar dan pemberdayaan keterampilan kewirausahaan kreatif bagi warga belajar PKBM Annur Karisma.',
    paketLabel: 'Projek P5',
    imageUrl: '/src/assets/images/kbm_keterampilan_p5_1795259573338.jpg',
    isCustom: false,
  },
];

export function mergeGalleryPhotosWithDefaults(
  remoteItems: Array<Partial<Omit<ActivityGalleryPhoto, 'id'>> & { id: string }>
): ActivityGalleryPhoto[] {
  const remoteMap = new Map<string, Partial<Omit<ActivityGalleryPhoto, 'id'>>>();
  remoteItems.forEach((item) => {
    if (GALLERY_SLOT_IDS.includes(item.id as GallerySlotId)) {
      remoteMap.set(item.id, item);
    }
  });

  return DEFAULT_ACTIVITY_GALLERY_PHOTOS.map((fallback) => {
    const remote = remoteMap.get(fallback.id);
    if (!remote) return fallback;
    const validImage =
      typeof remote.imageUrl === 'string' && remote.imageUrl.trim().length > 10
        ? remote.imageUrl.trim()
        : fallback.imageUrl;
    return {
      ...fallback,
      title:
        typeof remote.title === 'string' && remote.title.trim().length >= 2
          ? remote.title.trim()
          : fallback.title,
      caption:
        typeof remote.caption === 'string'
          ? remote.caption.trim()
          : fallback.caption,
      paketLabel:
        typeof remote.paketLabel === 'string' && remote.paketLabel.trim().length > 0
          ? remote.paketLabel.trim()
          : fallback.paketLabel,
      imageUrl: validImage,
      isCustom: validImage !== fallback.imageUrl || Boolean(remote.updatedBy),
      updatedBy: typeof remote.updatedBy === 'string' ? remote.updatedBy : undefined,
      updatedAt: typeof remote.updatedAt === 'string' ? remote.updatedAt : undefined,
    };
  });
}

export function readCachedPublicGalleryPhotos(): ActivityGalleryPhoto[] {
  try {
    const raw = localStorage.getItem(PUBLIC_GALLERY_CACHE_KEY);
    if (!raw) return DEFAULT_ACTIVITY_GALLERY_PHOTOS;
    const parsed = JSON.parse(raw) as Array<Partial<ActivityGalleryPhoto> & { id: string }>;
    if (!Array.isArray(parsed)) return DEFAULT_ACTIVITY_GALLERY_PHOTOS;
    return mergeGalleryPhotosWithDefaults(parsed);
  } catch {
    return DEFAULT_ACTIVITY_GALLERY_PHOTOS;
  }
}

export function writeCachedPublicGalleryPhotos(photos: ActivityGalleryPhoto[]): void {
  try {
    localStorage.setItem(PUBLIC_GALLERY_CACHE_KEY, JSON.stringify(photos));
  } catch {
    // Ignore localStorage quota issues
  }
}
