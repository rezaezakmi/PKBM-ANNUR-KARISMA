import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Crop,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  DEFAULT_ACTIVITY_GALLERY_PHOTOS,
  GALLERY_PAKET_LABELS,
} from '../../data/activityGalleryDefaults';
import { ActivityGalleryPhoto, GallerySlotId } from '../../types/siakad';
import {
  readImageFileForCropper,
  renderCroppedImageToDataUrl,
} from '../../utils/imageUploadUtils';
import {
  CropperState,
  InteractiveImageCropper,
} from '../ui/InteractiveImageCropper';
import { MotionModal } from '../ui/MotionPrimitives';

interface ActivityPhotoManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SlotDraft {
  title: string;
  caption: string;
  paketLabel: string;
  imageUrl: string;
  dirty: boolean;
}

const DEFAULT_LANDSCAPE_CROP: CropperState = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipX: false,
  cropWidth: 400,
  cropHeight: 250,
  isModified: false,
};

export const ActivityPhotoManagerModal: React.FC<ActivityPhotoManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    activityGalleryPhotos,
    saveActivityGalleryPhoto,
    resetActivityGalleryPhoto,
  } = useData();
  const { showToast } = useToast();

  const [drafts, setDrafts] = useState<Record<GallerySlotId, SlotDraft>>(
    {} as Record<GallerySlotId, SlotDraft>
  );
  const [processingSlot, setProcessingSlot] = useState<GallerySlotId | null>(null);
  const [savingSlot, setSavingSlot] = useState<GallerySlotId | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // Editor crop manual untuk slot foto KBM yang dipilih
  const [croppingSlot, setCroppingSlot] = useState<{
    slotId: GallerySlotId;
    slotIndex: number;
    sourceUrl: string;
  } | null>(null);
  const [cropState, setCropState] = useState<CropperState>(DEFAULT_LANDSCAPE_CROP);
  const [applyingCrop, setApplyingCrop] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCroppingSlot(null);
      return;
    }
    const next: Record<string, SlotDraft> = {};
    activityGalleryPhotos.forEach((p) => {
      next[p.id] = {
        title: p.title,
        caption: p.caption,
        paketLabel: p.paketLabel,
        imageUrl: p.imageUrl,
        dirty: false,
      };
    });
    setDrafts(next as Record<GallerySlotId, SlotDraft>);
  }, [isOpen, activityGalleryPhotos]);

  const handleCropStateChange = useCallback((next: CropperState) => {
    setCropState(next);
  }, []);

  const updateDraft = (slotId: GallerySlotId, patch: Partial<SlotDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [slotId]: {
        ...(prev[slotId] || {
          title: '',
          caption: '',
          paketLabel: 'Kegiatan PKBM',
          imageUrl: '',
        }),
        ...patch,
        dirty: true,
      },
    }));
  };

  const handleFileUpload = async (
    slotId: GallerySlotId,
    slotIndex: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessingSlot(slotId);
    try {
      const sourceUrl = await readImageFileForCropper(file, 1600);
      setCropState(DEFAULT_LANDSCAPE_CROP);
      setCroppingSlot({ slotId, slotIndex, sourceUrl });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memproses file foto.',
        'error'
      );
    } finally {
      setProcessingSlot(null);
    }
  };

  const handleApplyCrop = async () => {
    if (!croppingSlot) return;
    setApplyingCrop(true);
    try {
      const croppedDataUrl = await renderCroppedImageToDataUrl(croppingSlot.sourceUrl, {
        cropWidth: cropState.cropWidth,
        cropHeight: cropState.cropHeight,
        outputWidth: 960,
        outputHeight: 600,
        maxBytes: 215000,
        zoom: cropState.zoom,
        offsetX: cropState.offsetX,
        offsetY: cropState.offsetY,
        rotation: cropState.rotation,
        flipX: cropState.flipX,
        backgroundColor: '#0f172a',
      });
      updateDraft(croppingSlot.slotId, { imageUrl: croppedDataUrl });
      showToast(
        `Crop Foto 0${croppingSlot.slotIndex} diterapkan. Klik "Simpan Slot" atau "Simpan Semua" untuk menayangkan.`,
        'info'
      );
      setCroppingSlot(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memotong foto kegiatan.',
        'error'
      );
    } finally {
      setApplyingCrop(false);
    }
  };

  const handleSaveSlot = async (slotId: GallerySlotId) => {
    const draft = drafts[slotId];
    if (!draft) return;
    setSavingSlot(slotId);
    try {
      await saveActivityGalleryPhoto(slotId, {
        title: draft.title,
        caption: draft.caption,
        paketLabel: draft.paketLabel,
        imageUrl: draft.imageUrl,
      });
      setDrafts((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], dirty: false },
      }));
      showToast(
        `Foto Kegiatan #${slotId.replace('slot_', '')} berhasil disimpan dan tayang di laman depan.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan foto kegiatan.',
        'error'
      );
    } finally {
      setSavingSlot(null);
    }
  };

  const handleResetSlot = async (slotId: GallerySlotId) => {
    const fallback = DEFAULT_ACTIVITY_GALLERY_PHOTOS.find((p) => p.id === slotId);
    if (!fallback) return;
    setSavingSlot(slotId);
    try {
      await resetActivityGalleryPhoto(slotId);
      setDrafts((prev) => ({
        ...prev,
        [slotId]: {
          title: fallback.title,
          caption: fallback.caption,
          paketLabel: fallback.paketLabel,
          imageUrl: fallback.imageUrl,
          dirty: false,
        },
      }));
      showToast(`Slot #${fallback.slotIndex} dikembalikan ke foto bawaan.`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mereset foto.', 'error');
    } finally {
      setSavingSlot(null);
    }
  };

  const dirtySlots = activityGalleryPhotos.filter((p) => drafts[p.id]?.dirty);

  const handleSaveAllDirty = async () => {
    if (dirtySlots.length === 0) return;
    setSavingAll(true);
    let okCount = 0;
    try {
      for (const slot of dirtySlots) {
        const draft = drafts[slot.id];
        if (!draft) continue;
        await saveActivityGalleryPhoto(slot.id, {
          title: draft.title,
          caption: draft.caption,
          paketLabel: draft.paketLabel,
          imageUrl: draft.imageUrl,
        });
        okCount++;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        dirtySlots.forEach((s) => {
          if (next[s.id]) next[s.id] = { ...next[s.id], dirty: false };
        });
        return next;
      });
      showToast(
        `${okCount} foto kegiatan belajar mengajar berhasil diperbarui di laman depan!`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sebagian foto gagal disimpan.', 'error');
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <MotionModal
      open={isOpen}
      onClose={() => {
        if (!savingAll && !savingSlot && !applyingCrop) onClose();
      }}
      maxWidthClass={croppingSlot ? 'max-w-xl' : 'max-w-5xl'}
      noPadding
      disableSwipeClose
    >
      {/* Header Tetap */}
      <div className="shrink-0 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            {croppingSlot ? <Crop className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 dark:text-white truncate">
              {croppingSlot
                ? `Atur & Crop Foto Kegiatan 0${croppingSlot.slotIndex}`
                : 'Kelola 5 Foto Kegiatan Belajar Mengajar'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {croppingSlot
                ? 'Geser, perbesar, atau putar foto agar bingkai 16:10 terlihat pas sebelum disimpan.'
                : 'Foto yang diunggah tampil otomatis dengan animasi di Halaman Login & Dasbor Utama.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={savingAll || Boolean(savingSlot) || applyingCrop}
          onClick={() => {
            if (croppingSlot) {
              setCroppingSlot(null);
            } else {
              onClose();
            }
          }}
          aria-label="Tutup pengelola foto kegiatan"
          className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Konten Scrollable Tengah */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {croppingSlot ? (
          <InteractiveImageCropper
            imageSrc={croppingSlot.sourceUrl}
            aspect="landscape"
            onStateChange={handleCropStateChange}
            disabled={applyingCrop}
          />
        ) : (
          <div className="space-y-4">
            {activityGalleryPhotos.map((photo: ActivityGalleryPhoto) => {
              const draft = drafts[photo.id] || {
                title: photo.title,
                caption: photo.caption,
                paketLabel: photo.paketLabel,
                imageUrl: photo.imageUrl,
                dirty: false,
              };
              const isWorking = processingSlot === photo.id || savingSlot === photo.id;
              const fallback = DEFAULT_ACTIVITY_GALLERY_PHOTOS.find((p) => p.id === photo.id);
              const isModifiedFromDefault =
                photo.isCustom || (fallback && draft.imageUrl !== fallback.imageUrl);

              return (
                <div
                  key={photo.id}
                  className={`rounded-2xl border p-4 transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 items-start ${
                    draft.dirty
                      ? 'border-amber-400/70 bg-amber-50/40 dark:bg-amber-950/15'
                      : 'border-slate-200/80 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/35'
                  }`}
                >
                  {/* Preview & Upload Controls */}
                  <div className="md:col-span-4 space-y-2.5">
                    <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <img
                        src={draft.imageUrl}
                        alt={draft.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/75 text-white text-[11px] font-bold tabular-nums">
                        Foto 0{photo.slotIndex}
                      </span>
                      {isWorking && (
                        <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center text-white">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors">
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>Unggah Foto</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={isWorking || savingAll}
                          onChange={(e) => handleFileUpload(photo.id, photo.slotIndex, e)}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        disabled={isWorking || savingAll || !draft.imageUrl}
                        onClick={() => {
                          setCropState(DEFAULT_LANDSCAPE_CROP);
                          setCroppingSlot({
                            slotId: photo.id,
                            slotIndex: photo.slotIndex,
                            sourceUrl: draft.imageUrl,
                          });
                        }}
                        title="Edit & crop foto manual"
                        className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors disabled:opacity-50"
                      >
                        <Crop className="w-3.5 h-3.5 shrink-0" />
                        <span>Crop</span>
                      </button>

                      {isModifiedFromDefault && (
                        <button
                          type="button"
                          disabled={isWorking || savingAll}
                          onClick={() => handleResetSlot(photo.id)}
                          title="Kembalikan ke foto bawaan"
                          className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata Inputs */}
                  <div className="md:col-span-8 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Judul Kegiatan (Slot {photo.slotIndex})
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={draft.title}
                          onChange={(e) => updateDraft(photo.id, { title: e.target.value })}
                          placeholder="Contoh: Pendampingan Literasi Paket A"
                          className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Program / Label
                        </label>
                        <select
                          value={draft.paketLabel}
                          onChange={(e) => updateDraft(photo.id, { paketLabel: e.target.value })}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {GALLERY_PAKET_LABELS.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Deskripsi Singkat Kegiatan
                      </label>
                      <textarea
                        rows={2}
                        maxLength={240}
                        value={draft.caption}
                        onChange={(e) => updateDraft(photo.id, { caption: e.target.value })}
                        placeholder="Ceritakan singkat suasana belajar mengajar pada foto ini..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {draft.dirty
                          ? 'Ada perubahan yang belum disimpan'
                          : photo.isCustom
                            ? 'Foto khusus tersimpan di cloud'
                            : 'Menggunakan foto editorial bawaan'}
                      </span>

                      <button
                        type="button"
                        disabled={!draft.dirty || isWorking || savingAll}
                        onClick={() => handleSaveSlot(photo.id)}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-40"
                      >
                        {savingSlot === photo.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Simpan Slot {photo.slotIndex}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Tetap (SELALU TERLIHAT) */}
      <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
        {croppingSlot ? (
          <>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Rasio bingkai lanskap 16:10 · Otomatis dikompresi tajam
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={applyingCrop}
                onClick={() => setCroppingSlot(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={applyingCrop}
                onClick={handleApplyCrop}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              >
                {applyingCrop ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Terapkan Crop</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Bisa edit &amp; crop manual 16:10 pada setiap slot foto kegiatan.</span>
            </p>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={savingAll || Boolean(savingSlot)}
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Tutup
              </button>
              {dirtySlots.length > 0 && (
                <button
                  type="button"
                  disabled={savingAll || Boolean(savingSlot)}
                  onClick={handleSaveAllDirty}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  {savingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan ({dirtySlots.length})...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Semua ({dirtySlots.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </MotionModal>
  );
};
