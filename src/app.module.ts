import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AssetsModule } from './assets/assets.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MINUTE_MS, RATE_LIMITS } from './common/rate-limits.js';
import { type Env, validateEnv } from './config/env.js';
import { FeedModule } from './feed/feed.module.js';
import { HealthModule } from './health/health.module.js';
import { LaunchpadModule } from './launchpad/launchpad.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { BalancesModule } from './balances/balances.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Requests per IP: a general limit for every route, lower ones on some
    // (see common/rate-limits.ts). Kept in memory, so each server counts its
    // own; with several servers it needs a shared store such as Redis.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: MINUTE_MS, limit: RATE_LIMITS.general }],
        skipIf: () => !config.get('RATE_LIMIT_ENABLED', { infer: true }),
        errorMessage: 'Too many requests. Wait a minute and try again.',
      }),
    }),
    PrismaModule,
    AssetsModule,
    AuthModule,
    HealthModule,
    UsersModule,
    PostsModule,
    FeedModule,
    NotificationsModule,
    LaunchpadModule,
    UploadsModule,
    BalancesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      // Validates every request body against its DTO and rejects unknown fields.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
