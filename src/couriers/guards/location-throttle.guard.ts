import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class LocationThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { userId?: string } | undefined;
    return user?.userId ?? (req['ip'] as string);
  }

  protected errorMessage = 'Too many location updates';
}
