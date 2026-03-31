import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class ShiftResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  courier_id!: string;

  @ApiProperty({ enum: ['open', 'closed'], example: 'open' })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  started_at!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: 'Null while shift is open' })
  ended_at!: Date | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 480.5, description: 'Duration in minutes. Null while shift is open.' })
  duration_minutes!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 12, description: 'Number of completed orders during this shift.' })
  order_count!: number | null;
}

export class ShiftMetaDto {
  @ApiProperty({ example: 45 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 3 }) total_pages!: number;
}

export class PaginatedShiftsDto {
  @ApiProperty({ type: [ShiftResponseDto] }) data!: ShiftResponseDto[];
  @ApiProperty({ type: ShiftMetaDto }) meta!: ShiftMetaDto;
}

export class ActiveShiftItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) courier_id!: string;
  @ApiProperty({ example: 'Ivan Petrov' }) courier_name!: string;
  @ApiProperty({ format: 'date-time' }) started_at!: Date;
  @ApiProperty({ type: Number, example: 127.3 }) elapsed_minutes!: number;
  @ApiProperty({ type: Number, example: 1 }) active_order_count!: number;
}

export class ActiveShiftsResponseDto {
  @ApiProperty({ type: [ActiveShiftItemDto] }) data!: ActiveShiftItemDto[];
  @ApiProperty({ example: 14 }) total!: number;
}

export class ShiftHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }: { value: unknown }) => value)
  to?: string;
}
