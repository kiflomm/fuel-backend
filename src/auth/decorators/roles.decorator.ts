import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../database/enums';

export type Role = UserRole;

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

