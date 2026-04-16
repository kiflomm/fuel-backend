import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { AnnouncementsService } from './services/announcements.service';

@ApiTags('Owner Announcements')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Not a vehicle owner' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VEHICLE_OWNER')
@Controller('owner/announcements')
export class AnnouncementsOwnerController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'List announcements visible to the current owner' })
  @ApiOkResponse({ description: 'Announcements retrieved' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.announcementsService.listAnnouncementsForUser({
      userId: user.id,
    });
    return {
      success: true,
      message: 'Announcements retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

