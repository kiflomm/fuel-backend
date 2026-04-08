import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule ,DocumentBuilder } from '@nestjs/swagger';
async function bootstrap() {
  

  const config = new DocumentBuilder()
  .setTitle('API Documentation')
  .setDescription('API documentation for the application')
  .setVersion('1.0')
  .addServer(process.env.SERVER_URL || 'http://localhost:3000', 'Development server')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Enter JWT token',
      in: 'header',
    },
    'JWT-auth',
  )
  .build();


  const app = await NestFactory.create(AppModule);
    // Enable CORS with credentials
    app.enableCors({
      origin: process.env.APP_URL || 'http://localhost:3001',
      credentials: true,
    });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
