-- ============================================================================
-- Member booking history and clearly-labelled demo payment flow.
-- Run after 006_auth_and_passenger_checkout.sql.
-- ============================================================================

BEGIN;

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.build_booking_response(
    p_booking_id bigint,
    p_replayed boolean DEFAULT false
)
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
        'paymentStatus', (
            SELECT p.payment_status
              FROM public.payments AS p
             WHERE p.booking_id = b.booking_id
             ORDER BY p.created_at DESC, p.payment_id DESC
             LIMIT 1
        ),
        'paidAt', (
            SELECT p.paid_at
              FROM public.payments AS p
             WHERE p.booking_id = b.booking_id
               AND p.payment_status = 'PAID'
             ORDER BY p.paid_at DESC
             LIMIT 1
        ),
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
                    'seatPosition', s.seat_position,
                    'ticketNumber', tk.ticket_number,
                    'ticketStatus', tk.status
                ) ORDER BY bi.booking_item_id
            ) FILTER (WHERE bi.booking_item_id IS NOT NULL),
            '[]'::jsonb
        )
    )
      FROM public.bookings AS b
      LEFT JOIN public.booking_items AS bi ON bi.booking_id = b.booking_id
      LEFT JOIN public.seats AS s ON s.seat_id = bi.seat_id
      LEFT JOIN public.train_stops AS os ON os.stop_id = bi.origin_stop_id
      LEFT JOIN public.train_schedules AS ts ON ts.schedule_id = os.schedule_id
      LEFT JOIN public.trains AS tr ON tr.train_id = ts.train_id
      LEFT JOIN public.tickets AS tk ON tk.booking_item_id = bi.booking_item_id
     WHERE b.booking_id = p_booking_id
     GROUP BY b.booking_id;
$$;

CREATE OR REPLACE FUNCTION public.list_my_bookings()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_member_id bigint;
    v_result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT member_id INTO v_member_id
      FROM public.members
     WHERE auth_user_id = auth.uid();
    IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'MEMBER_PROFILE_REQUIRED';
    END IF;

    UPDATE public.bookings
       SET booking_status = 'CANCELLED'
     WHERE member_id = v_member_id
       AND booking_status = 'PENDING'
       AND expires_at <= now();

    DELETE FROM public.seat_segment_reservations AS ssr
     USING public.booking_items AS bi, public.bookings AS b
     WHERE ssr.booking_item_id = bi.booking_item_id
       AND bi.booking_id = b.booking_id
       AND b.member_id = v_member_id
       AND b.booking_status = 'CANCELLED'
       AND b.expires_at <= now();

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'bookingNumber', b.booking_number,
                'status', b.booking_status,
                'createdAt', b.created_at,
                'expiresAt', b.expires_at,
                'totalAmount', (
                    SELECT COALESCE(SUM(bi.fare_amount), 0)
                      FROM public.booking_items AS bi
                     WHERE bi.booking_id = b.booking_id
                ),
                'itemCount', (
                    SELECT COUNT(*)
                      FROM public.booking_items AS bi
                     WHERE bi.booking_id = b.booking_id
                ),
                'journeys', (
                    SELECT COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'scheduleId', j.schedule_id,
                                'trainNumber', j.train_number,
                                'originName', j.origin_name,
                                'destinationName', j.destination_name,
                                'departureAt', j.departure_at,
                                'arrivalAt', j.arrival_at
                            ) ORDER BY j.departure_at
                        ),
                        '[]'::jsonb
                    )
                      FROM (
                          SELECT DISTINCT
                              os.schedule_id,
                              tr.train_number,
                              origin.station_name AS origin_name,
                              destination.station_name AS destination_name,
                              os.departure_at,
                              ds.arrival_at
                            FROM public.booking_items AS bi
                            JOIN public.train_stops AS os ON os.stop_id = bi.origin_stop_id
                            JOIN public.train_stops AS ds ON ds.stop_id = bi.destination_stop_id
                            JOIN public.train_schedules AS ts ON ts.schedule_id = os.schedule_id
                            JOIN public.trains AS tr ON tr.train_id = ts.train_id
                            JOIN public.stations AS origin ON origin.station_id = os.station_id
                            JOIN public.stations AS destination ON destination.station_id = ds.station_id
                           WHERE bi.booking_id = b.booking_id
                      ) AS j
                )
            ) ORDER BY b.created_at DESC, b.booking_id DESC
        ),
        '[]'::jsonb
    ) INTO v_result
      FROM public.bookings AS b
      JOIN public.members AS m ON m.member_id = b.member_id
     WHERE m.auth_user_id = auth.uid();

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_booking(p_booking_number text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_id bigint;
    v_status thsr_booking_status;
    v_expires_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT b.booking_id, b.booking_status, b.expires_at
      INTO v_booking_id, v_status, v_expires_at
      FROM public.bookings AS b
      JOIN public.members AS m ON m.member_id = b.member_id
     WHERE b.booking_number = p_booking_number
       AND m.auth_user_id = auth.uid()
     FOR UPDATE OF b;

    IF v_booking_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_status = 'PENDING' AND v_expires_at <= now() THEN
        DELETE FROM public.seat_segment_reservations AS ssr
         USING public.booking_items AS bi
         WHERE ssr.booking_item_id = bi.booking_item_id
           AND bi.booking_id = v_booking_id;
        UPDATE public.bookings
           SET booking_status = 'CANCELLED'
         WHERE booking_id = v_booking_id;
    END IF;

    RETURN public.build_booking_response(v_booking_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.simulate_booking_payment(
    p_booking_number text,
    p_payment_method text DEFAULT 'CREDIT_CARD'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_id bigint;
    v_status thsr_booking_status;
    v_expires_at timestamptz;
    v_amount numeric(10, 2);
    v_method thsr_payment_method;
    v_transaction_id text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    BEGIN
        v_method := upper(p_payment_method)::thsr_payment_method;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
    END;

    SELECT b.booking_id, b.booking_status, b.expires_at
      INTO v_booking_id, v_status, v_expires_at
      FROM public.bookings AS b
      JOIN public.members AS m ON m.member_id = b.member_id
     WHERE b.booking_number = p_booking_number
       AND m.auth_user_id = auth.uid()
     FOR UPDATE OF b;

    IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND';
    END IF;
    IF v_status = 'CONFIRMED' THEN
        RETURN public.build_booking_response(v_booking_id, true);
    END IF;
    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'BOOKING_CLOSED';
    END IF;

    IF v_expires_at <= now() THEN
        DELETE FROM public.seat_segment_reservations AS ssr
         USING public.booking_items AS bi
         WHERE ssr.booking_item_id = bi.booking_item_id
           AND bi.booking_id = v_booking_id;
        UPDATE public.bookings
           SET booking_status = 'CANCELLED'
         WHERE booking_id = v_booking_id;
        RETURN public.build_booking_response(v_booking_id, false);
    END IF;

    SELECT SUM(fare_amount)
      INTO v_amount
      FROM public.booking_items
     WHERE booking_id = v_booking_id;
    IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
    END IF;

    v_transaction_id := 'DEMO-'
        || to_char(clock_timestamp() AT TIME ZONE 'Asia/Taipei', 'YYYYMMDDHH24MISS')
        || '-'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    INSERT INTO public.payments (
        booking_id,
        amount,
        payment_method,
        payment_status,
        transaction_id,
        paid_at
    ) VALUES (
        v_booking_id,
        v_amount,
        v_method,
        'PAID',
        v_transaction_id,
        now()
    );

    UPDATE public.bookings
       SET booking_status = 'CONFIRMED'
     WHERE booking_id = v_booking_id;

    INSERT INTO public.tickets (booking_item_id, ticket_number, status)
    SELECT
        bi.booking_item_id,
        'TKT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
        'ISSUED'
      FROM public.booking_items AS bi
     WHERE bi.booking_id = v_booking_id
    ON CONFLICT (booking_item_id) DO NOTHING;

    RETURN public.build_booking_response(v_booking_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_bookings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_booking(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.simulate_booking_payment(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_my_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_booking_payment(text, text) TO authenticated;

COMMIT;
