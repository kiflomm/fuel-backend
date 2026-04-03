import { pgEnum } from 'drizzle-orm/pg-core';

// User role enum
export const userRoleEnum = pgEnum('user_role', [
  'ADMIN',
  'GENERAL_FINANCE',
  'COLLEGE_FINANCE',
  'FACILITATOR',
  'GENERAL_FACILITATOR',
  'GUEST',
]);
