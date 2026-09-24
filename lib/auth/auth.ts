import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { bearer, twoFactor } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { client, getDb, getMongoClient } from '@/lib/mongo';

const db = client.db('mess');

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  secret: process.env.BETTER_AUTH_SECRET || 'temporary-development-secret-key-officers-mess-manager-32chars',
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    bearer(),
    twoFactor({
      issuer: 'Officers Mess',
      allowPasswordless: true,
    }),
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
