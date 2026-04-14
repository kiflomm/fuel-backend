import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FuelType } from '../../database/enums';
import { FUEL_TYPES } from '../../database/enums';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertFuelPriceDto {
  @ApiProperty({ enum: FUEL_TYPES })
  @IsIn(FUEL_TYPES)
  fuelType: FuelType;

  @ApiProperty({ description: 'Price per liter (ETB)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  pricePerLiter: number;

  @ApiPropertyOptional({ description: 'Whether this fuel type is available for payments' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

