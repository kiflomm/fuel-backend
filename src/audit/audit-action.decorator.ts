import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

export const AuditAction = (action: string, entity: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, entity });
