import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export const REVENUE_GRANULARITIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type RevenueGranularity = (typeof REVENUE_GRANULARITIES)[number];

export class RevenueTimeseriesQueryDto {
  @ApiProperty({ description: 'Inclusive start date (UTC calendar day), YYYY-MM-DD', example: '2026-01-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ description: 'Inclusive end date (UTC calendar day), YYYY-MM-DD', example: '2026-01-31' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to!: string;

  @ApiProperty({
    enum: REVENUE_GRANULARITIES,
    description:
      'Time bucket size. Weekly buckets use ISO weeks (Monday start) in UTC. Monthly buckets are calendar months in UTC.',
  })
  @IsIn([...REVENUE_GRANULARITIES])
  granularity!: RevenueGranularity;
}
