import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { FeedModule } from './feed/feed.module.js';
import { HealthModule } from './health/health.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    HealthModule,
    UsersModule,
    PostsModule,
    FeedModule,
  ],
  providers: [
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
