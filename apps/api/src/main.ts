import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { csrf } from './common/csrf';
import { assertEnv } from './common/env';
import { FilesService } from './modules/files';

async function bootstrap() {
  // .env is already loaded (ConfigModule in AppModule); refuse to boot production with weak settings.
  assertEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  app.use(csrf());
  // Public product images from disk or R2. Private files go through /api/files/private/:key.
  app.use('/uploads', app.get(FilesService).servePublic());
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
