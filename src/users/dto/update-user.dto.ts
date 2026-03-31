import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: ['manager', 'order_operator'], required: false })
  @IsOptional()
  @IsIn(['manager', 'order_operator'])
  role?: 'manager' | 'order_operator';
}
