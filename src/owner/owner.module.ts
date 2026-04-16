import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuthModule } from '../auth/auth.module';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { QuotaService } from '../queue/quota.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [DrizzleModule, AuthModule],
  controllers: [OwnerController],
  providers: [OwnerService, QuotaService, RolesGuard],
})
export class OwnerModule {}

