import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Errors } from './errors';

export function getIdempotencyKey(req: NextRequest): string | null {
  const v = req.headers.get('idempotency-key');
  return v && v.length >= 8 && v.length <= 128 ? v : null;
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Check whether a stored response exists for (key, user_id, body hash).
 * - Same hash → return the stored Response (replay).
 * - Different hash → throw 409 idempotency_conflict.
 * - No record → returns null; caller proceeds and should call storeResponse after success.
 */
export async function tryReplay(
  key: string,
  userId: string,
  bodyText: string,
): Promise<Response | null> {
  const sb = createServiceClient();
  const requestHash = hash(bodyText);
  const { data } = await sb
    .from('idempotency_keys')
    .select('request_hash, response_status, response_body')
    .eq('key', key)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  if (data.request_hash !== requestHash) {
    throw Errors.conflict('Idempotency-Key reused with a different payload', { code: 'idempotency_conflict' });
  }
  return NextResponse.json(data.response_body, { status: data.response_status });
}

export async function storeResponse(
  key: string,
  userId: string,
  bodyText: string,
  status: number,
  responseBody: unknown,
): Promise<void> {
  const sb = createServiceClient();
  await sb.from('idempotency_keys').insert({
    key,
    user_id: userId,
    request_hash: hash(bodyText),
    response_status: status,
    response_body: responseBody as never,
  });
}
