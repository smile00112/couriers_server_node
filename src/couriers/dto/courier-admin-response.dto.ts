import { ApiProperty } from '@nestjs/swagger';

export class CurrentPositionDto {
  @ApiProperty() lat!: number;
  @ApiProperty() lng!: number;
  @ApiProperty() recorded_at!: string;
}

export class CurrentShiftDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() started_at!: string;
  @ApiProperty() elapsed_minutes!: number;
}

export class CourierAdminListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() first_name!: string;
  @ApiProperty() last_name!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) login!: string | null;
  @ApiProperty() created_at!: string;
  @ApiProperty() updated_at!: string;
}

export class CourierAdminDetailDto extends CourierAdminListItemDto {
  @ApiProperty({ nullable: true }) telegram_chat_id!: string | null;
  @ApiProperty({ type: CurrentPositionDto, nullable: true })
  current_position!: CurrentPositionDto | null;
  @ApiProperty({ type: CurrentShiftDto, nullable: true })
  current_shift!: CurrentShiftDto | null;
}

export class PaginatedCouriersMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total_pages!: number;
}

export class PaginatedCouriersDto {
  @ApiProperty({ type: [CourierAdminListItemDto] }) data!: CourierAdminListItemDto[];
  @ApiProperty({ type: PaginatedCouriersMetaDto }) meta!: PaginatedCouriersMetaDto;
}
