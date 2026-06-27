import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadsPath = join(process.cwd(), 'uploads');

  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }

  // Enable CORS dengan environment variable
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Add global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Add API prefix
  app.setGlobalPrefix('api');
  app.use('/uploads', express.static(uploadsPath));

  const config = new DocumentBuilder()
    .setTitle('Mini ERP API')
    .setDescription('API documentation for Mini ERP backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `Application is running on: http://localhost:${process.env.PORT ?? 3000}`,
  );
  console.log(
    `Swagger available at: http://localhost:${process.env.PORT ?? 3000}/api`,
  );
}
bootstrap();
