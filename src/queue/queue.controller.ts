import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { QueueService } from './queue.service';
import { AuditAction } from '../audit/audit-action.decorator';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { JoinQueueDto } from './dto/join-queue.dto';

@ApiTags('Queue')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a vehicle owner' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VEHICLE_OWNER')
@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private readonly queueService: QueueService) {}

  @Get('stations')
  @ApiOperation({
    summary: 'List stations with live active queue length',
  })
  @ApiOkResponse({ description: 'Stations with queue lengths' })
  async listStations() {
    const data = await this.queueService.listStationsWithQueueLength();
    return {
      success: true,
      message: 'Stations retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('fuel-prices')
  @ApiOperation({
    summary: 'List active fuel prices before payment initiation',
  })
  @ApiOkResponse({ description: 'Fuel prices retrieved' })
  async listFuelPrices() {
    try {
      const data = await this.queueService.listFuelPrices();
      return {
        success: true,
        message: 'Fuel prices retrieved',
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `queue.fuel-prices failed at ${new Date().toISOString()} - ${this.extractErrorMessage(error)}`,
      );
      throw error;
    }
  }

  @Post('payments/initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start Chapa payment before joining a queue' })
  @ApiCreatedResponse({ description: 'Payment created; open checkoutUrl' })
  @AuditAction('INITIATE_PAYMENT', 'payments')
  async initiatePayment(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: InitiatePaymentDto,
  ) {
    try {
      const data = await this.queueService.initiatePayment(user.id, dto);
      return {
        success: true,
        message: 'Payment initiated',
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `queue.payments.initiate failed userId=${user.id} at ${new Date().toISOString()} - ${this.extractErrorMessage(error)}`,
      );
      throw error;
    }
  }

  @Post('payments/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Chapa payment with tx_ref (after redirect or poll)',
  })
  @ApiOkResponse({ description: 'Payment verified' })
  @AuditAction('VERIFY_PAYMENT', 'payments')
  async verifyPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyPaymentDto,
  ) {
    try {
      const data = await this.queueService.verifyPayment(user.id, dto.txRef);
      return {
        success: true,
        message: 'Payment verified',
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `queue.payments.verify failed userId=${user.id} txRef=${dto.txRef} at ${new Date().toISOString()} - ${this.extractErrorMessage(error)}`,
      );
      throw error;
    }
  }

  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Join queue after successful payment and valid quota',
  })
  @ApiCreatedResponse({ description: 'Joined queue' })
  @AuditAction('JOIN_QUEUE', 'queue_bookings')
  async joinQueue(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: JoinQueueDto,
  ) {
    try {
      const data = await this.queueService.joinQueue(user.id, dto.paymentId);
      return {
        success: true,
        message: 'Joined queue',
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `queue.join failed userId=${user.id} paymentId=${dto.paymentId} at ${new Date().toISOString()} - ${this.extractErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
