import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class WorkerCompleteDto {
  @ApiProperty({ description: 'Queue booking verify token (QR code payload)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  verifyToken: string;

  @ApiPropertyOptional({ description: 'Optional receipt reference/number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptRef?: string;
}

