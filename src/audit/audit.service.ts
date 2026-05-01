import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import * as schema from '../database/schema';
import { desc, eq } from 'drizzle-orm';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async logAction(
    userId: number,
    action: string,
    entity: string,
    entityId?: string,
    details?: any,
  ) {
    try {
      await this.db.insert(schema.auditLogs).values({
        userId,
        action,
        entity,
        entityId,
        details,
      });
    } catch (error) {
      this.logger.error(`Failed to create audit log for action ${action}`, error);
    }
  }

  async getAuditLogs(limit = 50, offset = 0) {
    return await this.db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        userFirstName: schema.users.firstName,
        userLastName: schema.users.lastName,
        userRole: schema.users.role,
        action: schema.auditLogs.action,
        entity: schema.auditLogs.entity,
        entityId: schema.auditLogs.entityId,
        details: schema.auditLogs.details,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.userId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
