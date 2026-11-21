import React from 'react';
import { resolveSchoolLogo } from '../../assets/branding';
import { SchoolSettings } from '../../types/siakad';
import { PKBM_FOUNDATION_NAME } from '../../utils/pdfKopSuratUtils';

export interface PkbmKopSuratHeaderProps {
  schoolSettings: SchoolSettings;
  className?: string;
}

/**
 * Komponen Header Kop Surat Resmi PKBM yang konsisten untuk seluruh lembar pratinjau
 * dan cetak dokumen A4 (Rapor, Surat Keterangan, Daftar Rombel, Surat Tugas, Presensi,
 * Perangkat Ajar, dan Naskah Ujian).
 */
export const PkbmKopSuratHeader: React.FC<PkbmKopSuratHeaderProps> = ({
  schoolSettings,
  className = '',
}) => {
  if (schoolSettings.letterheadUrl) {
    return (
      <div className={`pb-3 mb-5 border-b-[3px] border-black ${className}`}>
        <img
          src={schoolSettings.letterheadUrl}
          alt={`Kop Surat ${schoolSettings.schoolName}`}
          referrerPolicy="no-referrer"
          className="w-full max-h-36 object-contain mx-auto"
        />
        <div className="h-[1px] bg-black mt-[3px]" />
      </div>
    );
  }

  return (
    <div className={`mb-6 ${className}`}>
      <header className="pb-3 border-b-[3px] border-black flex items-center gap-4">
        <div className="w-[76px] h-[76px] shrink-0 flex items-center justify-center">
          <img
            src={resolveSchoolLogo(schoolSettings.logoUrl)}
            alt={`Logo ${schoolSettings.schoolName}`}
            referrerPolicy="no-referrer"
            className="w-[74px] h-[74px] object-contain"
          />
        </div>
        <div className="flex-1 text-center text-black">
          <p className="!text-[12pt] !leading-tight font-bold uppercase tracking-wide">
            {PKBM_FOUNDATION_NAME}
          </p>
          <h2 className="!text-[15pt] !leading-tight font-bold uppercase tracking-tight mt-0.5">
            {schoolSettings.schoolName}
          </h2>
          <p className="!text-[10.5pt] !leading-tight font-bold uppercase mt-0.5">
            PROGRAM PENDIDIKAN KESETARAAN PAKET A (SD), PAKET B (SMP), DAN PAKET C (SMA)
          </p>
          <p className="!text-[10pt] !leading-snug mt-1">
            {schoolSettings.address}
          </p>
          <p className="!text-[10pt] !leading-snug">
            NPSN: {schoolSettings.npsn}
            {schoolSettings.phone ? ` · Telp: ${schoolSettings.phone}` : ''}
            {schoolSettings.email ? ` · Email: ${schoolSettings.email}` : ''}
            {schoolSettings.website ? ` · ${schoolSettings.website}` : ''}
          </p>
        </div>
      </header>
      <div className="h-[1px] bg-black mt-[2px]" />
    </div>
  );
};
