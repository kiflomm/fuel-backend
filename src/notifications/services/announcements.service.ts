import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../../database/drizzle.provider';
import * as schema from '../../database/schema';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { AnnouncementScope, UserRole } from '../../database/enums';
import { FcmService } from './fcm.service';

type AnnouncementRow = typeof schema.announcements.$inferSelect;

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly fcmService: FcmService,
  ) {}

  private mapAnnouncement(row: AnnouncementRow) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdByAdminUserId: row.createdByAdminUserId,
      targetScope: row.targetScope,
      targetRole: row.targetRole ?? null,
      targetStationId: row.targetStationId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createAnnouncement(params: {
    adminUserId: number;
    title: string;
    body: string;
    targetScope: AnnouncementScope;
    targetRole?: UserRole;
    targetStationId?: number;
  }) {
    if (params.targetScope === 'ROLE' && !params.targetRole) {
      throw new BadRequestException('targetRole is required when targetScope=ROLE');
    }
    if (params.targetScope === 'STATION' && !params.targetStationId) {
      throw new BadRequestException(
        'targetStationId is required when targetScope=STATION',
      );
    }

    const [row] = await this.db
      .insert(schema.announcements)
      .values({
        title: params.title,
        body: params.body,
        createdByAdminUserId: params.adminUserId,
        targetScope: params.targetScope,
        targetRole: params.targetScope === 'ROLE' ? params.targetRole! : null,
        targetStationId:
          params.targetScope === 'STATION' ? params.targetStationId! : null,
      })
      .returning();

    const announcement = this.mapAnnouncement(row);

    const tokens = await this.resolveTargetDeviceTokens({
      targetScope: params.targetScope,
      targetRole: params.targetRole,
      targetStationId: params.targetStationId,
    });

    const push = await this.fcmService.sendToTokens(tokens, {
      title: params.title,
      body: params.body,
      data: {
        type: 'ANNOUNCEMENT',
        announcementId: String(announcement.id),
      },
    });

    return { announcement, push };
  }

  async listAnnouncements() {
    const rows = await this.db
      .select()
      .from(schema.announcements)
      .orderBy(desc(schema.announcements.createdAt));
    return rows.map((r) => this.mapAnnouncement(r));
  }

  async getAnnouncementById(id: number) {
    const [row] = await this.db
      .select()
      .from(schema.announcements)
      .where(eq(schema.announcements.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Announcement not found');
    }
    return this.mapAnnouncement(row);
  }

  async listAnnouncementsForUser(params: { userId: number }) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, params.userId))
      .limit(1);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const conditions = [
      eq(schema.announcements.targetScope, 'ALL'),
      and(
        eq(schema.announcements.targetScope, 'ROLE'),
        eq(schema.announcements.targetRole, user.role),
      ),
    ];

    if (user.stationId != null) {
      conditions.push(
        and(
          eq(schema.announcements.targetScope, 'STATION'),
          eq(schema.announcements.targetStationId, user.stationId),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(schema.announcements)
      .where(or(...conditions))
      .orderBy(desc(schema.announcements.createdAt));

    return rows.map((r) => this.mapAnnouncement(r));
  }

  async registerDevice(params: {
    userId: number;
    platform: 'ANDROID';
    fcmToken: string;
  }) {
    const token = params.fcmToken.trim();
    if (!token) {
      throw new BadRequestException('Invalid fcmToken');
    }

    const [existingByToken] = await this.db
      .select()
      .from(schema.userDevices)
      .where(eq(schema.userDevices.fcmToken, token))
      .limit(1);

    if (existingByToken) {
      const [updated] = await this.db
        .update(schema.userDevices)
        .set({
          userId: params.userId,
          platform: params.platform,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.userDevices.id, existingByToken.id))
        .returning();

      return {
        id: updated.id,
        platform: updated.platform,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }

    const [created] = await this.db
      .insert(schema.userDevices)
      .values({
        userId: params.userId,
        platform: params.platform,
        fcmToken: token,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    return {
      id: created.id,
      platform: created.platform,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async unregisterDevice(params: { userId: number; fcmToken: string }) {
    const token = params.fcmToken.trim();
    if (!token) {
      throw new BadRequestException('Invalid fcmToken');
    }

    const [existing] = await this.db
      .select()
      .from(schema.userDevices)
      .where(
        and(
          eq(schema.userDevices.userId, params.userId),
          eq(schema.userDevices.fcmToken, token),
        ),
      )
      .limit(1);

    if (!existing) {
      return { success: true };
    }

    await this.db
      .update(schema.userDevices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.userDevices.id, existing.id));

    return { success: true };
  }

  private async resolveTargetDeviceTokens(params: {
    targetScope: AnnouncementScope;
    targetRole?: UserRole;
    targetStationId?: number;
  }) {
    if (params.targetScope === 'ALL') {
      const rows = await this.db
        .select({ fcmToken: schema.userDevices.fcmToken })
        .from(schema.userDevices)
        .where(eq(schema.userDevices.isActive, true));
      return rows.map((r) => r.fcmToken);
    }

    if (params.targetScope === 'ROLE') {
      const users = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.role, params.targetRole!));
      const userIds = users.map((u) => u.id);
      if (userIds.length === 0) return [];
      const devices = await this.db
        .select({ fcmToken: schema.userDevices.fcmToken })
        .from(schema.userDevices)
        .where(
          and(
            eq(schema.userDevices.isActive, true),
            inArray(schema.userDevices.userId, userIds),
          ),
        );
      return devices.map((d) => d.fcmToken);
    }

    const users = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.stationId, params.targetStationId!));
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return [];
    const devices = await this.db
      .select({ fcmToken: schema.userDevices.fcmToken })
      .from(schema.userDevices)
      .where(
        and(
          eq(schema.userDevices.isActive, true),
          inArray(schema.userDevices.userId, userIds),
        ),
      );
    return devices.map((d) => d.fcmToken);
  }
}

