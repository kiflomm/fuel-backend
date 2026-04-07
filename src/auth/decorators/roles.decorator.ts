import { SetMetadata } from '@nestjs/common';

export type Role =
  | 'ADMIN'
  | 'GENERAL_FINANCE'
  | 'COLLEGE_FINANCE'
  | 'FACILITATOR'
  | 'GENERAL_FACILITATOR';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

