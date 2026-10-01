import {NextResponse} from 'next/server';

import {apiErrorResponse} from '@/lib/api/http';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const {data, error} = await createAdminClient()
      .from('stations')
      .select('station_id,station_code,station_name,station_name_en,city,station_order')
      .order('station_order');
    if (error) throw error;

    return NextResponse.json(
      {stations: data ?? []},
      {headers: {'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'}}
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
