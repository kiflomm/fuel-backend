import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsIn,
} from 'class-validator';
import type { StationFuelStatus } from '../../database/enums';
import { STATION_FUEL_STATUSES } from '../../database/enums';

export class CreateStationDto {
  @ApiProperty({ example: 'Mekelle Central' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Kebele 05' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Mekelle' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '+251...' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: { mon: { open: '06:00', close: '18:00' } },
    description: 'Structured operating hours (opaque JSON for clients)',
  })
  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: STATION_FUEL_STATUSES })
  @IsOptional()
  @IsIn(STATION_FUEL_STATUSES)
  fuelStatus?: StationFuelStatus;
}
