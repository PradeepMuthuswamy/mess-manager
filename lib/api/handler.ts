import { NextRequest, NextResponse } from 'next/server';
import { ApiError, Errors } from './errors';

type Handler<C = unknown> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

export function withRoute<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      }
      console.error('[api] unhandled error', err);
      const e = Errors.internal();
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    }
  };
}

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function created<T>(body: T, location?: string) {
  const headers: HeadersInit = {};
  if (location) headers['Location'] = location;
  return NextResponse.json(body, { status: 201, headers });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function list<T>(data: T[], next_cursor: string | null) {
  return NextResponse.json({ data, meta: { next_cursor, has_more: next_cursor !== null } });
}
