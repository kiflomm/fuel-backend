import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'ISO date/time (inclusive) or YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time (inclusive) or YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  to?: string;
}

