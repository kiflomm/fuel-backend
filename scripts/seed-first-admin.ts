/**
 * Creates the first GOVERNMENT_ADMIN user if none exists with the given email.
 *
 * Usage (from backend/):
 *   DATABASE_URL="postgres://..." SEED_ADMIN_EMAIL="admin@example.com" SEED_ADMIN_PASSWORD="secure" pnpm db:seed:admin
 *
 * Requires migrations applied so `users` and enums match the schema.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';

import * as schema from '../src/database/schema';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme';
  const firstName = process.env.SEED_ADMIN_FIRST_NAME ?? 'Government';
  const lastName = process.env.SEED_ADMIN_LAST_NAME ?? 'Admin';

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Skip: user already exists for email ${email}`);
    await pool.end();
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await db.insert(schema.users).values({
    email,
    password: hashedPassword,
    firstName,
    lastName,
    role: 'GOVERNMENT_ADMIN',
    stationId: null,
    isActive: true,
  });

  // eslint-disable-next-line no-console
  console.log(`Created GOVERNMENT_ADMIN: ${email}`);
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
