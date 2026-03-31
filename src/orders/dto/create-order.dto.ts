import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ example: 'Пицца Маргарита', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 850.0, minimum: 0 })
  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'ORD-2026-00042', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  order_number!: string;

  @ApiProperty({ example: '+79001234567' })
  @IsString()
  @IsNotEmpty()
  client_phone!: string;

  @ApiProperty({ example: 'ул. Ленина, 10, Москва' })
  @IsString()
  @IsNotEmpty()
  pickup_address!: string;

  @ApiProperty({ example: 55.7558, minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickup_lat!: number;

  @ApiProperty({ example: 37.6173, minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickup_lng!: number;

  @ApiProperty({ example: 'пр. Мира, 45, Москва' })
  @IsString()
  @IsNotEmpty()
  dropoff_address!: string;

  @ApiProperty({ example: 55.789, minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoff_lat!: number;

  @ApiProperty({ example: 37.64, minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoff_lng!: number;

  @ApiPropertyOptional({
    example: 'https://partner.example.com/webhooks/orders/42',
  })
  @IsUrl()
  @IsOptional()
  callback_url?: string;

  @ApiProperty({ type: [OrderItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
