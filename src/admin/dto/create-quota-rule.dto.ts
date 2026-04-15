import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { QuotaPeriod, VehicleCategory } from '../../database/enums';
import { QUOTA_PERIODS, VEHICLE_CATEGORIES } from '../../database/enums';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateQuotaRuleDto {
  @ApiProperty({ enum: VEHICLE_CATEGORIES })
  @IsIn(VEHICLE_CATEGORIES)
  vehicleCategory: VehicleCategory;

  @ApiProperty({ enum: QUOTA_PERIODS })
  @IsIn(QUOTA_PERIODS)
  period: QuotaPeriod;

  @ApiProperty({ description: 'Maximum liters allowed in the selected period' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  litersLimit: number;

  @ApiPropertyOptional({ description: 'Whether this rule is currently enforced' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
