'use client';

import {
  ArrowsClockwise,
  ArrowsLeftRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  MagnifyingGlass,
  MapPin,
  Ticket,
  Train,
  Users
} from '@phosphor-icons/react';
import {useLocale, useTranslations} from 'next-intl';
import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';

import {writeBookingDraft} from '@/lib/booking/checkout-draft';
import {useRouter} from '@/i18n/navigation';
import {
  BookingApiError,
  fetchCaptcha,
  fetchStations,
  searchSchedules,
  type CaptchaChallenge,
  type ScheduleSearchResult,
  type SeatPreference,
  type Station,
  type TicketCounts,
  type TicketType
} from '@/lib/supabase/booking';

const ticketTypes: TicketType[] = ['adult', 'child', 'disabled', 'senior', 'student'];
const tripTypes = ['oneWay', 'roundTrip'] as const;
const countOptions = Array.from({length: 11}, (_, index) => index);
const timeOptions = [
  '00:00',
  '00:30',
  ...Array.from({length: 38}, (_, index) => {
    const hour = 5 + Math.floor(index / 2);
    return `${String(hour).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`;
  })
];

type TripType = (typeof tripTypes)[number];
type SearchMode = 'time' | 'train';

const initialTicketCounts: TicketCounts = {
  adult: 1,
  child: 0,
  disabled: 0,
  senior: 0,
  student: 0
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function BookingForm() {
  const t = useTranslations('Booking');
  const locale = useLocale();
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState('');
  const [tripType, setTripType] = useState<TripType>('oneWay');
  const [searchMode, setSearchMode] = useState<SearchMode>('time');
  const [origin, setOrigin] = useState<number | ''>('');
  const [destination, setDestination] = useState<number | ''>('');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [trainNumber, setTrainNumber] = useState('');
  const [returnTrainNumber, setReturnTrainNumber] = useState('');
  const [cabin, setCabin] = useState('standard');
  const [seatPreference, setSeatPreference] = useState<SeatPreference>('none');
  const [ticketCounts, setTicketCounts] = useState<TicketCounts>(initialTicketCounts);
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [captchaError, setCaptchaError] = useState('');
  const dateRange = useMemo(() => {
    const today = new Date();
    const lastBookableDay = new Date(today);
    lastBookableDay.setDate(today.getDate() + 28);
    return {min: toInputDate(today), max: toInputDate(lastBookableDay)};
  }, []);
  const [announcement, setAnnouncement] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [outboundResults, setOutboundResults] = useState<ScheduleSearchResult[]>([]);
  const [returnResults, setReturnResults] = useState<ScheduleSearchResult[]>([]);
  const [selectedOutboundId, setSelectedOutboundId] = useState<number | null>(null);
  const [selectedReturnId, setSelectedReturnId] = useState<number | null>(null);
  const [captchaSecondsRemaining, setCaptchaSecondsRemaining] = useState(0);

  const refreshCaptcha = useCallback(async (announce = true) => {
    setCaptchaLoading(true);
    setCaptchaError('');
    setCaptchaInput('');
    try {
      setCaptchaChallenge(await fetchCaptcha(true));
      if (announce) setAnnouncement(t('captcha.refreshed'));
    } catch {
      setCaptchaChallenge(null);
      setCaptchaSecondsRemaining(0);
      setCaptchaError(t('errors.captchaLoad'));
      setAnnouncement(t('errors.captchaLoad'));
    } finally {
      setCaptchaLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    fetchStations()
      .then((data) => {
        if (cancelled) return;
        setStations(data);
        setStationsError('');
      })
      .catch(() => {
        if (cancelled) return;
        setStationsError(t('errors.stationLoad'));
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!captchaChallenge) return;

    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((Date.parse(captchaChallenge.expiresAt) - Date.now()) / 1000));
      setCaptchaSecondsRemaining(seconds);
      if (seconds === 0 && !captchaLoading && !isSearching) {
        void refreshCaptcha(false);
      }
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [captchaChallenge, captchaLoading, isSearching, refreshCaptcha]);

  useEffect(() => {
    let cancelled = false;
    fetchCaptcha()
      .then((challenge) => {
        if (!cancelled) {
          setCaptchaChallenge(challenge);
          setCaptchaError('');
        }
      })
      .catch(() => {
        if (!cancelled) setCaptchaError(t('errors.captchaLoad'));
      })
      .finally(() => {
        if (!cancelled) setCaptchaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const totalTickets = useMemo(
    () => Object.values(ticketCounts).reduce((total, count) => total + count, 0),
    [ticketCounts]
  );
  const originStation = stations.find((station) => station.station_id === origin);
  const destinationStation = stations.find((station) => station.station_id === destination);

  const stationsAreEqual = Boolean(origin && destination && origin === destination);
  const departureDateIsInvalid = Boolean(
    departureDate &&
    (departureDate < dateRange.min || departureDate > dateRange.max)
  );
  const returnDateIsInvalid = Boolean(
    tripType === 'roundTrip' &&
    returnDate &&
    (returnDate < (departureDate || dateRange.min) || returnDate > dateRange.max)
  );
  const captchaIsComplete = captchaInput.length === 6 && Boolean(captchaChallenge);
  const departureScheduleIsComplete =
    Boolean(departureDate) &&
    (searchMode === 'time' ? Boolean(departureTime) : Boolean(trainNumber.trim()));
  const returnScheduleIsComplete =
    tripType === 'oneWay' ||
    (Boolean(returnDate) &&
      (searchMode === 'time' ? Boolean(returnTime) : Boolean(returnTrainNumber.trim())));
  const formIsValid = Boolean(
    origin &&
      destination &&
      !stationsAreEqual &&
      departureScheduleIsComplete &&
      returnScheduleIsComplete &&
      !departureDateIsInvalid &&
      !returnDateIsInvalid &&
      totalTickets > 0 &&
      totalTickets <= (tripType === 'roundTrip' ? 5 : 10) &&
      captchaIsComplete &&
      !captchaLoading &&
      !captchaError &&
      !stationsLoading &&
      !stationsError &&
      !isSearching
  );

  const maxTickets = tripType === 'roundTrip' ? 5 : 10;
  const ticketLimitExceeded = totalTickets > maxTickets;

  function changeTripType(nextTripType: TripType) {
    setTripType(nextTripType);
    setSubmitted(false);
    if (nextTripType === 'oneWay') {
      setReturnDate('');
      setReturnTime('');
      setReturnTrainNumber('');
    }
  }

  function changeTicketCount(type: TicketType, value: number) {
    setTicketCounts((current) => ({...current, [type]: value}));
    setSubmitted(false);
  }

  function swapStations() {
    setOrigin(destination);
    setDestination(origin);
    setSubmitted(false);
  }

  function stationName(station: Station) {
    return locale === 'en' ? station.station_name_en : station.station_name;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formIsValid || !origin || !destination || !captchaChallenge) return;

    if (Date.parse(captchaChallenge.expiresAt) <= Date.now() + 1000) {
      const message = t('errors.captchaExpired');
      setSearchError(message);
      setAnnouncement(message);
      await refreshCaptcha(false);
      return;
    }

    setIsSearching(true);
    setSubmitted(false);
    setSearchError('');

    const commonInput = {
      searchMode,
      seatType: cabin === 'business' ? 'BUSINESS' as const : 'STANDARD' as const,
      seatPreference,
      ticketCounts
    };

    try {
      const journeys = [
        {
          ...commonInput,
          originStationId: origin,
          destinationStationId: destination,
          serviceDate: departureDate,
          departureTime,
          trainNumber
        },
        ...(tripType === 'roundTrip'
          ? [{
              ...commonInput,
              originStationId: destination,
              destinationStationId: origin,
              serviceDate: returnDate,
              departureTime: returnTime,
              trainNumber: returnTrainNumber
            }]
          : [])
      ];
      const [nextOutboundResults, nextReturnResults = []] = await searchSchedules({
        captcha: {challengeId: captchaChallenge.challengeId, answer: captchaInput},
        journeys
      });

      setOutboundResults(nextOutboundResults);
      setReturnResults(nextReturnResults);
      setSelectedOutboundId(null);
      setSelectedReturnId(null);
      setSubmitted(true);
      setAnnouncement(
        t('result.loaded', {
          outbound: nextOutboundResults.length,
          inbound: nextReturnResults.length
        })
      );
    } catch (error) {
      setOutboundResults([]);
      setReturnResults([]);
      setSelectedOutboundId(null);
      setSelectedReturnId(null);
      const message = error instanceof BookingApiError && error.code === 'CAPTCHA_EXPIRED'
        ? t('errors.captchaExpired')
        : error instanceof BookingApiError && error.code.startsWith('CAPTCHA_')
          ? t('errors.captchaInvalid')
          : t('errors.searchFailed');
      setSearchError(message);
      setAnnouncement(message);
    } finally {
      setIsSearching(false);
      void refreshCaptcha(false);
    }
  }

  function continueToCheckout() {
    if (!originStation || !destinationStation) return;
    const selectedOutbound = outboundResults.find((result) => result.scheduleId === selectedOutboundId);
    const selectedReturn = returnResults.find((result) => result.scheduleId === selectedReturnId);
    if (!selectedOutbound || (tripType === 'roundTrip' && !selectedReturn)) return;

    const toDraftJourney = (
      result: ScheduleSearchResult,
      originName: string,
      destinationName: string
    ) => ({
      ...result,
      originName,
      destinationName,
      seatType: cabin === 'business' ? 'BUSINESS' as const : 'STANDARD' as const,
      seatPreference
    });

    writeBookingDraft({
      createdAt: new Date().toISOString(),
      ticketCounts,
      journeys: [
        toDraftJourney(selectedOutbound, stationName(originStation), stationName(destinationStation)),
        ...(selectedReturn
          ? [toDraftJourney(selectedReturn, stationName(destinationStation), stationName(originStation))]
          : [])
      ]
    });
    router.push('/booking/checkout');
  }

  return (
    <main id="booking" className="bg-thsr-background pb-14 sm:pb-20">
      <section className="booking-hero overflow-hidden">
        <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-14 lg:px-5 lg:pb-28">
          <div className="flex flex-col gap-2 text-white sm:flex-row sm:items-end sm:gap-5">
            <h1 className="text-[30px] font-bold tracking-[0.04em] sm:text-[38px]">
              {t('title')}
            </h1>
            <p className="pb-1 text-base font-light tracking-[0.16em] text-white/90 sm:text-xl">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-[72px] max-w-[1180px] px-4 sm:px-6 lg:px-5">
        <div className="flex" role="tablist" aria-label={t('tripType.label')}>
          {tripTypes.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={tripType === type}
              aria-controls="booking-panel"
              onClick={() => changeTripType(type)}
              className={`min-w-[132px] border-t-4 px-6 py-3 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-w-[152px] ${
                tripType === type
                  ? 'border-thsr-orange bg-white text-thsr-orange'
                  : 'border-transparent bg-[#6e96ab]/85 text-white hover:bg-[#557f95]'
              }`}
            >
              {t(`tripType.${type}`)}
            </button>
          ))}
        </div>

        <form
          id="booking-panel"
          aria-label={t('formLabel')}
          onSubmit={handleSubmit}
          className="bg-white px-5 py-7 shadow-[0_14px_36px_rgba(32,51,61,0.13)] sm:px-8 sm:py-9 lg:px-9"
        >
          <div className="grid gap-4 border-b border-thsr-border pb-6 md:grid-cols-2 lg:grid-cols-[minmax(250px,1.25fr)_minmax(220px,1fr)_minmax(250px,auto)]">
            <Field label={t('cabin.label')} htmlFor="cabin">
              <select
                id="cabin"
                value={cabin}
                onChange={(event) => {
                  setCabin(event.target.value);
                  setSubmitted(false);
                }}
                className="booking-control"
              >
                <option value="standard">{t('cabin.standard')}</option>
                <option value="business">{t('cabin.business')}</option>
              </select>
            </Field>

            <Field label={t('seat.label')} htmlFor="seat-preference">
              <select
                id="seat-preference"
                value={seatPreference}
                onChange={(event) => {
                  setSeatPreference(event.target.value as SeatPreference);
                  setSubmitted(false);
                }}
                className="booking-control"
              >
                <option value="none">{t('seat.none')}</option>
                <option value="window">{t('seat.window')}</option>
                <option value="aisle">{t('seat.aisle')}</option>
              </select>
            </Field>

            <div className="booking-selection-card md:col-span-2 lg:col-span-1">
              <fieldset className="h-full">
                <legend className="text-xs font-medium text-thsr-muted">
                  {t('searchMode.label')}
                </legend>
                <div className="flex min-h-11 items-center gap-6">
                  {(['time', 'train'] as const).map((mode) => (
                    <label key={mode} className="flex min-h-10 cursor-pointer items-center gap-2 text-base font-bold text-thsr-dark">
                      <input
                        type="radio"
                        name="search-mode"
                        value={mode}
                        checked={searchMode === mode}
                        onChange={() => {
                          setSearchMode(mode);
                          setSubmitted(false);
                        }}
                        className="size-4 accent-thsr-orange"
                      />
                      {t(`searchMode.${mode}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          <div className="grid gap-4 border-b border-thsr-border py-6 lg:grid-cols-[1fr_52px_1fr] lg:items-center">
            <Field
              label={t('departureStation')}
              htmlFor="departure-station"
              icon={<MapPin size={20} weight="regular" aria-hidden="true" />}
            >
              <select
                id="departure-station"
                value={origin}
                disabled={stationsLoading || Boolean(stationsError)}
                onChange={(event) => {
                  setOrigin(event.target.value ? Number(event.target.value) : '');
                  setSubmitted(false);
                }}
                className="booking-control"
              >
                <option value="">
                  {stationsLoading ? t('stationsLoading') : t('selectPlaceholder')}
                </option>
                {stations.map((station) => (
                  <option key={station.station_id} value={station.station_id}>
                    {stationName(station)}
                  </option>
                ))}
              </select>
            </Field>

            <button
              type="button"
              onClick={swapStations}
              disabled={!origin && !destination}
              aria-label={t('swapStations')}
              className="mx-auto grid size-12 place-items-center border border-thsr-border bg-white text-thsr-muted transition-colors hover:border-thsr-orange hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:bg-[#fff3ee] disabled:cursor-not-allowed disabled:opacity-40 max-lg:rotate-90"
            >
              <ArrowsLeftRight size={23} aria-hidden="true" />
            </button>

            <Field
              label={t('arrivalStation')}
              htmlFor="arrival-station"
              icon={<MapPin size={20} weight="regular" aria-hidden="true" />}
              error={stationsAreEqual ? t('errors.sameStation') : undefined}
            >
              <select
                id="arrival-station"
                value={destination}
                disabled={stationsLoading || Boolean(stationsError)}
                aria-invalid={stationsAreEqual}
                aria-describedby={stationsAreEqual ? 'station-error' : undefined}
                onChange={(event) => {
                  setDestination(event.target.value ? Number(event.target.value) : '');
                  setSubmitted(false);
                }}
                className="booking-control"
              >
                <option value="">
                  {stationsLoading ? t('stationsLoading') : t('selectPlaceholder')}
                </option>
                {stations.map((station) => (
                  <option key={station.station_id} value={station.station_id}>
                    {stationName(station)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {stationsError && (
            <p role="alert" className="border-b border-thsr-border py-3 text-sm font-medium text-[#b54724]">
              {stationsError}
            </p>
          )}

          <div className={`grid gap-4 border-b border-thsr-border py-6 ${tripType === 'roundTrip' ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
            <Field
              label={t('departureDate')}
              htmlFor="departure-date"
              icon={<CalendarBlank size={20} aria-hidden="true" />}
              error={departureDateIsInvalid ? t('errors.dateOutOfRange') : undefined}
            >
              <input
                id="departure-date"
                type="date"
                min={dateRange.min}
                max={dateRange.max}
                value={departureDate}
                aria-invalid={departureDateIsInvalid}
                aria-describedby={departureDateIsInvalid ? 'departure-date-error' : undefined}
                onChange={(event) => {
                  setDepartureDate(event.target.value);
                  setSubmitted(false);
                }}
                className="booking-control"
              />
            </Field>

            {searchMode === 'time' ? (
              <Field
                label={t('departureTime')}
                htmlFor="departure-time"
                icon={<Clock size={20} aria-hidden="true" />}
              >
                <select
                  id="departure-time"
                  value={departureTime}
                  onChange={(event) => {
                    setDepartureTime(event.target.value);
                    setSubmitted(false);
                  }}
                  className="booking-control"
                >
                  <option value="">{t('selectPlaceholder')}</option>
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field
                label={t('trainNumber')}
                htmlFor="train-number"
                icon={<Train size={20} aria-hidden="true" />}
              >
                <input
                  id="train-number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={trainNumber}
                  placeholder={t('trainNumberPlaceholder')}
                  onChange={(event) => {
                    setTrainNumber(event.target.value.replace(/\D/g, ''));
                    setSubmitted(false);
                  }}
                  className="booking-control"
                />
              </Field>
            )}

            {tripType === 'roundTrip' && (
              <>
                <Field
                  label={t('returnDate')}
                  htmlFor="return-date"
                  icon={<CalendarBlank size={20} aria-hidden="true" />}
                  error={returnDateIsInvalid ? t('errors.returnBeforeDeparture') : undefined}
                >
                  <input
                    id="return-date"
                    type="date"
                    min={departureDate || dateRange.min}
                    max={dateRange.max}
                    value={returnDate}
                    aria-invalid={returnDateIsInvalid}
                    onChange={(event) => {
                      setReturnDate(event.target.value);
                      setSubmitted(false);
                    }}
                    className="booking-control"
                  />
                </Field>

                {searchMode === 'time' ? (
                  <Field
                    label={t('returnTime')}
                    htmlFor="return-time"
                    icon={<Clock size={20} aria-hidden="true" />}
                  >
                    <select
                      id="return-time"
                      value={returnTime}
                      onChange={(event) => {
                        setReturnTime(event.target.value);
                        setSubmitted(false);
                      }}
                      className="booking-control"
                    >
                      <option value="">{t('selectPlaceholder')}</option>
                      {timeOptions.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field
                    label={t('returnTrainNumber')}
                    htmlFor="return-train-number"
                    icon={<Train size={20} aria-hidden="true" />}
                  >
                    <input
                      id="return-train-number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={returnTrainNumber}
                      placeholder={t('trainNumberPlaceholder')}
                      onChange={(event) => {
                        setReturnTrainNumber(event.target.value.replace(/\D/g, ''));
                        setSubmitted(false);
                      }}
                      className="booking-control"
                    />
                  </Field>
                )}
              </>
            )}
          </div>

          <fieldset className="border-b border-thsr-border py-6">
            <legend className="flex items-center gap-2 text-base font-medium text-thsr-dark">
              <Users size={21} className="text-thsr-orange" aria-hidden="true" />
              {t('tickets.legend')}
            </legend>
            <p className="mt-1 text-xs leading-5 text-thsr-muted">
              {t('tickets.limit', {count: maxTickets})}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ticketTypes.map((type) => (
                <Field key={type} label={t(`tickets.${type}`)} htmlFor={`ticket-${type}`}>
                  <select
                    id={`ticket-${type}`}
                    value={ticketCounts[type]}
                    onChange={(event) => changeTicketCount(type, Number(event.target.value))}
                    className="booking-control"
                  >
                    {countOptions.map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="mt-3 flex min-h-5 items-center justify-between gap-4 text-xs">
              <span className="text-thsr-muted">{t('tickets.total', {count: totalTickets})}</span>
              {ticketLimitExceeded && (
                <span role="alert" className="font-medium text-[#b54724]">
                  {t('errors.ticketLimit', {count: maxTickets})}
                </span>
              )}
            </div>
          </fieldset>

          <div className="grid gap-6 pt-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label htmlFor="captcha-input" className="mb-2 block text-sm font-medium text-thsr-text">
                {t('captcha.label')}
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="grid h-[68px] w-[228px] place-items-center border border-thsr-border bg-[#eeeee9]">
                  {captchaChallenge ? (
                    // The API returns path-based SVG pixels; the answer is not present as text or metadata.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={captchaChallenge.imageDataUrl}
                      alt={t('captcha.imageLabel')}
                      width={228}
                      height={68}
                      className="h-[68px] w-[228px]"
                    />
                  ) : (
                    <span className="text-xs text-thsr-muted">
                      {captchaLoading ? t('captcha.loading') : t('captcha.unavailable')}
                    </span>
                  )}
                </div>
                <input
                  id="captcha-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[2-9]*"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={6}
                  value={captchaInput}
                  aria-describedby="captcha-help"
                  onChange={(event) => {
                    setCaptchaInput(event.target.value.replace(/[^2-9]/g, ''));
                    setSubmitted(false);
                  }}
                  className="h-[58px] w-[156px] border border-thsr-border bg-white px-4 text-center text-lg font-bold tracking-[0.2em] text-thsr-dark outline-none transition-colors focus:border-thsr-orange focus:ring-1 focus:ring-thsr-orange"
                />
                <button
                  type="button"
                  onClick={() => void refreshCaptcha()}
                  disabled={captchaLoading}
                  aria-label={t('captcha.refresh')}
                  className="grid size-11 place-items-center text-thsr-text transition-colors hover:text-thsr-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:rotate-12 disabled:cursor-wait disabled:opacity-40"
                >
                  <ArrowsClockwise size={23} aria-hidden="true" />
                </button>
              </div>
              <p id="captcha-help" className="mt-2 text-xs text-thsr-muted">
                {captchaError || (
                  captchaSecondsRemaining > 0
                    ? t('captcha.helpWithTime', {seconds: captchaSecondsRemaining})
                    : t('captcha.help')
                )}
              </p>
            </div>

            <button
              type="submit"
              disabled={!formIsValid}
              className="flex h-14 w-full items-center justify-center gap-2 bg-thsr-orange px-12 text-base font-bold tracking-[0.08em] text-white transition-colors hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:bg-thsr-orange-active disabled:cursor-not-allowed disabled:bg-[#b8b8b8] disabled:text-white/90 lg:w-[290px]"
            >
              <MagnifyingGlass size={21} weight="bold" aria-hidden="true" />
              {isSearching ? t('searching') : t('search')}
            </button>
          </div>

          <div aria-live="polite" className="mt-5 min-h-6">
            {searchError && (
              <p role="alert" className="border-l-4 border-[#b54724] bg-[#fff4ef] px-4 py-3 text-sm text-[#8a341d]">
                {searchError}
              </p>
            )}
            {submitted && originStation && destinationStation && (
              <div className="space-y-7 border-t border-thsr-border pt-7">
                <JourneyResults
                  title={t('result.outbound')}
                  originName={stationName(originStation)}
                  destinationName={stationName(destinationStation)}
                  results={outboundResults}
                  ticketCounts={ticketCounts}
                  locale={locale}
                  selectedScheduleId={selectedOutboundId}
                  onSelect={setSelectedOutboundId}
                />
                {tripType === 'roundTrip' && (
                  <JourneyResults
                    title={t('result.return')}
                    originName={stationName(destinationStation)}
                    destinationName={stationName(originStation)}
                    results={returnResults}
                    ticketCounts={ticketCounts}
                    locale={locale}
                    selectedScheduleId={selectedReturnId}
                    onSelect={setSelectedReturnId}
                  />
                )}
                <div className="grid gap-4 border border-thsr-border bg-[#fafaf8] p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex items-start gap-3">
                    <Ticket size={25} className="mt-0.5 shrink-0 text-thsr-orange" aria-hidden="true" />
                    <div>
                      <p className="font-bold text-thsr-dark">{t('result.selectionTitle')}</p>
                      <p className="mt-1 text-sm leading-6 text-thsr-muted">
                        {selectedOutboundId && (tripType === 'oneWay' || selectedReturnId)
                          ? t('result.selectionReady')
                          : t(tripType === 'roundTrip' ? 'result.selectBoth' : 'result.selectOutbound')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedOutboundId || (tripType === 'roundTrip' && !selectedReturnId)}
                    onClick={continueToCheckout}
                    className="flex h-12 w-full items-center justify-center gap-2 bg-thsr-orange px-7 font-bold text-white transition-colors hover:bg-thsr-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#b8b8b8] sm:w-auto"
                  >
                    <CheckCircle size={20} weight="bold" aria-hidden="true" />
                    {t('result.continueBooking')}
                  </button>
                </div>
              </div>
            )}
            <span className="sr-only">{announcement}</span>
          </div>
        </form>
      </div>

      <section className="mx-auto mt-8 max-w-[1180px] px-4 sm:px-6 lg:px-5" aria-labelledby="booking-notice-title">
        <div className="border border-thsr-border bg-white px-5 py-6 sm:px-8">
          <h2 id="booking-notice-title" className="border-l-4 border-thsr-orange pl-3 text-lg font-bold text-thsr-dark">
            {t('notices.title')}
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-thsr-text marker:font-bold marker:text-thsr-orange">
            <li>{t('notices.bookingWindow')}</li>
            <li>{t('notices.ticketLimit')}</li>
            <li>{t('notices.payment')}</li>
          </ol>
        </div>
      </section>
    </main>
  );
}

type JourneyResultsProps = {
  title: string;
  originName: string;
  destinationName: string;
  results: ScheduleSearchResult[];
  ticketCounts: TicketCounts;
  locale: string;
  selectedScheduleId: number | null;
  onSelect: (scheduleId: number) => void;
};

function JourneyResults({
  title,
  originName,
  destinationName,
  results,
  ticketCounts,
  locale,
  selectedScheduleId,
  onSelect
}: JourneyResultsProps) {
  const t = useTranslations('Booking');
  const dateTimeFormatter = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei'
  });
  const currencyFormatter = new Intl.NumberFormat(locale === 'zh' ? 'zh-TW' : 'en-US', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  });

  return (
    <section aria-label={title}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-thsr-orange">{title}</p>
          <h2 className="mt-1 text-lg font-bold text-thsr-dark">
            {originName} <span aria-hidden="true">→</span> {destinationName}
          </h2>
        </div>
        <p className="text-sm text-thsr-muted">{t('result.count', {count: results.length})}</p>
      </div>

      {results.length === 0 ? (
        <p className="border border-thsr-border bg-[#fafaf8] px-4 py-5 text-sm text-thsr-muted">
          {t('result.noResults')}
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((result) => (
            <article
              key={result.scheduleId}
              className={`grid gap-4 border p-4 transition-colors sm:grid-cols-[100px_1fr_auto] sm:items-center sm:p-5 ${
                selectedScheduleId === result.scheduleId
                  ? 'border-thsr-orange bg-[#fff7f3]'
                  : 'border-thsr-border bg-[#fafaf8]'
              }`}
            >
              <div>
                <p className="text-xs text-thsr-muted">{t('result.train')}</p>
                <p className="mt-1 text-xl font-bold text-thsr-orange">{result.trainNumber}</p>
              </div>

              <div>
                <div className="flex items-center gap-3 text-thsr-dark">
                  <time className="text-xl font-bold" dateTime={result.departureAt}>
                    {dateTimeFormatter.format(new Date(result.departureAt))}
                  </time>
                  <span className="h-px flex-1 bg-thsr-border" aria-hidden="true" />
                  <span className="text-xs text-thsr-muted">
                    {t('result.duration', {minutes: result.durationMinutes})}
                  </span>
                  <span className="h-px flex-1 bg-thsr-border" aria-hidden="true" />
                  <time className="text-xl font-bold" dateTime={result.arrivalAt}>
                    {dateTimeFormatter.format(new Date(result.arrivalAt))}
                  </time>
                </div>
                <div className="mt-2 flex justify-between text-xs text-thsr-muted">
                  <span>{originName}</span>
                  <span>{destinationName}</span>
                </div>
                <p className="mt-3 text-xs text-thsr-muted">
                  {t('result.matchingSeats', {count: result.matchingSeatCount})}
                </p>
              </div>

              <div className="border-t border-thsr-border pt-3 text-left sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-right">
                <p className="text-xs text-thsr-muted">{t('result.estimatedTotal')}</p>
                <p className="mt-1 text-xl font-bold text-thsr-dark">
                  {currencyFormatter.format(result.totalFare)}
                </p>
                <div className="mt-2 space-y-0.5 text-xs text-thsr-muted">
                  {(Object.entries(ticketCounts) as [TicketType, number][])
                    .filter(([, count]) => count > 0)
                    .map(([ticketType, count]) => (
                      <p key={ticketType}>
                        {t(`tickets.${ticketType}`)} × {count}: {' '}
                        {currencyFormatter.format((result.fareByTicketType[ticketType] ?? 0) * count)}
                      </p>
                    ))}
                </div>
                <button
                  type="button"
                  aria-pressed={selectedScheduleId === result.scheduleId}
                  onClick={() => onSelect(result.scheduleId)}
                  className={`mt-4 min-h-11 w-full px-5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thsr-orange active:translate-y-px ${
                    selectedScheduleId === result.scheduleId
                      ? 'border border-thsr-orange bg-white text-thsr-orange'
                      : 'bg-thsr-orange text-white hover:bg-thsr-orange-hover'
                  }`}
                >
                  {selectedScheduleId === result.scheduleId
                    ? t('result.selected')
                    : t('result.selectTrain')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type FieldProps = {
  label: string;
  htmlFor: string;
  icon?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
};

function Field({label, htmlFor, icon, error, children}: FieldProps) {
  return (
    <div>
      <div className="booking-selection-card" data-invalid={error ? 'true' : undefined}>
        <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-thsr-muted">
          {icon && <span className="text-thsr-orange">{icon}</span>}
          {label}
        </label>
        {children}
      </div>
      {error && (
        <p id={htmlFor === 'arrival-station' ? 'station-error' : `${htmlFor}-error`} role="alert" className="mt-1.5 text-xs font-medium text-[#b54724]">
          {error}
        </p>
      )}
    </div>
  );
}
