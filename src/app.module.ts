import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { OwnersModule } from './owners/owners.module';
import { CouriersModule } from './couriers/couriers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        database: config.get('DB_DATABASE'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        synchronize: false,
        migrationsRun: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'code', ttl: (config.get<number>('THROTTLE_CODE_TTL') as number) * 1000, limit: config.get<number>('THROTTLE_CODE_LIMIT') as number },
          { name: 'login', ttl: (config.get<number>('THROTTLE_LOGIN_TTL') as number) * 1000, limit: config.get<number>('THROTTLE_LOGIN_LIMIT') as number },
        ],
      }),
    }),
    AuthModule,
    OwnersModule,
    CouriersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
