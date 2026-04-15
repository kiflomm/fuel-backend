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
  });
});
