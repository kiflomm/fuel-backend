import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: process.env.NODE_ENV === 'production' ? './drizzle' : './drizzle-dev',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
