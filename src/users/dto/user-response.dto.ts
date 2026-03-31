import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() role!: string;
  @ApiProperty() created_at!: string;
}

export class PaginatedUsersMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total_pages!: number;
}

export class PaginatedUsersDto {
  @ApiProperty({ type: [UserResponseDto] }) data!: UserResponseDto[];
  @ApiProperty({ type: PaginatedUsersMetaDto }) meta!: PaginatedUsersMetaDto;
}
