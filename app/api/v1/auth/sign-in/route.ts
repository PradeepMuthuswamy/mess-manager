import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { signInSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  await checkRateLimit(req, 'auth');
  const body = await req.json().catch(() => null);
  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  try {
    const res = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
      asResponse: false,
    });

    if (!res || !res.token) {
      throw Errors.unauthenticated('Invalid email or password');
    }

    return ok({
      access_token: res.token,
      token: res.token,
      user: {
        id: res.user.id,
        email: res.user.email,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Invalid email or password';
    throw Errors.unauthenticated(message);
  }
});
