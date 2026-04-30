import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateFuelTypeDto {
  @ApiPropertyOptional({ description: 'Stable code used across APIs (recommended uppercase)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'code must contain only letters, numbers, and underscores',
  })
  code?: string;

  @ApiPropertyOptional({ description: 'Human-friendly display name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Whether this fuel type is selectable' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

