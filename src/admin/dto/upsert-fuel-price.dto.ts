import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertFuelPriceDto {
  @ApiProperty({ description: 'Fuel type code (admin-managed)' })
  @IsString()
  @IsNotEmpty()
  fuelTypeCode: string;

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

