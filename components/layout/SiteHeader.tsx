'use client';

import {
  CaretDown,
  GlobeHemisphereWest,
  List,
  SignOut,
  Ticket,
  UserCircle,
  X
} from '@phosphor-icons/react';
import Image from 'next/image';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useRef, useState, useTransition} from 'react';

import {Link, usePathname, useRouter} from '@/i18n/navigation';
import {fetchAuthSession, signOut, type AuthSession} from '@/lib/supabase/booking';

const primaryItems = [
  {key: 'ticketInfo', href: '#booking'},
  {key: 'travelGuide', href: '#travel-guide'},
  {key: 'travelWithThsr', href: '#travel'},
  {key: 'aboutThsr', href: '#about'}
] as const;

const utilityItems = [
  {key: 'siteMap', href: '#footer'},
  {key: 'sustainability', href: '#footer'},
  {key: 'investorRelations', href: '#footer'},
  {key: 'corporateGovernance', href: '#footer'}
] as const;

export function SiteHeader() {
  const t = useTranslations('Navigation');
  const language = useTranslations('LocaleSwitcher');
  const brand = useTranslations('Brand');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const desktopLocaleMenuRef = useRef<HTMLDivElement>(null);
  const mobileLocaleMenuRef = useRef<HTMLDivElement>(null);
  const memberMenuRef = useRef<HTMLDivElement>(null);
  const [isLocaleOpen, setIsLocaleOpen] = useState(false);
  const [isMemberOpen, setIsMemberOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const sentinel = document.getElementById('page-top-sentinel');
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsAtTop(entry.isIntersecting),
      {threshold: 0}
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const loadSession = () => {
      void fetchAuthSession()
        .then(setSession)
        .catch(() => setSession({authenticated: false, user: null}));
    };
    loadSession();
    window.addEventListener('thsr:auth-change', loadSession);
    return () => window.removeEventListener('thsr:auth-change', loadSession);
  }, []);

  useEffect(() => {
    const closeLocaleMenu = (event: PointerEvent) => {
      const target = event.target as Node;
      const isInsideDesktop = desktopLocaleMenuRef.current?.contains(target);
      const isInsideMobile = mobileLocaleMenuRef.current?.contains(target);
      const isInsideMember = memberMenuRef.current?.contains(target);

      if (!isInsideDesktop && !isInsideMobile) {
        setIsLocaleOpen(false);
      }
      if (!isInsideMember) setIsMemberOpen(false);
    };

    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLocaleOpen(false);
        setIsMemberOpen(false);
        setIsMobileOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeLocaleMenu);
    document.addEventListener('keydown', closeWithEscape);

    return () => {
      document.removeEventListener('pointerdown', closeLocaleMenu);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  const switchLocale = (nextLocale: 'zh' | 'en') => {
    setIsLocaleOpen(false);
    setIsMobileOpen(false);

    if (nextLocale === locale) {
      return;
    }

    startTransition(() => {
      router.replace(pathname, {locale: nextLocale});
    });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setSession({authenticated: false, user: null});
      setIsMemberOpen(false);
      setIsMobileOpen(false);
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <a
        href="#main-content"
        className="sr-only bg-thsr-orange px-4 py-3 text-white focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        {t('skipToContent')}
      </a>

      <div className={`relative mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 transition-[height] duration-200 lg:px-5 ${isAtTop ? 'lg:h-36' : 'lg:h-20'}`}>
        <Link
          href="/"
          aria-label={brand('logoAlt')}
          className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-thsr-orange"
        >
          <Image
            src="/brand/thsr-logo.svg"
            alt={brand('logoAlt')}
            width={210}
            height={84}
            priority
            className={`h-auto w-[138px] transition-[width] duration-200 ${isAtTop ? 'lg:w-[190px]' : 'lg:w-[158px]'}`}
          />
        </Link>

        <div className="hidden h-full flex-1 lg:block">
          {isAtTop && (
            <div className="absolute right-5 top-3 flex items-center gap-0 text-[14px] text-[#5b5b5b]">
              <nav aria-label={t('utilityNavigation')}>
                <ul className="flex items-center">
                  {utilityItems.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center after:mx-3 after:h-4 after:w-px after:bg-[#d7d7d7] last:after:hidden"
                    >
                      <a
                        href={`/${locale}${item.href}`}
                        className="border-b border-[#8a8a8a] leading-6 transition-colors hover:border-thsr-orange hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange"
                      >
                        {t(item.key)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <LocaleMenu
                ref={desktopLocaleMenuRef}
                locale={locale}
                isOpen={isLocaleOpen}
                isPending={isPending}
                onToggle={() => setIsLocaleOpen((current) => !current)}
                onSelect={switchLocale}
                labels={{
                  menu: language('menu'),
                  current: language(locale === 'zh' ? 'traditionalChinese' : 'english'),
                  zh: language('traditionalChinese'),
                  en: language('english')
                }}
              />
            </div>
          )}

          <nav
            aria-label={t('primaryNavigation')}
            className={`absolute right-5 transition-[top,bottom,transform] duration-200 ${isAtTop ? 'bottom-[26px]' : 'top-1/2 -translate-y-1/2'}`}
          >
            <ul className={`flex items-center ${isAtTop ? 'gap-12 xl:gap-16' : 'gap-8 xl:gap-12'}`}>
              {primaryItems.map((item) => (
                <li key={item.key}>
                  <a
                    href={`/${locale}${item.href}`}
                    className="relative block whitespace-nowrap py-2 text-[19px] font-medium tracking-[0.03em] text-thsr-dark after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-0 after:-translate-x-1/2 after:bg-thsr-orange after:transition-[width] hover:text-thsr-orange hover:after:w-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-thsr-orange"
                  >
                    {t(item.key)}
                  </a>
                </li>
              ))}
              <li>
                <MemberMenu
                  ref={memberMenuRef}
                  session={session}
                  isOpen={isMemberOpen}
                  signingOut={signingOut}
                  onToggle={() => setIsMemberOpen((current) => !current)}
                  onSignOut={handleSignOut}
                  labels={{
                    memberCenter: t('memberCenter'),
                    myBookings: t('myBookings'),
                    signIn: t('memberSignIn'),
                    signOut: t('signOut'),
                    signingOut: t('signingOut')
                  }}
                />
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          {isAtTop && (
            <LocaleMenu
              ref={mobileLocaleMenuRef}
              locale={locale}
              isOpen={isLocaleOpen}
              isPending={isPending}
              compact
              onToggle={() => setIsLocaleOpen((current) => !current)}
              onSelect={switchLocale}
              labels={{
                menu: language('menu'),
                current: language(locale === 'zh' ? 'shortZh' : 'shortEn'),
                zh: language('traditionalChinese'),
                en: language('english')
              }}
            />
          )}
          <button
            type="button"
            aria-expanded={isMobileOpen}
            aria-controls="mobile-navigation"
            aria-label={t(isMobileOpen ? 'closeMenu' : 'openMenu')}
            onClick={() => setIsMobileOpen((current) => !current)}
            className="grid size-11 place-items-center text-thsr-dark transition-colors hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px"
          >
            {isMobileOpen ? <X size={28} /> : <List size={30} />}
          </button>
        </div>
      </div>

      {isMobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label={t('primaryNavigation')}
          className="border-t border-thsr-border bg-white px-4 pb-5 lg:hidden"
        >
          <ul className="mx-auto max-w-xl">
            {primaryItems.map((item) => (
              <li key={item.key} className="border-b border-thsr-border">
                <a
                  href={`/${locale}${item.href}`}
                  onClick={() => setIsMobileOpen(false)}
                  className="block py-4 text-base font-medium text-thsr-dark hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-thsr-orange"
                >
                  {t(item.key)}
                </a>
              </li>
            ))}
            <li className="border-b border-thsr-border">
              <Link
                href="/account"
                onClick={() => setIsMobileOpen(false)}
                className="flex min-h-14 items-center gap-3 py-3 text-base font-bold text-thsr-dark hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-thsr-orange"
              >
                <UserCircle size={23} aria-hidden="true" />
                <span>
                  {session?.authenticated
                    ? session.user?.name || session.user?.email || t('memberCenter')
                    : t('memberSignIn')}
                </span>
              </Link>
            </li>
            {session?.authenticated && (
              <li>
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                  className="flex min-h-14 w-full items-center gap-3 py-3 text-left text-base font-medium text-thsr-muted hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-thsr-orange disabled:opacity-60"
                >
                  <SignOut size={22} aria-hidden="true" />
                  {t(signingOut ? 'signingOut' : 'signOut')}
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}

type MemberMenuProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  session: AuthSession | null;
  isOpen: boolean;
  signingOut: boolean;
  onToggle: () => void;
  onSignOut: () => Promise<void>;
  labels: {
    memberCenter: string;
    myBookings: string;
    signIn: string;
    signOut: string;
    signingOut: string;
  };
};

function MemberMenu({ref, session, isOpen, signingOut, onToggle, onSignOut, labels}: MemberMenuProps) {
  if (!session?.authenticated) {
    return (
      <Link
        href="/account"
        className="flex min-h-11 items-center gap-2 whitespace-nowrap border-l border-thsr-border pl-5 text-[16px] font-bold text-thsr-dark hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-thsr-orange"
      >
        <UserCircle size={24} aria-hidden="true" />
        {labels.signIn}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex min-h-11 max-w-48 items-center gap-2 border-l border-thsr-border pl-5 text-left text-[15px] font-bold text-thsr-dark hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-thsr-orange"
      >
        <UserCircle size={24} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{session.user?.name || labels.memberCenter}</span>
        <CaretDown size={12} weight="bold" className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 border border-[#cfcfcf] bg-white py-2 shadow-[0_8px_24px_rgba(32,51,61,0.16)]">
          <div className="border-b border-thsr-border px-4 pb-3 pt-1">
            <p className="font-bold text-thsr-dark">{session.user?.name || labels.memberCenter}</p>
            <p className="mt-1 truncate text-xs text-thsr-muted">{session.user?.email}</p>
          </div>
          <Link href="/account" role="menuitem" className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm font-medium text-thsr-dark hover:bg-[#f5f5f3] hover:text-thsr-orange focus-visible:bg-[#f5f5f3] focus-visible:outline-none">
            <Ticket size={20} aria-hidden="true" />
            {labels.myBookings}
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => void onSignOut()}
            className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-thsr-dark hover:bg-[#f5f5f3] hover:text-thsr-orange focus-visible:bg-[#f5f5f3] focus-visible:outline-none disabled:opacity-60"
          >
            <SignOut size={20} aria-hidden="true" />
            {signingOut ? labels.signingOut : labels.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

type LocaleMenuProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  locale: string;
  isOpen: boolean;
  isPending: boolean;
  compact?: boolean;
  onToggle: () => void;
  onSelect: (locale: 'zh' | 'en') => void;
  labels: {
    menu: string;
    current: string;
    zh: string;
    en: string;
  };
};

function LocaleMenu({
  ref,
  locale,
  isOpen,
  isPending,
  compact = false,
  onToggle,
  onSelect,
  labels
}: LocaleMenuProps) {
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={labels.menu}
        disabled={isPending}
        onClick={onToggle}
        className={`flex h-10 items-center gap-1.5 whitespace-nowrap px-2 text-[#555555] transition-colors hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange disabled:opacity-60 ${compact ? 'text-sm' : 'ml-2'}`}
      >
        <GlobeHemisphereWest size={compact ? 21 : 23} weight="light" />
        <span>{labels.current}</span>
        <CaretDown
          size={12}
          weight="bold"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={labels.menu}
          className="absolute right-0 top-full z-40 min-w-36 border border-[#cfcfcf] bg-white py-1 shadow-[0_5px_14px_rgba(0,0,0,0.16)]"
        >
          {(['zh', 'en'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={locale === option}
              onClick={() => onSelect(option)}
              className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#f2f2f2] hover:text-thsr-orange focus-visible:bg-[#f2f2f2] focus-visible:outline-none ${locale === option ? 'font-bold text-thsr-orange' : 'text-thsr-dark'}`}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
