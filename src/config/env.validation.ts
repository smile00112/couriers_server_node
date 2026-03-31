import { plainToInstance } from 'class-transformer';
import { IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString() DB_HOST!: string;
  @IsNumber() DB_PORT!: number;
  @IsString() DB_DATABASE!: string;
  @IsString() DB_USERNAME!: string;
  @IsString() DB_PASSWORD!: string;

  @IsString() REDIS_HOST!: string;
  @IsNumber() REDIS_PORT!: number;

  @IsString() JWT_SECRET!: string;
  @IsNumber() JWT_ACCESS_TTL!: number;
  @IsNumber() JWT_REFRESH_TTL!: number;

  @IsNumber() THROTTLE_CODE_LIMIT!: number;
  @IsNumber() THROTTLE_CODE_TTL!: number;
  @IsNumber() THROTTLE_LOGIN_LIMIT!: number;
  @IsNumber() THROTTLE_LOGIN_TTL!: number;

  @IsOptional() @IsString() NODE_ENV: string = 'development';
  @IsOptional() @IsNumber() PORT: number = 3000;

  @IsOptional() @IsString() AUTH_CODE_FIXED?: string;
  @IsOptional() @IsString() AUTH_CHANNEL_DEFAULT: string = 'sms';
  @IsOptional() @IsString() TELEGRAM_BOT_TOKEN?: string;

  // Firebase / FCM
  @IsOptional() @IsString() FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  @IsOptional() @IsString() FCM_DISABLED: string = 'false';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) throw new Error(errors.toString());
  return validatedConfig;
}
