import { ApiProperty } from '@nestjs/swagger';

export class AvailableOrderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ORD-2026-00042' }) order_number!: string;
  @ApiProperty({ example: 'ул. Ленина, 10, Москва' }) pickup_address!: string;
  @ApiProperty({ example: 'пр. Мира, 45, Москва' }) dropoff_address!: string;
  @ApiProperty({ example: 350.0 }) delivery_fee!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: Date;
}

export class AvailableMetaDto {
  @ApiProperty({ example: 12 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 1 }) total_pages!: number;
}

export class AvailableOrdersListDto {
  @ApiProperty({ type: () => [AvailableOrderDto] }) data!: AvailableOrderDto[];
  @ApiProperty({ type: () => AvailableMetaDto }) meta!: AvailableMetaDto;
}
