import {NextResponse} from 'next/server';

import {parseSignIn} from '@/lib/auth/validation';
import {apiErrorResponse, ApiError, assertSameOriginMutation, readJsonBody} from '@/lib/api/http';
import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = parseSignIn(await readJsonBody(request));
    const supabase = await createClient();
    const {data, error} = await supabase.auth.signInWithPassword(input);

    if (error || !data.user || !data.session) {
      throw new ApiError(401, 'UNAUTHORIZED', 'The email or password is incorrect.');
    }

    const displayName = typeof data.user.user_metadata?.name === 'string'
      ? data.user.user_metadata.name
      : null;
    const {error: profileError} = await supabase.rpc('ensure_member_profile', {
      p_name: displayName
    });
    if (profileError) throw profileError;

    return NextResponse.json(
      {user: {id: data.user.id, email: data.user.email}},
      {headers: {'Cache-Control': 'no-store'}}
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
