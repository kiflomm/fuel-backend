import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { RevenueTimeseriesQueryDto } from './revenue-timeseries-query.dto';

export class AdminRevenueTimeseriesQueryDto extends RevenueTimeseriesQueryDto {
  @ApiPropertyOptional({ description: 'Optional station filter (admin only)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  stationId?: number;
}
