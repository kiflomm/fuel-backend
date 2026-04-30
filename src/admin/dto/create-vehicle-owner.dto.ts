import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { VehicleCategory } from '../../database/enums';
import { VEHICLE_CATEGORIES } from '../../database/enums';

export class CreateVehicleItemDto {
  @ApiProperty({ example: '3-12345-AA' })
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @ApiProperty({ enum: VEHICLE_CATEGORIES })
  @IsIn(VEHICLE_CATEGORIES)
  category: VehicleCategory;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateVehicleOwnerDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ type: [CreateVehicleItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleItemDto)
  vehicles?: CreateVehicleItemDto[];
}
