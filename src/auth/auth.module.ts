import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CourierAuthService } from './courier-auth.service';
import { CourierAuthController } from './courier-auth.controller';
import { CodeDeliveryService } from './code-delivery/code-delivery.service';
import { CodeDeliveryProcessor } from './code-delivery/code-delivery.processor';
import { SendCodeThrottleGuard } from './guards/send-code-throttle.guard';
import { LoginThrottleGuard } from './guards/login-throttle.guard';
import { LoginAttemptTracker } from './services/login-attempt-tracker.service';
import { PhoneNormalizePipe } from '../common/pipes/phone-normalize.pipe';
import { AuthCode } from './entities/auth-code.entity';
import { CourierRefreshToken } from './entities/courier-refresh-token.entity';
import { Courier } from '../couriers/entities/courier.entity';
import { AUTH_CODE_DELIVERY_QUEUE } from '../queues/queues.constants';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get<number>('JWT_ACCESS_TTL') },
      }),
    }),
    TypeOrmModule.forFeature([AuthCode, CourierRefreshToken, Courier]),
    BullModule.registerQueue({ name: AUTH_CODE_DELIVERY_QUEUE }),
  ],
  controllers: [CourierAuthController],
  providers: [
    JwtStrategy,
    CourierAuthService,
    CodeDeliveryService,
    CodeDeliveryProcessor,
    SendCodeThrottleGuard,
    LoginThrottleGuard,
    LoginAttemptTracker,
    PhoneNormalizePipe,
  ],
  exports: [JwtModule, PassportModule, CourierAuthService],
})
export class AuthModule {}
