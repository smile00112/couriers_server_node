import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

@Injectable()
export class PhoneNormalizePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) throw new BadRequestException('Phone number is required');
    try {
      if (!isValidPhoneNumber(value)) throw new Error();
      return parsePhoneNumber(value).format('E.164');
    } catch {
      throw new BadRequestException(`Invalid phone number: ${value}`);
    }
  }
}
