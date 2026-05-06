import { BadRequestException, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../database/schema';
import { inArray, sql } from 'drizzle-orm';
import type { RevenueGranularity } from './dto/revenue-timeseries-query.dto';

export interface RevenueTimeseriesTotals {
  revenue: string;
  transactionCount: number;
  litersDispensed: string;
  uniqueVehicles: number;
}

export interface RevenueStationBreakdown extends RevenueTimeseriesTotals {
  stationId: number;
  stationName: string | null;
}

export interface RevenueTimeseriesBucket {
  periodStart: string;
  periodEnd: string;
  totals: RevenueTimeseriesTotals;
  byStation?: RevenueStationBreakdown[];
}

export interface RevenueTimeseriesResult {
  granularity: RevenueGranularity;
  from: string;
  to: string;
  /** Revenue includes only payments with status SUCCESS (see API docs). */
  paymentStatusFilter: 'SUCCESS';
  buckets: RevenueTimeseriesBucket[];
}

type TimeseriesScope =
  | { type: 'GLOBAL'; stationId?: number }
  | { type: 'STATION'; stationId: number };

interface BucketTotalsRow {
  bucket_start: unknown;
  transaction_count: unknown;
  liters_dispensed: unknown;
  unique_vehicles: unknown;
  revenue: unknown;
}

interface StationAggRow extends BucketTotalsRow {
  station_id: number;
}

@Injectable()
export class RevenueReportingService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getTimeseries(
    fromYmd: string,
    toYmd: string,
    granularity: RevenueGranularity,
    scope: TimeseriesScope,
    includeStationBreakdown: boolean,
  ): Promise<RevenueTimeseriesResult> {
    if (fromYmd > toYmd) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }

    const rangeStart = new Date(`${fromYmd}T00:00:00.000Z`);
    const rangeEnd = new Date(`${toYmd}T23:59:59.999Z`);

    const stationIdFilter =
      scope.type === 'STATION' ? scope.stationId : scope.stationId;

    const truncUnit = granularity === 'DAILY' ? 'day' : granularity === 'WEEKLY' ? 'week' : 'month';

    const stationFilter =
      stationIdFilter !== undefined ? sql`AND t.station_id = ${stationIdFilter}` : sql``;

    const bucketExpr = sql.raw(
      `date_trunc('${truncUnit}', timezone('UTC', t.served_at))`,
    );

    const bucketTotalsQuery = sql`
      SELECT
        ${bucketExpr} AS bucket_start,
        COUNT(*)::int AS transaction_count,
        COALESCE(SUM(t.liters_dispensed::numeric), 0) AS liters_dispensed,
        COUNT(DISTINCT t.vehicle_id)::int AS unique_vehicles,
        COALESCE(SUM(p.amount::numeric), 0) AS revenue
      FROM transactions t
      INNER JOIN payments p ON p.id = t.payment_id
      WHERE p.status = 'SUCCESS'
        AND t.served_at >= ${rangeStart}
        AND t.served_at <= ${rangeEnd}
        ${stationFilter}
      GROUP BY ${bucketExpr}
      ORDER BY bucket_start ASC
    `;

    const byStationQuery = sql`
      SELECT
        ${bucketExpr} AS bucket_start,
        t.station_id AS station_id,
        COUNT(*)::int AS transaction_count,
        COALESCE(SUM(t.liters_dispensed::numeric), 0) AS liters_dispensed,
        COUNT(DISTINCT t.vehicle_id)::int AS unique_vehicles,
        COALESCE(SUM(p.amount::numeric), 0) AS revenue
      FROM transactions t
      INNER JOIN payments p ON p.id = t.payment_id
      WHERE p.status = 'SUCCESS'
        AND t.served_at >= ${rangeStart}
        AND t.served_at <= ${rangeEnd}
        ${stationFilter}
      GROUP BY ${bucketExpr}, t.station_id
      ORDER BY bucket_start ASC, t.station_id ASC
    `;

    const totalsExec = await this.db.execute(bucketTotalsQuery);
    const totalsRows = this.rowsFromExecute<BucketTotalsRow>(totalsExec);

    const stationExec = includeStationBreakdown ? await this.db.execute(byStationQuery) : null;
    const stationRows: StationAggRow[] = includeStationBreakdown
      ? this.rowsFromExecute<StationAggRow>(stationExec)
      : [];

    const totalsByBucket = new Map<
      string,
      {
        transactionCount: number;
        litersDispensed: number;
        uniqueVehicles: number;
        revenue: number;
      }
    >();

    for (const row of totalsRows) {
      const bucketStart = this.parseBucketStart(row.bucket_start);
      const key = bucketStart.toISOString();
      totalsByBucket.set(key, {
        transactionCount: Number(row.transaction_count),
        litersDispensed: Number(row.liters_dispensed),
        uniqueVehicles: Number(row.unique_vehicles),
        revenue: Number(row.revenue),
      });
    }

    if (granularity === 'DAILY') {
      let cursor = fromYmd;
      while (cursor <= toYmd) {
        const dayStart = new Date(`${cursor}T00:00:00.000Z`);
        const key = dayStart.toISOString();
        if (!totalsByBucket.has(key)) {
          totalsByBucket.set(key, {
            transactionCount: 0,
            litersDispensed: 0,
            uniqueVehicles: 0,
            revenue: 0,
          });
        }
        cursor = this.addCalendarDaysYmd(cursor, 1);
      }
    }

    const byBucketStation = new Map<string, RevenueStationBreakdown[]>();
    if (includeStationBreakdown && stationRows.length > 0) {
      const stationIds = [...new Set(stationRows.map((r) => Number(r.station_id)))];
      const stations = await this.db
        .select({ id: schema.stations.id, name: schema.stations.name })
        .from(schema.stations)
        .where(inArray(schema.stations.id, stationIds));
      const stationNameById = new Map(stations.map((s) => [s.id, s.name] as const));

      for (const row of stationRows) {
        const bucketStart = this.parseBucketStart(row.bucket_start);
        const key = bucketStart.toISOString();
        const list = byBucketStation.get(key) ?? [];
        list.push({
          stationId: Number(row.station_id),
          stationName: stationNameById.get(Number(row.station_id)) ?? null,
          revenue: Number(row.revenue).toFixed(2),
          transactionCount: Number(row.transaction_count),
          litersDispensed: Number(row.liters_dispensed).toFixed(2),
          uniqueVehicles: Number(row.unique_vehicles),
        });
        byBucketStation.set(key, list);
      }
      for (const [, list] of byBucketStation) {
        list.sort((a, b) => Number(b.revenue) - Number(a.revenue));
      }
    }

    const bucketKeys = [...totalsByBucket.keys()].sort();

    const buckets: RevenueTimeseriesBucket[] = bucketKeys.map((key) => {
      const bucketStart = new Date(key);
      const t = totalsByBucket.get(key)!;
      const periodEnd = this.periodEndForBucket(bucketStart, granularity);

      const bucket: RevenueTimeseriesBucket = {
        periodStart: bucketStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totals: {
          revenue: t.revenue.toFixed(2),
          transactionCount: t.transactionCount,
          litersDispensed: t.litersDispensed.toFixed(2),
          uniqueVehicles: t.uniqueVehicles,
        },
      };

      if (includeStationBreakdown) {
        const stationsList = byBucketStation.get(key);
        if (stationsList?.length) {
          bucket.byStation = stationsList;
        } else {
          bucket.byStation = [];
        }
      }

      return bucket;
    });

    return {
      granularity,
      from: fromYmd,
      to: toYmd,
      paymentStatusFilter: 'SUCCESS',
      buckets,
    };
  }

  private rowsFromExecute<T>(execResult: unknown): T[] {
    if (Array.isArray(execResult)) {
      return execResult as T[];
    }
    if (
      typeof execResult === 'object' &&
      execResult !== null &&
      'rows' in execResult &&
      Array.isArray((execResult as { rows: unknown }).rows)
    ) {
      return (execResult as { rows: T[] }).rows;
    }
    return [];
  }

  private parseBucketStart(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid bucket timestamp from database');
    }
    return d;
  }

  private periodEndForBucket(bucketStart: Date, granularity: RevenueGranularity): Date {
    if (granularity === 'DAILY') {
      return new Date(
        Date.UTC(
          bucketStart.getUTCFullYear(),
          bucketStart.getUTCMonth(),
          bucketStart.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
    }
    if (granularity === 'WEEKLY') {
      return new Date(bucketStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    }
    const y = bucketStart.getUTCFullYear();
    const m = bucketStart.getUTCMonth();
    return new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  }

  private addCalendarDaysYmd(ymd: string, deltaDays: number): string {
    const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
}
