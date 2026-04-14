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
});
