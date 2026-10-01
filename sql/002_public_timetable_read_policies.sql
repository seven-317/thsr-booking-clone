-- ============================================================================
-- Supabase RLS：允許前端搜尋公開車站、票價與班次資料
--
-- 只開放 SELECT；不開放 INSERT、UPDATE 或 DELETE。
-- 會員、乘客、訂單、付款與票券表不在本次開放範圍。
-- ============================================================================

BEGIN;

SET search_path TO public;

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fares ENABLE ROW LEVEL SECURITY;
ALTER TABLE trains ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE train_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE train_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_segments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    target_table text;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'stations',
        'fares',
        'trains',
        'seats',
        'train_schedules',
        'train_stops',
        'schedule_segments'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies AS policies
            WHERE policies.schemaname = 'public'
              AND policies.tablename = target_table
              AND policies.policyname = 'public_read'
        ) THEN
            EXECUTE format(
                'CREATE POLICY public_read ON public.%I '
                'FOR SELECT TO anon, authenticated USING (true)',
                target_table
            );
        END IF;
    END LOOP;
END;
$$;

COMMIT;

SELECT
    tablename,
    policyname,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'stations',
      'fares',
      'trains',
      'seats',
      'train_schedules',
      'train_stops',
      'schedule_segments'
  )
ORDER BY tablename, policyname;
