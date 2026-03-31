import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayoutResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() owner_id!: string;
  @ApiProperty() payout_period_id!: string;
  @ApiProperty() courier_id!: string;
  @ApiProperty() amount!: string;
  @ApiPropertyOptional({ nullable: true }) reference_note!: string | null;
  @ApiProperty() paid_at!: Date;
  @ApiProperty() created_at!: Date;
}
