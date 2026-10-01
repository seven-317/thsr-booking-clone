-- ============================================================================
-- Keep public.members as the source of truth for editable member profile data.
-- Run after 007_member_bookings_and_demo_payment.sql.
-- ============================================================================

BEGIN;

SET search_path TO public;

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

CREATE OR REPLACE FUNCTION public.get_my_member_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'memberId', m.member_id,
        'name', m.name,
        'email', m.email
    )
      FROM public.members AS m
     WHERE m.auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.ensure_member_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_member_profile() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_member_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_member_profile() TO authenticated;

COMMIT;
