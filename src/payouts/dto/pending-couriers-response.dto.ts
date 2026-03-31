import { ApiProperty } from '@nestjs/swagger';

export class PendingCourierItemDto {
  @ApiProperty() courier_id!: string;
  @ApiProperty() courier_name!: string;
  @ApiProperty() delivery_count!: number;
  @ApiProperty() total_amount!: string;
}

export class PendingCouriersResponseDto {
  @ApiProperty() period_id!: string;
  @ApiProperty({ type: [PendingCourierItemDto] })
  couriers!: PendingCourierItemDto[];
}
