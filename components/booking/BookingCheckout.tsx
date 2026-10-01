'use client';

import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  Clock,
  IdentificationCard,
  LockKey,
  Plus,
  Seat,
  Ticket,
  Train,
  UserCircle
} from '@phosphor-icons/react';
import {useLocale, useTranslations} from 'next-intl';
import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';

import {Link} from '@/i18n/navigation';
import {
  clearBookingDraft,
  readBookingDraft
} from '@/lib/booking/checkout-draft';
import {
  BookingApiError,
  createBooking,
  createPassenger,
  fetchPassengers,
  signIn,
  signUp,
  type BookingDraft,
  type BookingResponse,
  type Passenger,
  type PassengerType,
  type TicketType
} from '@/lib/supabase/booking';

const ticketTypes: TicketType[] = ['adult', 'child', 'disabled', 'senior', 'student'];
const passengerTypes: PassengerType[] = ['ADULT', 'CHILD', 'SENIOR', 'DISABLED'];

type AuthMode = 'signIn' | 'signUp';
type TicketSlot = {key: string; ticketType: TicketType; position: number};

function defaultPassengerType(ticketType: TicketType): PassengerType {
  switch (ticketType) {
    case 'child': return 'CHILD';
    case 'senior': return 'SENIOR';
    case 'disabled': return 'DISABLED';
    default: return 'ADULT';
  }
}

function passengerIsEligible(passenger: Passenger, ticketType: TicketType) {
  if (ticketType === 'adult') return true;
  if (ticketType === 'student') {
    return Boolean(
      passenger.studentVerifiedUntil &&
      passenger.studentVerifiedUntil >= new Date().toISOString().slice(0, 10)
    );
  }
  return passenger.passengerType === defaultPassengerType(ticketType);
}

export function BookingCheckout() {
  const t = useTranslations('Checkout');
  const bookingT = useTranslations('Booking');
  const locale = useLocale();
  const [draft, setDraft] = useState<BookingDraft | null | undefined>(undefined);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [passengersLoading, setPassengersLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signIn');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [selections, setSelections] = useState<Record<string, number | ''>>({});
  const [newPassengerSlot, setNewPassengerSlot] = useState<string | null>(null);
  const [newPassengerName, setNewPassengerName] = useState('');
  const [newPassengerIdNumber, setNewPassengerIdNumber] = useState('');
  const [newPassengerType, setNewPassengerType] = useState<PassengerType>('ADULT');
  const [passengerBusy, setPassengerBusy] = useState(false);
  const [passengerError, setPassengerError] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [booking, setBooking] = useState<BookingResponse | null>(null);

  const loadPassengers = useCallback(async () => {
    setPassengersLoading(true);
    try {
      setPassengers(await fetchPassengers());
      setAuthRequired(false);
      setAuthError('');
    } catch (error) {
      if (error instanceof BookingApiError && error.status === 401) {
        setPassengers([]);
        setAuthRequired(true);
      } else {
        setAuthError(t('authFailed'));
      }
    } finally {
      setPassengersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setDraft(readBookingDraft());
      void loadPassengers();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadPassengers]);

  const ticketSlots = useMemo<TicketSlot[]>(() => {
    if (!draft) return [];
    return ticketTypes.flatMap((ticketType) =>
      Array.from({length: draft.ticketCounts[ticketType]}, (_, index) => ({
        key: `${ticketType}-${index + 1}`,
        ticketType,
        position: index + 1
      }))
    );
  }, [draft]);

  const selectedPassengerIds = Object.values(selections).filter((value): value is number => typeof value === 'number');
  const allPassengersSelected =
    ticketSlots.length > 0 &&
    ticketSlots.every((slot) => typeof selections[slot.key] === 'number') &&
    new Set(selectedPassengerIds).size === ticketSlots.length;

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(locale === 'zh' ? 'zh-TW' : 'en-US', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }), [locale]);
  const dateTimeFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei'
  }), [locale]);
  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    setAuthMessage('');
    try {
      if (authMode === 'signIn') {
        await signIn({email: authEmail, password: authPassword});
        window.dispatchEvent(new Event('thsr:auth-change'));
        await loadPassengers();
      } else {
        const result = await signUp({name: authName, email: authEmail, password: authPassword});
        if (result.authenticated) {
          window.dispatchEvent(new Event('thsr:auth-change'));
          await loadPassengers();
        } else {
          setAuthMessage(t('emailConfirmation'));
        }
      }
    } catch (error) {
      setAuthError(error instanceof BookingApiError ? error.message : t('authFailed'));
    } finally {
      setAuthBusy(false);
    }
  }

  function openPassengerForm(slot: TicketSlot) {
    setNewPassengerSlot(slot.key);
    setNewPassengerName('');
    setNewPassengerIdNumber('');
    setNewPassengerType(defaultPassengerType(slot.ticketType));
    setPassengerError('');
  }

  async function handlePassenger(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassengerSlot) return;
    setPassengerBusy(true);
    setPassengerError('');
    try {
      const passenger = await createPassenger({
        name: newPassengerName,
        idNumber: newPassengerIdNumber,
        passengerType: newPassengerType
      });
      setPassengers((current) => [...current, passenger]);
      setSelections((current) => ({...current, [newPassengerSlot]: passenger.passengerId}));
      setNewPassengerSlot(null);
    } catch (error) {
      setPassengerError(error instanceof BookingApiError ? error.message : t('passengerFailed'));
    } finally {
      setPassengerBusy(false);
    }
  }

  async function handleBooking() {
    if (!draft || !allPassengersSelected) return;
    setBookingBusy(true);
    setBookingError('');
    const requestKey = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(requestKey);

    try {
      const result = await createBooking({
        idempotencyKey: requestKey,
        journeys: draft.journeys.map((journey) => ({
          scheduleId: journey.scheduleId,
          originStopId: journey.originStopId,
          destinationStopId: journey.destinationStopId,
          seatType: journey.seatType,
          seatPreference: journey.seatPreference
        })),
        tickets: ticketSlots.map((slot) => ({
          passengerId: selections[slot.key] as number,
          ticketType: slot.ticketType
        }))
      });
      setBooking(result);
      clearBookingDraft();
    } catch (error) {
      if (error instanceof BookingApiError && error.code === 'PROFILE_REQUIRED') {
        setBookingError(t('profileRequired'));
      } else if (error instanceof BookingApiError && error.status === 401) {
        setAuthRequired(true);
        setBookingError(t('authFailed'));
      } else {
        setBookingError(error instanceof BookingApiError ? error.message : t('bookingFailed'));
      }
    } finally {
      setBookingBusy(false);
    }
  }

  if (draft === undefined) {
    return <CheckoutMessage title={t('loading')} />;
  }

  if (!draft) {
    return (
      <CheckoutMessage title={t('missingTitle')} body={t('missingBody')}>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 bg-thsr-orange px-5 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">
          <ArrowLeft size={18} aria-hidden="true" />
          {t('back')}
        </Link>
      </CheckoutMessage>
    );
  }

  if (booking) {
    return (
      <main className="bg-thsr-background py-10 sm:py-14">
        <section className="mx-auto max-w-[920px] px-4 sm:px-6">
          <div className="border-t-4 border-thsr-orange bg-white p-6 shadow-[0_14px_36px_rgba(32,51,61,0.12)] sm:p-9">
            <div className="flex items-start gap-4">
              <CheckCircle size={42} weight="fill" className="shrink-0 text-thsr-orange" aria-hidden="true" />
              <div>
                <h1 className="text-2xl font-bold text-thsr-dark sm:text-3xl">{t('successTitle')}</h1>
                <p className="mt-2 text-sm leading-6 text-thsr-muted">{t('holdNotice')}</p>
              </div>
            </div>

            <dl className="mt-8 grid gap-5 bg-[#fafaf8] p-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-thsr-muted">{t('bookingNumber')}</dt>
                <dd className="mt-1 break-all text-lg font-bold text-thsr-dark">{booking.bookingNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-thsr-muted">{t('status')}</dt>
                <dd className="mt-1 font-bold text-thsr-orange">{t('pending')}</dd>
              </div>
              <div>
                <dt className="text-xs text-thsr-muted">{t('expiresAt')}</dt>
                <dd className="mt-1 font-bold text-thsr-dark">{dateTimeFormatter.format(new Date(booking.expiresAt))}</dd>
              </div>
            </dl>

            <div className="mt-7 space-y-3">
              {booking.items.map((item) => {
                const passenger = passengers.find((candidate) => candidate.passengerId === item.passengerId);
                return (
                  <div key={item.bookingItemId} className="grid gap-2 border-b border-thsr-border pb-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <span className="font-medium text-thsr-dark">{passenger?.name ?? item.passengerId}</span>
                    <span className="text-thsr-muted">{t('train', {number: item.trainNumber})}</span>
                    <span className="font-bold text-thsr-dark">{t('seat', {carriage: item.carriageNumber, seat: item.seatNumber})}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 flex items-end justify-between gap-4 border-t border-thsr-border pt-5">
              <div>
                <p className="text-xs text-thsr-muted">{t('total')}</p>
                <p className="mt-1 text-2xl font-bold text-thsr-dark">{currencyFormatter.format(Number(booking.totalAmount))}</p>
              </div>
              <Link href={`/booking/${booking.bookingNumber}`} className="inline-flex min-h-11 items-center bg-thsr-orange px-6 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">
                {t('continuePayment')}
              </Link>
            </div>
            <p className="mt-6 border-l-4 border-thsr-orange bg-[#fff7f3] px-4 py-3 text-sm leading-6 text-thsr-text">
              {t('paymentNotice')}
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-thsr-background py-8 sm:py-12">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-5">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-thsr-text hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">
          <ArrowLeft size={18} aria-hidden="true" />
          {t('back')}
        </Link>
        <div className="mt-4">
          <h1 className="text-3xl font-bold tracking-tight text-thsr-dark sm:text-4xl">{t('title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-thsr-muted sm:text-base">{t('subtitle')}</p>
        </div>

        <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-7">
            <section className="bg-white p-5 shadow-[0_10px_28px_rgba(32,51,61,0.08)] sm:p-7" aria-labelledby="journey-summary-title">
              <h2 id="journey-summary-title" className="flex items-center gap-2 text-xl font-bold text-thsr-dark">
                <Train size={24} className="text-thsr-orange" aria-hidden="true" />
                {t('journeyTitle')}
              </h2>
              <div className="mt-5 space-y-5">
                {draft.journeys.map((journey) => (
                  <article key={journey.scheduleId} className="border-l-4 border-thsr-orange bg-[#fafaf8] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-thsr-orange">{t('train', {number: journey.trainNumber})}</p>
                        <h3 className="mt-1 text-lg font-bold text-thsr-dark">{journey.originName} → {journey.destinationName}</h3>
                      </div>
                      <p className="text-lg font-bold text-thsr-dark">{currencyFormatter.format(journey.totalFare)}</p>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-thsr-muted sm:grid-cols-3">
                      <span className="flex items-center gap-2"><CalendarBlank size={18} aria-hidden="true" />{dateTimeFormatter.format(new Date(journey.departureAt))}</span>
                      <span className="flex items-center gap-2"><Clock size={18} aria-hidden="true" />{t('duration', {minutes: journey.durationMinutes})}</span>
                      <span className="flex items-center gap-2"><Seat size={18} aria-hidden="true" />{t(journey.seatType === 'BUSINESS' ? 'business' : 'standard')}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {authRequired ? (
              <section className="bg-white p-5 shadow-[0_10px_28px_rgba(32,51,61,0.08)] sm:p-7" aria-labelledby="login-title">
                <h2 id="login-title" className="flex items-center gap-2 text-xl font-bold text-thsr-dark">
                  <LockKey size={24} className="text-thsr-orange" aria-hidden="true" />
                  {t('loginTitle')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-thsr-muted">{t('loginBody')}</p>
                <div className="mt-5 flex border-b border-thsr-border" role="tablist">
                  {(['signIn', 'signUp'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={authMode === mode}
                      onClick={() => {
                        setAuthMode(mode);
                        setAuthError('');
                        setAuthMessage('');
                      }}
                      className={`min-h-11 border-b-2 px-5 font-bold ${authMode === mode ? 'border-thsr-orange text-thsr-orange' : 'border-transparent text-thsr-muted hover:text-thsr-dark'}`}
                    >
                      {t(mode)}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleAuth} className="mt-5 grid gap-4 sm:max-w-xl">
                  {authMode === 'signUp' && (
                    <CheckoutField label={t('name')} htmlFor="auth-name">
                      <input id="auth-name" required autoComplete="name" value={authName} onChange={(event) => setAuthName(event.target.value)} className="booking-control" />
                    </CheckoutField>
                  )}
                  <CheckoutField label={t('email')} htmlFor="auth-email">
                    <input id="auth-email" required type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} className="booking-control" />
                  </CheckoutField>
                  <CheckoutField label={t('password')} htmlFor="auth-password" help={t('passwordHelp')}>
                    <input id="auth-password" required type="password" minLength={8} autoComplete={authMode === 'signIn' ? 'current-password' : 'new-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} className="booking-control" />
                  </CheckoutField>
                  {authError && <p role="alert" className="text-sm font-medium text-[#a83d1d]">{authError}</p>}
                  {authMessage && <p role="status" className="border-l-4 border-thsr-orange bg-[#fff7f3] px-4 py-3 text-sm text-thsr-text">{authMessage}</p>}
                  <button type="submit" disabled={authBusy} className="min-h-12 bg-thsr-orange px-6 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px disabled:bg-[#b8b8b8] sm:w-fit">
                    {authBusy ? t(authMode === 'signIn' ? 'signingIn' : 'creatingAccount') : t(authMode)}
                  </button>
                </form>
              </section>
            ) : (
              <section className="bg-white p-5 shadow-[0_10px_28px_rgba(32,51,61,0.08)] sm:p-7" aria-labelledby="passengers-title">
                <h2 id="passengers-title" className="flex items-center gap-2 text-xl font-bold text-thsr-dark">
                  <UserCircle size={25} className="text-thsr-orange" aria-hidden="true" />
                  {t('passengersTitle')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-thsr-muted">{t('passengersBody')}</p>

                {passengersLoading ? (
                  <div className="mt-5 space-y-3" aria-label={t('loading')}>
                    {ticketSlots.map((slot) => <div key={slot.key} className="h-20 animate-pulse bg-[#eeeeea] motion-reduce:animate-none" />)}
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {ticketSlots.map((slot) => {
                      const eligiblePassengers = passengers.filter((passenger) => passengerIsEligible(passenger, slot.ticketType));
                      return (
                        <div key={slot.key} className="grid gap-3 border-b border-thsr-border pb-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                          <div>
                            <p className="text-sm font-bold text-thsr-dark">{t('ticketSlot', {ticketType: bookingT(`tickets.${slot.ticketType}`), index: slot.position})}</p>
                            {slot.ticketType === 'student' && <p className="mt-1 text-xs leading-5 text-thsr-muted">{t('studentNote')}</p>}
                          </div>
                          <CheckoutField label={t('choosePassenger')} htmlFor={`passenger-${slot.key}`}>
                            <select
                              id={`passenger-${slot.key}`}
                              value={selections[slot.key] ?? ''}
                              onChange={(event) => setSelections((current) => ({...current, [slot.key]: event.target.value ? Number(event.target.value) : ''}))}
                              className="booking-control"
                            >
                              <option value="">{t('choosePassenger')}</option>
                              {eligiblePassengers.map((passenger) => {
                                const usedElsewhere = selectedPassengerIds.includes(passenger.passengerId) && selections[slot.key] !== passenger.passengerId;
                                return <option key={passenger.passengerId} value={passenger.passengerId} disabled={usedElsewhere}>{passenger.name} ({passenger.idNumberMasked})</option>;
                              })}
                            </select>
                          </CheckoutField>
                          <button type="button" onClick={() => openPassengerForm(slot)} className="inline-flex min-h-12 items-center justify-center gap-2 border border-thsr-orange px-4 text-sm font-bold text-thsr-orange hover:bg-[#fff7f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px">
                            <Plus size={18} aria-hidden="true" />
                            {t('addPassenger')}
                          </button>
                          {eligiblePassengers.length === 0 && <p className="text-xs text-[#a83d1d] sm:col-start-2 sm:col-span-2">{t('noEligiblePassenger')}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {newPassengerSlot && (
                  <form onSubmit={handlePassenger} className="mt-6 border-l-4 border-thsr-orange bg-[#fafaf8] p-5">
                    <h3 className="flex items-center gap-2 font-bold text-thsr-dark"><IdentificationCard size={21} aria-hidden="true" />{t('addPassenger')}</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <CheckoutField label={t('passengerName')} htmlFor="new-passenger-name">
                        <input id="new-passenger-name" required autoComplete="name" value={newPassengerName} onChange={(event) => setNewPassengerName(event.target.value)} className="booking-control" />
                      </CheckoutField>
                      <CheckoutField label={t('idNumber')} htmlFor="new-passenger-id" help={t('idNumberHelp')}>
                        <input id="new-passenger-id" required minLength={6} maxLength={32} autoComplete="off" value={newPassengerIdNumber} onChange={(event) => setNewPassengerIdNumber(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} className="booking-control" />
                      </CheckoutField>
                      <CheckoutField label={t('passengerType')} htmlFor="new-passenger-type">
                        <select id="new-passenger-type" value={newPassengerType} onChange={(event) => setNewPassengerType(event.target.value as PassengerType)} className="booking-control">
                          {passengerTypes.map((type) => <option key={type} value={type}>{t(type.toLowerCase() as 'adult' | 'child' | 'senior' | 'disabled')}</option>)}
                        </select>
                      </CheckoutField>
                    </div>
                    {passengerError && <p role="alert" className="mt-3 text-sm font-medium text-[#a83d1d]">{passengerError}</p>}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button type="submit" disabled={passengerBusy} className="min-h-11 bg-thsr-orange px-5 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px disabled:bg-[#b8b8b8]">{passengerBusy ? t('savingPassenger') : t('savePassenger')}</button>
                      <button type="button" onClick={() => setNewPassengerSlot(null)} className="min-h-11 border border-thsr-border bg-white px-5 font-bold text-thsr-text hover:border-thsr-orange hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange">{t('cancel')}</button>
                    </div>
                  </form>
                )}
              </section>
            )}
          </div>

          <aside className="bg-white p-5 shadow-[0_10px_28px_rgba(32,51,61,0.1)] lg:sticky lg:top-40" aria-labelledby="review-title">
            <h2 id="review-title" className="flex items-center gap-2 text-lg font-bold text-thsr-dark"><Ticket size={23} className="text-thsr-orange" aria-hidden="true" />{t('reviewTitle')}</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-thsr-muted">{t('estimatedTotal')}</dt><dd className="text-xl font-bold text-thsr-dark">{currencyFormatter.format(draft.journeys.reduce((sum, journey) => sum + journey.totalFare, 0))}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-thsr-muted">{bookingT('tickets.total', {count: ticketSlots.length})}</dt><dd className="font-bold text-thsr-dark">{ticketSlots.length}</dd></div>
            </dl>
            <p className="mt-5 border-l-4 border-thsr-orange bg-[#fff7f3] px-3 py-3 text-xs leading-5 text-thsr-text">{t('holdNotice')}</p>
            {bookingError && <p role="alert" className="mt-4 text-sm font-medium leading-6 text-[#a83d1d]">{bookingError}</p>}
            <button type="button" disabled={authRequired || !allPassengersSelected || bookingBusy} onClick={() => void handleBooking()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 bg-thsr-orange px-5 font-bold text-white hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#b8b8b8]">
              <CheckCircle size={20} weight="bold" aria-hidden="true" />
              {bookingBusy ? t('booking') : t('confirmBooking')}
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}

function CheckoutMessage({title, body, children}: {title: string; body?: string; children?: React.ReactNode}) {
  return (
    <main className="grid min-h-[50dvh] place-items-center bg-thsr-background px-4 py-12">
      <section className="w-full max-w-xl border-t-4 border-thsr-orange bg-white p-7 text-center shadow-[0_14px_36px_rgba(32,51,61,0.12)]">
        <h1 className="text-2xl font-bold text-thsr-dark">{title}</h1>
        {body && <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-thsr-muted">{body}</p>}
        {children && <div className="mt-6">{children}</div>}
      </section>
    </main>
  );
}

function CheckoutField({
  label,
  htmlFor,
  help,
  children
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-thsr-text">{label}</label>
      {children}
      {help && <p className="mt-1.5 text-xs leading-5 text-thsr-muted">{help}</p>}
    </div>
  );
}
