import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fuel Monitor API')
    .setDescription('API documentation for Fuel Monitor backend')
    .setVersion('1.0.0')
    .addServer(process.env.SERVER_URL || 'http://localhost:3000', 'Development server')
    .addCookieAuth(
      'refreshToken',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description: 'Refresh token stored in cookie',
      },
      'refreshToken',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);
  if (process.env.NODE_ENV !== 'production' || true) {
    SwaggerModule.setup('api/docs', app, documentFactory, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Enable CORS with credentials
  app.enableCors({
    origin: process.env.APP_URL || 'http://localhost:3001',
    credentials: true,
  });
  // Add cookie parser
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
