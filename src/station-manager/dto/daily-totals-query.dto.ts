import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DailyTotalsQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start datetime filter' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end datetime filter' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
