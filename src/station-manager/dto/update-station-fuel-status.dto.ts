import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class UpdateStationFuelStatusDto {
  @ApiProperty({ description: 'Remaining fuel in liters' })
  @IsNumber()
  remainingFuel: number;
}
