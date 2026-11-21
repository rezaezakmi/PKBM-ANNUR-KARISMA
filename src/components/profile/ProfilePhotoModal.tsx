import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ROLE_LABELS } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { UserProfile } from '../../types/siakad';
import {
  readImageFileForCropper,
  renderCroppedImageToDataUrl,
} from '../../utils/imageUploadUtils';
import { InitialAvatar } from '../ui/InitialAvatar';
import {
  CropperState,
  InteractiveImageCropper,
} from '../ui/InteractiveImageCropper';
import { MotionModal } from '../ui/MotionPrimitives';

interface ProfilePhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opsional: diisi oleh Admin saat mengganti foto profil akun Guru/Kepala Sekolah/Admin lain */
  targetUser?: UserProfile | null;
}

const DEFAULT_CROP_STATE: CropperState = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipX: false,
  cropWidth: 236,
  cropHeight: 236,
  isModified: false,
};

export const ProfilePhotoModal: React.FC<ProfilePhotoModalProps> = ({
  isOpen,
  onClose,
  targetUser = null,
}) => {
  const { profile, updateOwnProfileAvatar } = useAuth();
  const { updateUserProfileAvatar } = useData();
  const { showToast } = useToast();

  const activeUser = targetUser || profile;
  const isEditingSelf = !targetUser || targetUser.uid === profile?.uid;

  const [sourceImageUrl, setSourceImageUrl] = useState<string>('');
  const [isNewUpload, setIsNewUpload] = useState<boolean>(false);
  const [cropState, setCropState] = useState<CropperState>(DEFAULT_CROP_STATE);
  const [processingFile, setProcessingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSourceImageUrl(activeUser?.avatarUrl || '');
      setIsNewUpload(false);
      setCropState(DEFAULT_CROP_STATE);
      setErrorMsg(null);
      setDragOver(false);
    }
  }, [isOpen, activeUser?.uid, activeUser?.avatarUrl]);

  const handleCropStateChange = useCallback((next: CropperState) => {
    setCropState(next);
  }, []);

  if (!activeUser) return null;

  const originalAvatar = activeUser.avatarUrl || '';
  const isRemovingPhoto = !sourceImageUrl && Boolean(originalAvatar);
  const hasChanges = isNewUpload || isRemovingPhoto || (Boolean(sourceImageUrl) && cropState.isModified);

  const processSelectedFile = async (file: File) => {
    setErrorMsg(null);
    setProcessingFile(true);
    try {
      const dataUrl = await readImageFileForCropper(file, 1600);
      setSourceImageUrl(dataUrl);
      setIsNewUpload(true);
      setCropState(DEFAULT_CROP_STATE);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal memproses gambar. Coba file JPG/PNG lain.'
      );
    } finally {
      setProcessingFile(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      let finalAvatarDataUrl = '';
      if (sourceImageUrl) {
        finalAvatarDataUrl = await renderCroppedImageToDataUrl(sourceImageUrl, {
          cropWidth: cropState.cropWidth,
          cropHeight: cropState.cropHeight,
          outputWidth: 360,
          outputHeight: 360,
          maxBytes: 105000,
          zoom: cropState.zoom,
          offsetX: cropState.offsetX,
          offsetY: cropState.offsetY,
          rotation: cropState.rotation,
          flipX: cropState.flipX,
          backgroundColor: '#ffffff',
        });
      }

      if (isEditingSelf) {
        await updateOwnProfileAvatar(finalAvatarDataUrl);
      } else {
        await updateUserProfileAvatar(activeUser.uid, finalAvatarDataUrl);
      }

      showToast(
        finalAvatarDataUrl
          ? `Foto profil ${activeUser.name} berhasil disimpan.`
          : `Foto profil ${activeUser.name} dikembalikan ke inisial nama.`,
        'success'
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan foto profil.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MotionModal
      open={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      maxWidthClass="max-w-md"
      noPadding
      disableSwipeClose
    >
      {/* Input File Tersembunyi */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header Tetap (Pinned) */}
      <div className="shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Camera className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
              {isEditingSelf ? 'Foto Profil Saya' : 'Ubah Foto Profil Akun'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {activeUser.name} · {ROLE_LABELS[activeUser.role]}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          aria-label="Tutup modal foto profil"
          className="min-h-[38px] min-w-[38px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Konten Scrollable Tengah */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5 transition-colors ${
          dragOver ? 'bg-emerald-50/50 dark:bg-emerald-950/30' : ''
        }`}
      >
        {sourceImageUrl ? (
          <>
            {/* Editor & Crop Manual */}
            <div className="relative">
              <InteractiveImageCropper
                imageSrc={sourceImageUrl}
                aspect="square"
                onStateChange={handleCropStateChange}
                disabled={processingFile || saving}
              />

              {processingFile && (
                <div className="absolute inset-0 rounded-2xl bg-slate-950/60 flex items-center justify-center text-white">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
            </div>

            {/* Aksi Ganti / Hapus Foto */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={processingFile || saving}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Ganti Foto Lain</span>
              </button>

              <button
                type="button"
                disabled={processingFile || saving}
                onClick={() => {
                  setSourceImageUrl('');
                  setIsNewUpload(false);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Hapus Foto</span>
              </button>
            </div>
          </>
        ) : (
          /* Keadaan Belum Ada Foto / Setelah Klik Hapus Foto */
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center pt-1">
              <InitialAvatar
                name={activeUser.name}
                size="xl"
                className="!w-24 !h-24 !text-3xl ring-4 ring-emerald-500/15"
              />
              <p className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">
                {activeUser.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                @{activeUser.username} · {ROLE_LABELS[activeUser.role]}
              </p>
            </div>

            {isRemovingPhoto && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
                <span>Foto profil akan dihapus saat Anda klik Simpan.</span>
                <button
                  type="button"
                  onClick={() => setSourceImageUrl(originalAvatar)}
                  className="font-bold underline hover:no-underline inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Urungkan</span>
                </button>
              </div>
            )}

            <div
              className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40'
                  : 'border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/40 hover:border-emerald-400 dark:hover:border-emerald-500/60'
              }`}
            >
              <Upload className="w-6 h-6 mx-auto text-emerald-700 dark:text-emerald-400" />
              <p className="mt-2 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">
                Pilih atau seret foto profil ke sini
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Format JPG, PNG, atau WebP · Bisa digeser, diperbesar, &amp; diputar manual
              </p>
              <div className="mt-3.5 flex justify-center">
                <button
                  type="button"
                  disabled={processingFile || saving}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shadow-xs inline-flex items-center gap-2 whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  {processingFile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                  <span>Pilih Foto dari Perangkat</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Footer Simpan Tetap (SELALU TERLIHAT DI BAWAH) */}
      <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2.5">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {isRemovingPhoto
            ? 'Klik Simpan untuk hapus foto'
            : hasChanges
              ? 'Posisi foto siap disimpan'
              : sourceImageUrl
                ? 'Geser / zoom agar pas'
                : 'Belum ada foto dipilih'}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving || processingFile || (!hasChanges && !sourceImageUrl)}
            onClick={handleSave}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center gap-1.5 whitespace-nowrap transition-all disabled:opacity-45"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{isRemovingPhoto ? 'Simpan (Hapus)' : 'Simpan Foto'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </MotionModal>
  );
};
