import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class AdminServiceActivityQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start datetime filter' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end datetime filter' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Optional station filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  stationId?: number;
}

