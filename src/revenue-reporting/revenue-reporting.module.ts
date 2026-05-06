import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { RevenueReportingService } from './revenue-reporting.service';

@Module({
  imports: [DrizzleModule],
  providers: [RevenueReportingService],
  exports: [RevenueReportingService],
})
export class RevenueReportingModule {}
