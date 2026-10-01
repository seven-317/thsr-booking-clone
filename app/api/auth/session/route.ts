import {NextResponse} from 'next/server';

import {createClient} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {data, error} = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      {authenticated: false, user: null},
      {headers: {'Cache-Control': 'no-store'}}
    );
  }

  const {data: storedProfile, error: profileError} = await supabase.rpc('get_my_member_profile');
  let profile = storedProfile as {name?: unknown; email?: unknown} | null;

  if (profileError || !profile) {
    const metadataName = typeof data.user.user_metadata?.name === 'string'
      ? data.user.user_metadata.name
      : null;
    const {data: repairedProfile, error: repairError} = await supabase.rpc('ensure_member_profile', {
      p_name: metadataName
    });
    if (!repairError) profile = repairedProfile as {name?: unknown; email?: unknown} | null;
  }

  const name = typeof profile?.name === 'string' ? profile.name : null;
  const email = typeof profile?.email === 'string' ? profile.email : data.user.email ?? '';

  return NextResponse.json(
    {
      authenticated: true,
      user: {id: data.user.id, email, name}
    },
    {headers: {'Cache-Control': 'no-store'}}
  );
}
