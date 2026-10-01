import {NextResponse} from 'next/server';

import {apiErrorResponse, ApiError, assertSameOriginMutation, readJsonBody} from '@/lib/api/http';
import {parseBookingNumber, parseDemoPayment} from '@/lib/booking/booking-validation';
import {bookingRpcError} from '@/lib/booking/rpc-errors';
import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {params: Promise<{bookingNumber: string}>};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const bookingNumber = parseBookingNumber((await context.params).bookingNumber);
    parseDemoPayment(await readJsonBody(request));
    const supabase = await createClient();
    const {data: userData, error: userError} = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const {data, error} = await supabase.rpc('simulate_booking_payment', {
      p_booking_number: bookingNumber,
      p_payment_method: 'CREDIT_CARD'
    });
    if (error) throw bookingRpcError(error);

    return NextResponse.json(data, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return apiErrorResponse(error);
  }
}
