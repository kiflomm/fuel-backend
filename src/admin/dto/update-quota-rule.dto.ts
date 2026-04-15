import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateQuotaRuleDto {
  @ApiPropertyOptional({ description: 'Maximum liters allowed in the selected period' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  litersLimit?: number;

  @ApiPropertyOptional({ description: 'Whether this rule is currently enforced' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
