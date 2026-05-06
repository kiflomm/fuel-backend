import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class DailyTotalsQueryDto {
  @ApiPropertyOptional({
    description:
      'Single calendar date (YYYY-MM-DD). When set, returns one row for that day (legacy).',
  })
  @IsOptional()
  @Matches(YMD, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @ApiPropertyOptional({ description: 'Range start (YYYY-MM-DD, inclusive)' })
  @IsOptional()
  @Matches(YMD, {
    message: 'from must be in YYYY-MM-DD format',
  })
  from?: string;

  @ApiPropertyOptional({ description: 'Range end (YYYY-MM-DD, inclusive)' })
  @IsOptional()
  @Matches(YMD, {
    message: 'to must be in YYYY-MM-DD format',
  })
  to?: string;
}
