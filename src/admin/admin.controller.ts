import {
  Body,
  Controller,
  Delete,
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
import { UpsertFuelPriceDto } from './dto/upsert-fuel-price.dto';
import { CreateQuotaRuleDto } from './dto/create-quota-rule.dto';
import { UpdateQuotaRuleDto } from './dto/update-quota-rule.dto';
import { ListQuotaRulesDto } from './dto/list-quota-rules.dto';
import { AdminDailyTotalsQueryDto } from './dto/admin-daily-totals-query.dto';
import { AdminServiceActivityQueryDto } from './dto/admin-service-activity-query.dto';
import { AdminDistributionQueryDto } from './dto/admin-distribution-query.dto';

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

  @Get('stations')
  @ApiOperation({ summary: 'List fuel stations' })
  @ApiOkResponse({ description: 'Stations retrieved' })
  async listStations() {
    const data = await this.adminService.listStations();
    return {
      success: true,
      message: 'Stations retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stations/:id')
  @ApiOperation({ summary: 'Get a fuel station by id' })
  @ApiOkResponse({ description: 'Station retrieved' })
  async getStation(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.getStationById(id);
    return {
      success: true,
      message: 'Station retrieved',
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

  @Get('users')
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ description: 'Users retrieved' })
  async listUsers() {
    const data = await this.adminService.listUsers();
    return {
      success: true,
      message: 'Users retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkResponse({ description: 'User retrieved' })
  async getUser(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.getUserById(id);
    return {
      success: true,
      message: 'User retrieved',
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

  @Post('fuel-prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update a fuel price by fuel type' })
  @ApiCreatedResponse({ description: 'Fuel price upserted' })
  async upsertFuelPrice(@Body() dto: UpsertFuelPriceDto) {
    const data = await this.adminService.upsertFuelPrice(dto);
    return {
      success: true,
      message: 'Fuel price saved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('fuel-prices')
  @ApiOperation({ summary: 'List configured fuel prices' })
  @ApiOkResponse({ description: 'Fuel prices' })
  async listFuelPrices() {
    const data = await this.adminService.listFuelPrices();
    return {
      success: true,
      message: 'Fuel prices retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('quota-rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a quota rule for a vehicle category and period' })
  @ApiCreatedResponse({ description: 'Quota rule created' })
  async createQuotaRule(@Body() dto: CreateQuotaRuleDto) {
    const data = await this.adminService.createQuotaRule(dto);
    return {
      success: true,
      message: 'Quota rule created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('quota-rules')
  @ApiOperation({ summary: 'List quota rules' })
  @ApiOkResponse({ description: 'Quota rules retrieved' })
  async listQuotaRules(@Query() query: ListQuotaRulesDto) {
    const data = await this.adminService.listQuotaRules(query);
    return {
      success: true,
      message: 'Quota rules retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('quota-rules/:id')
  @ApiOperation({ summary: 'Get a quota rule by id' })
  @ApiOkResponse({ description: 'Quota rule retrieved' })
  async getQuotaRule(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.getQuotaRuleById(id);
    return {
      success: true,
      message: 'Quota rule retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('quota-rules/:id')
  @ApiOperation({ summary: 'Update a quota rule' })
  @ApiOkResponse({ description: 'Quota rule updated' })
  async updateQuotaRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuotaRuleDto,
  ) {
    const data = await this.adminService.updateQuotaRule(id, dto);
    return {
      success: true,
      message: 'Quota rule updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('quota-rules/:id')
  @ApiOperation({ summary: 'Delete a quota rule' })
  @ApiOkResponse({ description: 'Quota rule deleted' })
  async deleteQuotaRule(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.deleteQuotaRule(id);
    return {
      success: true,
      message: 'Quota rule deleted',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('reports/daily-totals')
  @ApiOperation({ summary: 'View daily system totals (optionally per-station)' })
  @ApiOkResponse({ description: 'Daily totals retrieved' })
  async getDailyTotals(@Query() query: AdminDailyTotalsQueryDto) {
    const data = await this.adminService.getDailyTotals(query);
    return {
      success: true,
      message: 'Daily totals retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('reports/service-activity')
  @ApiOperation({
    summary: 'View service activity (aggregate by station worker; optional station filter)',
  })
  @ApiOkResponse({ description: 'Service activity retrieved' })
  async getServiceActivity(@Query() query: AdminServiceActivityQueryDto) {
    const data = await this.adminService.getServiceActivity(query);
    return {
      success: true,
      message: 'Service activity retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('reports/distribution')
  @ApiOperation({
    summary:
      'View fuel distribution breakdowns (by station, vehicle category, fuel type)',
  })
  @ApiOkResponse({ description: 'Distribution report retrieved' })
  async getDistribution(@Query() query: AdminDistributionQueryDto) {
    const data = await this.adminService.getDistributionReport(query);
    return {
      success: true,
      message: 'Distribution report retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
