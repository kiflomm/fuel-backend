import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import type { QuotaPeriod } from '../../database/enums';
import { QUOTA_PERIODS } from '../../database/enums';

export class QuotaRuleItemDto {
  @ApiProperty({ enum: QUOTA_PERIODS })
  @IsNotEmpty()
  @IsIn(QUOTA_PERIODS)
  period: QuotaPeriod;

  @ApiProperty({ example: 120 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  litersLimit: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
