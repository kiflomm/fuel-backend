import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { CreateStationManagerDto } from './dto/create-station-manager.dto';
import { CreateVehicleOwnerDto } from './dto/create-vehicle-owner.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a government admin' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('GOVERNMENT_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('health')
  @ApiOperation({ summary: 'Verify admin authentication' })
  @ApiOkResponse({ description: 'Authenticated as GOVERNMENT_ADMIN' })
  health(@CurrentUser() user: CurrentUserPayload) {
    return {
      success: true,
      message: 'Admin context OK',
      data: { role: user.role, userId: user.id },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('stations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a fuel station' })
  @ApiCreatedResponse({ description: 'Station created' })
  async createStation(@Body() dto: CreateStationDto) {
    const data = await this.adminService.createStation(dto);
    return {
      success: true,
      message: 'Station created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('stations/:id')
  @ApiOperation({ summary: 'Update a fuel station' })
  @ApiOkResponse({ description: 'Station updated' })
  async updateStation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStationDto,
  ) {
    const data = await this.adminService.updateStation(id, dto);
    return {
      success: true,
      message: 'Station updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('users/station-managers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a station manager account' })
  @ApiCreatedResponse({ description: 'Station manager created' })
  async createStationManager(@Body() dto: CreateStationManagerDto) {
    const data = await this.adminService.createStationManager(dto);
    return {
      success: true,
      message: 'Station manager created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('users/vehicle-owners')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a vehicle owner account with one or more vehicles',
  })
  @ApiCreatedResponse({ description: 'Vehicle owner and vehicles created' })
  async createVehicleOwner(@Body() dto: CreateVehicleOwnerDto) {
    const data = await this.adminService.createVehicleOwner(dto);
    return {
      success: true,
      message: 'Vehicle owner created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Activate or suspend a user account' })
  @ApiOkResponse({ description: 'User status updated' })
  async updateUserStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    const data = await this.adminService.updateUserStatus(id, actor.id, dto);
    return {
      success: true,
      message: 'User status updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
