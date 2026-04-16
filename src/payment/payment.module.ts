import { Module } from '@nestjs/common';
import { ChapaService } from './chapa.service';
import { DrizzleModule } from '../database/drizzle.module';
import { PaymentProcessingService } from './payment-processing.service';
import { ChapaWebhookController } from './chapa.webhook.controller';

@Module({
  imports: [DrizzleModule],
  controllers: [ChapaWebhookController],
  providers: [ChapaService, PaymentProcessingService],
  exports: [ChapaService, PaymentProcessingService],
})
export class PaymentModule {}
