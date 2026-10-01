import {NextResponse} from 'next/server';

import {parsePassenger} from '@/lib/auth/validation';
import {apiErrorResponse, ApiError, assertSameOriginMutation, readJsonBody} from '@/lib/api/http';
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
    const {data, error} = await supabase.rpc('list_my_passengers');
    if (error) throw bookingRpcError(error);
    return NextResponse.json(
      {passengers: Array.isArray(data) ? data : []},
      {headers: {'Cache-Control': 'no-store'}}
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = parsePassenger(await readJsonBody(request));
    const supabase = await authenticatedClient();
    const {data, error} = await supabase.rpc('create_my_passenger', {
      p_name: input.name,
      p_id_number: input.idNumber,
      p_passenger_type: input.passengerType
    });
    if (error) {
      if (error.code === '23505') {
        throw new ApiError(409, 'CONFLICT', 'This passenger is already saved.');
      }
      throw bookingRpcError(error);
    }
    return NextResponse.json(data, {status: 201, headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return apiErrorResponse(error);
  }
}
