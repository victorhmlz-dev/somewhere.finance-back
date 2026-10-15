import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Behind proxies, the client's address comes from X-Forwarded-For; the
  // request limits count requests by that address
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('FRONT_URL'), credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.get('PORT'));
}
await bootstrap();
