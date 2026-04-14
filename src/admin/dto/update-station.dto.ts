import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsIn,
} from 'class-validator';
import type { StationFuelStatus } from '../../database/enums';
import { STATION_FUEL_STATUSES } from '../../database/enums';

export class UpdateStationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: STATION_FUEL_STATUSES })
  @IsOptional()
  @IsIn(STATION_FUEL_STATUSES)
  fuelStatus?: StationFuelStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'When true, vehicle owners cannot join the queue at this station.',
  })
  @IsOptional()
  @IsBoolean()
  queueIntakePaused?: boolean;
}
