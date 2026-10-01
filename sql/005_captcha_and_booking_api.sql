-- ============================================================================
-- Production-oriented CAPTCHA and atomic booking API support.
-- Run after thsr_booking_supabase.sql and migrations 001-004.
-- ============================================================================

BEGIN;

SET search_path TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CAPTCHA solutions are HMAC digests created by the Next.js server. The raw
-- solution is never persisted and each challenge is bound to a client fingerprint.
CREATE TABLE IF NOT EXISTS captcha_challenges (
    challenge_id       uuid PRIMARY KEY,
    answer_digest      char(64) NOT NULL,
    client_fingerprint char(64) NOT NULL,
    attempts           smallint NOT NULL DEFAULT 0,
    expires_at         timestamptz NOT NULL,
    used_at            timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_captcha_attempts CHECK (attempts BETWEEN 0 AND 5),
    CONSTRAINT ck_captcha_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_captcha_fingerprint_created
    ON captcha_challenges (client_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captcha_expiry
    ON captcha_challenges (expires_at);

ALTER TABLE captcha_challenges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION issue_captcha_challenge(
    p_challenge_id uuid,
    p_answer_digest text,
    p_client_fingerprint text,
    p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF length(p_answer_digest) <> 64 OR length(p_client_fingerprint) <> 64
       OR p_expires_at <= now() OR p_expires_at > now() + interval '10 minutes' THEN
        RAISE EXCEPTION 'CAPTCHA_INVALID_INPUT';
    END IF;

    -- Serialize issuance per fingerprint so concurrent requests cannot bypass the limit.
    PERFORM pg_advisory_xact_lock(hashtextextended('captcha:' || p_client_fingerprint, 0));

    DELETE FROM captcha_challenges
     WHERE expires_at < now() - interval '1 day';

    IF (
        SELECT count(*)
          FROM captcha_challenges
         WHERE client_fingerprint = p_client_fingerprint
           AND created_at >= now() - interval '10 minutes'
    ) >= 30 THEN
        RAISE EXCEPTION 'CAPTCHA_RATE_LIMITED';
    END IF;

    INSERT INTO captcha_challenges (
        challenge_id,
        answer_digest,
        client_fingerprint,
        expires_at
    ) VALUES (
        p_challenge_id,
        p_answer_digest,
        p_client_fingerprint,
        p_expires_at
    );

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION consume_captcha_challenge(
    p_challenge_id uuid,
    p_answer_digest text,
    p_client_fingerprint text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_challenge captcha_challenges%ROWTYPE;
BEGIN
    SELECT *
      INTO v_challenge
      FROM captcha_challenges
     WHERE challenge_id = p_challenge_id
     FOR UPDATE;

    IF NOT FOUND OR v_challenge.client_fingerprint <> p_client_fingerprint THEN
        RETURN 'INVALID';
    END IF;
    IF v_challenge.used_at IS NOT NULL THEN
        RETURN 'INVALID';
    END IF;
    IF v_challenge.expires_at <= now() THEN
        RETURN 'EXPIRED';
    END IF;
    IF v_challenge.attempts >= 5 THEN
        RETURN 'LOCKED';
    END IF;

    IF v_challenge.answer_digest <> p_answer_digest THEN
        UPDATE captcha_challenges
           SET attempts = attempts + 1
         WHERE challenge_id = p_challenge_id;
        IF v_challenge.attempts + 1 >= 5 THEN
            RETURN 'LOCKED';
        END IF;
        RETURN 'INVALID';
    END IF;

    UPDATE captcha_challenges
       SET used_at = now()
     WHERE challenge_id = p_challenge_id;
    RETURN 'VALID';
END;
$$;

REVOKE ALL ON TABLE captcha_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION issue_captcha_challenge(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consume_captcha_challenge(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION issue_captcha_challenge(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION consume_captcha_challenge(uuid, text, text) TO service_role;

-- Link application members to Supabase Auth. Transaction tables remain private;
-- authenticated users can access them only through the ownership-checking RPCs below.
ALTER TABLE members ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_auth_user_id
    ON members (auth_user_id) WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_members_auth_user'
           AND conrelid = 'public.members'::regclass
    ) THEN
        ALTER TABLE members
            ADD CONSTRAINT fk_members_auth_user
            FOREIGN KEY (auth_user_id) REFERENCES auth.users (id)
            ON UPDATE RESTRICT ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS student_verified_until date;
ALTER TABLE bookings ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 minutes');
UPDATE bookings
   SET expires_at = created_at + interval '10 minutes'
 WHERE expires_at IS NULL;
ALTER TABLE bookings ALTER COLUMN expires_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_member_idempotency
    ON bookings (member_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_pending_expiry
    ON bookings (expires_at)
    WHERE booking_status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_booking_items_booking_id
    ON booking_items (booking_id);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_segment_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION build_booking_response(p_booking_id bigint, p_replayed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'bookingId', b.booking_id,
        'bookingNumber', b.booking_number,
        'status', b.booking_status,
        'createdAt', b.created_at,
        'expiresAt', b.expires_at,
        'totalAmount', COALESCE(SUM(bi.fare_amount), 0),
        'replayed', p_replayed,
        'items', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'bookingItemId', bi.booking_item_id,
                    'passengerId', bi.passenger_id,
                    'scheduleId', os.schedule_id,
                    'trainNumber', tr.train_number,
                    'originStopId', bi.origin_stop_id,
                    'destinationStopId', bi.destination_stop_id,
                    'fareType', bi.fare_type,
                    'fareAmount', bi.fare_amount,
                    'seatId', bi.seat_id,
                    'carriageNumber', s.carriage_number,
                    'seatNumber', s.seat_number,
                    'seatType', s.seat_type,
                    'seatPosition', s.seat_position
                ) ORDER BY bi.booking_item_id
            ) FILTER (WHERE bi.booking_item_id IS NOT NULL),
            '[]'::jsonb
        )
    )
      FROM bookings AS b
      LEFT JOIN booking_items AS bi ON bi.booking_id = b.booking_id
      LEFT JOIN seats AS s ON s.seat_id = bi.seat_id
      LEFT JOIN train_stops AS os ON os.stop_id = bi.origin_stop_id
      LEFT JOIN train_schedules AS ts ON ts.schedule_id = os.schedule_id
      LEFT JOIN trains AS tr ON tr.train_id = ts.train_id
     WHERE b.booking_id = p_booking_id
     GROUP BY b.booking_id;
$$;

CREATE OR REPLACE FUNCTION create_booking(
    p_idempotency_key uuid,
    p_journeys jsonb,
    p_tickets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id             uuid := auth.uid();
    v_member_id           bigint;
    v_booking_id          bigint;
    v_booking_number      text;
    v_schedule_id         bigint;
    v_train_id            bigint;
    v_origin_stop_id      bigint;
    v_destination_stop_id bigint;
    v_origin_order        smallint;
    v_destination_order   smallint;
    v_origin_station_id   bigint;
    v_destination_station_id bigint;
    v_departure_at        timestamptz;
    v_seat_type           thsr_seat_type;
    v_seat_preference     text;
    v_seat_id             bigint;
    v_passenger_id        bigint;
    v_passenger_type      thsr_passenger_type;
    v_student_verified_until date;
    v_fare_type           thsr_fare_type;
    v_fare_amount         numeric(10, 2);
    v_journey             jsonb;
    v_ticket              jsonb;
    v_journey_count       integer;
    v_ticket_count        integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
    END IF;
    IF jsonb_typeof(p_journeys) <> 'array' OR jsonb_typeof(p_tickets) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_BOOKING_PAYLOAD';
    END IF;

    v_journey_count := jsonb_array_length(p_journeys);
    v_ticket_count := jsonb_array_length(p_tickets);
    IF v_journey_count NOT BETWEEN 1 AND 2 OR v_ticket_count NOT BETWEEN 1 AND 10
       OR (v_journey_count = 2 AND v_ticket_count > 5) THEN
        RAISE EXCEPTION 'INVALID_BOOKING_LIMITS';
    END IF;
    IF (
        SELECT count(DISTINCT value ->> 'passengerId')
          FROM jsonb_array_elements(p_tickets)
    ) <> v_ticket_count THEN
        RAISE EXCEPTION 'INVALID_DUPLICATE_PASSENGER';
    END IF;
    IF (
        SELECT count(DISTINCT concat_ws(':', value ->> 'scheduleId', value ->> 'originStopId', value ->> 'destinationStopId'))
          FROM jsonb_array_elements(p_journeys)
    ) <> v_journey_count THEN
        RAISE EXCEPTION 'INVALID_DUPLICATE_JOURNEY';
    END IF;

    SELECT member_id INTO v_member_id
      FROM members
     WHERE auth_user_id = v_user_id;
    IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'MEMBER_PROFILE_REQUIRED';
    END IF;

    -- Serialize identical submissions before checking for an existing booking.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0));
    SELECT booking_id INTO v_booking_id
      FROM bookings
     WHERE member_id = v_member_id
       AND idempotency_key = p_idempotency_key;
    IF v_booking_id IS NOT NULL THEN
        RETURN build_booking_response(v_booking_id, true);
    END IF;

    -- Always acquire schedule locks in numeric order to prevent deadlocks between
    -- two-leg bookings and serialize seat allocation for a given service.
    FOR v_schedule_id IN
        SELECT DISTINCT (journey.value ->> 'scheduleId')::bigint
          FROM jsonb_array_elements(p_journeys) AS journey
         ORDER BY 1
    LOOP
        PERFORM pg_advisory_xact_lock(v_schedule_id);
    END LOOP;

    -- Release inventory from unpaid expired holds before evaluating availability.
    UPDATE bookings
       SET booking_status = 'CANCELLED'
     WHERE booking_status = 'PENDING'
       AND expires_at <= now();
    DELETE FROM seat_segment_reservations AS ssr
     USING booking_items AS bi, bookings AS b
     WHERE ssr.booking_item_id = bi.booking_item_id
       AND bi.booking_id = b.booking_id
       AND b.booking_status = 'CANCELLED'
       AND b.expires_at <= now();

    v_booking_number := 'HSR'
        || to_char(clock_timestamp() AT TIME ZONE 'Asia/Taipei', 'YYMMDD')
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

    INSERT INTO bookings (member_id, booking_number, booking_status, idempotency_key, expires_at)
    VALUES (v_member_id, v_booking_number, 'PENDING', p_idempotency_key, now() + interval '10 minutes')
    RETURNING booking_id INTO v_booking_id;

    FOR v_journey IN SELECT value FROM jsonb_array_elements(p_journeys)
    LOOP
        BEGIN
            v_schedule_id := (v_journey ->> 'scheduleId')::bigint;
            v_origin_stop_id := (v_journey ->> 'originStopId')::bigint;
            v_destination_stop_id := (v_journey ->> 'destinationStopId')::bigint;
            v_seat_type := (v_journey ->> 'seatType')::thsr_seat_type;
            v_seat_preference := upper(v_journey ->> 'seatPreference');
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_JOURNEY';
        END;

        IF v_seat_type IS NULL
           OR v_seat_preference IS NULL
           OR v_seat_type NOT IN ('STANDARD', 'BUSINESS')
           OR v_seat_preference NOT IN ('NONE', 'WINDOW', 'AISLE') THEN
            RAISE EXCEPTION 'INVALID_JOURNEY';
        END IF;

        SELECT ts.train_id,
               os.stop_order,
               ds.stop_order,
               os.station_id,
               ds.station_id,
               os.departure_at
          INTO v_train_id,
               v_origin_order,
               v_destination_order,
               v_origin_station_id,
               v_destination_station_id,
               v_departure_at
          FROM train_schedules AS ts
          JOIN train_stops AS os
            ON os.schedule_id = ts.schedule_id AND os.stop_id = v_origin_stop_id
          JOIN train_stops AS ds
            ON ds.schedule_id = ts.schedule_id AND ds.stop_id = v_destination_stop_id
         WHERE ts.schedule_id = v_schedule_id
           AND ts.status = 'SCHEDULED';

        IF NOT FOUND OR v_origin_order >= v_destination_order THEN
            RAISE EXCEPTION 'INVALID_JOURNEY';
        END IF;
        IF v_departure_at < now() + interval '1 hour' THEN
            RAISE EXCEPTION 'BOOKING_WINDOW_CLOSED';
        END IF;
        IF (v_departure_at AT TIME ZONE 'Asia/Taipei')::date
           > (now() AT TIME ZONE 'Asia/Taipei')::date + 28 THEN
            RAISE EXCEPTION 'INVALID_JOURNEY_DATE';
        END IF;

        FOR v_ticket IN SELECT value FROM jsonb_array_elements(p_tickets)
        LOOP
            BEGIN
                v_passenger_id := (v_ticket ->> 'passengerId')::bigint;
                v_fare_type := CASE v_ticket ->> 'ticketType'
                    WHEN 'adult' THEN 'FULL'::thsr_fare_type
                    WHEN 'child' THEN 'CHILD'::thsr_fare_type
                    WHEN 'disabled' THEN 'DISABLED'::thsr_fare_type
                    WHEN 'senior' THEN 'SENIOR'::thsr_fare_type
                    WHEN 'student' THEN 'STUDENT'::thsr_fare_type
                    ELSE NULL
                END;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'INVALID_TICKET';
            END;

            SELECT passenger_type, student_verified_until
              INTO v_passenger_type, v_student_verified_until
              FROM passengers
             WHERE passenger_id = v_passenger_id
               AND member_id = v_member_id;
            IF NOT FOUND OR v_fare_type IS NULL THEN
                RAISE EXCEPTION 'PASSENGER_NOT_OWNED';
            END IF;
            IF (v_fare_type = 'CHILD' AND v_passenger_type <> 'CHILD')
               OR (v_fare_type = 'SENIOR' AND v_passenger_type <> 'SENIOR')
               OR (v_fare_type = 'DISABLED' AND v_passenger_type <> 'DISABLED')
               OR (
                    v_fare_type = 'STUDENT'
                    AND (
                        v_student_verified_until IS NULL
                        OR v_student_verified_until < (now() AT TIME ZONE 'Asia/Taipei')::date
                    )
               ) THEN
                RAISE EXCEPTION 'INVALID_TICKET_ELIGIBILITY';
            END IF;

            SELECT amount INTO v_fare_amount
              FROM fares
             WHERE origin_station_id = v_origin_station_id
               AND destination_station_id = v_destination_station_id
               AND seat_type = v_seat_type
               AND fare_type = v_fare_type;
            IF v_fare_amount IS NULL THEN
                RAISE EXCEPTION 'FARE_NOT_FOUND';
            END IF;

            SELECT s.seat_id INTO v_seat_id
              FROM seats AS s
             WHERE s.train_id = v_train_id
               AND s.seat_type = v_seat_type
               AND NOT EXISTS (
                    SELECT 1
                      FROM seat_segment_reservations AS ssr
                      JOIN schedule_segments AS sg ON sg.segment_id = ssr.segment_id
                      JOIN train_stops AS fs ON fs.stop_id = sg.from_stop_id
                     WHERE ssr.seat_id = s.seat_id
                       AND fs.schedule_id = v_schedule_id
                       AND fs.stop_order >= v_origin_order
                       AND fs.stop_order < v_destination_order
               )
             ORDER BY
                CASE
                    WHEN v_seat_preference = 'NONE' THEN 0
                    WHEN s.seat_position::text = v_seat_preference THEN 0
                    ELSE 1
                END,
                s.carriage_number,
                s.seat_number
             LIMIT 1
             FOR UPDATE OF s SKIP LOCKED;

            IF v_seat_id IS NULL THEN
                RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
            END IF;

            INSERT INTO booking_items (
                booking_id,
                passenger_id,
                seat_id,
                origin_stop_id,
                destination_stop_id,
                fare_type,
                fare_amount
            ) VALUES (
                v_booking_id,
                v_passenger_id,
                v_seat_id,
                v_origin_stop_id,
                v_destination_stop_id,
                v_fare_type,
                v_fare_amount
            );
        END LOOP;
    END LOOP;

    RETURN build_booking_response(v_booking_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION get_booking(p_booking_number text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_id bigint;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
    SELECT b.booking_id INTO v_booking_id
      FROM bookings AS b
      JOIN members AS m ON m.member_id = b.member_id
     WHERE b.booking_number = p_booking_number
       AND m.auth_user_id = auth.uid();
    IF v_booking_id IS NULL THEN RETURN NULL; END IF;
    RETURN build_booking_response(v_booking_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_booking(p_booking_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_id bigint;
    v_status thsr_booking_status;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

    SELECT b.booking_id, b.booking_status
      INTO v_booking_id, v_status
      FROM bookings AS b
      JOIN members AS m ON m.member_id = b.member_id
     WHERE b.booking_number = p_booking_number
       AND m.auth_user_id = auth.uid()
     FOR UPDATE OF b;

    IF v_booking_id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF v_status = 'CANCELLED' THEN RETURN build_booking_response(v_booking_id, true); END IF;
    IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'BOOKING_CLOSED'; END IF;

    DELETE FROM seat_segment_reservations AS ssr
     USING booking_items AS bi
     WHERE ssr.booking_item_id = bi.booking_item_id
       AND bi.booking_id = v_booking_id;
    UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = v_booking_id;

    RETURN build_booking_response(v_booking_id, false);
END;
$$;

REVOKE ALL ON FUNCTION build_booking_response(bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_booking(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_booking(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION cancel_booking(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_booking(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION get_booking(text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(text) TO authenticated;

COMMIT;
