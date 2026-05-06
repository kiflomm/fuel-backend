import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RevenueReportingService } from '../src/revenue-reporting/revenue-reporting.service';

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

const emptyTimeseries = {
  granularity: 'DAILY' as const,
  from: '2026-01-01',
  to: '2026-01-07',
  paymentStatusFilter: 'SUCCESS' as const,
  buckets: [],
};

describe('Revenue time series (e2e)', () => {
  describe('station worker', () => {
    let app: INestApplication<App>;
    const getTimeseries = jest.fn().mockResolvedValue(emptyTimeseries);

    @Injectable()
    class MockStationWorkerJwtGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        req.user = {
          id: 7,
          email: 'worker@test.local',
          role: 'STATION_WORKER',
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
        .useClass(MockStationWorkerJwtGuard)
        .overrideProvider(RevenueReportingService)
        .useValue({ getTimeseries })
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      getTimeseries.mockClear();
    });

    it('GET /queue/worker/revenue-timeseries scopes to JWT stationId', async () => {
      await request(app.getHttpServer())
        .get('/queue/worker/revenue-timeseries')
        .query({ from: '2026-01-01', to: '2026-01-07', granularity: 'DAILY' })
        .set('Authorization', 'Bearer fake')
        .expect(200);

      expect(getTimeseries).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-07',
        'DAILY',
        { type: 'STATION', stationId: 1 },
        false,
      );
    });

    it('GET /queue/worker/revenue-timeseries rejects unknown query params (no client stationId)', async () => {
      await request(app.getHttpServer())
        .get('/queue/worker/revenue-timeseries')
        .query({
          from: '2026-01-01',
          to: '2026-01-07',
          granularity: 'DAILY',
          stationId: 99,
        })
        .set('Authorization', 'Bearer fake')
        .expect(400);

      expect(getTimeseries).not.toHaveBeenCalled();
    });
  });

  describe('government admin', () => {
    let app: INestApplication<App>;
    const getTimeseries = jest.fn().mockResolvedValue(emptyTimeseries);

    @Injectable()
    class MockGovernmentAdminJwtGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        req.user = {
          id: 1,
          email: 'admin@test.local',
          role: 'GOVERNMENT_ADMIN',
          stationId: null,
        };
        return true;
      }
    }

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(JwtAuthGuard)
        .useClass(MockGovernmentAdminJwtGuard)
        .overrideProvider(RevenueReportingService)
        .useValue({ getTimeseries })
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      getTimeseries.mockClear();
    });

    it('GET /admin/reports/revenue-timeseries includes per-station breakdown and optional station filter', async () => {
      await request(app.getHttpServer())
        .get('/admin/reports/revenue-timeseries')
        .query({ from: '2026-01-01', to: '2026-01-07', granularity: 'WEEKLY', stationId: 3 })
        .set('Authorization', 'Bearer fake')
        .expect(200);

      expect(getTimeseries).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-07',
        'WEEKLY',
        { type: 'GLOBAL', stationId: 3 },
        true,
      );
    });
  });
});
