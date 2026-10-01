import {NextResponse} from 'next/server';

import {parseSignUp} from '@/lib/auth/validation';
import {apiErrorResponse, ApiError, assertSameOriginMutation, readJsonBody} from '@/lib/api/http';
import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = parseSignUp(await readJsonBody(request));
    const supabase = await createClient();
    const {data, error} = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {data: {name: input.name}}
    });

    if (error || !data.user) {
      throw new ApiError(400, 'BAD_REQUEST', error?.message ?? 'The account could not be created.');
    }

    if (data.session) {
      const {error: profileError} = await supabase.rpc('ensure_member_profile', {
        p_name: input.name
      });
      if (profileError) throw profileError;
    }

    return NextResponse.json(
      {
        authenticated: Boolean(data.session),
        requiresEmailConfirmation: !data.session,
        user: {id: data.user.id, email: data.user.email}
      },
      {status: 201, headers: {'Cache-Control': 'no-store'}}
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
