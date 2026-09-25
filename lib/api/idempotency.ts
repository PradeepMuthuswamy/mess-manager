import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongo';
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
  const col = await getCollection('idempotency_keys');
  const requestHash = hash(bodyText);
  const data = await col.findOne({ key, user_id: userId });
  if (!data) return null;
  if (data.request_hash !== requestHash) {
    throw Errors.conflict('Idempotency-Key reused with a different payload', { code: 'idempotency_conflict' });
  }
  return NextResponse.json(data.response_body, { status: data.response_status });
}

export async function storeResponse(
  key: string,
  userId: string,
  arg3: unknown,
  arg4: unknown,
  arg5?: unknown,
): Promise<void> {
  const col = await getCollection('idempotency_keys');
  let bodyText: string;
  let status: number;
  let responseBody: unknown;

  if (typeof arg3 === 'string' && typeof arg4 === 'number') {
    // storeResponse(key, userId, bodyText, status, responseBody)
    bodyText = arg3;
    status = arg4;
    responseBody = arg5;
  } else if (typeof arg3 === 'number') {
    // storeResponse(key, userId, status, responseBody, bodyText)
    status = arg3;
    responseBody = arg4;
    bodyText = typeof arg5 === 'string' ? arg5 : '';
  } else {
    bodyText = String(arg3);
    status = typeof arg4 === 'number' ? arg4 : 200;
    responseBody = arg5;
  }

  await col.insertOne({
    id: crypto.randomUUID(),
    key,
    user_id: userId,
    request_hash: hash(bodyText),
    response_status: status,
    response_body: responseBody,
    created_at: new Date().toISOString(),
  });
}
