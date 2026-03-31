import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class SubmitLocationDto {
  @ApiProperty({ example: 55.7558, description: 'Latitude in decimal degrees' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 37.6173, description: 'Longitude in decimal degrees' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
