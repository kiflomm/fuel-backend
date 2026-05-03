import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StationManagerController } from './station-manager.controller';
import { StationManagerService } from './station-manager.service';
import { FuelInventoryModule } from '../fuel-inventory/fuel-inventory.module';

@Module({
  imports: [DrizzleModule, AuthModule, FuelInventoryModule],
  controllers: [StationManagerController],
  providers: [StationManagerService, RolesGuard],
})
export class StationManagerModule {}
