import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as schema from '../database/schema';
import { DrizzleAsyncProvider } from '../database/drizzle.provider';
import { CreateStationWorkerDto } from './dto/create-station-worker.dto';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class StationManagerService {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  private mapUser(row: typeof schema.users.$inferSelect) {
    return {
      id: row.id.toString(),
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      stationId: row.stationId ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createStationWorker(managerUserId: number, dto: CreateStationWorkerDto) {
    const [manager] = await this.db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, managerUserId),
          eq(schema.users.role, 'STATION_MANAGER'),
        ),
      )
      .limit(1);

    if (!manager) {
      throw new NotFoundException('Station manager not found');
    }

    if (!manager.stationId) {
      throw new BadRequestException('Station manager is not assigned to a station');
    }

    const [station] = await this.db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, manager.stationId))
      .limit(1);

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    if (!station.isActive) {
      throw new BadRequestException('Cannot create station worker for an inactive station');
    }

    const passwordHash = await this.hashPassword(dto.password);

    try {
      const [worker] = await this.db
        .insert(schema.users)
        .values({
          email: dto.email,
          password: passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'STATION_WORKER',
          stationId: manager.stationId,
          isActive: true,
        })
        .returning();

      return {
        worker: this.mapUser(worker),
        station: {
          id: station.id,
          name: station.name,
          city: station.city,
          isActive: station.isActive,
        },
      };
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }
}
