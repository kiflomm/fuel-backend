import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Same tx_ref used for Chapa initialize and verify' })
  @IsString()
  @IsNotEmpty()
  txRef: string;
}
