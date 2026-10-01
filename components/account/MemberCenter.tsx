'use client';

import {
  ArrowRight,
  CalendarBlank,
  Clock,
  Receipt,
  SignOut,
  Ticket,
  Train,
  UserCircle
} from '@phosphor-icons/react';
import {useLocale, useTranslations} from 'next-intl';
import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';

import {Link, useRouter} from '@/i18n/navigation';
import {
  BookingApiError,
  fetchAuthSession,
  fetchBookings,
  signIn,
  signOut,
  signUp,
  type AuthSession,
  type BookingSummary
} from '@/lib/supabase/booking';

type AuthMode = 'signIn' | 'signUp';

export function MemberCenter() {
  const t = useTranslations('Member');
  const authT = useTranslations('Checkout');
  const locale = useLocale();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | undefined>(undefined);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  const currency = useMemo(() => new Intl.NumberFormat(locale === 'zh' ? 'zh-TW' : 'en-US', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }), [locale]);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei'
  }), [locale]);

  const loadAccount = useCallback(async () => {
    try {
      const nextSession = await fetchAuthSession();
      setSession(nextSession);
      if (!nextSession.authenticated) {
        setBookings([]);
        setLoadError('');
        return;
      }
      setBookings(await fetchBookings());
      setLoadError('');
    } catch {
      setSession((current) => current ?? {authenticated: false, user: null});
      setLoadError(t('loadError'));
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount]);

  useEffect(() => {
    const update = () => setCurrentTime(Date.now());
    const timer = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      if (authMode === 'signIn') {
        await signIn({email, password});
      } else {
        const result = await signUp({name, email, password});
        if (!result.authenticated) {
          setAuthError(authT('authFailed'));
          return;
        }
      }
      window.dispatchEvent(new Event('thsr:auth-change'));
      await loadAccount();
      router.refresh();
    } catch (error) {
      setAuthError(error instanceof BookingApiError ? error.message : authT('authFailed'));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      setSession({authenticated: false, user: null});
      setBookings([]);
      window.dispatchEvent(new Event('thsr:auth-change'));
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  function statusLabel(booking: BookingSummary) {
    if (booking.status === 'PENDING' && currentTime !== null && Date.parse(booking.expiresAt) <= currentTime) {
      return t('statusExpired');
    }
    const keys = {
      PENDING: 'statusPending',
      CONFIRMED: 'statusConfirmed',
      CANCELLED: 'statusCancelled',
      COMPLETED: 'statusCompleted'
    } as const;
    return t(keys[booking.status]);
  }

  if (session === undefined) {
    return <AccountShell><p className="py-16 text-center text-thsr-muted">{t('loading')}</p></AccountShell>;
  }

  if (!session.authenticated) {
    return (
      <AccountShell>
        <section className="mx-auto max-w-xl border-t-4 border-thsr-orange bg-white p-6 shadow-[0_12px_30px_rgba(32,51,61,0.10)] sm:p-8" aria-labelledby="member-login-title">
          <div className="flex items-start gap-3">
            <UserCircle size={34} className="shrink-0 text-thsr-orange" aria-hidden="true" />
            <div>
              <h1 id="member-login-title" className="text-2xl font-bold text-thsr-dark">{t('loginTitle')}</h1>
              <p className="mt-2 text-sm leading-6 text-thsr-muted">{t('loginBody')}</p>
            </div>
          </div>

          <div className="mt-6 flex border-b border-thsr-border" role="tablist">
            {(['signIn', 'signUp'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={authMode === mode}
                onClick={() => {
                  setAuthMode(mode);
                  setAuthError('');
                }}
                className={`min-h-11 border-b-2 px-5 font-bold ${authMode === mode ? 'border-thsr-orange text-thsr-orange' : 'border-transparent text-thsr-muted hover:text-thsr-dark'}`}
              >
                {authT(mode)}
              </button>
            ))}
          </div>

          <form onSubmit={handleAuth} className="mt-6 grid gap-4">
            {authMode === 'signUp' && (
              <AccountField label={authT('name')} htmlFor="member-name">
                <input id="member-name" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="booking-control" />
              </AccountField>
            )}
            <AccountField label={authT('email')} htmlFor="member-email">
              <input id="member-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="booking-control" />
            </AccountField>
            <AccountField label={authT('password')} htmlFor="member-password">
              <input id="member-password" required type="password" minLength={8} autoComplete={authMode === 'signIn' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="booking-control" />
              {authMode === 'signUp' && <p className="text-xs leading-5 text-thsr-muted">{authT('passwordHelp')}</p>}
            </AccountField>
            {(authError || loadError) && <p role="alert" className="border-l-4 border-[#b42318] bg-[#fff4f2] px-4 py-3 text-sm text-[#8f1d14]">{authError || loadError}</p>}
            <button type="submit" disabled={authBusy} className="min-h-12 bg-thsr-orange px-6 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px">
              {authBusy ? authT(authMode === 'signIn' ? 'signingIn' : 'creatingAccount') : authT(authMode)}
            </button>
          </form>
        </section>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      <div className="flex flex-col gap-5 border-b border-thsr-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-thsr-dark sm:text-4xl">{t('title')}</h1>
          <p className="mt-2 text-sm leading-6 text-thsr-muted sm:text-base">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-60">
            <p className="text-xs text-thsr-muted">{t('signedInAs')}</p>
            <p className="truncate text-sm font-bold text-thsr-dark">{session.user?.email}</p>
          </div>
          <button type="button" disabled={signingOut} onClick={() => void handleSignOut()} className="inline-flex min-h-11 items-center gap-2 border border-thsr-border bg-white px-4 text-sm font-bold text-thsr-dark hover:border-thsr-orange hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange disabled:opacity-60">
            <SignOut size={19} aria-hidden="true" />
            {t(signingOut ? 'signingOut' : 'signOut')}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-thsr-dark"><Receipt size={26} className="text-thsr-orange" aria-hidden="true" />{t('myBookings')}</h2>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 bg-thsr-orange px-5 text-sm font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px">
          {t('newBooking')}<ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>

      {loadError ? (
        <p role="alert" className="mt-6 border-l-4 border-[#b42318] bg-[#fff4f2] px-4 py-3 text-sm text-[#8f1d14]">{loadError}</p>
      ) : bookings.length === 0 ? (
        <div className="mt-6 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(32,51,61,0.07)]">
          <Ticket size={42} className="mx-auto text-thsr-orange" aria-hidden="true" />
          <h3 className="mt-4 text-xl font-bold text-thsr-dark">{t('emptyTitle')}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-thsr-muted">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5">
          {bookings.map((booking) => {
            const isPending = booking.status === 'PENDING' && (currentTime === null || Date.parse(booking.expiresAt) > currentTime);
            return (
              <article key={booking.bookingNumber} className="border-l-4 border-thsr-orange bg-white p-5 shadow-[0_8px_24px_rgba(32,51,61,0.07)] sm:p-6">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <h3 className="text-lg font-bold text-thsr-dark">{booking.bookingNumber}</h3>
                      <span className={`text-sm font-bold ${isPending ? 'text-thsr-orange' : 'text-thsr-muted'}`}>{statusLabel(booking)}</span>
                      <span className="text-sm text-thsr-muted">{t('passengerCount', {count: booking.itemCount})}</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {booking.journeys.map((journey) => (
                        <div key={`${booking.bookingNumber}-${journey.scheduleId}`} className="bg-[#f7f7f5] p-4">
                          <p className="flex items-center gap-2 text-sm font-bold text-thsr-orange"><Train size={18} aria-hidden="true" />{t('train', {number: journey.trainNumber})}</p>
                          <p className="mt-1 font-bold text-thsr-dark">{journey.originName} → {journey.destinationName}</p>
                          <p className="mt-2 flex items-center gap-2 text-xs text-thsr-muted"><CalendarBlank size={16} aria-hidden="true" />{dateTime.format(new Date(journey.departureAt))}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-thsr-muted">
                      <span>{t('createdAt')}: {dateTime.format(new Date(booking.createdAt))}</span>
                      {booking.status === 'PENDING' && <span className="flex items-center gap-1"><Clock size={15} aria-hidden="true" />{t('paymentDeadline')}: {dateTime.format(new Date(booking.expiresAt))}</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-thsr-border pt-4 lg:block lg:min-w-44 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 lg:text-right">
                    <p className="text-xl font-bold text-thsr-dark">{currency.format(Number(booking.totalAmount))}</p>
                    <Link href={`/booking/${booking.bookingNumber}`} className={`mt-0 inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange lg:mt-4 ${isPending ? 'bg-thsr-orange text-white hover:bg-thsr-orange-hover' : 'border border-thsr-border text-thsr-dark hover:border-thsr-orange hover:text-thsr-orange'}`}>
                      {isPending ? t('continuePayment') : t('viewDetails')}
                      <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AccountShell>
  );
}

function AccountShell({children}: {children: React.ReactNode}) {
  return <main className="bg-thsr-background py-10 sm:py-14"><div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-5">{children}</div></main>;
}

function AccountField({label, htmlFor, children}: {label: string; htmlFor: string; children: React.ReactNode}) {
  return <div className="grid gap-2"><label htmlFor={htmlFor} className="text-sm font-bold text-thsr-dark">{label}</label>{children}</div>;
}
