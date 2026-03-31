import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CourierSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ivan' }) first_name!: string;
  @ApiProperty({ example: 'Petrov' }) last_name!: string;
  @ApiProperty({ example: '+79001234567' }) phone!: string;
}

export class OrderLifecycleResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) owner_id!: string;
  @ApiProperty({ example: 'ORD-2026-00042' }) order_number!: string;
  @ApiProperty({ example: 'assigned' }) status!: string;

  @ApiPropertyOptional({ type: () => CourierSummaryDto, nullable: true })
  courier!: CourierSummaryDto | null;

  @ApiProperty({ example: 'ул. Ленина, 10, Москва' }) pickup_address!: string;
  @ApiProperty({ example: 'пр. Мира, 45, Москва' }) dropoff_address!: string;
  @ApiProperty({ example: 350.0 }) delivery_fee!: number;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  callback_url!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  assigned_at!: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  picked_up_at!: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  in_delivery_at!: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  completed_at!: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  cancelled_at!: Date | null;

  @ApiProperty({ format: 'date-time' }) created_at!: Date;
  @ApiProperty({ format: 'date-time' }) updated_at!: Date;
}

export class CancelOrderDto {
  @ApiPropertyOptional({ maxLength: 500, example: 'Customer cancelled' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
