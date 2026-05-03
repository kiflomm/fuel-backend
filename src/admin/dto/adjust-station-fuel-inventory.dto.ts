import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

const MAX_DELTA_LITERS = 100_000_000;

export class AdjustStationFuelInventoryDto {
  @ApiProperty({ description: 'Fuel type id', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fuelTypeId: number;

  @ApiProperty({
    description: 'Liters to add to current stock (must be positive)',
    example: 500.25,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  @Max(MAX_DELTA_LITERS)
  deltaLiters: number;

  @ApiProperty({
    description: 'Short reason/category for the adjustment',
    required: false,
    example: 'Delivery received',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    description: 'Optional extended note',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
