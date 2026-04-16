import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
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
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { AnnouncementsService } from './services/announcements.service';

@ApiTags('Admin Announcements')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a government admin' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('GOVERNMENT_ADMIN')
@Controller('admin/announcements')
export class AnnouncementsAdminController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an announcement and push to targeted users' })
  @ApiCreatedResponse({ description: 'Announcement created' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAnnouncementDto,
  ) {
    const data = await this.announcementsService.createAnnouncement({
      adminUserId: user.id,
      title: dto.title,
      body: dto.body,
      targetScope: dto.targetScope,
      targetRole: dto.targetRole,
      targetStationId: dto.targetStationId,
    });

    return {
      success: true,
      message: 'Announcement created',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List announcements (admin)' })
  @ApiOkResponse({ description: 'Announcements retrieved' })
  async list() {
    const data = await this.announcementsService.listAnnouncements();
    return {
      success: true,
      message: 'Announcements retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get announcement by id (admin)' })
  @ApiOkResponse({ description: 'Announcement retrieved' })
  async get(@Param('id', ParseIntPipe) id: number) {
    const data = await this.announcementsService.getAnnouncementById(id);
    return {
      success: true,
      message: 'Announcement retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

