import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlipHorizontal2,
  Move,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface CropperState {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  flipX: boolean;
  cropWidth: number;
  cropHeight: number;
  isModified: boolean;
}

interface InteractiveImageCropperProps {
  /** Data URL atau URL gambar sumber untuk diedit/crop secara manual */
  imageSrc: string;
  /** Rasio bingkai crop: 'square' (1:1 foto profil) atau 'landscape' (16:10 foto KBM) */
  aspect?: 'square' | 'landscape';
  /** Dipanggil setiap kali posisi, zoom, rotasi, atau ukuran bingkai berubah */
  onStateChange: (state: CropperState) => void;
  /** Nonaktifkan kontrol saat proses simpan berjalan */
  disabled?: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export const InteractiveImageCropper: React.FC<InteractiveImageCropperProps> = ({
  imageSrc,
  aspect = 'square',
  onStateChange,
  disabled = false,
}) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originOffsetX: number;
    originOffsetY: number;
  } | null>(null);

  const [natSize, setNatSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>(
    aspect === 'square' ? { w: 236, h: 236 } : { w: 400, h: 250 }
  );
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [flipX, setFlipX] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Reset transformasi setiap kali foto sumber berganti
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setFlipX(false);
    setNatSize({ w: 0, h: 0 });
  }, [imageSrc]);

  // Amati ukuran bingkai crop aktual (responsif HP & Desktop)
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setFrameSize({ w: rect.width, h: rect.height });
      }
    };

    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const normRot = ((rotation % 360) + 360) % 360;
  const effW = normRot % 180 === 0 ? natSize.w : natSize.h;
  const effH = normRot % 180 === 0 ? natSize.h : natSize.w;

  const baseScale =
    effW > 0 && effH > 0
      ? Math.max(frameSize.w / effW, frameSize.h / effH)
      : 1;

  const computeClampedOffset = useCallback(
    (
      nextX: number,
      nextY: number,
      targetZoom: number,
      targetRotation: number
    ): { x: number; y: number } => {
      if (!natSize.w || !natSize.h || !frameSize.w || !frameSize.h) {
        return { x: 0, y: 0 };
      }
      const rot = ((targetRotation % 360) + 360) % 360;
      const eW = rot % 180 === 0 ? natSize.w : natSize.h;
      const eH = rot % 180 === 0 ? natSize.h : natSize.w;
      const bScale = Math.max(frameSize.w / eW, frameSize.h / eH);
      const maxX = Math.max(0, (eW * bScale * targetZoom - frameSize.w) / 2);
      const maxY = Math.max(0, (eH * bScale * targetZoom - frameSize.h) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    [natSize.w, natSize.h, frameSize.w, frameSize.h]
  );

  // Pastikan offset selalu terjepit dalam batas saat dimensi/rotasi/zoom berubah
  const clampedOffset = computeClampedOffset(offset.x, offset.y, zoom, rotation);

  const isModified =
    Math.abs(zoom - 1) > 0.005 ||
    Math.abs(clampedOffset.x) > 0.5 ||
    Math.abs(clampedOffset.y) > 0.5 ||
    normRot !== 0 ||
    flipX;

  // Laporkan state terkini ke modal induk agar tombol Simpan langsung merender hasil crop
  useEffect(() => {
    onStateChange({
      zoom,
      offsetX: clampedOffset.x,
      offsetY: clampedOffset.y,
      rotation: normRot,
      flipX,
      cropWidth: frameSize.w,
      cropHeight: frameSize.h,
      isModified,
    });
  }, [
    zoom,
    clampedOffset.x,
    clampedOffset.y,
    normRot,
    flipX,
    frameSize.w,
    frameSize.h,
    isModified,
    onStateChange,
  ]);

  const applyZoom = (nextZoomRaw: number) => {
    const nextZoom = Number(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoomRaw)).toFixed(2));
    setZoom(nextZoom);
    setOffset((prev) => computeClampedOffset(prev.x, prev.y, nextZoom, rotation));
  };

  const applyRotate = (deltaDeg: number) => {
    const nextRot = ((rotation + deltaDeg) % 360 + 360) % 360;
    setRotation(nextRot);
    setOffset((prev) => computeClampedOffset(prev.x, prev.y, zoom, nextRot));
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setFlipX(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originOffsetX: clampedOffset.x,
      originOffsetY: clampedOffset.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current || dragOriginRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - dragOriginRef.current.startX;
    const dy = e.clientY - dragOriginRef.current.startY;
    const next = computeClampedOffset(
      dragOriginRef.current.originOffsetX + dx,
      dragOriginRef.current.originOffsetY + dy,
      zoom,
      rotation
    );
    setOffset(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current || dragOriginRef.current.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Abaikan jika pointer sudah dilepas
    }
    dragOriginRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.12 : -0.12;
    applyZoom(zoom + step);
  };

  const displayW = natSize.w > 0 ? natSize.w * baseScale : frameSize.w;
  const displayH = natSize.h > 0 ? natSize.h * baseScale : frameSize.h;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="space-y-3">
      {/* Bingkai Crop Interaktif */}
      <div className="flex flex-col items-center">
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          role="application"
          aria-label="Area crop foto manual, geser untuk mengatur posisi gambar"
          className={`relative overflow-hidden bg-slate-950 select-none touch-none border-2 transition-colors ${
            aspect === 'square'
              ? 'w-[224px] sm:w-[240px] aspect-square rounded-2xl'
              : 'w-full max-w-[440px] aspect-[16/10] rounded-xl'
          } ${
            isDragging
              ? 'border-emerald-400 cursor-grabbing ring-4 ring-emerald-500/25'
              : 'border-emerald-600/80 dark:border-emerald-500/70 cursor-grab shadow-lg'
          }`}
        >
          <img
            src={imageSrc}
            alt="Pratinjau crop foto"
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const img = e.currentTarget;
              setNatSize({
                w: img.naturalWidth || img.width,
                h: img.naturalHeight || img.height,
              });
            }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: `${displayW}px`,
              height: `${displayH}px`,
              maxWidth: 'none',
              maxHeight: 'none',
              transform: `translate(-50%, -50%) translate(${clampedOffset.x}px, ${clampedOffset.y}px) scale(${zoom}) rotate(${normRot}deg) scaleX(${flipX ? -1 : 1})`,
              transformOrigin: 'center center',
            }}
            className="pointer-events-none select-none will-change-transform"
          />

          {/* Garis Panduan Rule-of-Thirds */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
              isDragging ? 'opacity-90' : 'opacity-45'
            }`}
          >
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/70 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/70 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/70 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/70 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
          </div>

          {/* Panduan Sudut Bingkai Crop */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <span className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-white/95 rounded-tl-sm drop-shadow" />
            <span className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-white/95 rounded-tr-sm drop-shadow" />
            <span className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-white/95 rounded-bl-sm drop-shadow" />
            <span className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-white/95 rounded-br-sm drop-shadow" />
          </div>

          {/* Label Geser Ringkas */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-md bg-slate-950/75 text-white text-[10px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-opacity ${
              isDragging ? 'opacity-0' : 'opacity-95'
            }`}
          >
            <Move className="w-3 h-3 text-emerald-400" />
            <span>Geser untuk atur posisi</span>
          </div>
        </div>
      </div>

      {/* Kontrol Zoom Presisi */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#FAFAF7] dark:bg-slate-800/50 px-3 py-2.5 space-y-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={disabled || zoom <= MIN_ZOOM}
            onClick={() => applyZoom(zoom - 0.15)}
            aria-label="Perkecil foto"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.02}
            value={zoom}
            disabled={disabled}
            onChange={(e) => applyZoom(parseFloat(e.target.value))}
            aria-label="Perbesar atau perkecil foto"
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-emerald-600"
          />

          <button
            type="button"
            disabled={disabled || zoom >= MAX_ZOOM}
            onClick={() => applyZoom(zoom + 0.15)}
            aria-label="Perbesar foto"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <span className="w-11 text-right text-xs font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
            {zoomPercent}%
          </span>
        </div>

        {/* Tombol Putar, Balik & Reset */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => applyRotate(-90)}
            className="min-h-[36px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Kiri</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => applyRotate(90)}
            className="min-h-[36px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors disabled:opacity-40"
          >
            <RotateCw className="w-3.5 h-3.5 shrink-0" />
            <span>Kanan</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => setFlipX((prev) => !prev)}
            className={`min-h-[36px] px-2 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors disabled:opacity-40 ${
              flipX
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5 shrink-0" />
            <span>Balik</span>
          </button>

          <button
            type="button"
            disabled={disabled || !isModified}
            onClick={handleReset}
            className="min-h-[36px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
