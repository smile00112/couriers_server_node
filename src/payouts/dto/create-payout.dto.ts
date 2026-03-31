import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePayoutDto {
  @ApiProperty({ example: 'uuid', description: 'Courier UUID' })
  @IsUUID()
  courier_id!: string;

  @ApiProperty({
    example: 420.0,
    description: 'Amount paid (positive decimal)',
  })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    example: 'TRF-2026-03-001',
    description: 'Optional bank transfer reference',
  })
  @IsOptional()
  @IsString()
  reference_note?: string;
}
