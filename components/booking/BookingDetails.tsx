'use client';

import {
  ArrowLeft,
  CheckCircle,
  Clock,
  CreditCard,
  Seat,
  Ticket,
  Train,
  WarningCircle
} from '@phosphor-icons/react';
import {useLocale, useTranslations} from 'next-intl';
import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';

import {Link} from '@/i18n/navigation';
import {DEMO_PAYMENT_CARD, isDemoPaymentCard} from '@/lib/booking/demo-payment';
import {
  BookingApiError,
  cancelBooking,
  completeDemoPayment,
  fetchBooking,
  type BookingResponse
} from '@/lib/supabase/booking';

export function BookingDetails({bookingNumber}: {bookingNumber: string}) {
  const t = useTranslations('BookingDetail');
  const locale = useLocale();
  const [booking, setBooking] = useState<BookingResponse | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState<'payment' | 'cancel' | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [paymentTipOpen, setPaymentTipOpen] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [cardholderName, setCardholderName] = useState('');

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

  const loadBooking = useCallback(async () => {
    try {
      setBooking(await fetchBooking(bookingNumber));
      setError('');
    } catch (loadError) {
      setBooking(null);
      setError(loadError instanceof BookingApiError ? loadError.message : t('loadErrorBody'));
    }
  }, [bookingNumber, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBooking(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBooking]);

  useEffect(() => {
    const update = () => setCurrentTime(Date.now());
    const timer = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);

  const demoCardReady = isDemoPaymentCard({cardNumber, expiry, securityCode, cardholderName});

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoCardReady) {
      setActionError(t('demoCardError'));
      return;
    }
    setActionBusy('payment');
    setActionError('');
    try {
      setBooking(await completeDemoPayment(bookingNumber, {
        cardNumber,
        expiry,
        securityCode,
        cardholderName
      }));
    } catch (paymentError) {
      setActionError(
        paymentError instanceof BookingApiError && paymentError.code === 'INVALID_DEMO_CARD'
          ? t('demoCardError')
          : paymentError instanceof BookingApiError
            ? paymentError.message
            : t('actionError')
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCancel() {
    setActionBusy('cancel');
    setActionError('');
    try {
      setBooking(await cancelBooking(bookingNumber));
      setConfirmCancel(false);
    } catch (cancelError) {
      setActionError(cancelError instanceof BookingApiError ? cancelError.message : t('actionError'));
    } finally {
      setActionBusy(null);
    }
  }

  if (booking === undefined) {
    return <DetailShell><p className="py-16 text-center text-thsr-muted">{t('loading')}</p></DetailShell>;
  }

  if (!booking) {
    return (
      <DetailShell>
        <section className="border-t-4 border-thsr-orange bg-white p-7 shadow-[0_12px_30px_rgba(32,51,61,0.10)]">
          <WarningCircle size={38} className="text-thsr-orange" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-thsr-dark">{t('loadErrorTitle')}</h1>
          <p className="mt-2 text-sm leading-6 text-thsr-muted">{error || t('loadErrorBody')}</p>
          <Link href="/account" className="mt-6 inline-flex min-h-11 items-center gap-2 bg-thsr-orange px-5 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">
            <ArrowLeft size={18} aria-hidden="true" />{t('back')}
          </Link>
        </section>
      </DetailShell>
    );
  }

  const expired = booking.status === 'PENDING' && currentTime !== null && Date.parse(booking.expiresAt) <= currentTime;
  const statusKey = expired
    ? 'statusExpired'
    : ({PENDING: 'statusPending', CONFIRMED: 'statusConfirmed', CANCELLED: 'statusCancelled', COMPLETED: 'statusCompleted'} as const)[booking.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'];

  return (
    <DetailShell>
      <Link href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-thsr-dark hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">
        <ArrowLeft size={18} aria-hidden="true" />{t('back')}
      </Link>

      <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6">
          <section className="border-t-4 border-thsr-orange bg-white p-6 shadow-[0_10px_28px_rgba(32,51,61,0.08)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-thsr-dark">{t('title')}</h1>
                <p className="mt-2 text-sm text-thsr-muted">{t('bookingNumber')}</p>
                <p className="mt-1 text-xl font-bold text-thsr-dark">{booking.bookingNumber}</p>
              </div>
              <span className={`text-base font-bold ${booking.status === 'CONFIRMED' ? 'text-[#25743b]' : booking.status === 'PENDING' && !expired ? 'text-thsr-orange' : 'text-thsr-muted'}`}>{t(statusKey)}</span>
            </div>

            <dl className="mt-7 grid gap-4 bg-[#f7f7f5] p-5 sm:grid-cols-3">
              <div><dt className="text-xs text-thsr-muted">{t('createdAt')}</dt><dd className="mt-1 text-sm font-bold text-thsr-dark">{dateTime.format(new Date(booking.createdAt))}</dd></div>
              <div><dt className="text-xs text-thsr-muted">{t('expiresAt')}</dt><dd className="mt-1 text-sm font-bold text-thsr-dark">{dateTime.format(new Date(booking.expiresAt))}</dd></div>
              <div><dt className="text-xs text-thsr-muted">{t('total')}</dt><dd className="mt-1 text-xl font-bold text-thsr-dark">{currency.format(Number(booking.totalAmount))}</dd></div>
            </dl>
          </section>

          <section className="bg-white p-6 shadow-[0_10px_28px_rgba(32,51,61,0.08)] sm:p-8" aria-label={t('title')}>
            <div className="grid gap-4">
              {booking.items.map((item) => (
                <article key={item.bookingItemId} className="grid gap-3 border-b border-thsr-border pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <p className="flex items-center gap-2 font-bold text-thsr-dark"><Train size={20} className="text-thsr-orange" aria-hidden="true" />{t('train', {number: item.trainNumber})}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-thsr-muted"><Seat size={18} aria-hidden="true" />{t('seat', {carriage: item.carriageNumber, seat: item.seatNumber})}</p>
                  </div>
                  {item.ticketNumber ? (
                    <p className="flex items-center gap-2 text-sm font-bold text-[#25743b]"><Ticket size={18} aria-hidden="true" />{t('ticketNumber', {number: item.ticketNumber})}</p>
                  ) : (
                    <p className="text-sm font-bold text-thsr-dark">{currency.format(Number(item.fareAmount))}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="bg-white p-6 shadow-[0_10px_28px_rgba(32,51,61,0.08)] lg:sticky lg:top-24">
          {booking.status === 'CONFIRMED' ? (
            <div>
              <CheckCircle size={38} weight="fill" className="text-[#25743b]" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-bold text-thsr-dark">{t('paidTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-thsr-muted">{t('paidBody')}</p>
            </div>
          ) : booking.status === 'CANCELLED' || expired ? (
            <div>
              <Clock size={38} className="text-thsr-orange" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-bold text-thsr-dark">{t(expired ? 'statusExpired' : 'statusCancelled')}</h2>
              <p className="mt-2 text-sm leading-6 text-thsr-muted">{t(expired ? 'expiredBody' : 'cancelledBody')}</p>
              <Link href="/account" className="mt-5 inline-flex min-h-11 items-center bg-thsr-orange px-5 text-sm font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">{t('back')}</Link>
            </div>
          ) : (
            <div>
              <CreditCard size={38} className="text-thsr-orange" aria-hidden="true" />
              <div className="mt-4 flex items-center gap-2">
                <h2 className="text-xl font-bold text-thsr-dark">{t('demoTitle')}</h2>
                <div className="group relative">
                  <button
                    type="button"
                    aria-label={t('demoTipLabel')}
                    aria-expanded={paymentTipOpen}
                    aria-describedby="demo-card-tooltip"
                    onClick={() => setPaymentTipOpen((current) => !current)}
                    className="grid size-8 place-items-center text-thsr-orange hover:text-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange"
                  >
                    <WarningCircle size={21} weight="fill" aria-hidden="true" />
                  </button>
                  <div
                    id="demo-card-tooltip"
                    role="tooltip"
                    className={`absolute right-0 top-10 z-20 w-[280px] border border-[#d4d4d0] bg-[#282d30] p-4 text-left text-white shadow-[0_12px_28px_rgba(32,45,52,0.24)] transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 ${paymentTipOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
                  >
                    <p className="font-bold">{t('demoTipTitle')}</p>
                    <p className="mt-1 text-xs leading-5 text-white/80">{t('demoTipBody')}</p>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                      <dt className="text-white/65">{t('cardNumber')}</dt><dd className="font-mono font-bold">{DEMO_PAYMENT_CARD.displayNumber}</dd>
                      <dt className="text-white/65">{t('expiry')}</dt><dd className="font-mono font-bold">{DEMO_PAYMENT_CARD.expiry}</dd>
                      <dt className="text-white/65">{t('securityCode')}</dt><dd className="font-mono font-bold">{DEMO_PAYMENT_CARD.securityCode}</dd>
                      <dt className="text-white/65">{t('cardholderName')}</dt><dd className="font-mono font-bold">{DEMO_PAYMENT_CARD.cardholderName}</dd>
                    </dl>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-thsr-muted">{t('demoBody')}</p>
              <form onSubmit={handlePayment} className="mt-5 grid gap-3" noValidate>
                <div>
                  <label htmlFor="demo-card-number" className="mb-1.5 block text-xs font-bold text-thsr-text">{t('cardNumber')}</label>
                  <input
                    id="demo-card-number"
                    inputMode="numeric"
                    autoComplete="off"
                    value={cardNumber}
                    placeholder="0000 0000 0000 0000"
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 16);
                      setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim());
                      setActionError('');
                    }}
                    className="booking-control font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="demo-card-expiry" className="mb-1.5 block text-xs font-bold text-thsr-text">{t('expiry')}</label>
                    <input
                      id="demo-card-expiry"
                      inputMode="numeric"
                      autoComplete="off"
                      value={expiry}
                      placeholder="MM/YY"
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                        setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                        setActionError('');
                      }}
                      className="booking-control font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-card-code" className="mb-1.5 block text-xs font-bold text-thsr-text">{t('securityCode')}</label>
                    <input
                      id="demo-card-code"
                      inputMode="numeric"
                      autoComplete="off"
                      value={securityCode}
                      placeholder="000"
                      onChange={(event) => {
                        setSecurityCode(event.target.value.replace(/\D/g, '').slice(0, 3));
                        setActionError('');
                      }}
                      className="booking-control font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="demo-card-name" className="mb-1.5 block text-xs font-bold text-thsr-text">{t('cardholderName')}</label>
                  <input
                    id="demo-card-name"
                    autoComplete="off"
                    value={cardholderName}
                    placeholder={t('cardholderPlaceholder')}
                    onChange={(event) => {
                      setCardholderName(event.target.value.toUpperCase().slice(0, 60));
                      setActionError('');
                    }}
                    className="booking-control uppercase"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCardNumber(DEMO_PAYMENT_CARD.displayNumber);
                    setExpiry(DEMO_PAYMENT_CARD.expiry);
                    setSecurityCode(DEMO_PAYMENT_CARD.securityCode);
                    setCardholderName(DEMO_PAYMENT_CARD.cardholderName);
                    setActionError('');
                  }}
                  className="min-h-11 border border-thsr-orange px-4 text-sm font-bold text-thsr-orange hover:bg-[#fff4ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px"
                >
                  {t('useDemoCard')}
                </button>
                {actionError && <p role="alert" className="border-l-4 border-[#b42318] bg-[#fff4f2] px-3 py-2 text-sm text-[#8f1d14]">{actionError}</p>}
                <button type="submit" disabled={actionBusy !== null || !demoCardReady} className="min-h-12 w-full bg-thsr-orange px-5 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange disabled:cursor-not-allowed disabled:bg-[#b8b8b8] disabled:text-white active:translate-y-px">
                  {t(actionBusy === 'payment' ? 'paying' : 'pay')}
                </button>
              </form>
              {!confirmCancel ? (
                <button type="button" disabled={actionBusy !== null} onClick={() => setConfirmCancel(true)} className="mt-3 min-h-11 w-full border border-thsr-border px-5 text-sm font-bold text-thsr-muted hover:border-[#b42318] hover:text-[#b42318] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318] disabled:opacity-60">
                  {t('cancel')}
                </button>
              ) : (
                <div className="mt-3 border border-[#e8b4ad] bg-[#fff4f2] p-3">
                  <p className="text-sm leading-5 text-[#8f1d14]">{t('confirmCancelBody')}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmCancel(false)} className="min-h-10 border border-thsr-border bg-white text-sm font-bold text-thsr-dark">{t('keepBooking')}</button>
                    <button type="button" disabled={actionBusy !== null} onClick={() => void handleCancel()} className="min-h-10 bg-[#9f251b] text-sm font-bold text-white disabled:opacity-60">{t(actionBusy === 'cancel' ? 'cancelling' : 'cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </DetailShell>
  );
}

function DetailShell({children}: {children: React.ReactNode}) {
  return <main className="bg-thsr-background py-10 sm:py-14"><div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-5">{children}</div></main>;
}
