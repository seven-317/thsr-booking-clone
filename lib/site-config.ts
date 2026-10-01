const FALLBACK_SITE_URL = 'http://localhost:3000';

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL);

export const localizedPath = (locale: string, pathname = '') => {
  const normalizedPath = pathname ? `/${pathname.replace(/^\/+/, '')}` : '';
  return `/${locale}${normalizedPath}`;
};
