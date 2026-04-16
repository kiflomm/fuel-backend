import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { DEVICE_PLATFORMS } from '../../database/enums';
import type { DevicePlatform } from '../../database/enums';

export class RegisterDeviceDto {
  @ApiPropertyOptional({ enum: DEVICE_PLATFORMS, default: 'ANDROID' })
  @IsOptional()
  @IsIn(DEVICE_PLATFORMS)
  platform?: DevicePlatform;

  @ApiPropertyOptional({ description: 'Firebase Cloud Messaging registration token' })
  @IsString()
  @MinLength(10)
  fcmToken: string;
}

