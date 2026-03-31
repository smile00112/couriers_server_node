import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { DeliveryChannel } from '../entities/auth-code.entity';

export class SendCodeDto {
  @IsUUID() owner_id!: string;

  @IsString() phone!: string;

  @IsOptional()
  @IsEnum(DeliveryChannel)
  channel?: DeliveryChannel = DeliveryChannel.SMS;
}
