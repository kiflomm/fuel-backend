import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  
  const app = await NestFactory.create(AppModule);
  // Enable CORS with credentials
  app.enableCors({
    origin: process.env.APP_URL || 'http://localhost:3001',
    credentials: true,
  });
  // Add cookie parser
  app.use(cookieParser());

  

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
