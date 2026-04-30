import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListVehicleCategoriesDto {
  @ApiPropertyOptional({ description: 'Include inactive categories' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  })
  @IsBoolean()
  includeInactive?: boolean;
}
