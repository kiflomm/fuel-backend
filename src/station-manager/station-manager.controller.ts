import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { StationManagerService } from './station-manager.service';
import { CreateStationWorkerDto } from './dto/create-station-worker.dto';

@ApiTags('Station Manager')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a station manager' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STATION_MANAGER')
@Controller('station-manager')
export class StationManagerController {
  constructor(private readonly stationManagerService: StationManagerService) {}

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
}
