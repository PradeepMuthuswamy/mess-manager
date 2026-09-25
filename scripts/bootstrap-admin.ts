#!/usr/bin/env tsx
/**
 * Bootstrap the first admin user in MongoDB.
 *
 * Usage:
 *   npm run bootstrap-admin -- <email> <password> [full_name]
 *
 * Reads MONGODB_URI from .env.local.
 * Re-running with the same email updates password & role to super_admin (idempotent).
 */
import { MongoClient } from 'mongodb';
import { hashPassword } from 'better-auth/crypto';

async function main() {
  const [, , email, password, ...nameParts] = process.argv;
  const fullName = nameParts.join(' ').trim() || null;

  if (!email || !password) {
    console.error('Usage: npm run bootstrap-admin -- <email> <password> [full_name]');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();

  const now = new Date();
  const normalizedEmail = email.toLowerCase().trim();
  const hashedPassword = await hashPassword(password);

  const existingUser = await db.collection('users').findOne({ email: normalizedEmail });

  let userId: string;

  if (existingUser) {
    userId = existingUser.id || existingUser._id.toString();
    console.log(`User ${email} already exists (${userId}). Promoting to super_admin...`);
    await db.collection('users').updateOne(
      { email: normalizedEmail },
      {
        $set: {
          role: 'super_admin',
          unit_id: null,
          home_unit_id: null,
          full_name: fullName || existingUser.full_name || existingUser.name,
          status: 'active',
          emailVerified: true,
          updated_at: now.toISOString(),
          updatedAt: now,
        },
      }
    );
  } else {
    userId = crypto.randomUUID();
    console.log(`Creating user ${email} (${userId})...`);
    await db.collection('users').insertOne({
      id: userId,
      email: normalizedEmail,
      name: fullName || email.split('@')[0],
      full_name: fullName,
      role: 'super_admin',
      unit_id: null,
      home_unit_id: null,
      status: 'active',
      emailVerified: true,
      capabilities: ['*'],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      createdAt: now,
      updatedAt: now,
    });
  }

  // Also upsert credential account for Better Auth
  await db.collection('accounts').updateOne(
    { userId, providerId: 'credential' },
    {
      $set: {
        userId,
        accountId: normalizedEmail,
        providerId: 'credential',
        password: hashedPassword,
        updatedAt: now,
      },
      $setOnInsert: {
        id: crypto.randomUUID(),
        createdAt: now,
      },
    },
    { upsert: true }
  );

  console.log(`✓ ${email} is now super_admin.`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
