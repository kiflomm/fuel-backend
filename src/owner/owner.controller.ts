import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
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
import { OwnerService } from './owner.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';

@ApiTags('Owner')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a vehicle owner' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VEHICLE_OWNER')
@Controller('owner')
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'List vehicles for current owner' })
  @ApiOkResponse({ description: 'Vehicles retrieved' })
  async listVehicles(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.ownerService.listVehicles(user.id);
    return {
      success: true,
      message: 'Vehicles retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Get a vehicle for current owner' })
  @ApiOkResponse({ description: 'Vehicle retrieved' })
  async getVehicle(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.ownerService.getVehicle(user.id, id);
    return {
      success: true,
      message: 'Vehicle retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('vehicles/:id/quota')
  @ApiOperation({ summary: 'Get quota status for a vehicle (all active periods)' })
  @ApiOkResponse({ description: 'Vehicle quota retrieved' })
  async getVehicleQuota(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.ownerService.getVehicleQuota(user.id, id);
    return {
      success: true,
      message: 'Vehicle quota retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('queue/active')
  @ApiOperation({ summary: 'Get active queue bookings for current owner' })
  @ApiOkResponse({ description: 'Active queue retrieved' })
  async getActiveQueue(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.ownerService.getActiveQueue(user.id);
    return {
      success: true,
      message: 'Active queue retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List transactions for current owner' })
  @ApiOkResponse({ description: 'Transactions retrieved' })
  async listTransactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DateRangeQueryDto,
  ) {
    const data = await this.ownerService.listTransactions(user.id, query);
    return {
      success: true,
      message: 'Transactions retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get a transaction/receipt for current owner' })
  @ApiOkResponse({ description: 'Transaction retrieved' })
  async getTransaction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.ownerService.getTransaction(user.id, id);
    return {
      success: true,
      message: 'Transaction retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

