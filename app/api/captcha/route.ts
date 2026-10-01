import {NextResponse} from 'next/server';

import {apiErrorResponse} from '@/lib/api/http';
import {issueCaptcha} from '@/lib/captcha/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const challenge = await issueCaptcha(request);
    return NextResponse.json(challenge, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache'
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
