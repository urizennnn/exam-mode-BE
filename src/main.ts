import './lib/tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);

  app.use(helmet());

  const allowedOrigins: string[] = config.getOrThrow('ALLOWED_ORIGINS')
    ? (JSON.parse(config.getOrThrow('ALLOWED_ORIGINS')) as string[])
    : ['http://localhost:5173'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe());
  const SwaggerCfg = new DocumentBuilder()
    .setTitle('Docenti Exam API')
    .setDescription('The exam API description')
    .setVersion('1.0')
    .addTag('MVP')
    .build();

  const document = SwaggerModule.createDocument(app, SwaggerCfg);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      operationsSorter: 'alpha',
      tagsSorter: 'alpha',
    },
  });

  await app.listen(process.env.PORT ?? 8080);
}
void bootstrap();
