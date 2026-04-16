import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class AdminDailyTotalsQueryDto {
  @ApiPropertyOptional({ description: 'Calendar date in YYYY-MM-DD format (UTC)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @ApiPropertyOptional({ description: 'Optional station filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  stationId?: number;
}

