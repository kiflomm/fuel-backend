import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStationWorkerStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
