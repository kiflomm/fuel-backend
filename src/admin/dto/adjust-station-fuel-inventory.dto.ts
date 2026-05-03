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

export class AdjustStationFuelInventoryDto {
  @ApiProperty({ description: 'Fuel type id', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fuelTypeId: number;

  @ApiProperty({ description: 'New remaining liters at the station', example: 4500.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  remainingLiters: number;

  @ApiProperty({
    description: 'Short reason/category for the adjustment',
    required: false,
    example: 'Physical dip count',
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
