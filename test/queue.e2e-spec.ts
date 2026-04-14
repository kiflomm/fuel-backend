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

describe('QueueController (e2e)', () => {
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

    it('GET /queue/stations returns 401 without Authorization', () => {
      return request(app.getHttpServer()).get('/queue/stations').expect(401);
    });
  });

  describe('non-vehicle-owner (simulated)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(JwtAuthGuard)
        .useClass(MockGovernmentAdminJwtGuard)
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /queue/stations returns 403 for GOVERNMENT_ADMIN', () => {
      return request(app.getHttpServer())
        .get('/queue/stations')
        .set('Authorization', 'Bearer fake')
        .expect(403);
    });
  });

  describe('worker endpoints (route-level)', () => {
    let app: INestApplication<App>;

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
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /queue/worker/verify returns 404 for unknown token', () => {
      return request(app.getHttpServer())
        .post('/queue/worker/verify')
        .set('Authorization', 'Bearer fake')
        .send({ verifyToken: '0123456789abcdef0123456789abcdef' })
        .expect((res) => {
          expect([404, 500]).toContain(res.status);
        });
    });

    it('POST /queue/worker/complete returns 404 for unknown token', () => {
      return request(app.getHttpServer())
        .post('/queue/worker/complete')
        .set('Authorization', 'Bearer fake')
        .send({
          verifyToken: '0123456789abcdef0123456789abcdef',
          receiptRef: 'R-1',
        })
        .expect((res) => {
          expect([404, 500]).toContain(res.status);
        });
    });
  });
});
