import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuditModule } from '../audit/audit.module';
import { FuelInventoryService } from './fuel-inventory.service';

@Module({
  imports: [DrizzleModule, AuditModule],
  providers: [FuelInventoryService],
  exports: [FuelInventoryService],
})
export class FuelInventoryModule {}
