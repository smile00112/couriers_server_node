import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '+79001234567' }) phone!: string;
  @ApiPropertyOptional({ example: null, nullable: true }) name!: string | null;
}

export class OrderItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Пицца Маргарита' }) name!: string;
  @ApiProperty({ example: 2 }) quantity!: number;
  @ApiProperty({ example: 850.0 }) price!: number;
}

export class AuditEntryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'created' }) action!: string;
  @ApiProperty({ format: 'uuid' }) actor_id!: string;
  @ApiProperty({ example: 'order_operator' }) actor_role!: string;
  @ApiProperty({ type: String, format: 'date-time' }) created_at!: Date;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) owner_id!: string;
  @ApiProperty({ example: 'ORD-2026-00042' }) order_number!: string;
  @ApiProperty({ example: 'created' }) status!: string;
  @ApiProperty({ type: ClientSummaryDto }) client!: ClientSummaryDto;
  @ApiProperty({ example: 'ул. Ленина, 10, Москва' }) pickup_address!: string;
  @ApiProperty({ example: 55.7558 }) pickup_lat!: number;
  @ApiProperty({ example: 37.6173 }) pickup_lng!: number;
  @ApiProperty({ example: 'пр. Мира, 45, Москва' }) dropoff_address!: string;
  @ApiProperty({ example: 55.789 }) dropoff_lat!: number;
  @ApiProperty({ example: 37.64 }) dropoff_lng!: number;
  @ApiProperty({ example: 350.0, description: 'Courier award, snapshotted from tenant config at creation' })
  delivery_fee!: number;
  @ApiPropertyOptional({ example: null, nullable: true }) callback_url!: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' }) created_at!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updated_at!: Date;
}

export class MetaDto {
  @ApiProperty({ example: 142 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 8 }) total_pages!: number;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] }) data!: OrderResponseDto[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

export class OrderDetailResponseDto extends OrderResponseDto {
  @ApiProperty({ type: [AuditEntryResponseDto] })
  audit_entries!: AuditEntryResponseDto[];
}
