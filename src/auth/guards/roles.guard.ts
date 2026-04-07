import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  // Injects the Reflector service to access metadata set by decorators
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get the array of required roles from metadata for the current route handler or class
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required for this route, allow access
    if (!requiredRoles) {
      return true;
    }

    // Extract the user object (populated by an authentication guard) from the request
    const { user } = context.switchToHttp().getRequest();

    // If there is no authenticated user present, deny access
    if (!user) {
      return false;
    }

    // Allow access only if the user's role matches one of the required roles
    return requiredRoles.some((role) => user.role === role);
  }
}
