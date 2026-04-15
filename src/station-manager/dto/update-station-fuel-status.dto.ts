import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { StationFuelStatus } from '../../database/enums';
import { STATION_FUEL_STATUSES } from '../../database/enums';

export class UpdateStationFuelStatusDto {
  @ApiProperty({ enum: STATION_FUEL_STATUSES })
  @IsIn(STATION_FUEL_STATUSES)
  fuelStatus: StationFuelStatus;
}
