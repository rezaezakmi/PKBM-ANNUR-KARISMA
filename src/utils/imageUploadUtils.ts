/**
 * Utilitas kompresi gambar sisi klien untuk foto profil akun (square center-crop)
 * dan foto dokumentasi kegiatan belajar mengajar (landscape high-res) agar tetap
 * tajam, cepat dimuat, dan selalu aman di bawah batas ukuran dokumen Firestore.
 */

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      reject(new Error('Format file harus berupa gambar (JPG, PNG, atau WebP).'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gagal memproses file gambar. Silakan pilih file lain.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar dari perangkat Anda.'));
    reader.readAsDataURL(file);
  });
}

function encodeCanvasWithinLimit(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  initialQuality = 0.86
): string {
  const mimeCandidates: Array<'image/webp' | 'image/jpeg'> = ['image/webp', 'image/jpeg'];
  for (const mime of mimeCandidates) {
    let quality = initialQuality;
    let output = canvas.toDataURL(mime, quality);
    // Pastikan browser benar-benar mendukung mime tersebut (Safari lama fallback ke png)
    if (mime === 'image/webp' && !output.startsWith('data:image/webp')) {
      continue;
    }
    while (output.length > maxBytes && quality > 0.35) {
      quality = Number((quality - 0.08).toFixed(2));
      output = canvas.toDataURL(mime, quality);
    }
    if (output.length <= maxBytes) {
      return output;
    }
  }
  return canvas.toDataURL('image/jpeg', 0.45);
}

/**
 * Mengubah file foto profil menjadi persegi 320x320 center-cropped (maks ~95 KB data URL)
 * sehingga serasi di semua avatar Header, Dasbor, dan Manajemen Akun.
 */
export async function compressAvatarToDataUrl(
  file: File,
  targetSize = 320,
  maxBytes = 98000
): Promise<string> {
  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width || targetSize;
  const srcH = img.naturalHeight || img.height || targetSize;
  const cropSide = Math.min(srcW, srcH);
  const sx = Math.max(0, Math.floor((srcW - cropSide) / 2));
  const sy = Math.max(0, Math.floor((srcH - cropSide) / 2));

  let dim = targetSize;
  for (let attempt = 0; attempt < 3; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Peramban tidak mendukung pengolahan kanvas gambar.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, dim, dim);

    const dataUrl = encodeCanvasWithinLimit(canvas, maxBytes, 0.88);
    if (dataUrl.length <= maxBytes) {
      return dataUrl;
    }
    dim = Math.round(dim * 0.78);
  }

  throw new Error('Ukuran foto profil masih terlalu besar. Pilih foto dengan resolusi lebih kecil.');
}

/**
 * Mengompresi foto dokumentasi KBM menjadi rasio lanskap 4:3 / 16:10 tajam
 * (lebar maks 1024px, maks ~210 KB data URL) untuk galeri animasi laman depan.
 */
export async function compressGalleryPhotoToDataUrl(
  file: File,
  maxWidth = 1024,
  maxBytes = 215000
): Promise<string> {
  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width || maxWidth;
  const srcH = img.naturalHeight || img.height || Math.round((maxWidth * 3) / 4);

  let widthLimit = maxWidth;
  for (let attempt = 0; attempt < 3; attempt++) {
    const scale = Math.min(1, widthLimit / Math.max(srcW, srcH));
    const dstW = Math.max(320, Math.round(srcW * scale));
    const dstH = Math.max(220, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Peramban tidak mendukung pengolahan kanvas gambar.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, dstW, dstH);
    ctx.drawImage(img, 0, 0, dstW, dstH);

    const dataUrl = encodeCanvasWithinLimit(canvas, maxBytes, 0.85);
    if (dataUrl.length <= maxBytes) {
      return dataUrl;
    }
    widthLimit = Math.round(widthLimit * 0.78);
  }

  throw new Error('Ukuran foto kegiatan masih terlalu besar. Pilih foto JPG/PNG yang lebih ringan.');
}

/**
 * Memuat HTMLImageElement dari URL lokal, data URL, atau asset publik untuk kebutuhan crop manual.
 */
export function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Gagal memuat gambar untuk diedit. Silakan unggah ulang file foto Anda.'));
    img.src = src;
  });
}

/**
 * Membaca file gambar menjadi data URL siap-crop (dibatasi sisi terpanjang 1600px agar geser & zoom
 * sangat ringan di HP maupun laptop tanpa mengurangi ketajaman hasil crop).
 */
export async function readImageFileForCropper(file: File, maxDimension = 1600): Promise<string> {
  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  if (!srcW || !srcH) {
    throw new Error('Dimensi file gambar tidak valid.');
  }

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Peramban tidak mendukung pengolahan kanvas gambar.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, dstW, dstH);

  return canvas.toDataURL('image/jpeg', 0.94);
}

export interface ManualCropRenderParams {
  /** Lebar viewport bingkai crop dalam px CSS */
  cropWidth: number;
  /** Tinggi viewport bingkai crop dalam px CSS */
  cropHeight: number;
  /** Lebar output akhir (px) */
  outputWidth: number;
  /** Tinggi output akhir (px) */
  outputHeight: number;
  /** Batas maksimum panjang string data URL (byte) sesuai firestore.rules */
  maxBytes: number;
  /** Faktor pembesaran >= 1 */
  zoom: number;
  /** Pergeseran horizontal dari tengah bingkai crop (px CSS) */
  offsetX: number;
  /** Pergeseran vertikal dari tengah bingkai crop (px CSS) */
  offsetY: number;
  /** Rotasi kelipatan 90 derajat (0, 90, 180, 270) */
  rotation: number;
  /** Balik horizontal */
  flipX?: boolean;
  /** Warna latar belakang fallback untuk gambar transparan */
  backgroundColor?: string;
}

/**
 * Merender area crop manual dari InteractiveImageCropper secara presisi piksel-per-piksel
 * dan mengompresi hasilnya di bawah batas ukuran dokumen Firestore.
 */
export async function renderCroppedImageToDataUrl(
  imageSrc: string,
  params: ManualCropRenderParams
): Promise<string> {
  const img = await loadImageFromSrc(imageSrc);
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;

  if (!natW || !natH) {
    throw new Error('Gambar tidak memiliki dimensi yang valid untuk disimpan.');
  }

  const {
    cropWidth,
    cropHeight,
    outputWidth,
    outputHeight,
    maxBytes,
    zoom,
    offsetX,
    offsetY,
    rotation,
    flipX = false,
    backgroundColor = '#ffffff',
  } = params;

  const normRot = ((rotation % 360) + 360) % 360;
  const effW = normRot % 180 === 0 ? natW : natH;
  const effH = normRot % 180 === 0 ? natH : natW;

  const safeCropW = Math.max(1, cropWidth);
  const safeCropH = Math.max(1, cropHeight);
  const baseScale = Math.max(safeCropW / effW, safeCropH / effH);
  const safeZoom = Math.max(1, zoom);

  const maxOffsetX = Math.max(0, (effW * baseScale * safeZoom - safeCropW) / 2);
  const maxOffsetY = Math.max(0, (effH * baseScale * safeZoom - safeCropH) / 2);
  const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
  const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

  let targetW = outputWidth;
  let targetH = outputHeight;

  for (let attempt = 0; attempt < 3; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Peramban tidak mendukung pengolahan kanvas gambar.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, targetW, targetH);

    const ratio = targetW / safeCropW;
    const drawW = natW * baseScale * ratio;
    const drawH = natH * baseScale * ratio;

    ctx.save();
    ctx.translate(targetW / 2 + clampedX * ratio, targetH / 2 + clampedY * ratio);
    ctx.scale(safeZoom, safeZoom);
    ctx.rotate((normRot * Math.PI) / 180);
    if (flipX) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const dataUrl = encodeCanvasWithinLimit(canvas, maxBytes, 0.88);
    if (dataUrl.length <= maxBytes) {
      return dataUrl;
    }
    targetW = Math.max(200, Math.round(targetW * 0.8));
    targetH = Math.max(140, Math.round(targetH * 0.8));
  }

  throw new Error('Ukuran hasil crop foto masih terlalu besar. Coba pilih foto lain yang lebih ringan.');
}

