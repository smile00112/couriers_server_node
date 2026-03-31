import { ApiProperty } from '@nestjs/swagger';

export class RouteHistoryListItemDto {
  @ApiProperty() order_id!: string;
  @ApiProperty() courier_id!: string;
  @ApiProperty() courier_name!: string;
  @ApiProperty() order_number!: string;
  @ApiProperty() total_distance_meters!: number;
  @ApiProperty() recorded_date!: string;
  @ApiProperty() point_count!: number;
}

export class RouteHistoryMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total_pages!: number;
}

export class PaginatedRouteHistoryDto {
  @ApiProperty({ type: [RouteHistoryListItemDto] }) data!: RouteHistoryListItemDto[];
  @ApiProperty({ type: RouteHistoryMetaDto }) meta!: RouteHistoryMetaDto;
}
