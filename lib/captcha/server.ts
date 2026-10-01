import 'server-only';

import {createHmac, randomInt, randomUUID} from 'node:crypto';

import {ApiError} from '@/lib/api/http';
import {createAdminClient} from '@/lib/supabase/admin';

const CAPTCHA_DIGITS = '23456789';
const CAPTCHA_LENGTH = 6;
const CAPTCHA_TTL_SECONDS = 5 * 60;

const glyphs: Record<string, readonly string[]> = {
  '2': ['11110', '00001', '00001', '11110', '10000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01111', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '11110']
};

function secret() {
  const value = process.env.CAPTCHA_HMAC_SECRET;
  if (!value || value.length < 32) {
    throw new Error('CAPTCHA_HMAC_SECRET must contain at least 32 characters.');
  }
  return value;
}

function hmac(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

function randomCode() {
  return Array.from({length: CAPTCHA_LENGTH}, () => CAPTCHA_DIGITS[randomInt(CAPTCHA_DIGITS.length)]).join('');
}

function clientAddress(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

export function fingerprintRequest(request: Request) {
  const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? 'unknown';
  return hmac(`client:${clientAddress(request.headers)}:${userAgent}`);
}

function answerDigest(challengeId: string, answer: string) {
  return hmac(`answer:${challengeId}:${answer.trim()}`);
}

function jitter(value: number, amount: number) {
  return value + randomInt(-amount, amount + 1);
}

function renderCaptchaSvg(code: string) {
  const width = 228;
  const height = 68;
  const cells: string[] = [];

  for (const [characterIndex, character] of [...code].entries()) {
    const glyph = glyphs[character];
    const cellSize = randomInt(5, 8);
    const baseX = 13 + characterIndex * 35 + randomInt(-2, 3);
    const baseY = randomInt(9, 17);
    const rotation = randomInt(-9, 10);
    const blocks: string[] = [];

    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel === '1') {
          blocks.push(
            `<rect x="${columnIndex * cellSize}" y="${rowIndex * cellSize}" width="${cellSize + 0.7}" height="${cellSize + 0.7}" rx="1"/>`
          );
        }
      });
    });

    cells.push(
      `<g transform="translate(${baseX} ${baseY}) rotate(${rotation} ${cellSize * 2.5} ${cellSize * 3.5})" fill="${characterIndex % 2 ? '#424242' : '#202020'}">${blocks.join('')}</g>`
    );
  }

  const lines = Array.from({length: 9}, (_, index) => {
    const opacity = (0.13 + (index % 4) * 0.035).toFixed(2);
    return `<path d="M ${jitter(0, 8)} ${randomInt(height)} Q ${randomInt(width)} ${randomInt(height)} ${jitter(width, 8)} ${randomInt(height)}" fill="none" stroke="#555" stroke-opacity="${opacity}" stroke-width="${randomInt(1, 3)}"/>`;
  });

  const dots = Array.from({length: 75}, () =>
    `<circle cx="${randomInt(width)}" cy="${randomInt(height)}" r="${randomInt(1, 3) / 2}" fill="#111" fill-opacity="0.14"/>`
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eeeee9"/>${lines.join('')}${cells.join('')}${dots.join('')}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function issueCaptcha(request: Request) {
  const challengeId = randomUUID();
  const answer = randomCode();
  const expiresAt = new Date(Date.now() + CAPTCHA_TTL_SECONDS * 1000).toISOString();
  const supabase = createAdminClient();
  const {data, error} = await supabase.rpc('issue_captcha_challenge', {
    p_challenge_id: challengeId,
    p_answer_digest: answerDigest(challengeId, answer),
    p_client_fingerprint: fingerprintRequest(request),
    p_expires_at: expiresAt
  });

  if (error) {
    if (error.message.includes('CAPTCHA_RATE_LIMITED')) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many verification codes were requested. Please try again later.');
    }
    throw error;
  }
  if (!data) throw new Error('The CAPTCHA challenge was not persisted.');

  return {challengeId, imageDataUrl: renderCaptchaSvg(answer), expiresAt};
}

export async function consumeCaptcha(request: Request, challengeId: string, answer: string) {
  const supabase = createAdminClient();
  const {data, error} = await supabase.rpc('consume_captcha_challenge', {
    p_challenge_id: challengeId,
    p_answer_digest: answerDigest(challengeId, answer),
    p_client_fingerprint: fingerprintRequest(request)
  });

  if (error) throw error;
  switch (data as string) {
    case 'VALID':
      return;
    case 'EXPIRED':
      throw new ApiError(410, 'CAPTCHA_EXPIRED', 'The verification code has expired.');
    case 'LOCKED':
      throw new ApiError(429, 'CAPTCHA_INVALID', 'Too many incorrect verification attempts.');
    default:
      throw new ApiError(422, 'CAPTCHA_INVALID', 'The verification code is incorrect.');
  }
}
