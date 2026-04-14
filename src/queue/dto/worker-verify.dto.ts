import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class WorkerVerifyDto {
  @ApiProperty({ description: 'Queue booking verify token (QR code payload)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  verifyToken: string;
}

