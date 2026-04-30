import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InitiatePaymentDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehicleId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stationId: number;

  @ApiProperty({ description: 'Fuel type code (admin-managed)' })
  @IsString()
  @IsNotEmpty()
  fuelType: string;

  @ApiProperty({ description: 'Liters requested (must be within remaining quota)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  litersRequested: number;

  /** Chapa requires a phone number for checkout. */
  @ApiProperty({ example: '+251911234567' })
  @IsString()
  @IsNotEmpty()
  @MinLength(9)
  @MaxLength(20)
  phoneNumber: string;
}
