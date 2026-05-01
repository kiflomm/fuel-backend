import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuotaRuleItemDto } from './quota-rule-item.dto';

export class CreateVehicleCategoryDto {
  @ApiProperty({ example: 'PRIVATE_CAR' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Private Car' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    default: 0,
    description: 'Fuel subsidy percentage applied to this category (0-100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  fuelSubsidyPercentage?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [QuotaRuleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotaRuleItemDto)
  quotaRules: QuotaRuleItemDto[];
}
