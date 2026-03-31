import { ApiProperty } from '@nestjs/swagger';

export class PeriodInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() start_date!: string;
  @ApiProperty() end_date!: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status!: 'open' | 'closed';
}

export class CourierSummaryItemDto {
  @ApiProperty() courier_id!: string;
  @ApiProperty() courier_name!: string;
  @ApiProperty() delivery_count!: number;
  @ApiProperty() total_amount!: string;
  @ApiProperty() is_paid!: boolean;
}

export class PeriodSummaryResponseDto {
  @ApiProperty({ type: PeriodInfoDto }) period!: PeriodInfoDto;
  @ApiProperty({ type: [CourierSummaryItemDto] })
  couriers!: CourierSummaryItemDto[];
}
