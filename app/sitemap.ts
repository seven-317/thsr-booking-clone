import type {MetadataRoute} from 'next';

import {localizedPath, siteUrl} from '@/lib/site-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const languages = {
    'zh-TW': new URL(localizedPath('zh'), siteUrl).toString(),
    en: new URL(localizedPath('en'), siteUrl).toString()
  };

  return ['zh', 'en'].map((locale) => ({
    url: new URL(localizedPath(locale), siteUrl).toString(),
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: locale === 'zh' ? 1 : 0.8,
    alternates: {languages}
  }));
}
