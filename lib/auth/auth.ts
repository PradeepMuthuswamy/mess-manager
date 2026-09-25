import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { bearer } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { client, getDb, getMongoClient } from '@/lib/mongo';

const db = client.db('mess');

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error('BETTER_AUTH_SECRET is required');
}

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  secret,
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    bearer(),
    nextCookies(),
  ],
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
      },
      unit_id: {
        type: 'string',
        required: false,
      },
      home_unit_id: {
        type: 'string',
        required: false,
      },
      rank: {
        type: 'string',
        required: false,
      },
      service_number: {
        type: 'string',
        required: false,
      },
      full_name: {
        type: 'string',
        required: false,
      },
      status: {
        type: 'string',
        required: false,
      },
      capabilities: {
        type: 'string[]',
        required: false,
      },
    },
  },
});

export { getDb, getMongoClient };
