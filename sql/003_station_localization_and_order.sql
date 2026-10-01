-- ============================================================================
-- 車站主檔：增加英文站名與台灣高鐵路線順序
-- ============================================================================

BEGIN;

SET search_path TO public;

ALTER TABLE stations
    ADD COLUMN IF NOT EXISTS station_name_en varchar(100),
    ADD COLUMN IF NOT EXISTS station_order smallint;

UPDATE stations
SET
    station_name_en = CASE station_code
        WHEN 'nangang'  THEN 'Nangang'
        WHEN 'taipei'   THEN 'Taipei'
        WHEN 'banqiao'  THEN 'Banqiao'
        WHEN 'taoyuan'  THEN 'Taoyuan'
        WHEN 'hsinchu'  THEN 'Hsinchu'
        WHEN 'miaoli'   THEN 'Miaoli'
        WHEN 'taichung' THEN 'Taichung'
        WHEN 'changhua' THEN 'Changhua'
        WHEN 'yunlin'   THEN 'Yunlin'
        WHEN 'chiayi'   THEN 'Chiayi'
        WHEN 'tainan'   THEN 'Tainan'
        WHEN 'zuoying'  THEN 'Zuoying'
    END,
    station_order = CASE station_code
        WHEN 'nangang'  THEN 1
        WHEN 'taipei'   THEN 2
        WHEN 'banqiao'  THEN 3
        WHEN 'taoyuan'  THEN 4
        WHEN 'hsinchu'  THEN 5
        WHEN 'miaoli'   THEN 6
        WHEN 'taichung' THEN 7
        WHEN 'changhua' THEN 8
        WHEN 'yunlin'   THEN 9
        WHEN 'chiayi'   THEN 10
        WHEN 'tainan'   THEN 11
        WHEN 'zuoying'  THEN 12
    END
WHERE station_code IN (
    'nangang', 'taipei', 'banqiao', 'taoyuan', 'hsinchu', 'miaoli',
    'taichung', 'changhua', 'yunlin', 'chiayi', 'tainan', 'zuoying'
);

ALTER TABLE stations
    ALTER COLUMN station_name_en SET NOT NULL,
    ALTER COLUMN station_order SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.stations'::regclass
          AND conname = 'uq_stations_order'
    ) THEN
        ALTER TABLE stations
            ADD CONSTRAINT uq_stations_order UNIQUE (station_order);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.stations'::regclass
          AND conname = 'ck_stations_order_positive'
    ) THEN
        ALTER TABLE stations
            ADD CONSTRAINT ck_stations_order_positive CHECK (station_order > 0);
    END IF;
END;
$$;

COMMIT;

SELECT
    station_id,
    station_code,
    station_name,
    station_name_en,
    city,
    station_order
FROM stations
ORDER BY station_order;
