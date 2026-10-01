import {NextResponse} from 'next/server';

import {apiErrorResponse, readJsonBody} from '@/lib/api/http';
import {searchSchedulesOnServer} from '@/lib/booking/search.server';
import {parseSearchRequest} from '@/lib/booking/validation';
import {consumeCaptcha} from '@/lib/captcha/server';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = parseSearchRequest(await readJsonBody(request));
    await consumeCaptcha(request, input.captcha.challengeId, input.captcha.answer);

    const supabase = createAdminClient();
    const journeys = await Promise.all(
      input.journeys.map((journey) => searchSchedulesOnServer(supabase, journey))
    );

    return NextResponse.json(
      {journeys},
      {headers: {'Cache-Control': 'no-store'}}
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
