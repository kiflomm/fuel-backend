import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ description: 'Suspend (false) or re-activate (true) the account.' })
  @IsBoolean()
  isActive: boolean;
}
