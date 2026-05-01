import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_ACTION_KEY } from './audit-action.decorator';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMeta = this.reflector.get<{ action: string; entity: string }>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!auditMeta) {
      return next.handle();
    }

    const { action, entity } = auditMeta;
    const request = context.switchToHttp().getRequest();
    const user: CurrentUserPayload | undefined = request.user;
    const method = request.method;

    return next.handle().pipe(
      tap((responsePayload) => {
        if (user) {
          // If the response contains the created/updated entity id, we can try to extract it.
          // Usually responses are formatted like { success: true, data: { id: ... } }
          let entityId: string | undefined;
          if (responsePayload && responsePayload.data && responsePayload.data.id != null) {
            entityId = String(responsePayload.data.id);
          } else if (request.params && request.params.id) {
            entityId = String(request.params.id);
          }

          // Strip passwords or sensitive fields from body
          const safeBody = { ...request.body };
          if (safeBody.password) {
            safeBody.password = '[REDACTED]';
          }

          this.auditService.logAction(
            user.id,
            action,
            entity,
            entityId,
            safeBody,
          );
        }
      }),
    );
  }
}
