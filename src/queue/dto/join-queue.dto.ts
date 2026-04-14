import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class JoinQueueDto {
  @ApiProperty({ description: 'Payment row id after successful Chapa verification' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentId: number;
}
