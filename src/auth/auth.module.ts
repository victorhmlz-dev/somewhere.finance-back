import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PRIVY_KEYS, privyKeysOf } from './privy-identity.js';

// Global so any module can protect its routes with `AuthGuard`.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    {
      // Privy's public keys, only when sign-in with Privy is set up
      provide: PRIVY_KEYS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const appId = config.get('PRIVY_APP_ID', { infer: true });
        return appId ? privyKeysOf(appId) : null;
      },
    },
  ],
  exports: [AuthGuard, OptionalAuthGuard, JwtModule],
})
export class AuthModule {}
