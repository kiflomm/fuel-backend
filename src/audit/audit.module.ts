import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { DrizzleModule } from '../database/drizzle.module';

@Module({
  imports: [DrizzleModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
