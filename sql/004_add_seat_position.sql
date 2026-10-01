-- ============================================================================
-- 為座位新增明確的位置屬性，取代應用程式依座號字尾推測位置。
-- 可安全重複執行；現有 A/E、C/D、B 座位會分別回填為靠窗、走道、中間。
-- ============================================================================

BEGIN;

SET search_path TO public;

DO $$
BEGIN
    CREATE TYPE thsr_seat_position AS ENUM (
        'WINDOW', 'AISLE', 'MIDDLE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE seats
    ADD COLUMN IF NOT EXISTS seat_position thsr_seat_position;

UPDATE seats
SET seat_position = CASE right(upper(trim(seat_number)), 1)
    WHEN 'A' THEN 'WINDOW'::thsr_seat_position
    WHEN 'E' THEN 'WINDOW'::thsr_seat_position
    WHEN 'C' THEN 'AISLE'::thsr_seat_position
    WHEN 'D' THEN 'AISLE'::thsr_seat_position
    WHEN 'B' THEN 'MIDDLE'::thsr_seat_position
END
WHERE seat_position IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM seats WHERE seat_position IS NULL) THEN
        RAISE EXCEPTION
            '無法判斷部分座位的位置，請先為這些座位設定 seat_position：%',
            (
                SELECT string_agg(
                    format('train_id=%s carriage=%s seat=%s', train_id, carriage_number, seat_number),
                    ', '
                    ORDER BY train_id, carriage_number, seat_number
                )
                FROM (
                    SELECT train_id, carriage_number, seat_number
                    FROM seats
                    WHERE seat_position IS NULL
                    ORDER BY train_id, carriage_number, seat_number
                    LIMIT 20
                ) AS unresolved_seats
            );
    END IF;
END;
$$;

ALTER TABLE seats
    ALTER COLUMN seat_position SET NOT NULL;

COMMENT ON COLUMN seats.seat_position IS '座位位置：靠窗、走道或中間座位';

CREATE INDEX IF NOT EXISTS idx_seats_train_type_position
    ON seats (train_id, seat_type, seat_position);

COMMIT;
