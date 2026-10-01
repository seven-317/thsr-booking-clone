export type TicketType = 'adult' | 'child' | 'disabled' | 'senior' | 'student';
export type SeatPreference = 'none' | 'window' | 'aisle';
export type SeatType = 'STANDARD' | 'BUSINESS';

export type Station = {
  station_id: number;
  station_code: string;
  station_name: string;
  station_name_en: string;
  city: string;
  station_order: number;
};

export type TicketCounts = Record<TicketType, number>;

export type ScheduleSearchInput = {
  originStationId: number;
  destinationStationId: number;
  serviceDate: string;
  searchMode: 'time' | 'train';
  departureTime?: string;
  trainNumber?: string;
  seatType: SeatType;
  seatPreference: SeatPreference;
  ticketCounts: TicketCounts;
};

export type ScheduleSearchResult = {
  scheduleId: number;
  trainNumber: string;
  trainType: string;
  originStopId: number;
  destinationStopId: number;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  matchingSeatCount: number;
  fareByTicketType: Partial<Record<TicketType, number>>;
  totalFare: number;
};

export type CaptchaChallenge = {
  challengeId: string;
  imageDataUrl: string;
  expiresAt: string;
};

export type PassengerType = 'ADULT' | 'CHILD' | 'SENIOR' | 'DISABLED';

export type Passenger = {
  passengerId: number;
  name: string;
  idNumberMasked: string;
  passengerType: PassengerType;
  studentVerifiedUntil: string | null;
};

export type BookingJourneyDraft = ScheduleSearchResult & {
  originName: string;
  destinationName: string;
  seatType: SeatType;
  seatPreference: SeatPreference;
};

export type BookingDraft = {
  createdAt: string;
  journeys: BookingJourneyDraft[];
  ticketCounts: TicketCounts;
};

export type BookingResponse = {
  bookingId: number;
  bookingNumber: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  totalAmount: number;
  paymentStatus?: string | null;
  paidAt?: string | null;
  replayed: boolean;
  items: Array<{
    bookingItemId: number;
    passengerId: number;
    scheduleId: number;
    trainNumber: string;
    fareType: string;
    fareAmount: number;
    seatId: number;
    carriageNumber: number;
    seatNumber: string;
    seatType: string;
    seatPosition: string;
    ticketNumber?: string | null;
    ticketStatus?: string | null;
  }>;
};

export type AuthSession = {
  authenticated: boolean;
  user: {id: string; email: string; name: string | null} | null;
};

export type BookingSummary = {
  bookingNumber: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  createdAt: string;
  expiresAt: string;
  totalAmount: number;
  itemCount: number;
  journeys: Array<{
    scheduleId: number;
    trainNumber: string;
    originName: string;
    destinationName: string;
    departureAt: string;
    arrivalAt: string;
  }>;
};

export type DemoPaymentInput = {
  cardNumber: string;
  expiry: string;
  securityCode: string;
  cardholderName: string;
};

export class BookingApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'BookingApiError';
  }
}

let pendingCaptchaRequest: Promise<CaptchaChallenge> | null = null;

async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null) as
    | {error?: {code?: string; message?: string}}
    | T
    | null;

  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new BookingApiError(
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? 'The request could not be completed.',
      response.status
    );
  }
  return payload as T;
}

export async function fetchStations() {
  const payload = await apiFetch<{stations: Station[]}>('/api/stations');
  return payload.stations;
}

export function fetchCaptcha(force = false) {
  if (!force && pendingCaptchaRequest) return pendingCaptchaRequest;

  const request = apiFetch<CaptchaChallenge>('/api/captcha', {cache: 'no-store'});
  if (force) return request;

  pendingCaptchaRequest = request.finally(() => {
    pendingCaptchaRequest = null;
  });
  return pendingCaptchaRequest;
}

export async function searchSchedules(input: {
  captcha: {challengeId: string; answer: string};
  journeys: ScheduleSearchInput[];
}) {
  const payload = await apiFetch<{journeys: ScheduleSearchResult[][]}>('/api/schedules/search', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input)
  });
  return payload.journeys;
}

export function signIn(input: {email: string; password: string}) {
  return apiFetch<{user: {id: string; email?: string}}>('/api/auth/sign-in', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input)
  });
}

export function signUp(input: {name: string; email: string; password: string}) {
  return apiFetch<{
    authenticated: boolean;
    requiresEmailConfirmation: boolean;
    user: {id: string; email?: string};
  }>('/api/auth/sign-up', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input)
  });
}

export function fetchAuthSession() {
  return apiFetch<AuthSession>('/api/auth/session', {cache: 'no-store'});
}

export async function signOut() {
  await apiFetch<null>('/api/auth/sign-out', {method: 'POST'});
}

export async function fetchPassengers() {
  const payload = await apiFetch<{passengers: Passenger[]}>('/api/passengers', {cache: 'no-store'});
  return payload.passengers;
}

export function createPassenger(input: {
  name: string;
  idNumber: string;
  passengerType: PassengerType;
}) {
  return apiFetch<Passenger>('/api/passengers', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input)
  });
}

export function createBooking(input: {
  idempotencyKey: string;
  journeys: Array<{
    scheduleId: number;
    originStopId: number;
    destinationStopId: number;
    seatType: SeatType;
    seatPreference: SeatPreference;
  }>;
  tickets: Array<{passengerId: number; ticketType: TicketType}>;
}) {
  return apiFetch<BookingResponse>('/api/bookings', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input)
  });
}

export async function fetchBookings() {
  const payload = await apiFetch<{bookings: BookingSummary[]}>('/api/bookings', {cache: 'no-store'});
  return payload.bookings;
}

export function fetchBooking(bookingNumber: string) {
  return apiFetch<BookingResponse>(`/api/bookings/${encodeURIComponent(bookingNumber)}`, {cache: 'no-store'});
}

export function completeDemoPayment(bookingNumber: string, input: DemoPaymentInput) {
  return apiFetch<BookingResponse>(`/api/bookings/${encodeURIComponent(bookingNumber)}/payment`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input)
  });
}

export function cancelBooking(bookingNumber: string) {
  return apiFetch<BookingResponse>(`/api/bookings/${encodeURIComponent(bookingNumber)}`, {
    method: 'DELETE'
  });
}
