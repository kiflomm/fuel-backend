import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StationManagerController } from './station-manager.controller';
import { StationManagerService } from './station-manager.service';

@Module({
  imports: [DrizzleModule, AuthModule],
  controllers: [StationManagerController],
  providers: [StationManagerService, RolesGuard],
})
export class StationManagerModule {}
