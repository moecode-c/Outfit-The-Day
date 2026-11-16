import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';
import { uploadRoot } from './modules/files';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  // Public product images (dev storage). Private files go through /api/files/private/:key.
  app.useStaticAssets(path.join(uploadRoot(), 'public'), { prefix: '/uploads/', maxAge: '30d', immutable: true });
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
