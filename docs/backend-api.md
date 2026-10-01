# Booking backend API

The browser talks only to Next.js App Router route handlers. Supabase service-role credentials remain server-only, CAPTCHA answers are stored only as HMAC digests, and seat allocation is performed in one PostgreSQL transaction.

## Setup

1. Apply the existing schema and migrations, then run `sql/005_captcha_and_booking_api.sql`, `sql/006_auth_and_passenger_checkout.sql`, `sql/007_member_bookings_and_demo_payment.sql`, and `sql/008_member_profile_source_of_truth.sql` in order.
2. Configure the variables shown in `.env.example`. Generate `CAPTCHA_HMAC_SECRET` with at least 32 random characters and never expose it through a `NEXT_PUBLIC_` variable.
3. New Supabase Auth users are linked to a booking member automatically. Existing Auth users are backfilled when migration `006` is applied, and the API can repair a missing profile through the authenticated `ensure_member_profile` RPC.
4. A student fare is accepted only when `passengers.student_verified_until` is today or later. Child, senior, and disabled fares must match `passengers.passenger_type`.

The private member and transaction tables have RLS enabled without direct client policies. Booking access is available only through the authenticated RPC functions used by the route handlers.

## Routes

### `POST /api/auth/sign-up`

Creates a Supabase Auth account, sets the server-managed session cookie, and ensures that a matching booking member exists. The body contains `email`, `password`, and `fullName`. This course-project environment has Supabase email confirmation disabled, so new email and password accounts can sign in immediately. Re-enable confirmation before any production deployment.

### `POST /api/auth/sign-in`

Signs in with `email` and `password`, refreshes the HTTP-only session cookies, and ensures that the booking member profile exists.

### `POST /api/auth/sign-out`

Clears the current Supabase Auth session.

### `GET /api/auth/session`

Returns the current server-verified authentication state and the signed-in member's display name and email. Profile fields come from `public.members`, which is the source of truth for editable member data. Auth metadata is used only to repair a missing profile and does not overwrite an existing member name.

### `GET /api/passengers`

Returns passengers owned by the signed-in member. Direct table access remains blocked by RLS.

### `POST /api/passengers`

Creates a passenger owned by the signed-in member. The body contains `fullName`, `idNumber`, and `passengerType`. Discount eligibility is still revalidated in the booking transaction.

### `GET /api/captcha`

Creates a client-bound, five-minute, one-use challenge. The returned SVG is made from paths and contains no answer text. Issuance is limited to 30 challenges per trusted client fingerprint in ten minutes; the browser deduplicates simultaneous initial requests and refreshes the challenge before expiry.

```json
{
  "challengeId": "3e73854d-f51d-4f1c-88a9-c4c6b1989456",
  "imageDataUrl": "data:image/svg+xml;base64,...",
  "expiresAt": "2026-10-01T04:05:00.000Z"
}
```

### `GET /api/stations`

Returns the ordered station list. The response is publicly cacheable.

### `POST /api/schedules/search`

Consumes one CAPTCHA and searches one or two journeys. Prices and available seats are read by the server; availability excludes seats reserved on any overlapping segment.

```json
{
  "captcha": {
    "challengeId": "3e73854d-f51d-4f1c-88a9-c4c6b1989456",
    "answer": "238579"
  },
  "journeys": [
    {
      "originStationId": 1,
      "destinationStationId": 7,
      "serviceDate": "2026-10-08",
      "searchMode": "time",
      "departureTime": "06:00",
      "seatType": "STANDARD",
      "seatPreference": "window",
      "ticketCounts": {
        "adult": 1,
        "child": 0,
        "disabled": 0,
        "senior": 0,
        "student": 0
      }
    }
  ]
}
```

### `GET /api/bookings`

Returns a compact, newest-first history of bookings owned by the signed-in member. Expired pending holds are atomically cancelled and their seat segments are released before the list is returned.

### `POST /api/bookings`

Requires a Supabase Auth session. The idempotency key must be newly generated for each intended booking and reused for retries of that same booking.

```json
{
  "idempotencyKey": "85d9b120-b18d-4ec2-b1d4-f8f7b97e7a86",
  "journeys": [
    {
      "scheduleId": 101,
      "originStopId": 1201,
      "destinationStopId": 1207,
      "seatType": "STANDARD",
      "seatPreference": "window"
    }
  ],
  "tickets": [
    {"passengerId": 12, "ticketType": "adult"}
  ]
}
```

The database revalidates authentication, member/passenger ownership, booking window, schedule status, stop order, discount eligibility, fare, and inventory. It then locks schedules in a stable order, allocates seats, and reserves every traversed segment atomically. A newly created hold returns `201`; an idempotent replay returns the same booking with `200`. Pending holds expire after ten minutes.

The checkout UI implements authenticated passenger assignment and this atomic seat-hold flow. A pending booking can continue to the course-project payment simulation described below.

### `GET /api/bookings/:bookingNumber`

Returns the signed-in member's booking, including assigned seats, payment state, issued ticket numbers, and the server-calculated total. If a pending hold has expired, the database atomically cancels it and releases its seat segments before returning the response.

### `DELETE /api/bookings/:bookingNumber`

Cancels a pending hold and releases its seat segments. Confirmed or completed bookings cannot be cancelled through this endpoint.

### `POST /api/bookings/:bookingNumber/payment`

Completes the project's clearly labelled demo payment for a valid pending booking. The database locks the booking, verifies ownership and expiry, records an idempotent paid demo transaction, confirms the booking, and issues demo ticket numbers in one transaction. No bank, card network, or real money is involved.

The request must contain the project's fixed test card details. Both the browser and route handler reject any other values, and the interface warns users not to enter a real card.

```json
{
  "cardNumber": "4242 4242 4242 4242",
  "expiry": "12/34",
  "securityCode": "123",
  "cardholderName": "THSR TEST"
}
```

A production deployment must replace this route with a PCI-compliant payment provider, signed webhook verification, idempotent reconciliation, refund handling, and operational monitoring.

## Error contract

All failures use the same shape:

```json
{
  "error": {
    "code": "INVENTORY_UNAVAILABLE",
    "message": "The requested seats are no longer available. Search again for current availability."
  }
}
```

Expected client-handled codes include `CAPTCHA_INVALID`, `CAPTCHA_EXPIRED`, `RATE_LIMITED`, `UNAUTHORIZED`, `PROFILE_REQUIRED`, `INVALID_BOOKING`, `BOOKING_CLOSED`, `INVENTORY_UNAVAILABLE`, and `NOT_FOUND`.

## Operational notes

- Configure the hosting proxy to overwrite `X-Forwarded-For`; the CAPTCHA fingerprint and issuance limit rely on the trusted proxy address.
- Schedule periodic cleanup for expired CAPTCHA rows and pending bookings that are never viewed again. Booking creation, booking history, and booking details also release expired holds before allocating or returning inventory.
- Keep the service-role key only in the server runtime and rotate it immediately if exposed.
- For high-risk public deployment, place a managed accessible bot-protection provider in front of these routes. The included visual challenge intentionally does not expose the answer for browser text-to-speech.
