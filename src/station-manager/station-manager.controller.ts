import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { StationManagerService } from './station-manager.service';
import { FuelInventoryService } from '../fuel-inventory/fuel-inventory.service';
import { AuditAction } from '../audit/audit-action.decorator';
import { CreateStationWorkerDto } from './dto/create-station-worker.dto';
import { UpdateStationWorkerDto } from './dto/update-station-worker.dto';
import { UpdateStationWorkerStatusDto } from './dto/update-station-worker-status.dto';
import { ListStationTransactionsQueryDto } from './dto/list-station-transactions-query.dto';
import { DailyTotalsQueryDto } from './dto/daily-totals-query.dto';
import { ServiceActivityQueryDto } from './dto/service-activity-query.dto';

@ApiTags('Station Manager')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a station manager' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STATION_MANAGER')
@Controller('station-manager')
export class StationManagerController {
  constructor(
    private readonly stationManagerService: StationManagerService,
    private readonly fuelInventoryService: FuelInventoryService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Verify station manager authentication' })
  @ApiOkResponse({ description: 'Authenticated as STATION_MANAGER' })
  health(@CurrentUser() user: CurrentUserPayload) {
    return {
      success: true,
      message: 'Station manager context OK',
      data: { role: user.role, userId: user.id, stationId: user.stationId },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('users/station-workers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a station worker account for your station' })
  @ApiCreatedResponse({ description: 'Station worker created' })
  @AuditAction('CREATE_STATION_WORKER', 'users')
  async createStationWorker(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateStationWorkerDto,
  ) {
    const data = await this.stationManagerService.createStationWorker(user.id, dto);
    return {
      success: true,
      message: 'Station worker created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('users/station-workers')
  @ApiOperation({ summary: 'List station worker accounts for your station' })
  @ApiOkResponse({ description: 'Station workers retrieved' })
  async listStationWorkers(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.stationManagerService.listStationWorkers(user.id);
    return {
      success: true,
      message: 'Station workers retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('users/station-workers/:id')
  @ApiOperation({ summary: 'Get a station worker account for your station' })
  @ApiOkResponse({ description: 'Station worker retrieved' })
  async getStationWorker(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.stationManagerService.getStationWorker(user.id, id);
    return {
      success: true,
      message: 'Station worker retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('users/station-workers/:id')
  @ApiOperation({ summary: 'Update a station worker account for your station' })
  @ApiOkResponse({ description: 'Station worker updated' })
  @AuditAction('UPDATE_STATION_WORKER', 'users')
  async updateStationWorker(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStationWorkerDto,
  ) {
    const data = await this.stationManagerService.updateStationWorker(
      user.id,
      id,
      dto,
    );
    return {
      success: true,
      message: 'Station worker updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('users/station-workers/:id/status')
  @ApiOperation({ summary: 'Activate or suspend a station worker account' })
  @ApiOkResponse({ description: 'Station worker status updated' })
  @AuditAction('UPDATE_STATION_WORKER_STATUS', 'users')
  async updateStationWorkerStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStationWorkerStatusDto,
  ) {
    const data = await this.stationManagerService.updateStationWorkerStatus(
      user.id,
      id,
      dto,
    );
    return {
      success: true,
      message: 'Station worker status updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('fuel-inventory')
  @ApiOperation({ summary: 'View per-fuel-type remaining inventory for your station (refresh manually)' })
  @ApiOkResponse({ description: 'Fuel inventory retrieved' })
  async getFuelInventory(@CurrentUser() user: CurrentUserPayload) {
    if (user.stationId == null) {
      throw new BadRequestException('Station manager has no assigned station');
    }
    const data = await this.fuelInventoryService.getInventoryForStation(user.stationId);
    return {
      success: true,
      message: 'Fuel inventory retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('queue/live')
  @ApiOperation({ summary: 'View the live queue for your station' })
  @ApiOkResponse({ description: 'Live queue retrieved' })
  async getLiveQueue(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.stationManagerService.getLiveQueue(user.id);
    return {
      success: true,
      message: 'Live queue retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('queue/intake/pause')
  @ApiOperation({ summary: 'Pause queue intake for your station' })
  @ApiOkResponse({ description: 'Queue intake paused' })
  @AuditAction('PAUSE_QUEUE_INTAKE', 'stations')
  async pauseQueueIntake(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.stationManagerService.setQueueIntakePaused(
      user.id,
      true,
    );
    return {
      success: true,
      message: 'Queue intake paused',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('queue/intake/resume')
  @ApiOperation({ summary: 'Resume queue intake for your station' })
  @ApiOkResponse({ description: 'Queue intake resumed' })
  @AuditAction('RESUME_QUEUE_INTAKE', 'stations')
  async resumeQueueIntake(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.stationManagerService.setQueueIntakePaused(
      user.id,
      false,
    );
    return {
      success: true,
      message: 'Queue intake resumed',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'View transaction history for your station' })
  @ApiOkResponse({ description: 'Station transactions retrieved' })
  async listTransactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListStationTransactionsQueryDto,
  ) {
    const data = await this.stationManagerService.listTransactions(user.id, query);
    return {
      success: true,
      message: 'Station transactions retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('reports/daily-totals')
  @ApiOperation({ summary: 'View daily station totals' })
  @ApiOkResponse({ description: 'Daily station totals retrieved' })
  async getDailyTotals(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DailyTotalsQueryDto,
  ) {
    const data = await this.stationManagerService.getDailyTotals(user.id, query);
    return {
      success: true,
      message: 'Daily station totals retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('reports/service-activity')
  @ApiOperation({ summary: 'View service activity for your station' })
  @ApiOkResponse({ description: 'Service activity retrieved' })
  async getServiceActivity(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ServiceActivityQueryDto,
  ) {
    const data = await this.stationManagerService.getServiceActivity(user.id, query);
    return {
      success: true,
      message: 'Service activity retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
