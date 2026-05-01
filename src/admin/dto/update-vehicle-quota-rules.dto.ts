import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QuotaRuleItemDto } from './quota-rule-item.dto';

export class UpdateVehicleQuotaRulesDto {
  @ApiProperty({ type: [QuotaRuleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotaRuleItemDto)
  quotaRules: QuotaRuleItemDto[];
}
