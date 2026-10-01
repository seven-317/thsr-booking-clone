-- ============================================================================
-- 高鐵訂票系統：可重複執行的示範基礎資料
--
-- 前置條件：
-- 1. 新資料庫先執行 thsr_booking_supabase.sql。
-- 2. 舊資料庫依序執行 001、002、003、004 migration 後再執行本檔。
--
-- 資料範圍：
-- - 12 個高鐵車站。
-- - 4 個示範車次（南下、北上各 2 班）。
-- - 每個車次 50 個座位。
-- - 以台灣當地日期起算的 29 天班次。
-- - 所有起迄站、座位類型與票種的示範票價。
--
-- 注意：車次、時刻與票價都是功能測試用示範資料，不代表官方資訊。
-- ============================================================================

BEGIN;

SET search_path TO public;

-- ----------------------------------------------------------------------------
-- 車站
-- station_code 與前端 i18n key 保持一致。
-- ----------------------------------------------------------------------------

INSERT INTO stations (
    station_code,
    station_name,
    station_name_en,
    city,
    station_order
)
VALUES
    ('nangang',   '南港', 'Nangang',  '台北市',  1),
    ('taipei',    '台北', 'Taipei',   '台北市',  2),
    ('banqiao',   '板橋', 'Banqiao',  '新北市',  3),
    ('taoyuan',   '桃園', 'Taoyuan',  '桃園市',  4),
    ('hsinchu',   '新竹', 'Hsinchu',  '新竹縣',  5),
    ('miaoli',    '苗栗', 'Miaoli',   '苗栗縣',  6),
    ('taichung',  '台中', 'Taichung', '台中市',  7),
    ('changhua',  '彰化', 'Changhua', '彰化縣',  8),
    ('yunlin',    '雲林', 'Yunlin',   '雲林縣',  9),
    ('chiayi',    '嘉義', 'Chiayi',   '嘉義縣', 10),
    ('tainan',    '台南', 'Tainan',   '台南市', 11),
    ('zuoying',   '左營', 'Zuoying',  '高雄市', 12)
ON CONFLICT (station_code) DO UPDATE
SET station_name = EXCLUDED.station_name,
    station_name_en = EXCLUDED.station_name_en,
    city = EXCLUDED.city,
    station_order = EXCLUDED.station_order;

-- ----------------------------------------------------------------------------
-- 車次與座位
-- 0601、0801 為南下；0602、0802 為北上。
-- 每車：40 個標準座、8 個商務座、2 個無障礙座。
-- ----------------------------------------------------------------------------

INSERT INTO trains (train_number, train_type)
VALUES
    ('0601', 'DEMO_LOCAL_SOUTHBOUND'),
    ('0801', 'DEMO_LOCAL_SOUTHBOUND'),
    ('0602', 'DEMO_LOCAL_NORTHBOUND'),
    ('0802', 'DEMO_LOCAL_NORTHBOUND')
ON CONFLICT (train_number) DO UPDATE
SET train_type = EXCLUDED.train_type;

WITH standard_seats AS (
    SELECT
        t.train_id,
        1::smallint AS carriage_number,
        seat_row::text || seat_letter AS seat_number,
        'STANDARD'::thsr_seat_type AS seat_type,
        CASE seat_letter
            WHEN 'A' THEN 'WINDOW'::thsr_seat_position
            WHEN 'E' THEN 'WINDOW'::thsr_seat_position
            WHEN 'C' THEN 'AISLE'::thsr_seat_position
            WHEN 'D' THEN 'AISLE'::thsr_seat_position
            ELSE 'MIDDLE'::thsr_seat_position
        END AS seat_position
    FROM trains AS t
    CROSS JOIN generate_series(1, 8) AS rows(seat_row)
    CROSS JOIN unnest(ARRAY['A', 'B', 'C', 'D', 'E']) AS letters(seat_letter)
    WHERE t.train_number IN ('0601', '0801', '0602', '0802')
),
business_seats AS (
    SELECT
        t.train_id,
        2::smallint AS carriage_number,
        seat_row::text || seat_letter AS seat_number,
        'BUSINESS'::thsr_seat_type AS seat_type,
        CASE seat_letter
            WHEN 'A' THEN 'WINDOW'::thsr_seat_position
            WHEN 'E' THEN 'WINDOW'::thsr_seat_position
            ELSE 'AISLE'::thsr_seat_position
        END AS seat_position
    FROM trains AS t
    CROSS JOIN generate_series(1, 2) AS rows(seat_row)
    CROSS JOIN unnest(ARRAY['A', 'C', 'D', 'E']) AS letters(seat_letter)
    WHERE t.train_number IN ('0601', '0801', '0602', '0802')
),
accessible_seats AS (
    SELECT
        t.train_id,
        3::smallint AS carriage_number,
        seat_number,
        'ACCESSIBLE'::thsr_seat_type AS seat_type,
        'WINDOW'::thsr_seat_position AS seat_position
    FROM trains AS t
    CROSS JOIN unnest(ARRAY['1A', '1E']) AS seat_numbers(seat_number)
    WHERE t.train_number IN ('0601', '0801', '0602', '0802')
),
all_seats AS (
    SELECT * FROM standard_seats
    UNION ALL
    SELECT * FROM business_seats
    UNION ALL
    SELECT * FROM accessible_seats
)
INSERT INTO seats (train_id, carriage_number, seat_number, seat_type, seat_position)
SELECT train_id, carriage_number, seat_number, seat_type, seat_position
FROM all_seats
ON CONFLICT (train_id, carriage_number, seat_number) DO UPDATE
SET seat_type = EXCLUDED.seat_type,
    seat_position = EXCLUDED.seat_position;

-- ----------------------------------------------------------------------------
-- 未來 29 天的每日班次
-- 使用台灣當地日期，避免 UTC 換日時差。
-- ----------------------------------------------------------------------------

WITH seed_dates AS (
    SELECT
        (timezone('Asia/Taipei', now()))::date + day_offset AS service_date
    FROM generate_series(0, 28) AS offsets(day_offset)
)
INSERT INTO train_schedules (train_id, service_date, status)
SELECT t.train_id, d.service_date, 'SCHEDULED'::thsr_schedule_status
FROM trains AS t
CROSS JOIN seed_dates AS d
WHERE t.train_number IN ('0601', '0801', '0602', '0802')
ON CONFLICT (train_id, service_date) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 停靠時刻
-- 首站沒有 arrival_at，末站沒有 departure_at；中間站停靠 2 分鐘。
-- ----------------------------------------------------------------------------

WITH train_plan (train_number, departure_time, direction) AS (
    VALUES
        ('0601', time '06:00', 'SOUTHBOUND'),
        ('0801', time '14:00', 'SOUTHBOUND'),
        ('0602', time '06:30', 'NORTHBOUND'),
        ('0802', time '14:30', 'NORTHBOUND')
),
station_plan (station_code, south_order, distance_km, elapsed_minutes) AS (
    VALUES
        ('nangang',   1,   0,   0),
        ('taipei',    2,   9,  10),
        ('banqiao',   3,  17,  20),
        ('taoyuan',   4,  47,  42),
        ('hsinchu',   5,  76,  55),
        ('miaoli',    6, 105,  72),
        ('taichung',  7, 166,  88),
        ('changhua',  8, 194, 101),
        ('yunlin',    9, 226, 117),
        ('chiayi',   10, 258, 134),
        ('tainan',   11, 291, 154),
        ('zuoying',  12, 345, 169)
),
stop_plan AS (
    SELECT
        ts.schedule_id,
        st.station_id,
        CASE
            WHEN tp.direction = 'SOUTHBOUND' THEN sp.south_order
            ELSE 13 - sp.south_order
        END::smallint AS stop_order,
        tp.departure_time,
        CASE
            WHEN tp.direction = 'SOUTHBOUND' THEN sp.elapsed_minutes
            ELSE 169 - sp.elapsed_minutes
        END AS elapsed_minutes
    FROM train_schedules AS ts
    JOIN trains AS t ON t.train_id = ts.train_id
    JOIN train_plan AS tp ON tp.train_number = t.train_number
    CROSS JOIN station_plan AS sp
    JOIN stations AS st ON st.station_code = sp.station_code
    WHERE ts.service_date BETWEEN (timezone('Asia/Taipei', now()))::date
                              AND (timezone('Asia/Taipei', now()))::date + 28
),
calculated_stops AS (
    SELECT
        sp.schedule_id,
        sp.station_id,
        sp.stop_order,
        CASE
            WHEN sp.stop_order = 1 THEN NULL
            ELSE (
                ts.service_date::timestamp
                + sp.departure_time
                + make_interval(mins => sp.elapsed_minutes)
            ) AT TIME ZONE 'Asia/Taipei'
        END AS arrival_at,
        CASE
            WHEN sp.stop_order = 12 THEN NULL
            ELSE (
                ts.service_date::timestamp
                + sp.departure_time
                + make_interval(
                    mins => sp.elapsed_minutes
                         + CASE WHEN sp.stop_order = 1 THEN 0 ELSE 2 END
                )
            ) AT TIME ZONE 'Asia/Taipei'
        END AS departure_at
    FROM stop_plan AS sp
    JOIN train_schedules AS ts ON ts.schedule_id = sp.schedule_id
)
INSERT INTO train_stops (
    schedule_id,
    station_id,
    stop_order,
    arrival_at,
    departure_at
)
SELECT
    schedule_id,
    station_id,
    stop_order,
    arrival_at,
    departure_at
FROM calculated_stops
ON CONFLICT (schedule_id, stop_order) DO UPDATE
SET station_id = EXCLUDED.station_id,
    arrival_at = EXCLUDED.arrival_at,
    departure_at = EXCLUDED.departure_at;

-- 建立每班車 11 個相鄰行車區間。
INSERT INTO schedule_segments (from_stop_id, to_stop_id)
SELECT from_stop.stop_id, to_stop.stop_id
FROM train_stops AS from_stop
JOIN train_stops AS to_stop
  ON to_stop.schedule_id = from_stop.schedule_id
 AND to_stop.stop_order = from_stop.stop_order + 1
JOIN train_schedules AS ts ON ts.schedule_id = from_stop.schedule_id
JOIN trains AS t ON t.train_id = ts.train_id
WHERE t.train_number IN ('0601', '0801', '0602', '0802')
  AND ts.service_date BETWEEN (timezone('Asia/Taipei', now()))::date
                          AND (timezone('Asia/Taipei', now()))::date + 28
ON CONFLICT (from_stop_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 示範票價
-- 全票依站間示範里程計算，再套用座位與票種係數。
-- 無障礙座位本身不收加價，優惠由 fare_type 決定。
-- ----------------------------------------------------------------------------

WITH station_distance (station_code, distance_km) AS (
    VALUES
        ('nangang',    0),
        ('taipei',     9),
        ('banqiao',   17),
        ('taoyuan',   47),
        ('hsinchu',   76),
        ('miaoli',   105),
        ('taichung', 166),
        ('changhua', 194),
        ('yunlin',   226),
        ('chiayi',   258),
        ('tainan',   291),
        ('zuoying',  345)
),
station_with_distance AS (
    SELECT st.station_id, sd.distance_km
    FROM stations AS st
    JOIN station_distance AS sd ON sd.station_code = st.station_code
),
routes AS (
    SELECT
        origin.station_id AS origin_station_id,
        destination.station_id AS destination_station_id,
        GREATEST(
            40::numeric,
            ROUND((80 + ABS(destination.distance_km - origin.distance_km) * 4.2) / 5) * 5
        ) AS standard_full_fare
    FROM station_with_distance AS origin
    CROSS JOIN station_with_distance AS destination
    WHERE origin.station_id <> destination.station_id
),
seat_factors (seat_type, factor) AS (
    VALUES
        ('STANDARD'::thsr_seat_type,   1.00::numeric),
        ('BUSINESS'::thsr_seat_type,   1.55::numeric),
        ('ACCESSIBLE'::thsr_seat_type, 1.00::numeric)
),
fare_factors (fare_type, factor) AS (
    VALUES
        ('FULL'::thsr_fare_type,       1.00::numeric),
        ('CHILD'::thsr_fare_type,      0.50::numeric),
        ('SENIOR'::thsr_fare_type,     0.50::numeric),
        ('DISABLED'::thsr_fare_type,   0.50::numeric),
        ('STUDENT'::thsr_fare_type,    0.75::numeric),
        ('EARLY_BIRD'::thsr_fare_type, 0.65::numeric)
)
INSERT INTO fares (
    origin_station_id,
    destination_station_id,
    seat_type,
    fare_type,
    amount
)
SELECT
    r.origin_station_id,
    r.destination_station_id,
    sf.seat_type,
    ff.fare_type,
    ROUND((r.standard_full_fare * sf.factor * ff.factor) / 5) * 5 AS amount
FROM routes AS r
CROSS JOIN seat_factors AS sf
CROSS JOIN fare_factors AS ff
ON CONFLICT (
    origin_station_id,
    destination_station_id,
    seat_type,
    fare_type
) DO UPDATE
SET amount = EXCLUDED.amount;

COMMIT;

-- 執行後摘要。
SELECT 'stations' AS data_set, COUNT(*) AS row_count FROM stations
UNION ALL
SELECT 'demo_trains', COUNT(*) FROM trains
 WHERE train_number IN ('0601', '0801', '0602', '0802')
UNION ALL
SELECT 'demo_seats', COUNT(*) FROM seats AS s
 JOIN trains AS t ON t.train_id = s.train_id
 WHERE t.train_number IN ('0601', '0801', '0602', '0802')
UNION ALL
SELECT 'active_demo_schedules', COUNT(*) FROM train_schedules AS ts
 JOIN trains AS t ON t.train_id = ts.train_id
 WHERE t.train_number IN ('0601', '0801', '0602', '0802')
   AND ts.service_date BETWEEN (timezone('Asia/Taipei', now()))::date
                           AND (timezone('Asia/Taipei', now()))::date + 28
UNION ALL
SELECT 'active_demo_stops', COUNT(*) FROM train_stops AS stops
 JOIN train_schedules AS ts ON ts.schedule_id = stops.schedule_id
 JOIN trains AS t ON t.train_id = ts.train_id
 WHERE t.train_number IN ('0601', '0801', '0602', '0802')
   AND ts.service_date BETWEEN (timezone('Asia/Taipei', now()))::date
                           AND (timezone('Asia/Taipei', now()))::date + 28
UNION ALL
SELECT 'active_demo_segments', COUNT(*) FROM schedule_segments AS segments
 JOIN train_stops AS stops ON stops.stop_id = segments.from_stop_id
 JOIN train_schedules AS ts ON ts.schedule_id = stops.schedule_id
 JOIN trains AS t ON t.train_id = ts.train_id
 WHERE t.train_number IN ('0601', '0801', '0602', '0802')
   AND ts.service_date BETWEEN (timezone('Asia/Taipei', now()))::date
                           AND (timezone('Asia/Taipei', now()))::date + 28
UNION ALL
SELECT 'fares', COUNT(*) FROM fares
ORDER BY data_set;
