import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerException } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthCode, DeliveryChannel } from './entities/auth-code.entity';
import { CourierRefreshToken } from './entities/courier-refresh-token.entity';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { LogoutDto } from './dto/logout.dto';
import { CodeDeliveryService } from './code-delivery/code-delivery.service';
import { LoginAttemptTracker } from './services/login-attempt-tracker.service';
import { Courier } from '../couriers/entities/courier.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

@Injectable()
export class CourierAuthService {
  constructor(
    @InjectRepository(AuthCode)
    private readonly authCodeRepo: Repository<AuthCode>,
    @InjectRepository(CourierRefreshToken)
    private readonly refreshTokenRepo: Repository<CourierRefreshToken>,
    @InjectRepository(Courier)
    private readonly courierRepo: Repository<Courier>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly codeDeliveryService: CodeDeliveryService,
    private readonly loginAttemptTracker: LoginAttemptTracker,
  ) {}

  async sendCode(dto: SendCodeDto): Promise<void> {
    const channel = dto.channel ?? DeliveryChannel.SMS;

    // 1. Look up courier
    const courier = await this.courierRepo.findOne({
      where: { owner_id: dto.owner_id, phone: dto.phone },
    });
    if (!courier) {
      throw new NotFoundException(
        'No courier account found for this phone in the given tenant',
      );
    }

    // 1b. Validate Telegram prerequisite before creating a code
    if (channel === DeliveryChannel.TELEGRAM && !courier.telegram_chat_id) {
      throw new BadRequestException('Courier has no Telegram account linked');
    }

    // 2. Check for existing active code (idempotency)
    const existing = await this.authCodeRepo.findOne({
      where: {
        owner_id: dto.owner_id,
        phone: dto.phone,
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    if (existing) {
      await this.codeDeliveryService.enqueue({
        authCodeId: existing.id,
        phone: dto.phone,
        channel,
        code: existing.code,
        telegramChatId: courier.telegram_chat_id,
      });
      return;
    }

    // 3. Generate code
    const code =
      process.env.AUTH_CODE_FIXED ??
      String(Math.floor(100000 + Math.random() * 900000));

    // 4. Insert new AuthCode
    const authCode = this.authCodeRepo.create({
      owner_id: dto.owner_id,
      courier_id: courier.id,
      phone: dto.phone,
      code,
      channel,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    await this.authCodeRepo.save(authCode);

    // 5. Enqueue delivery
    await this.codeDeliveryService.enqueue({
      authCodeId: authCode.id,
      phone: dto.phone,
      channel,
      code,
      telegramChatId: courier.telegram_chat_id,
    });
  }

  async verifyCode(dto: VerifyCodeDto): Promise<AuthTokens> {
    // 1. Find active matching code
    const authCode = await this.authCodeRepo.findOne({
      where: {
        owner_id: dto.owner_id,
        phone: dto.phone,
        code: dto.code,
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      relations: ['courier'],
    });
    if (!authCode) throw new UnauthorizedException('Invalid or expired code');

    // 2. Mark code as used
    authCode.used_at = new Date();
    await this.authCodeRepo.save(authCode);

    // 3. Resolve courier — relation is always loaded; null here means DB inconsistency
    const courier = authCode.courier;
    if (!courier) {
      throw new InternalServerErrorException(
        'Auth code has no associated courier — data integrity issue',
      );
    }

    return this.issueTokens(courier);
  }

  async logout(courierId: string, dto: LogoutDto): Promise<void> {
    const token_hash = createHash('sha256')
      .update(dto.refresh_token)
      .digest('hex');
    const token = await this.refreshTokenRepo.findOne({
      where: {
        courier_id: courierId,
        token_hash,
        revoked_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    if (!token) return; // idempotent — already revoked or expired
    token.revoked_at = new Date();
    await this.refreshTokenRepo.save(token);
  }

  async loginWithPassword(dto: LoginPasswordDto): Promise<AuthTokens> {
    const limit = this.configService.get<number>(
      'THROTTLE_LOGIN_LIMIT',
    ) as number;
    const ttlMs =
      (this.configService.get<number>('THROTTLE_LOGIN_TTL') as number) * 1000;
    const throttleKey = `login:${dto.owner_id}:${dto.login}`;

    if (this.loginAttemptTracker.isBlocked(throttleKey, limit)) {
      throw new ThrottlerException();
    }

    const courier = await this.courierRepo
      .createQueryBuilder('courier')
      .addSelect('courier.password_hash')
      .where('courier.owner_id = :owner_id AND courier.login = :login', {
        owner_id: dto.owner_id,
        login: dto.login,
      })
      .getOne();

    const invalidCredentials = new UnauthorizedException('Invalid credentials');

    if (!courier || !courier.password_hash) {
      this.loginAttemptTracker.recordFailure(throttleKey, limit, ttlMs);
      throw invalidCredentials;
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      courier.password_hash,
    );
    if (!passwordMatches) {
      this.loginAttemptTracker.recordFailure(throttleKey, limit, ttlMs);
      throw invalidCredentials;
    }

    this.loginAttemptTracker.reset(throttleKey);
    return this.issueTokens(courier);
  }

  async issueTokens(courier: Courier): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: courier.id,
      owner_id: courier.owner_id,
      role: 'courier',
    };
    const accessTtl = this.configService.get<number>(
      'JWT_ACCESS_TTL',
    ) as number;
    const refreshTtl = this.configService.get<number>(
      'JWT_REFRESH_TTL',
    ) as number;

    const access_token = this.jwtService.sign(payload);

    // Generate refresh token
    const rawRefreshToken = randomUUID();
    const token_hash = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');
    const refreshToken = this.refreshTokenRepo.create({
      courier_id: courier.id,
      owner_id: courier.owner_id,
      token_hash,
      expires_at: new Date(Date.now() + refreshTtl * 1000),
    });
    await this.refreshTokenRepo.save(refreshToken);

    return {
      access_token,
      refresh_token: rawRefreshToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
    };
  }
}
