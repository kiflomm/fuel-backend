import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditModule } from '../audit/audit.module';
import { FuelInventoryModule } from '../fuel-inventory/fuel-inventory.module';
import { RevenueReportingModule } from '../revenue-reporting/revenue-reporting.module';

@Module({
  imports: [DrizzleModule, AuthModule, AuditModule, FuelInventoryModule, RevenueReportingModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
})
export class AdminModule {}
