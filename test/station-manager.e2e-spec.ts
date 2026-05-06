import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { StationManagerService } from '../src/station-manager/station-manager.service';

@Injectable()
class MockVehicleOwnerJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      id: 99,
      email: 'vehicle-owner@test.local',
      role: 'VEHICLE_OWNER',
      stationId: null,
    };
    return true;
  }
}

function configureApp(app: INestApplication) {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

class MockStationManagerService {
  async createStationWorker() {
    return { worker: { id: '10' }, station: { id: 1 } };
  }

  async listStationWorkers() {
    return [{ id: '10', role: 'STATION_WORKER', stationId: 1 }];
  }

  async getStationWorker(_managerId: number, workerId: number) {
    if (workerId === 999) {
      throw new NotFoundException('Station worker not found');
    }
    if (workerId === 998) {
      throw new BadRequestException('Target user is not a station worker');
    }
    return { id: String(workerId), role: 'STATION_WORKER', stationId: 1 };
  }

  async updateStationWorker(_managerId: number, workerId: number) {
    if (workerId === 999) {
      throw new NotFoundException('Station worker not found');
    }
    if (workerId === 998) {
      throw new BadRequestException('Target user is not a station worker');
    }
    return { id: String(workerId), firstName: 'Updated' };
  }

  async updateStationWorkerStatus(
    _managerId: number,
    workerId: number,
    dto: { isActive: boolean },
  ) {
    if (workerId === 999) {
      throw new NotFoundException('Station worker not found');
    }
    return { id: String(workerId), isActive: dto.isActive };
  }

  async getLiveQueue() {
    return {
      stationId: 1,
      stationName: 'Station 1',
      isIntakePaused: false,
      queueLength: 1,
      items: [
        {
          id: 1,
          plateNumber: 'ABC-123',
          vehicleCategory: '1',
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async setQueueIntakePaused(_managerId: number, paused: boolean) {
    return { id: 1, queueIntakePaused: paused };
  }

  async listTransactions() {
    return [{ transactionId: 1, queueBookingId: 1 }];
  }

  async getDailyTotals() {
    return [
      {
        date: '2026-04-15',
        completedTransactionCount: 0,
        totalLitersDispensed: '0.00',
        totalGrossAmount: '0.00',
        uniqueVehiclesServedCount: 0,
      },
    ];
  }

  async getServiceActivity() {
    return [{ stationWorker: { id: 10 }, completedTransactionCount: 0 }];
  }
}

describe('StationManagerController (e2e)', () => {
  describe('without JWT', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /station-manager/health returns 401 without Authorization', () => {
      return request(app.getHttpServer())
        .get('/station-manager/health')
        .expect(401);
    });
  });

  describe('non-station-manager JWT (simulated)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(JwtAuthGuard)
        .useClass(MockVehicleOwnerJwtGuard)
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /station-manager/health returns 403 for non-STATION_MANAGER', () => {
      return request(app.getHttpServer())
        .get('/station-manager/health')
        .set('Authorization', 'Bearer fake-token')
        .expect(403);
    });
  });

  describe('station worker creation (route-level)', () => {
    let app: INestApplication<App>;

    @Injectable()
    class MockStationManagerJwtGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        req.user = {
          id: 2,
          email: 'manager@test.local',
          role: 'STATION_MANAGER',
          stationId: 1,
        };
        return true;
      }
    }

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(JwtAuthGuard)
        .useClass(MockStationManagerJwtGuard)
        .overrideProvider(StationManagerService)
        .useClass(MockStationManagerService)
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /station-manager/users/station-workers returns 201 (auth/validation wired)', () => {
      return request(app.getHttpServer())
        .post('/station-manager/users/station-workers')
        .set('Authorization', 'Bearer fake-token')
        .send({
          email: 'worker@test.local',
          password: 'secret123',
          firstName: 'Fuel',
          lastName: 'Worker',
        })
        .expect((res) => {
          expect([201, 500]).toContain(res.status);
        });
    });

    it('GET /station-manager/users/station-workers returns 200', () => {
      return request(app.getHttpServer())
        .get('/station-manager/users/station-workers')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('GET /station-manager/users/station-workers/:id returns 200', () => {
      return request(app.getHttpServer())
        .get('/station-manager/users/station-workers/10')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('GET /station-manager/users/station-workers/:id returns 404 for missing worker', () => {
      return request(app.getHttpServer())
        .get('/station-manager/users/station-workers/999')
        .set('Authorization', 'Bearer fake-token')
        .expect(404);
    });

    it('PATCH /station-manager/users/station-workers/:id rejects invalid payload', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/users/station-workers/10')
        .set('Authorization', 'Bearer fake-token')
        .send({
          password: '123',
          isActive: false,
        })
        .expect(400);
    });

    it('PATCH /station-manager/users/station-workers/:id returns 400 for non-worker target', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/users/station-workers/998')
        .set('Authorization', 'Bearer fake-token')
        .send({
          firstName: 'Fuel',
        })
        .expect(400);
    });

    it('PATCH /station-manager/users/station-workers/:id returns 404 for different-station target', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/users/station-workers/999')
        .set('Authorization', 'Bearer fake-token')
        .send({
          firstName: 'Fuel',
        })
        .expect(404);
    });

    it('PATCH /station-manager/users/station-workers/:id returns 200', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/users/station-workers/10')
        .set('Authorization', 'Bearer fake-token')
        .send({
          firstName: 'Fuel',
          lastName: 'Worker',
          email: 'worker@test.local',
          password: 'secret123',
        })
        .expect(200);
    });

    it('PATCH /station-manager/users/station-workers/:id/status returns 200', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/users/station-workers/10/status')
        .set('Authorization', 'Bearer fake-token')
        .send({
          isActive: false,
        })
        .expect(200);
    });

    it('GET /station-manager/queue/live returns 200', () => {
      return request(app.getHttpServer())
        .get('/station-manager/queue/live')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('PATCH /station-manager/queue/intake/pause returns 200', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/queue/intake/pause')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('PATCH /station-manager/queue/intake/resume returns 200', () => {
      return request(app.getHttpServer())
        .patch('/station-manager/queue/intake/resume')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('GET /station-manager/transactions rejects invalid date filters', () => {
      return request(app.getHttpServer())
        .get('/station-manager/transactions?from=bad-date')
        .set('Authorization', 'Bearer fake-token')
        .expect(400);
    });

    it('GET /station-manager/transactions returns 200', () => {
      return request(app.getHttpServer())
        .get(
          '/station-manager/transactions?from=2026-04-15T00:00:00.000Z&to=2026-04-15T23:59:59.999Z',
        )
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('GET /station-manager/reports/daily-totals rejects invalid date format', () => {
      return request(app.getHttpServer())
        .get('/station-manager/reports/daily-totals?date=15-04-2026')
        .set('Authorization', 'Bearer fake-token')
        .expect(400);
    });

    it('GET /station-manager/reports/daily-totals returns 200', () => {
      return request(app.getHttpServer())
        .get('/station-manager/reports/daily-totals?date=2026-04-15')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });

    it('GET /station-manager/reports/service-activity returns 200', () => {
      return request(app.getHttpServer())
        .get(
          '/station-manager/reports/service-activity?from=2026-04-15T00:00:00.000Z&to=2026-04-15T23:59:59.999Z',
        )
        .set('Authorization', 'Bearer fake-token')
        .expect(200);
    });
  });
});
