import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CreatePayoutPeriodDto {
  @ApiProperty({
    example: '2026-03-01',
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @IsDateString()
  start_date!: string;

  @ApiProperty({
    example: '2026-03-31',
    description: 'Inclusive end date (YYYY-MM-DD), must be >= start_date',
  })
  @IsDateString()
  end_date!: string;
}
