import pkbmLoginBanner from './images/pkbm_login_banner_1794966815242.jpg';

export const DEFAULT_PKBM_LOGO = '/assets/aistudio/LOGO_PKBM_d17be539.png';
export const DEFAULT_PKBM_LOGIN_BANNER = pkbmLoginBanner;

export function isLegacyDummyLogo(url?: string | null): boolean {
  if (!url || !url.trim()) return true;
  return url.includes('pkbm_emblem_crest') || url.includes('/src/assets/');
}

export function resolveSchoolLogo(url?: string | null): string {
  return isLegacyDummyLogo(url) ? DEFAULT_PKBM_LOGO : (url as string);
}
