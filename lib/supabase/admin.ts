import 'server-only';

import {createClient as createSupabaseClient} from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing server-side Supabase environment variables.');
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {autoRefreshToken: false, persistSession: false},
    global: {headers: {'X-Client-Info': 'thsr-booking-api'}}
  });
}
