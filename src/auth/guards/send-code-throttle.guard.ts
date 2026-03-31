import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { SendCodeDto } from '../dto/send-code.dto';

@Injectable()
export class SendCodeThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const dto = req['body'] as SendCodeDto;
    // Normalize to E.164 so different formats of the same number share one counter.
    let phone = dto.phone;
    try {
      if (isValidPhoneNumber(phone)) {
        phone = parsePhoneNumber(phone).format('E.164');
      }
    } catch {
      // Leave raw — PhoneNormalizePipe will throw BadRequestException later
    }
    return `send-code:${dto.owner_id}:${phone}`;
  }
}
