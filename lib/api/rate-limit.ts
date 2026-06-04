import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { Errors } from './errors';

let _client: Redis | null = null;
function redis(): Redis | null {
  if (_client) return _client;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  _client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _client;
}

const limiters = new Map<string, Ratelimit>();

function limiter(name: string, tokens: number, window: `${number} ${'s'|'m'|'h'|'d'}`): Ratelimit | null {
  const r = redis();
  if (!r) return null;
  const key = `${name}:${tokens}:${window}`;
  let l = limiters.get(key);
  if (!l) {
    l = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(tokens, window), analytics: false, prefix: 'om:rl' });
    limiters.set(key, l);
  }
  return l;
}

function clientKey(req: NextRequest, fallback = 'anon'): string {
  // X-Forwarded-For (Vercel sets this), then X-Real-IP, then a fallback.
  const xff = req.headers.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0].trim() : req.headers.get('x-real-ip') ?? fallback;
  return ip || fallback;
}

export async function checkRateLimit(
  req: NextRequest,
  bucket: 'auth' | 'write' | 'read',
  identifier?: string,
): Promise<void> {
  let l: Ratelimit | null = null;
  if (bucket === 'auth')  l = limiter('auth',  5,  '10 m');
  if (bucket === 'write') l = limiter('write', 60, '1 m');
  if (bucket === 'read')  l = limiter('read',  240,'1 m');
  if (!l) return;

  const key = identifier ?? clientKey(req);
  const { success, reset } = await l.limit(`${bucket}:${key}`);
  if (!success) {
    const seconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    throw Errors.rateLimited(`Try again in ${seconds}s`);
  }
}
