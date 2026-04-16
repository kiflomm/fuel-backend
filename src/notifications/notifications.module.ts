import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FcmService } from './services/fcm.service';
import { DevicesController } from './devices.controller';
import { AnnouncementsAdminController } from './announcements.admin.controller';
import { AnnouncementsOwnerController } from './announcements.owner.controller';
import { AnnouncementsService } from './services/announcements.service';

@Module({
  imports: [DrizzleModule, AuthModule],
  controllers: [
    DevicesController,
    AnnouncementsAdminController,
    AnnouncementsOwnerController,
  ],
  providers: [FcmService, AnnouncementsService, RolesGuard],
  exports: [AnnouncementsService, FcmService],
})
export class NotificationsModule {}

