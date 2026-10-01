import {NextResponse} from 'next/server';

import {apiErrorResponse, assertSameOriginMutation} from '@/lib/api/http';
import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const supabase = await createClient();
    const {error} = await supabase.auth.signOut();
    if (error) throw error;
    return new NextResponse(null, {status: 204, headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return apiErrorResponse(error);
  }
}
