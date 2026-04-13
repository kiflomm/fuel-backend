import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../../database/enums';

export interface CurrentUserPayload {
  id: number;
  email: string;
  role: UserRole;
  /** Set for station staff; null for government admin and vehicle owners. */
  stationId: number | null;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

