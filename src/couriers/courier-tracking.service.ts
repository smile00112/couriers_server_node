import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { OrdersGateway } from '../gateways/orders.gateway';
import { Order } from '../orders/entities/order.entity';
import { CourierPosition } from './entities/courier-position.entity';
import { CourierLocationHistory } from './entities/courier-location-history.entity';
import { SubmitLocationDto } from './dto/submit-location.dto';
import {
  LocationResponseDto,
  RouteHistoryResponseDto,
  RoutePointDto,
} from './dto/location-history-response.dto';
import type { PaginatedRouteHistoryDto, RouteHistoryListItemDto } from './dto/route-history-list.dto';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { LOCATION_CALLBACK_QUEUE } from '../queues/queues.constants';

@Injectable()
export class CourierTrackingService {
  private readonly logger = new Logger(CourierTrackingService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
    @InjectQueue(LOCATION_CALLBACK_QUEUE)
    private readonly locationCallbackQueue: Queue,
  ) {}

  async submitLocation(dto: SubmitLocationDto, user: AuthUser): Promise<LocationResponseDto> {
    const now = new Date();

    // 1. Find active order for courier
    const activeOrder = await this.dataSource.getRepository(Order).findOne({
      where: [
        { courier_id: user.userId, owner_id: user.ownerId, status: 'assigned' },
        { courier_id: user.userId, owner_id: user.ownerId, status: 'picked_up' },
        { courier_id: user.userId, owner_id: user.ownerId, status: 'in_delivery' },
      ],
      select: ['id', 'callback_url'],
    });

    // 2. Load previous position
    const previous = await this.dataSource
      .getRepository(CourierPosition)
      .findOne({ where: { courier_id: user.userId } });

    // 3. Compute Haversine distance
    const distanceMeters = previous
      ? this.haversineMeters(
          Number(previous.lat),
          Number(previous.lng),
          dto.lat,
          dto.lng,
        )
      : 0;

    // 4. UPSERT courier_positions
    await this.dataSource.query(
      `INSERT INTO courier_positions (owner_id, courier_id, lat, lng, recorded_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (courier_id) DO UPDATE
         SET lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             recorded_at = EXCLUDED.recorded_at,
             updated_at = NOW()`,
      [user.ownerId, user.userId, dto.lat, dto.lng, now],
    );

    // 5. INSERT history entry
    await this.dataSource.getRepository(CourierLocationHistory).save({
      owner_id: user.ownerId,
      courier_id: user.userId,
      order_id: activeOrder?.id ?? null,
      lat: dto.lat,
      lng: dto.lng,
      distance_meters: distanceMeters,
    });

    // 6. Emit Socket.IO event
    this.emitLocationUpdated(user.ownerId, {
      courierId: user.userId,
      lat: dto.lat,
      lng: dto.lng,
      recordedAt: now,
      orderId: activeOrder?.id ?? null,
      distanceMeters,
    });

    // 7. Enqueue external callback if order has callback_url
    if (activeOrder?.callback_url) {
      await this.locationCallbackQueue.add('send', {
        courierId: user.userId,
        orderId: activeOrder.id,
        callbackUrl: activeOrder.callback_url,
        lat: dto.lat,
        lng: dto.lng,
        timestamp: now.toISOString(),
        ownerId: user.ownerId,
      });
    }

    return {
      courier_id: user.userId,
      lat: dto.lat,
      lng: dto.lng,
      recorded_at: now,
      order_id: activeOrder?.id ?? null,
      distance_meters: distanceMeters,
    };
  }

  async getOrderRoute(orderId: string, ownerId: string): Promise<RouteHistoryResponseDto> {
    // 1. Verify order belongs to tenant
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId, owner_id: ownerId },
      select: ['id', 'courier_id'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 2. Query history ordered chronologically
    const points = await this.dataSource
      .getRepository(CourierLocationHistory)
      .find({
        where: { order_id: orderId },
        order: { recorded_at: 'ASC' },
      });

    // 3. Sum distances
    const totalDistance = points.reduce(
      (sum, p) => sum + Number(p.distance_meters),
      0,
    );

    // 4. Map to DTOs
    const routePoints: RoutePointDto[] = points.map((p) => ({
      id: p.id,
      lat: Number(p.lat),
      lng: Number(p.lng),
      distance_meters: Number(p.distance_meters),
      recorded_at: p.recorded_at,
    }));

    return {
      order_id: orderId,
      courier_id: order.courier_id ?? (points[0]?.courier_id ?? ''),
      total_distance_meters: totalDistance,
      points: routePoints,
    };
  }

  async getRouteHistoryList(
    ownerId: string,
    page: number,
    limit: number,
    filters: {
      courier_id?: string;
      order_id?: string;
      from?: string;
      to?: string;
    },
  ): Promise<PaginatedRouteHistoryDto> {
    const offset = (page - 1) * limit;

    const params: unknown[] = [ownerId];
    const whereClauses: string[] = ['h.owner_id = $1'];
    let paramIdx = 2;

    if (filters.courier_id) {
      whereClauses.push(`h.courier_id = $${paramIdx}`);
      params.push(filters.courier_id);
      paramIdx++;
    }
    if (filters.order_id) {
      whereClauses.push(`h.order_id = $${paramIdx}`);
      params.push(filters.order_id);
      paramIdx++;
    }
    if (filters.from) {
      whereClauses.push(`h.recorded_at >= $${paramIdx}`);
      params.push(filters.from);
      paramIdx++;
    }
    if (filters.to) {
      whereClauses.push(`h.recorded_at <= $${paramIdx}`);
      params.push(filters.to);
      paramIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(DISTINCT (h.order_id, h.courier_id)) as count
       FROM courier_location_history h
       WHERE ${whereStr} AND h.order_id IS NOT NULL`,
      params,
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const rows = await this.dataSource.query<Array<{
      order_id: string;
      courier_id: string;
      courier_name: string;
      order_number: string;
      total_distance_meters: string;
      recorded_date: string;
      point_count: string;
    }>>(
      `SELECT
         h.order_id,
         h.courier_id,
         (c.first_name || ' ' || c.last_name) AS courier_name,
         o.order_number,
         SUM(h.distance_meters)::numeric AS total_distance_meters,
         MIN(h.recorded_at)::date AS recorded_date,
         COUNT(*)::int AS point_count
       FROM courier_location_history h
       JOIN couriers c ON c.id = h.courier_id
       JOIN orders o ON o.id = h.order_id
       WHERE ${whereStr} AND h.order_id IS NOT NULL
       GROUP BY h.order_id, h.courier_id, c.first_name, c.last_name, o.order_number
       ORDER BY recorded_date DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    const data: RouteHistoryListItemDto[] = rows.map((r) => ({
      order_id: r.order_id,
      courier_id: r.courier_id,
      courier_name: r.courier_name,
      order_number: r.order_number,
      total_distance_meters: parseFloat(r.total_distance_meters),
      recorded_date: r.recorded_date,
      point_count: parseInt(String(r.point_count), 10),
    }));

    return {
      data,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  private emitLocationUpdated(ownerId: string, payload: object): void {
    try {
      this.ordersGateway.emitLocationUpdated(ownerId, payload);
    } catch (err) {
      this.logger.error('Failed to emit courier:location_updated', err);
    }
  }

  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
