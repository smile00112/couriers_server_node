import { ApiProperty } from '@nestjs/swagger';

export class CourierEarningsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() earned_at!: Date;
}

export class PaginatedCourierEarningsDto {
  @ApiProperty({ type: [CourierEarningsResponseDto] })
  data!: CourierEarningsResponseDto[];
  @ApiProperty() meta!: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
