import React, { useEffect, useState } from 'react';

interface InitialAvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const PALETTES = [
  'from-emerald-700 to-emerald-500 text-white',
  'from-teal-700 to-emerald-600 text-white',
  'from-amber-600 to-amber-500 text-white',
  'from-emerald-800 to-amber-600 text-white',
];

function getInitials(name: string): string {
  const clean = name.replace(/^(Drs\.|H\.|Hj\.)\s*/gi, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const InitialAvatar: React.FC<InitialAvatarProps> = ({
  name,
  src,
  size = 'md',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const gradient = PALETTES[hash % PALETTES.length];
  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-xs rounded-lg'
      : size === 'lg'
        ? 'w-12 h-12 text-base rounded-xl'
        : size === 'xl'
          ? 'w-16 h-16 text-lg rounded-2xl'
          : 'w-10 h-10 text-sm rounded-xl';

  if (src && src.trim() && !imgFailed) {
    return (
      <div
        className={`${sizeClass} overflow-hidden shrink-0 shadow-sm ring-1 ring-emerald-950/10 dark:ring-white/15 bg-slate-100 dark:bg-slate-800 ${className}`}
      >
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClass} bg-gradient-to-br ${gradient} font-display font-bold flex items-center justify-center shrink-0 shadow-sm ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
