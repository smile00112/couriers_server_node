import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LocationResponseDto {
  @ApiProperty({ format: 'uuid' })
  courier_id!: string;

  @ApiProperty({ example: 55.7558 })
  lat!: number;

  @ApiProperty({ example: 37.6173 })
  lng!: number;

  @ApiProperty({ format: 'date-time' })
  recorded_at!: Date;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  order_id!: string | null;

  @ApiProperty({ example: 123.45, description: 'Distance in metres from previous position (0 for first update)' })
  distance_meters!: number;
}

export class RoutePointDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 55.7558 })
  lat!: number;

  @ApiProperty({ example: 37.6173 })
  lng!: number;

  @ApiProperty({ example: 87.3 })
  distance_meters!: number;

  @ApiProperty({ format: 'date-time' })
  recorded_at!: Date;
}

export class RouteHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  order_id!: string;

  @ApiProperty({ format: 'uuid' })
  courier_id!: string;

  @ApiProperty({ example: 4521.1, description: 'Sum of all individual segment distances for this delivery' })
  total_distance_meters!: number;

  @ApiProperty({ type: [RoutePointDto] })
  points!: RoutePointDto[];
}
