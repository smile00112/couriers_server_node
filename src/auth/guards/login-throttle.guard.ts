import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoginPasswordDto } from '../dto/login-password.dto';

@Injectable()
export class LoginThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const dto = req['body'] as LoginPasswordDto;
    return `login:${dto.owner_id}:${dto.login}`;
  }
}
