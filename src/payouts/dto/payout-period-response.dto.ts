import { ApiProperty } from '@nestjs/swagger';

export class PayoutPeriodResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() owner_id!: string;
  @ApiProperty() start_date!: string;
  @ApiProperty() end_date!: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status!: 'open' | 'closed';
  @ApiProperty() created_by!: string;
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
}

export class PaginatedPayoutPeriodsDto {
  @ApiProperty({ type: [PayoutPeriodResponseDto] })
  data!: PayoutPeriodResponseDto[];
  @ApiProperty() meta!: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
