import {NextResponse} from 'next/server';

import {apiErrorResponse, ApiError, assertSameOriginMutation, readJsonBody} from '@/lib/api/http';
import {parseCreateBooking} from '@/lib/booking/booking-validation';
import {bookingRpcError} from '@/lib/booking/rpc-errors';
import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authenticatedClient() {
  const supabase = await createClient();
  const {data, error} = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  return supabase;
}

export async function GET() {
  try {
    const supabase = await authenticatedClient();
    const {data, error} = await supabase.rpc('list_my_bookings');
    if (error) throw bookingRpcError(error);
    return NextResponse.json(
      {bookings: Array.isArray(data) ? data : []},
      {headers: {'Cache-Control': 'no-store'}}
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = parseCreateBooking(await readJsonBody(request));
    const supabase = await authenticatedClient();

    const {data, error} = await supabase.rpc('create_booking', {
      p_idempotency_key: input.idempotencyKey,
      p_journeys: input.journeys,
      p_tickets: input.tickets
    });
    if (error) throw bookingRpcError(error);

    const replayed = Boolean(data && typeof data === 'object' && 'replayed' in data && data.replayed);
    return NextResponse.json(data, {
      status: replayed ? 200 : 201,
      headers: {'Cache-Control': 'no-store'}
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
