import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateVehicleItemDto } from './create-vehicle-owner.dto';

export class AddOwnerVehiclesDto {
  @ApiProperty({ type: [CreateVehicleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleItemDto)
  vehicles: CreateVehicleItemDto[];
}

