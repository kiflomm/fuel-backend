import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  BadRequestException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { WorkerVerifyDto } from './dto/worker-verify.dto';
import { WorkerCompleteDto } from './dto/worker-complete.dto';
import { DateRangeQueryDto } from '../owner/dto/date-range-query.dto';

@ApiTags('Queue (Worker)')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a station worker' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STATION_WORKER')
@Controller('queue/worker')
export class QueueWorkerController {
  constructor(private readonly queueService: QueueService) {}

  @Get('station')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the assigned station info for the current worker' })
  @ApiOkResponse({ description: 'Station retrieved' })
  async getAssignedStation(@CurrentUser() user: CurrentUserPayload) {
    if (!user.stationId) {
      throw new BadRequestException('Station worker is not assigned to a station');
    }

    const data = await this.queueService.getStationById(user.stationId);
    return {
      success: true,
      message: 'Station retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a queue booking by scanning its QR token' })
  @ApiOkResponse({ description: 'Booking verified' })
  async verify(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: WorkerVerifyDto,
  ) {
    if (!user.stationId) {
      throw new BadRequestException('Station worker is not assigned to a station');
    }
    const data = await this.queueService.workerVerifyBooking(
      user.id,
      user.stationId,
      dto.verifyToken,
    );
    return {
      success: true,
      message: 'Booking verified',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a verified booking and create a transaction' })
  @ApiOkResponse({ description: 'Transaction created (idempotent)' })
  async complete(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: WorkerCompleteDto,
  ) {
    if (!user.stationId) {
      throw new BadRequestException('Station worker is not assigned to a station');
    }
    const data = await this.queueService.workerCompleteBooking(
      user.id,
      user.stationId,
      dto.verifyToken,
      dto.receiptRef,
    );
    return {
      success: true,
      message: 'Booking completed',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('transactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List transactions for current worker' })
  @ApiOkResponse({ description: 'Transactions retrieved' })
  async listTransactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DateRangeQueryDto,
  ) {
    if (!user.stationId) {
      throw new BadRequestException('Station worker is not assigned to a station');
    }
    const data = await this.queueService.listWorkerTransactions(user.stationId, query);
    return {
      success: true,
      message: 'Transactions retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('transactions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a transaction for current worker' })
  @ApiOkResponse({ description: 'Transaction retrieved' })
  async getTransaction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!user.stationId) {
      throw new BadRequestException('Station worker is not assigned to a station');
    }
    const data = await this.queueService.getWorkerTransaction(user.stationId, id);
    return {
      success: true,
      message: 'Transaction retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

