import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { OrdersGateway } from '../gateways/orders.gateway';
import { Courier } from './entities/courier.entity';
import { CourierShift } from './entities/courier-shift.entity';
import {
  ActiveShiftItemDto,
  ActiveShiftsResponseDto,
  PaginatedShiftsDto,
  ShiftHistoryQueryDto,
  ShiftResponseDto,
} from './dto/shift-response.dto';

@Injectable()
export class ShiftManagementService {
  private readonly logger = new Logger(ShiftManagementService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
  ) {}

  async openShift(user: AuthUser): Promise<ShiftResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      let shift: CourierShift;
      try {
        shift = manager.create(CourierShift, {
          owner_id: user.ownerId,
          courier_id: user.userId,
        });
        shift = await manager.save(CourierShift, shift);
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err.driverError as { code?: string })?.code === '23505'
        ) {
          throw new ConflictException('Courier already has an open shift');
        }
        throw err;
      }

      await manager
        .createQueryBuilder()
        .update(Courier)
        .set({ status: 'available' as const, updated_at: () => 'NOW()' })
        .where('id = :id AND owner_id = :ownerId', {
          id: user.userId,
          ownerId: user.ownerId,
        })
        .execute();

      try {
        this.ordersGateway.emitShiftOpened(user.ownerId, {
          courierId: user.userId,
          shiftId: shift.id,
          startedAt: shift.started_at,
        });
      } catch (err) {
        this.logger.error('Failed to emit courier:shift_opened', err);
      }

      return this.mapToDto(shift, null);
    });
  }

  async closeShift(user: AuthUser): Promise<ShiftResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(CourierShift)
        .set({ status: 'closed', ended_at: () => 'NOW()', updated_at: () => 'NOW()' })
        .where(
          "courier_id = :courierId AND owner_id = :ownerId AND status = 'open'",
          { courierId: user.userId, ownerId: user.ownerId },
        )
        .execute();

      if (result.affected === 0) {
        throw new ConflictException('No open shift to close');
      }

      const shift = await manager
        .getRepository(CourierShift)
        .createQueryBuilder('s')
        .where('s.courier_id = :courierId AND s.owner_id = :ownerId AND s.status = :status', {
          courierId: user.userId,
          ownerId: user.ownerId,
          status: 'closed',
        })
        .andWhere('s.ended_at IS NOT NULL')
        .orderBy('s.ended_at', 'DESC')
        .getOne();

      if (!shift) throw new ConflictException('No open shift to close');

      await manager
        .createQueryBuilder()
        .update(Courier)
        .set({ status: 'unavailable' as const, updated_at: () => 'NOW()' })
        .where('id = :id AND owner_id = :ownerId', {
          id: user.userId,
          ownerId: user.ownerId,
        })
        .execute();

      const durationMinutes = this.computeDuration(shift.started_at, shift.ended_at);

      try {
        this.ordersGateway.emitShiftClosed(user.ownerId, {
          courierId: user.userId,
          shiftId: shift.id,
          startedAt: shift.started_at,
          endedAt: shift.ended_at,
          durationMinutes,
        });
      } catch (err) {
        this.logger.error('Failed to emit courier:shift_closed', err);
      }

      return this.mapToDto(shift, null);
    });
  }

  async getCurrentShift(user: AuthUser): Promise<ShiftResponseDto | null> {
    const shift = await this.dataSource.getRepository(CourierShift).findOne({
      where: { courier_id: user.userId, owner_id: user.ownerId, status: 'open' },
    });
    return shift ? this.mapToDto(shift, null) : null;
  }

  async getOwnShiftHistory(
    user: AuthUser,
    query: ShiftHistoryQueryDto,
  ): Promise<PaginatedShiftsDto> {
    return this.queryShiftHistory(user.userId, user.ownerId, query);
  }

  async getCourierShifts(
    courierId: string,
    ownerId: string,
    query: ShiftHistoryQueryDto,
  ): Promise<PaginatedShiftsDto> {
    const courier = await this.dataSource
      .getRepository(Courier)
      .findOne({ where: { id: courierId, owner_id: ownerId } });
    if (!courier) throw new NotFoundException('Courier not found');
    return this.queryShiftHistory(courierId, ownerId, query);
  }

  async getActiveShifts(ownerId: string): Promise<ActiveShiftsResponseDto> {
    const rows = await this.dataSource
      .getRepository(CourierShift)
      .createQueryBuilder('cs')
      .innerJoinAndSelect('cs.courier', 'c')
      .where('cs.owner_id = :ownerId AND cs.status = :status', {
        ownerId,
        status: 'open',
      })
      .orderBy('cs.started_at', 'ASC')
      .getMany();

    const now = Date.now();

    const data: ActiveShiftItemDto[] = await Promise.all(
      rows.map(async (shift) => {
        const activeOrderCount = await this.dataSource
          .getRepository('orders')
          .createQueryBuilder('o')
          .where('o.courier_id = :courierId AND o.owner_id = :ownerId', {
            courierId: shift.courier_id,
            ownerId,
          })
          .andWhere("o.status NOT IN ('completed', 'cancelled')")
          .getCount();

        return {
          id: shift.id,
          courier_id: shift.courier_id,
          courier_name: `${shift.courier.first_name} ${shift.courier.last_name}`,
          started_at: shift.started_at,
          elapsed_minutes: Math.round((now - shift.started_at.getTime()) / 60000),
          active_order_count: activeOrderCount,
        };
      }),
    );

    return { data, total: data.length };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async queryShiftHistory(
    courierId: string,
    ownerId: string,
    query: ShiftHistoryQueryDto,
  ): Promise<PaginatedShiftsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const qb = this.dataSource
      .getRepository(CourierShift)
      .createQueryBuilder('s')
      .where('s.courier_id = :courierId AND s.owner_id = :ownerId', {
        courierId,
        ownerId,
      })
      .orderBy('s.started_at', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.from) {
      qb.andWhere('s.started_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('s.started_at <= :to', { to: query.to });
    }

    const [shifts, total] = await qb.getManyAndCount();

    const data = await Promise.all(
      shifts.map(async (s) => {
        let orderCount: number | null = null;
        if (s.status === 'closed' && s.ended_at) {
          const count = await this.dataSource
            .createQueryBuilder()
            .select('COUNT(*)', 'cnt')
            .from('courier_earnings', 'ce')
            .where('ce.courier_id = :courierId', { courierId })
            .andWhere('ce.earned_at >= :start', { start: s.started_at })
            .andWhere('ce.earned_at <= :end', { end: s.ended_at })
            .getRawOne<{ cnt: string }>();
          orderCount = parseInt(count?.cnt ?? '0', 10);
        }
        return this.mapToDto(s, orderCount);
      }),
    );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  private mapToDto(shift: CourierShift, orderCount: number | null): ShiftResponseDto {
    const dto = new ShiftResponseDto();
    dto.id = shift.id;
    dto.courier_id = shift.courier_id;
    dto.status = shift.status;
    dto.started_at = shift.started_at;
    dto.ended_at = shift.ended_at ?? null;
    dto.duration_minutes = shift.ended_at
      ? this.computeDuration(shift.started_at, shift.ended_at)
      : null;
    dto.order_count = orderCount;
    return dto;
  }

  private computeDuration(startedAt: Date, endedAt: Date | null): number | null {
    if (!endedAt) return null;
    return Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  }
}
