import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CourierPayoutItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() payout_period_id!: string;
  @ApiProperty() period_start_date!: string;
  @ApiProperty() period_end_date!: string;
  @ApiProperty() amount!: string;
  @ApiPropertyOptional({ nullable: true }) reference_note!: string | null;
  @ApiProperty() paid_at!: Date;
}

export class PaginatedCourierPayoutsDto {
  @ApiProperty({ type: [CourierPayoutItemDto] }) data!: CourierPayoutItemDto[];
  @ApiProperty() meta!: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
