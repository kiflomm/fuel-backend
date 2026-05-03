import {
  BadRequestException,
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
import { FuelInventoryService } from '../fuel-inventory/fuel-inventory.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-action.decorator';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { CreateStationManagerDto } from './dto/create-station-manager.dto';
import { CreateVehicleOwnerDto } from './dto/create-vehicle-owner.dto';
import { AddOwnerVehiclesDto } from './dto/add-owner-vehicles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpsertFuelPriceDto } from './dto/upsert-fuel-price.dto';
import { CreateFuelTypeDto } from './dto/create-fuel-type.dto';
import { CreateFuelTypeWithPriceDto } from './dto/create-fuel-type-with-price.dto';
import { UpdateFuelTypeDto } from './dto/update-fuel-type.dto';
import { ListFuelTypesDto } from './dto/list-fuel-types.dto';
import { CreateVehicleCategoryDto } from './dto/create-vehicle-category.dto';
import { UpdateVehicleCategoryDto } from './dto/update-vehicle-category.dto';
import { ListVehicleCategoriesDto } from './dto/list-vehicle-categories.dto';
import { AdminDailyTotalsQueryDto } from './dto/admin-daily-totals-query.dto';
import { AdminServiceActivityQueryDto } from './dto/admin-service-activity-query.dto';
import { AdminDistributionQueryDto } from './dto/admin-distribution-query.dto';
import { UpdateVehicleQuotaRulesDto } from './dto/update-vehicle-quota-rules.dto';
import { AdjustStationFuelInventoryDto } from './dto/adjust-station-fuel-inventory.dto';
import { ListFuelInventoryAdjustmentsQueryDto } from './dto/list-fuel-inventory-adjustments-query.dto';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a government admin' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('GOVERNMENT_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly fuelInventoryService: FuelInventoryService,
  ) {}

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
  @AuditAction('CREATE_STATION', 'stations')
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
  @AuditAction('UPDATE_STATION', 'stations')
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

  @Get('stations/:id/fuel-inventory')
  @ApiOperation({ summary: 'List per-fuel-type remaining inventory for a station' })
  @ApiOkResponse({ description: 'Fuel inventory retrieved' })
  async getStationFuelInventory(@Param('id', ParseIntPipe) id: number) {
    const data = await this.fuelInventoryService.getInventoryForStation(id);
    return {
      success: true,
      message: 'Fuel inventory retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('stations/:id/fuel-inventory/adjust')
  @ApiOperation({
    summary:
      'Add liters to current stock for one fuel type (append-only adjustment history)',
  })
  @ApiOkResponse({ description: 'Fuel inventory adjusted' })
  @AuditAction('ADJUST_STATION_FUEL_INVENTORY', 'station_fuel_inventory')
  async adjustStationFuelInventory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStationFuelInventoryDto,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    const data = await this.fuelInventoryService.adjustInventory({
      stationId: id,
      fuelTypeId: dto.fuelTypeId,
      deltaLiters: dto.deltaLiters,
      reason: dto.reason,
      note: dto.note,
      changedByUserId: actor.id,
    });
    return {
      success: true,
      message: 'Fuel inventory adjusted',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('fuel-inventory-adjustments')
  @ApiOperation({ summary: 'List fuel inventory adjustments (audit history)' })
  @ApiOkResponse({ description: 'Adjustments retrieved' })
  async listFuelInventoryAdjustments(@Query() query: ListFuelInventoryAdjustmentsQueryDto) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    if (
      fromDate &&
      toDate &&
      Number.isFinite(fromDate.getTime()) &&
      Number.isFinite(toDate.getTime()) &&
      fromDate > toDate
    ) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }
    const data = await this.fuelInventoryService.listAdjustments({
      stationId: query.stationId,
      fuelTypeId: query.fuelTypeId,
      from:
        fromDate && Number.isFinite(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && Number.isFinite(toDate.getTime()) ? toDate : undefined,
      limit,
      offset,
    });
    return {
      success: true,
      message: 'Fuel inventory adjustments retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('users/station-managers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a station manager account' })
  @ApiCreatedResponse({ description: 'Station manager created' })
  @AuditAction('CREATE_STATION_MANAGER', 'users')
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
  @AuditAction('CREATE_VEHICLE_OWNER', 'users')
  async createVehicleOwner(@Body() dto: CreateVehicleOwnerDto) {
    const data = await this.adminService.createVehicleOwner(dto);
    return {
      success: true,
      message: 'Vehicle owner created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('users/vehicle-owners/:id/vehicles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add one or more vehicles to an existing vehicle owner' })
  @ApiCreatedResponse({ description: 'Vehicles added to owner' })
  @AuditAction('ADD_VEHICLES_TO_OWNER', 'vehicles')
  async addVehiclesToOwner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddOwnerVehiclesDto,
  ) {
    const data = await this.adminService.addVehiclesToOwner(id, dto);
    return {
      success: true,
      message: 'Vehicles added',
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

  @Get('vehicles/:id/quota-rules')
  @ApiOperation({ summary: 'Get manual quota rules configured for a vehicle' })
  @ApiOkResponse({ description: 'Vehicle quota rules retrieved' })
  async getVehicleQuotaRules(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.listVehicleQuotaRules(id);
    return {
      success: true,
      message: 'Vehicle quota rules retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('vehicles/:id/quota-rules')
  @ApiOperation({ summary: 'Replace manual quota rules configured for a vehicle' })
  @ApiOkResponse({ description: 'Vehicle quota rules updated' })
  @AuditAction('UPDATE_VEHICLE_QUOTA_RULES', 'vehicle_quota_rules')
  async updateVehicleQuotaRules(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleQuotaRulesDto,
  ) {
    const data = await this.adminService.updateVehicleQuotaRules(id, dto.quotaRules);
    return {
      success: true,
      message: 'Vehicle quota rules updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Activate or suspend a user account' })
  @ApiOkResponse({ description: 'User status updated' })
  @AuditAction('UPDATE_USER_STATUS', 'users')
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

  @Get('fuel-types')
  @ApiOperation({ summary: 'List fuel types' })
  @ApiOkResponse({ description: 'Fuel types' })
  async listFuelTypes(@Query() query: ListFuelTypesDto) {
    const data = await this.adminService.listFuelTypes(query);
    return {
      success: true,
      message: 'Fuel types retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('fuel-types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a fuel type with price' })
  @ApiCreatedResponse({ description: 'Fuel type and price created' })
  @AuditAction('CREATE_FUEL_TYPE', 'fuel_types')
  async createFuelTypeWithPrice(@Body() dto: CreateFuelTypeWithPriceDto) {
    const data = await this.adminService.createFuelTypeWithPrice(dto);
    return {
      success: true,
      message: 'Fuel type and price created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('fuel-types/:id')
  @ApiOperation({ summary: 'Update a fuel type' })
  @ApiOkResponse({ description: 'Fuel type updated' })
  @AuditAction('UPDATE_FUEL_TYPE', 'fuel_types')
  async updateFuelType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFuelTypeDto,
  ) {
    const data = await this.adminService.updateFuelType(id, dto);
    return {
      success: true,
      message: 'Fuel type updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('fuel-types/:id')
  @ApiOperation({ summary: 'Delete a fuel type' })
  @ApiOkResponse({ description: 'Fuel type deleted' })
  @AuditAction('DELETE_FUEL_TYPE', 'fuel_types')
  async deleteFuelType(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.deleteFuelType(id);
    return {
      success: true,
      message: 'Fuel type deleted',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('fuel-prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update a fuel price by fuel type' })
  @ApiCreatedResponse({ description: 'Fuel price upserted' })
  @AuditAction('UPSERT_FUEL_PRICE', 'fuel_prices')
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

  @Post('vehicle-categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a vehicle category' })
  @ApiCreatedResponse({ description: 'Vehicle category created' })
  @AuditAction('CREATE_VEHICLE_CATEGORY', 'vehicle_categories')
  async createVehicleCategory(@Body() dto: CreateVehicleCategoryDto) {
    const data = await this.adminService.createVehicleCategory(dto);
    return {
      success: true,
      message: 'Vehicle category created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('vehicle-categories')
  @ApiOperation({ summary: 'List vehicle categories' })
  @ApiOkResponse({ description: 'Vehicle categories retrieved' })
  async listVehicleCategories(@Query() query: ListVehicleCategoriesDto) {
    const data = await this.adminService.listVehicleCategories(query);
    return {
      success: true,
      message: 'Vehicle categories retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('vehicle-categories/:id')
  @ApiOperation({ summary: 'Get a vehicle category by id' })
  @ApiOkResponse({ description: 'Vehicle category retrieved' })
  async getVehicleCategory(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.getVehicleCategoryById(id);
    return {
      success: true,
      message: 'Vehicle category retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Patch('vehicle-categories/:id')
  @ApiOperation({ summary: 'Update a vehicle category' })
  @ApiOkResponse({ description: 'Vehicle category updated' })
  @AuditAction('UPDATE_VEHICLE_CATEGORY', 'vehicle_categories')
  async updateVehicleCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleCategoryDto,
  ) {
    const data = await this.adminService.updateVehicleCategory(id, dto);
    return {
      success: true,
      message: 'Vehicle category updated',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('vehicle-categories/:id')
  @ApiOperation({ summary: 'Delete a vehicle category' })
  @ApiOkResponse({ description: 'Vehicle category deleted' })
  @AuditAction('DELETE_VEHICLE_CATEGORY', 'vehicle_categories')
  async deleteVehicleCategory(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.deleteVehicleCategory(id);
    return {
      success: true,
      message: 'Vehicle category deleted',
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

  @Get('audit-logs')
  @ApiOperation({ summary: 'View system audit logs' })
  @ApiOkResponse({ description: 'Audit logs retrieved' })
  async getAuditLogs(
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;
    const data = await this.auditService.getAuditLogs(limit, offset);
    return {
      success: true,
      message: 'Audit logs retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

