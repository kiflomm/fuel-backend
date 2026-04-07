import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

// The JwtAuthGuard is responsible for protecting routes by validating JSON Web Tokens (JWTs)
// using Passport's 'jwt' strategy. It can be extended to provide custom logic or metadata-driven
// permission checks on protected routes.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // The Reflector allows access to route-specific metadata, which can be useful
  // for implementing advanced authorization or permission logic in the future.
  constructor(private reflector: Reflector) {
    // Call the parent constructor to ensure the 'jwt' strategy is registered.
    super();
  }

  // The canActivate method is invoked to determine whether the request should proceed.
  // By default, it delegates authentication checks to the Passport 'jwt' strategy via super.canActivate().
  canActivate(context: ExecutionContext) {
    // We can later extend this method to include more granular authorization checks using the context or reflector.
    return super.canActivate(context);
  }
}
