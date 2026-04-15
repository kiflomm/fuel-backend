import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import type { QuotaPeriod, VehicleCategory } from '../../database/enums';
import { QUOTA_PERIODS, VEHICLE_CATEGORIES } from '../../database/enums';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class ListQuotaRulesDto {
  @ApiPropertyOptional({ enum: VEHICLE_CATEGORIES })
  @IsOptional()
  @IsIn(VEHICLE_CATEGORIES)
  vehicleCategory?: VehicleCategory;

  @ApiPropertyOptional({ enum: QUOTA_PERIODS })
  @IsOptional()
  @IsIn(QUOTA_PERIODS)
  period?: QuotaPeriod;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  })
  @IsBoolean()
  isActive?: boolean;
}
