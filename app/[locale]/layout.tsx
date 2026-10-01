import type {Metadata} from 'next';
import {hasLocale, NextIntlClientProvider} from 'next-intl';
import {getMessages, getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';

import {SiteFooter} from '@/components/layout/SiteFooter';
import {SiteHeader} from '@/components/layout/SiteHeader';
import {routing} from '@/i18n/routing';
import {localizedPath, siteUrl} from '@/lib/site-config';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata({params}: Omit<Props, 'children'>): Promise<Metadata> {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({locale, namespace: 'Metadata'});
  const canonicalPath = localizedPath(locale);
  const otherLocale = locale === 'zh' ? 'en' : 'zh';

  return {
    metadataBase: siteUrl,
    title: {
      default: t('title'),
      template: `%s | ${t('shortTitle')}`
    },
    description: t('description'),
    applicationName: t('siteName'),
    authors: [{name: t('author')}],
    creator: t('author'),
    publisher: t('author'),
    keywords: t('keywords').split(','),
    category: 'travel',
    alternates: {
      canonical: canonicalPath,
      languages: {
        'zh-TW': localizedPath('zh'),
        en: localizedPath('en')
      }
    },
    openGraph: {
      type: 'website',
      url: canonicalPath,
      siteName: t('siteName'),
      title: t('title'),
      description: t('description'),
      locale: locale === 'zh' ? 'zh_TW' : 'en_US',
      alternateLocale: [otherLocale === 'zh' ? 'zh_TW' : 'en_US'],
      images: [
        {
          url: localizedPath(locale, 'opengraph-image'),
          width: 1200,
          height: 630,
          alt: t('ogImageAlt')
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: [localizedPath(locale, 'opengraph-image')]
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1
      }
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false
    }
  };
}

export default async function LocaleLayout({children, params}: Props) {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="bg-thsr-background font-sans text-thsr-dark antialiased">
        <NextIntlClientProvider messages={messages}>
          <div className="flex min-h-[100dvh] flex-col">
            <div id="page-top-sentinel" aria-hidden="true" className="h-px" />
            <SiteHeader />
            <div id="main-content" className="flex-1">
              {children}
            </div>
            <SiteFooter />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
