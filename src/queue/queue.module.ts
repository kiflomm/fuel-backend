import { Module } from '@nestjs/common';
import { DrizzleModule } from '../database/drizzle.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { QueueController } from './queue.controller';
import { QueueWorkerController } from './queue.worker.controller';
import { QueueService } from './queue.service';
import { QuotaService } from './quota.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [DrizzleModule, AuthModule, PaymentModule],
  controllers: [QueueController, QueueWorkerController],
  providers: [QueueService, QuotaService, RolesGuard],
})
export class QueueModule {}
