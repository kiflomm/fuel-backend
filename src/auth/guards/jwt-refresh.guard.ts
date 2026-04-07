import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// This guard applies the Passport 'jwt-refresh' strategy to incoming requests.
// It ensures that only requests with a valid refresh JWT token will proceed to the route handler.
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
