import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  IsEmail,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { QuotaPeriod } from '../../database/enums';
import { QUOTA_PERIODS } from '../../database/enums';

export class CreateVehicleQuotaRuleItemDto {
  @ApiProperty({ enum: QUOTA_PERIODS })
  @IsNotEmpty()
  @IsIn(QUOTA_PERIODS)
  period: QuotaPeriod;

  @ApiProperty({ example: 120 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  litersLimit: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateVehicleItemDto {
  @ApiProperty({ example: '3-12345-AA' })
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ type: [CreateVehicleQuotaRuleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleQuotaRuleItemDto)
  quotaRules: CreateVehicleQuotaRuleItemDto[];
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
