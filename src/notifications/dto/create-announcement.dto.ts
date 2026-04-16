import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import {
  ANNOUNCEMENT_SCOPES,
  USER_ROLES,
} from '../../database/enums';
import type { AnnouncementScope, UserRole } from '../../database/enums';

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiProperty({ enum: ANNOUNCEMENT_SCOPES })
  @IsIn(ANNOUNCEMENT_SCOPES)
  targetScope: AnnouncementScope;

  @ApiPropertyOptional({ enum: USER_ROLES, description: 'Required if targetScope=ROLE' })
  @ValidateIf((o: CreateAnnouncementDto) => o.targetScope === 'ROLE')
  @IsIn(USER_ROLES)
  targetRole?: UserRole;

  @ApiPropertyOptional({ description: 'Required if targetScope=STATION' })
  @ValidateIf((o: CreateAnnouncementDto) => o.targetScope === 'STATION')
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  targetStationId?: number;
}

