#!/usr/bin/env tsx
/**
 * Bootstrap the first admin user.
 *
 * Usage:
 *   npm run bootstrap-admin -- <email> <password> [full_name]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Re-running with the same email is a no-op (idempotent).
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const [, , email, password, ...nameParts] = process.argv;
  const fullName = nameParts.join(' ').trim() || null;

  if (!email || !password) {
    console.error('Usage: npm run bootstrap-admin -- <email> <password> [full_name]');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    console.error('NEXT_PUBLIC_SUPABASE_URL is not set');
    process.exit(1);
  }
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Required to create users via the admin API.');
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId: string;

  const { data: existing } = await admin.auth.admin.listUsers();
  const match = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (match) {
    userId = match.id;
    console.log(`User ${email} already exists (${userId}). Promoting to admin...`);
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'super_admin',
        ...(fullName ? { full_name: fullName } : {}),
      },
    });
    if (cErr || !created.user) {
      console.error('Could not create user:', cErr?.message);
      process.exit(1);
    }
    userId = created.user.id;
    console.log(`Created user ${email} (${userId}).`);
  }

  const { error: upErr } = await admin
    .from('profiles')
    .update({
      role: 'super_admin',
      unit_id: null,
      full_name: fullName ?? undefined,
    })
    .eq('id', userId);
  if (upErr) {
    console.error('Could not promote profile to admin:', upErr.message);
    process.exit(1);
  }

  console.log(`✓ ${email} is now admin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
