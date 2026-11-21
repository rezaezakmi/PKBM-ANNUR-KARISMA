import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  DEFAULT_HEADMASTER_SIG_SVG,
  DEFAULT_SCHOOL_SETTINGS,
} from '../../data/seedData';
import { SchoolSettings } from '../../types/siakad';
import { A4DocumentSheet } from '../documents/A4DocumentPrinter';
import { ActivityPhotoManagerModal } from '../gallery/ActivityPhotoManagerModal';

type AssetField =
  | 'logoUrl'
  | 'letterheadUrl'
  | 'headmasterSignatureUrl'
  | 'teacherSignatureUrl';

export const SchoolSettingsView: React.FC = () => {
  const { effectiveRole } = useAuth();
  const { schoolSettings, activityGalleryPhotos, updateSchoolSettings, uploadSchoolAsset } = useData();
  const { showToast } = useToast();

  const [form, setForm] = useState<SchoolSettings>(schoolSettings);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [showGalleryManager, setShowGalleryManager] = useState(false);
  const formRef = useRef<SchoolSettings>(schoolSettings);
  const isDirtyRef = useRef(false);

  const isAdmin = effectiveRole === 'admin';
  const canManageGallery = effectiveRole !== 'murid';

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!isDirtyRef.current) {
      setForm(schoolSettings);
      formRef.current = schoolSettings;
    }
  }, [schoolSettings]);

  const updateField = <K extends keyof SchoolSettings>(key: K, value: SchoolSettings[K]) => {
    isDirtyRef.current = true;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      formRef.current = next;
      return next;
    });
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: AssetField,
    label: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;

    if (!file.type.startsWith('image/')) {
      showToast(`File "${file.name}" bukan gambar. Pilih berkas PNG, JPG, WebP, atau SVG.`, 'warning');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast(`Ukuran "${file.name}" melebihi 10 MB.`, 'warning');
      return;
    }

    setUploadingField(field);
    try {
      const url = await uploadSchoolAsset(file, field);
      const nextForm: SchoolSettings = { ...formRef.current, [field]: url };
      formRef.current = nextForm;
      setForm(nextForm);

      await updateSchoolSettings(nextForm);
      isDirtyRef.current = false;
      showToast(`${label} berhasil diunggah dan langsung disimpan`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : `Gagal mengunggah ${label}`,
        'error'
      );
    } finally {
      setUploadingField(null);
    }
  };

  const handleResetAsset = async (field: AssetField, defaultVal: string, label: string) => {
    if (!isAdmin) return;
    setUploadingField(field);
    try {
      const nextForm: SchoolSettings = { ...formRef.current, [field]: defaultVal };
      formRef.current = nextForm;
      setForm(nextForm);
      await updateSchoolSettings(nextForm);
      isDirtyRef.current = false;
      showToast(`${label} dikembalikan ke bawaan`, 'info');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : `Gagal mereset ${label}`,
        'error'
      );
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    try {
      await updateSchoolSettings(formRef.current);
      isDirtyRef.current = false;
      showToast('Pengaturan sekolah berhasil disimpan', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan sekolah.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white">
            Pengaturan Identitas & Kop Surat Lembaga
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Atur identitas sekolah, logo, kop surat, tanda tangan, serta tahun ajaran aktif.
          </p>
        </div>
        {!isAdmin && (
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3.5 py-2 rounded-xl">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Mode Lihat Saja (Khusus Admin dapat mengubah)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Form Inputs & Asset Uploaders */}
        <form
          onSubmit={handleSave}
          className="xl:col-span-6 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5"
        >
          <div className="space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
              Identitas Lembaga & Akademik
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama PKBM *
                </label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={form.schoolName}
                  onChange={(e) => updateField('schoolName', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  NPSN *
                </label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={form.npsn}
                  onChange={(e) => updateField('npsn', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Alamat Lengkap *
              </label>
              <textarea
                rows={2}
                required
                disabled={!isAdmin}
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telepon Lembaga
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.phone || ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Resmi
                </label>
                <input
                  type="email"
                  disabled={!isAdmin}
                  value={form.email || ''}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Kepala PKBM *
                </label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={form.headmasterName}
                  onChange={(e) => updateField('headmasterName', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  NIP Kepala PKBM
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.headmasterNip || ''}
                  onChange={(e) => updateField('headmasterNip', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tahun Ajaran Aktif *
                </label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={form.academicYear}
                  onChange={(e) => updateField('academicYear', e.target.value)}
                  placeholder="2026/2027"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Semester Aktif
                </label>
                <select
                  disabled={!isAdmin}
                  value={form.semester}
                  onChange={(e) =>
                    updateField('semester', e.target.value as 'Ganjil' | 'Genap')
                  }
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-70"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
            </div>
          </div>

          {/* Asset Uploaders */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Berkas Grafis Resmi (PNG Transparan / JPG / WebP / SVG)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Gambar otomatis dioptimalkan sambil menjaga latar transparan dan langsung tersimpan ke database.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  {
                    field: 'logoUrl',
                    label: 'Logo Sekolah',
                    defaultVal: DEFAULT_SCHOOL_SETTINGS.logoUrl || '',
                  },
                  {
                    field: 'letterheadUrl',
                    label: 'Kop Surat Custom (Opsional)',
                    defaultVal: '',
                  },
                  {
                    field: 'headmasterSignatureUrl',
                    label: 'TTD Kepala PKBM',
                    defaultVal: DEFAULT_HEADMASTER_SIG_SVG,
                  },
                  {
                    field: 'teacherSignatureUrl',
                    label: 'TTD Guru / Wali Kelas',
                    defaultVal: '',
                  },
                ] as const
              ).map((asset) => {
                const currentVal = form[asset.field];
                const isUploading = uploadingField === asset.field;
                return (
                  <div
                    key={asset.field}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFAF7] dark:bg-slate-800/60 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {currentVal ? (
                          <img
                            src={currentVal}
                            alt={asset.label}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain p-0.5"
                          />
                        ) : (
                          <ImagePlus className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {asset.label}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {isUploading
                            ? 'Mengunggah...'
                            : currentVal
                              ? 'Terpasang'
                              : asset.field === 'teacherSignatureUrl'
                                ? 'Kosong (TTD Manual)'
                                : 'Otomatis'}
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <label
                          className={`min-h-[44px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center transition-colors ${
                            isUploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                          }`}
                        >
                          {isUploading ? '...' : 'Unggah'}
                          <input
                            type="file"
                            disabled={isUploading}
                            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*"
                            onChange={(e) => handleImageUpload(e, asset.field, asset.label)}
                            className="hidden"
                          />
                        </label>
                        {currentVal !== asset.defaultVal && (
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() =>
                              handleResetAsset(asset.field, asset.defaultVal, asset.label)
                            }
                            title={asset.defaultVal === '' ? 'Kosongkan' : 'Kembalikan ke bawaan'}
                            className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={saving || Boolean(uploadingField)}
                className="min-h-[46px] px-6 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 text-white text-sm font-bold shadow-sm hover:brightness-105 inline-flex items-center gap-2 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Sekolah'}</span>
              </button>
            </div>
          )}
        </form>

        {/* Right: Live Preview Kop Surat & Blok TTD */}
        <div className="xl:col-span-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Pratinjau Langsung (Live Preview)
            </h3>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              Skala Dokumen A4
            </span>
          </div>

          <div className="rounded-2xl bg-slate-200/80 dark:bg-slate-950/75 p-4 border border-emerald-950/10 dark:border-white/10 overflow-hidden">
            <div className="origin-top scale-[0.72] sm:scale-[0.82] xl:scale-[0.72] -mb-[26%] sm:-mb-[16%] xl:-mb-[26%]">
              <A4DocumentSheet
                schoolSettings={form}
                documentTitle="PRATINJAU KOP SURAT & PENGESAHAN"
                documentNumber="421.9/PREVIEW/PKBM-AK/2026"
                showTeacherSignature={true}
                teacherLabel="Tutor / Wali Kelas"
                teacherName="Reny Febriyani, S.Sos."
                teacherNip="TUTOR-PKBM-003"
              >
                <div className="space-y-3 text-slate-600">
                  <p>
                    Area ini menampilkan pratinjau langsung tata letak kop surat di bagian atas serta
                    blok tanda tangan Kepala PKBM dan Guru/Wali Kelas di bagian bawah.
                  </p>
                  <p>
                    Setiap perubahan nama sekolah, alamat, NPSN, tahun ajaran ({form.academicYear}{' '}
                    Semester {form.semester}), maupun unggahan logo dan tanda tangan akan langsung
                    diperbarui secara otomatis pada seluruh dokumen cetak SIAKAD.
                  </p>
                </div>
              </A4DocumentSheet>
            </div>
          </div>

          {/* Kartu Pengelolaan 5 Foto Kegiatan Belajar Mengajar Laman Depan */}
          {canManageGallery && (
            <div className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Galeri 5 Foto Kegiatan Belajar Mengajar
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ditampilkan dengan animasi di halaman Login dan Dasbor Utama.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGalleryManager(true)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span>Kelola 5 Foto KBM</span>
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {activityGalleryPhotos.slice(0, 5).map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setShowGalleryManager(true)}
                    title={`Ubah Foto ${photo.slotIndex}: ${photo.title}`}
                    className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                  >
                    <img
                      src={photo.imageUrl}
                      alt={photo.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute left-1 bottom-1 px-1 rounded bg-slate-950/75 text-white text-[10px] font-bold tabular-nums">
                      0{photo.slotIndex}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ActivityPhotoManagerModal
        isOpen={showGalleryManager}
        onClose={() => setShowGalleryManager(false)}
      />
    </div>
  );
};
