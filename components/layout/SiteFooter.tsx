import {
  FacebookLogo,
  Headset,
  MagnifyingGlass,
  Question,
  YoutubeLogo
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import {getTranslations} from 'next-intl/server';

const legalItems = [
  'privacy',
  'intellectualProperty',
  'transactionNotice',
  'passengerContract'
] as const;

export async function SiteFooter() {
  const t = await getTranslations('Footer');

  return (
    <footer id="footer" className="text-white">
      <div className="bg-thsr-footer">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-5">
          <nav aria-label={t('serviceNavigation')}>
            <ul className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-0">
              <li className="sm:border-r sm:border-white/50 sm:pr-5">
                <a
                  href="#footer"
                  className="flex min-h-11 items-center gap-2 text-[16px] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  <Question size={34} weight="light" />
                  {t('faq')}
                </a>
              </li>
              <li className="sm:px-5">
                <a
                  href="#footer"
                  className="flex min-h-11 items-center gap-2 text-[16px] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  <MagnifyingGlass size={32} weight="light" />
                  {t('lostAndFound')}
                </a>
              </li>
              <li className="sm:border-l sm:border-white/50 sm:pl-5">
                <a
                  href="#footer"
                  className="flex min-h-11 items-center gap-2 text-[16px] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  <Headset size={34} weight="light" />
                  {t('contactUs')}
                </a>
              </li>
            </ul>
          </nav>

          <div className="flex flex-wrap items-center gap-5 lg:justify-end">
            <span className="text-sm">{t('followUs')}</span>
            <a
              href="https://www.facebook.com/thsrco"
              target="_blank"
              rel="noreferrer"
              aria-label={t('facebook')}
              className="grid size-10 place-items-center rounded-full border border-white text-white hover:bg-white hover:text-thsr-footer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <FacebookLogo size={22} weight="light" />
            </a>
            <a
              href="https://www.youtube.com/user/THSRFan"
              target="_blank"
              rel="noreferrer"
              aria-label={t('youtube')}
              className="grid size-10 place-items-center rounded-full border border-white text-white hover:bg-white hover:text-thsr-footer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <YoutubeLogo size={23} weight="light" />
            </a>
            <a
              href="https://accessibility.moda.gov.tw/Applications/Detail?category=20231019153714"
              target="_blank"
              rel="noreferrer"
              className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <Image
                src="/brand/accessibility-aa.webp"
                alt={t('accessibilityBadge')}
                width={112}
                height={40}
                className="h-auto w-[112px]"
              />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/15 bg-thsr-footer-dark">
        <div className="mx-auto max-w-[1240px] px-4 py-4 lg:px-5">
          <nav aria-label={t('legalNavigation')}>
            <ul className="flex flex-wrap gap-x-0 gap-y-2 text-[13px] text-white/90">
              {legalItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center after:mx-3 after:h-3 after:w-px after:bg-white/45 last:after:hidden"
                >
                  <a
                    href="#footer"
                    className="hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {t(item)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="mt-3 text-[12px] leading-5 text-white/90">
            {t('copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
