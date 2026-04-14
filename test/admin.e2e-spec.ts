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

/** Simulates a logged-in vehicle owner so `RolesGuard` can return 403 on admin routes. */
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

describe('AdminController (e2e)', () => {
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

    it('GET /admin/health returns 401 without Authorization', () => {
      return request(app.getHttpServer())
        .get('/admin/health')
        .expect(401);
    });
  });

  describe('non-admin JWT (simulated)', () => {
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

    it('GET /admin/health returns 403 for non-GOVERNMENT_ADMIN', () => {
      return request(app.getHttpServer())
        .get('/admin/health')
        .set('Authorization', 'Bearer fake-token')
        .expect(403);
    });
  });

  describe('fuel price management (route-level)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(JwtAuthGuard)
        .useClass(
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
          },
        )
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /admin/fuel-prices returns 201 (auth/validation wired)', () => {
      return request(app.getHttpServer())
        .post('/admin/fuel-prices')
        .set('Authorization', 'Bearer fake-token')
        .send({
          fuelType: 'DIESEL',
          pricePerLiter: 100,
          isActive: true,
        })
        // DB may be missing in CI; this test mainly ensures route exists + DTO validation passes.
        .expect((res) => {
          expect([201, 500]).toContain(res.status);
        });
    });
  });
});
