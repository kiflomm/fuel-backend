import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  id: number;
  email: string;
  role:
    | 'ADMIN'
    | 'GENERAL_FINANCE'
    | 'COLLEGE_FINANCE'
    | 'FACILITATOR'
    | 'GENERAL_FACILITATOR'
    | 'GUEST';
  collegeId: number | null;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

