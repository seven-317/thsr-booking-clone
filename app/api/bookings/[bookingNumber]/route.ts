import {NextResponse} from 'next/server';

import {apiErrorResponse, ApiError, assertSameOriginMutation} from '@/lib/api/http';
import {parseBookingNumber} from '@/lib/booking/booking-validation';
import {bookingRpcError} from '@/lib/booking/rpc-errors';
import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {params: Promise<{bookingNumber: string}>};

async function authenticatedClient() {
  const supabase = await createClient();
  const {data, error} = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
  return supabase;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const bookingNumber = parseBookingNumber((await context.params).bookingNumber);
    const supabase = await authenticatedClient();
    const {data, error} = await supabase.rpc('get_booking', {p_booking_number: bookingNumber});
    if (error) throw bookingRpcError(error);
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'The booking was not found.');
    return NextResponse.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const bookingNumber = parseBookingNumber((await context.params).bookingNumber);
    const supabase = await authenticatedClient();
    const {data, error} = await supabase.rpc('cancel_booking', {p_booking_number: bookingNumber});
    if (error) throw bookingRpcError(error);
    return NextResponse.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return apiErrorResponse(error);
  }
}
