import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { AnnouncementsService } from './services/announcements.service';

@ApiTags('Devices')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register/update the current user device for push notifications' })
  @ApiCreatedResponse({ description: 'Device registered' })
  async register(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegisterDeviceDto,
  ) {
    const data = await this.announcementsService.registerDevice({
      userId: user.id,
      platform: dto.platform ?? 'ANDROID',
      fcmToken: dto.fcmToken,
    });
    return {
      success: true,
      message: 'Device registered',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('unregister')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a device token for the current user' })
  @ApiOkResponse({ description: 'Device unregistered' })
  async unregister(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegisterDeviceDto,
  ) {
    const data = await this.announcementsService.unregisterDevice({
      userId: user.id,
      fcmToken: dto.fcmToken,
    });
    return {
      success: true,
      message: 'Device unregistered',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

