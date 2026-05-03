import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import * as schema from '../database/schema';
import { and, desc, eq, gte, lte, or, isNotNull, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';

export interface FuelInventoryRow {
  fuelTypeId: number;
  fuelTypeCode: string;
  fuelTypeName: string;
  fuelTypeIsActive: boolean;
  remainingLiters: number;
  inventoryUpdatedAt: string | null;
}

export interface FuelInventoryAdjustmentListItem {
  id: number;
  stationId: number;
  fuelTypeId: number;
  fuelTypeCode: string;
  fuelTypeName: string;
  previousLiters: number;
  updatedLiters: number;
  deltaLiters: number;
  reason: string | null;
  note: string | null;
  changedByUserId: number;
  changedByEmail: string;
  changedByFirstName: string;
  changedByLastName: string;
  changedAt: string;
}

export interface AdjustFuelInventoryResult {
  stationId: number;
  fuelTypeId: number;
  previousLiters: number;
  updatedLiters: number;
  deltaLiters: number;
  reason: string | null;
  note: string | null;
  adjustmentId: number;
}

@Injectable()
export class FuelInventoryService {
  private static readonly MAX_STATION_INVENTORY_LITERS = 100_000_000;

  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {}

  private litersToFixed2(value: number): string {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Invalid liters value');
    }
    return value.toFixed(2);
  }

  /** Station listing: merged view of inactive types only if inventory row exists */
  async getInventoryForStation(stationId: number): Promise<FuelInventoryRow[]> {
    const [st] = await this.db
      .select({ id: schema.stations.id })
      .from(schema.stations)
      .where(eq(schema.stations.id, stationId))
      .limit(1);

    if (!st) {
      throw new NotFoundException('Station not found');
    }

    const rows = await this.db
      .select({
        fuelTypeId: schema.fuelTypes.id,
        fuelTypeCode: schema.fuelTypes.code,
        fuelTypeName: schema.fuelTypes.name,
        fuelTypeIsActive: schema.fuelTypes.isActive,
        remainingRaw: schema.stationFuelInventory.remainingLiters,
        inventoryUpdatedAt: schema.stationFuelInventory.updatedAt,
      })
      .from(schema.fuelTypes)
      .leftJoin(
        schema.stationFuelInventory,
        and(
          eq(schema.stationFuelInventory.fuelTypeId, schema.fuelTypes.id),
          eq(schema.stationFuelInventory.stationId, stationId),
        ),
      )
      .where(
        or(
          eq(schema.fuelTypes.isActive, true),
          isNotNull(schema.stationFuelInventory.id),
        ),
      )
      .orderBy(schema.fuelTypes.code);

    return rows.map((r) => ({
      fuelTypeId: r.fuelTypeId,
      fuelTypeCode: r.fuelTypeCode,
      fuelTypeName: r.fuelTypeName,
      fuelTypeIsActive: r.fuelTypeIsActive,
      remainingLiters: r.remainingRaw
        ? parseFloat(r.remainingRaw.toString())
        : 0,
      inventoryUpdatedAt: r.inventoryUpdatedAt
        ? r.inventoryUpdatedAt.toISOString()
        : null,
    }));
  }

  async listAdjustments(params: {
    stationId?: number;
    fuelTypeId?: number;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }): Promise<FuelInventoryAdjustmentListItem[]> {
    const conditions: SQL[] = [];
    if (params.stationId !== undefined) {
      conditions.push(eq(schema.fuelInventoryAdjustments.stationId, params.stationId));
    }
    if (params.fuelTypeId !== undefined) {
      conditions.push(eq(schema.fuelInventoryAdjustments.fuelTypeId, params.fuelTypeId));
    }
    if (params.from) {
      conditions.push(gte(schema.fuelInventoryAdjustments.changedAt, params.from));
    }
    if (params.to) {
      conditions.push(lte(schema.fuelInventoryAdjustments.changedAt, params.to));
    }

    const baseQuery = this.db
      .select({
        id: schema.fuelInventoryAdjustments.id,
        stationId: schema.fuelInventoryAdjustments.stationId,
        fuelTypeId: schema.fuelInventoryAdjustments.fuelTypeId,
        fuelTypeCode: schema.fuelTypes.code,
        fuelTypeName: schema.fuelTypes.name,
        previousLitersRaw: schema.fuelInventoryAdjustments.previousLiters,
        updatedLitersRaw: schema.fuelInventoryAdjustments.updatedLiters,
        deltaLitersRaw: schema.fuelInventoryAdjustments.deltaLiters,
        reason: schema.fuelInventoryAdjustments.reason,
        note: schema.fuelInventoryAdjustments.note,
        changedByUserId: schema.fuelInventoryAdjustments.changedByUserId,
        changedAt: schema.fuelInventoryAdjustments.changedAt,
        changedByEmail: schema.users.email,
        changedByFirstName: schema.users.firstName,
        changedByLastName: schema.users.lastName,
      })
      .from(schema.fuelInventoryAdjustments)
      .innerJoin(
        schema.fuelTypes,
        eq(schema.fuelTypes.id, schema.fuelInventoryAdjustments.fuelTypeId),
      )
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.fuelInventoryAdjustments.changedByUserId),
      );

    const filteredQuery =
      conditions.length === 0
        ? baseQuery
        : conditions.length === 1
          ? baseQuery.where(conditions[0])
          : baseQuery.where(and(...conditions));

    const rows = await filteredQuery
      .orderBy(desc(schema.fuelInventoryAdjustments.changedAt))
      .limit(params.limit)
      .offset(params.offset);

    return rows.map((row) => ({
      id: row.id,
      stationId: row.stationId,
      fuelTypeId: row.fuelTypeId,
      fuelTypeCode: row.fuelTypeCode,
      fuelTypeName: row.fuelTypeName,
      previousLiters: parseFloat(row.previousLitersRaw.toString()),
      updatedLiters: parseFloat(row.updatedLitersRaw.toString()),
      deltaLiters: parseFloat(row.deltaLitersRaw.toString()),
      reason: row.reason,
      note: row.note,
      changedByUserId: row.changedByUserId,
      changedByEmail: row.changedByEmail,
      changedByFirstName: row.changedByFirstName,
      changedByLastName: row.changedByLastName,
      changedAt: row.changedAt.toISOString(),
    }));
  }

  /**
   * Atomically inserts adjustment row and upserts inventory. Mirrors summary to audit_logs after commit.
   */
  async adjustInventory(params: {
    stationId: number;
    fuelTypeId: number;
    deltaLiters: number;
    reason?: string | null;
    note?: string | null;
    changedByUserId: number;
  }): Promise<AdjustFuelInventoryResult> {
    if (!Number.isFinite(params.deltaLiters) || params.deltaLiters <= 0) {
      throw new BadRequestException('deltaLiters must be a positive number');
    }

    const result = await this.db.transaction(async (tx) => {
      const [station] = await tx
        .select({ id: schema.stations.id })
        .from(schema.stations)
        .where(eq(schema.stations.id, params.stationId))
        .limit(1);

      if (!station) {
        throw new NotFoundException('Station not found');
      }

      const [fuelType] = await tx
        .select({ id: schema.fuelTypes.id })
        .from(schema.fuelTypes)
        .where(eq(schema.fuelTypes.id, params.fuelTypeId))
        .limit(1);

      if (!fuelType) {
        throw new NotFoundException('Fuel type not found');
      }

      const [existingInv] = await tx
        .select()
        .from(schema.stationFuelInventory)
        .where(
          and(
            eq(schema.stationFuelInventory.stationId, params.stationId),
            eq(schema.stationFuelInventory.fuelTypeId, params.fuelTypeId),
          ),
        )
        .limit(1);

      const previousLitersNum = existingInv
        ? parseFloat(existingInv.remainingLiters.toString())
        : 0;
      const deltaLitersNum = params.deltaLiters;
      const updatedLitersNum = previousLitersNum + deltaLitersNum;

      if (updatedLitersNum > FuelInventoryService.MAX_STATION_INVENTORY_LITERS) {
        throw new BadRequestException(
          `Resulting inventory cannot exceed ${FuelInventoryService.MAX_STATION_INVENTORY_LITERS} liters`,
        );
      }

      const prevStr = this.litersToFixed2(previousLitersNum);
      const updStr = this.litersToFixed2(updatedLitersNum);
      const deltaStr = this.litersToFixed2(deltaLitersNum);

      const trimmedReason =
        typeof params.reason === 'string'
          ? params.reason.trim().slice(0, 500) || null
          : null;
      const trimmedNote =
        typeof params.note === 'string'
          ? params.note.trim().slice(0, 2000) || null
          : null;

      const now = new Date();

      const [adj] = await tx
        .insert(schema.fuelInventoryAdjustments)
        .values({
          stationId: params.stationId,
          fuelTypeId: params.fuelTypeId,
          previousLiters: prevStr,
          updatedLiters: updStr,
          deltaLiters: deltaStr,
          reason: trimmedReason,
          note: trimmedNote,
          changedByUserId: params.changedByUserId,
          changedAt: now,
        })
        .returning({ id: schema.fuelInventoryAdjustments.id });

      if (!adj) {
        throw new BadRequestException('Failed to record fuel inventory adjustment');
      }

      if (existingInv) {
        await tx
          .update(schema.stationFuelInventory)
          .set({
            remainingLiters: updStr,
            updatedAt: now,
          })
          .where(eq(schema.stationFuelInventory.id, existingInv.id));
      } else {
        await tx.insert(schema.stationFuelInventory).values({
          stationId: params.stationId,
          fuelTypeId: params.fuelTypeId,
          remainingLiters: updStr,
          updatedAt: now,
        });
      }

      return {
        adjustmentId: adj.id,
        previousLiters: previousLitersNum,
        updatedLiters: updatedLitersNum,
        deltaLiters: deltaLitersNum,
        reason: trimmedReason,
        note: trimmedNote,
      };
    });

    await this.auditService.logAction(
      params.changedByUserId,
      'ADJUST_STATION_FUEL_INVENTORY',
      'station_fuel_inventory',
      `${params.stationId}:${params.fuelTypeId}`,
      {
        stationId: params.stationId,
        fuelTypeId: params.fuelTypeId,
        previousLiters: result.previousLiters,
        updatedLiters: result.updatedLiters,
        deltaLiters: result.deltaLiters,
        reason: result.reason,
        note: result.note,
        adjustmentId: result.adjustmentId,
        mode: 'add',
      },
    );

    return {
      stationId: params.stationId,
      fuelTypeId: params.fuelTypeId,
      previousLiters: result.previousLiters,
      updatedLiters: result.updatedLiters,
      deltaLiters: result.deltaLiters,
      reason: result.reason,
      note: result.note,
      adjustmentId: result.adjustmentId,
    };
  }
}
