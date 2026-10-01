-- ============================================================================
-- Auth-backed member onboarding and passenger APIs for the checkout flow.
-- Run after 005_captcha_and_booking_api.sql.
-- ============================================================================

BEGIN;

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name text := nullif(trim(COALESCE(NEW.raw_user_meta_data ->> 'name', '')), '');
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.members
       SET auth_user_id = NEW.id,
           name = COALESCE(v_name, name),
           password_hash = '$supabase-auth$'
     WHERE lower(email) = lower(NEW.email)
       AND auth_user_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO public.members (name, email, password_hash, auth_user_id)
        VALUES (
            COALESCE(v_name, split_part(NEW.email, '@', 1)),
            lower(NEW.email),
            '$supabase-auth$',
            NEW.id
        )
        ON CONFLICT (email) DO UPDATE
        SET auth_user_id = EXCLUDED.auth_user_id,
            name = COALESCE(v_name, public.members.name),
            password_hash = '$supabase-auth$'
        WHERE public.members.auth_user_id IS NULL
           OR public.members.auth_user_id = EXCLUDED.auth_user_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Link pre-existing Supabase Auth users by e-mail, then create missing profiles.
UPDATE public.members AS m
   SET auth_user_id = u.id,
       password_hash = '$supabase-auth$'
  FROM auth.users AS u
 WHERE u.email IS NOT NULL
   AND lower(m.email) = lower(u.email)
   AND m.auth_user_id IS NULL;

INSERT INTO public.members (name, email, password_hash, auth_user_id)
SELECT
    COALESCE(
        nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
        split_part(u.email, '@', 1)
    ),
    lower(u.email),
    '$supabase-auth$',
    u.id
FROM auth.users AS u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
        FROM public.members AS m
       WHERE m.auth_user_id = u.id
          OR lower(m.email) = lower(u.email)
  );

CREATE OR REPLACE FUNCTION public.ensure_member_profile(p_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_email text := lower(auth.jwt() ->> 'email');
    v_member public.members%ROWTYPE;
    v_name text := nullif(trim(COALESCE(p_name, '')), '');
BEGIN
    IF v_user_id IS NULL OR v_email IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    UPDATE public.members
       SET auth_user_id = v_user_id,
           name = COALESCE(v_name, name),
           password_hash = '$supabase-auth$'
     WHERE lower(email) = v_email
       AND (auth_user_id IS NULL OR auth_user_id = v_user_id)
    RETURNING * INTO v_member;

    IF v_member.member_id IS NULL THEN
        INSERT INTO public.members (name, email, password_hash, auth_user_id)
        VALUES (
            COALESCE(v_name, split_part(v_email, '@', 1)),
            v_email,
            '$supabase-auth$',
            v_user_id
        )
        RETURNING * INTO v_member;
    END IF;

    RETURN jsonb_build_object(
        'memberId', v_member.member_id,
        'name', v_member.name,
        'email', v_member.email
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_passengers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_member_id bigint;
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

    RETURN (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'passengerId', p.passenger_id,
                    'name', p.name,
                    'idNumberMasked',
                        CASE
                            WHEN length(p.id_number) <= 4 THEN repeat('*', length(p.id_number))
                            ELSE left(p.id_number, 2)
                                || repeat('*', greatest(length(p.id_number) - 4, 1))
                                || right(p.id_number, 2)
                        END,
                    'passengerType', p.passenger_type,
                    'studentVerifiedUntil', p.student_verified_until
                ) ORDER BY p.created_at, p.passenger_id
            ),
            '[]'::jsonb
        )
          FROM public.passengers AS p
         WHERE p.member_id = v_member_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_passenger(
    p_name text,
    p_id_number text,
    p_passenger_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_member_id bigint;
    v_passenger public.passengers%ROWTYPE;
    v_name text := trim(COALESCE(p_name, ''));
    v_id_number text := upper(trim(COALESCE(p_id_number, '')));
    v_type thsr_passenger_type;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF length(v_name) NOT BETWEEN 1 AND 100
       OR length(v_id_number) NOT BETWEEN 6 AND 32
       OR v_id_number !~ '^[A-Z0-9-]+$' THEN
        RAISE EXCEPTION 'INVALID_PASSENGER';
    END IF;

    BEGIN
        v_type := upper(p_passenger_type)::thsr_passenger_type;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_PASSENGER';
    END;

    SELECT member_id INTO v_member_id
      FROM public.members
     WHERE auth_user_id = auth.uid();
    IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'MEMBER_PROFILE_REQUIRED';
    END IF;

    INSERT INTO public.passengers (member_id, name, id_number, passenger_type)
    VALUES (v_member_id, v_name, v_id_number, v_type)
    RETURNING * INTO v_passenger;

    RETURN jsonb_build_object(
        'passengerId', v_passenger.passenger_id,
        'name', v_passenger.name,
        'idNumberMasked',
            CASE
                WHEN length(v_passenger.id_number) <= 4 THEN repeat('*', length(v_passenger.id_number))
                ELSE left(v_passenger.id_number, 2)
                    || repeat('*', greatest(length(v_passenger.id_number) - 4, 1))
                    || right(v_passenger.id_number, 2)
            END,
        'passengerType', v_passenger.passenger_type,
        'studentVerifiedUntil', v_passenger.student_verified_until
    );
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_member_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_passengers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_my_passenger(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_member_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_passengers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_passenger(text, text, text) TO authenticated;

COMMIT;
