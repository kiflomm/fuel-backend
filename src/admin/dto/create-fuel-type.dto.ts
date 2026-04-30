import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateFuelTypeDto {
  @ApiProperty({ description: 'Stable code used across APIs (recommended uppercase)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'code must contain only letters, numbers, and underscores',
  })
  code: string;

  @ApiProperty({ description: 'Human-friendly display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Whether this fuel type is selectable' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

