import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { PayoutPeriod } from './entities/payout-period.entity';
import { Payout } from './entities/payout.entity';
import { Courier } from '../couriers/entities/courier.entity';
import { CourierEarning } from '../orders/entities/courier-earning.entity';
import { CreatePayoutPeriodDto } from './dto/create-payout-period.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';
import {
  PaginatedPayoutPeriodsDto,
  PayoutPeriodResponseDto,
} from './dto/payout-period-response.dto';
import {
  CourierSummaryItemDto,
  PeriodSummaryResponseDto,
} from './dto/period-summary-response.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { PendingCouriersResponseDto } from './dto/pending-couriers-response.dto';
import {
  CourierEarningsResponseDto,
  PaginatedCourierEarningsDto,
} from './dto/courier-earnings-response.dto';
import {
  CourierPayoutItemDto,
  PaginatedCourierPayoutsDto,
} from './dto/courier-payouts-response.dto';

export interface PeriodsQuery {
  page?: number;
  limit?: number;
  status?: 'open' | 'closed';
}

export interface EarningsQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface PayoutsHistoryQuery {
  page?: number;
  limit?: number;
}

@Injectable()
export class PayoutsService {
  constructor(private readonly dataSource: DataSource) {}

  // ---------------------------------------------------------------------------
  // US1 — Payout Period management + earnings summary
  // ---------------------------------------------------------------------------

  async createPeriod(
    user: AuthUser,
    dto: CreatePayoutPeriodDto,
  ): Promise<PayoutPeriodResponseDto> {
    if (dto.end_date < dto.start_date) {
      throw new BadRequestException(
        'end_date must be greater than or equal to start_date',
      );
    }

    const period = await this.dataSource.getRepository(PayoutPeriod).save(
      this.dataSource.getRepository(PayoutPeriod).create({
        owner_id: user.ownerId,
        created_by: user.userId,
        start_date: dto.start_date,
        end_date: dto.end_date,
        status: 'open',
      }),
    );

    return this.mapPeriodToDto(period);
  }

  async listPeriods(
    ownerId: string,
    query: PeriodsQuery,
  ): Promise<PaginatedPayoutPeriodsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const qb = this.dataSource
      .getRepository(PayoutPeriod)
      .createQueryBuilder('pp')
      .where('pp.owner_id = :ownerId', { ownerId })
      .orderBy('pp.created_at', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.status) {
      qb.andWhere('pp.status = :status', { status: query.status });
    }

    const [periods, total] = await qb.getManyAndCount();

    return {
      data: periods.map(this.mapPeriodToDto),
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async closePeriod(
    ownerId: string,
    periodId: string,
  ): Promise<PayoutPeriodResponseDto> {
    const period = await this.findPeriodOrFail(ownerId, periodId);

    if (period.status === 'closed') {
      throw new ConflictException('Payout period is already closed');
    }

    await this.dataSource
      .getRepository(PayoutPeriod)
      .createQueryBuilder()
      .update()
      .set({ status: 'closed', updated_at: () => 'NOW()' })
      .where('id = :id AND owner_id = :ownerId', { id: periodId, ownerId })
      .execute();

    period.status = 'closed';
    return this.mapPeriodToDto(period);
  }

  async getPeriodSummary(
    ownerId: string,
    periodId: string,
  ): Promise<PeriodSummaryResponseDto> {
    const period = await this.findPeriodOrFail(ownerId, periodId);
    const couriers = await this.aggregateCourierEarnings(ownerId, period);
    const paidCourierIds = await this.getPaidCourierIds(periodId);

    return {
      period: {
        id: period.id,
        start_date: period.start_date,
        end_date: period.end_date,
        status: period.status,
      },
      couriers: couriers.map((c) => ({
        ...c,
        is_paid: paidCourierIds.has(c.courier_id),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // US2 — Record payout (mark courier as paid)
  // ---------------------------------------------------------------------------

  async recordPayout(
    ownerId: string,
    periodId: string,
    dto: CreatePayoutDto,
  ): Promise<PayoutResponseDto> {
    const period = await this.findPeriodOrFail(ownerId, periodId);

    if (period.status === 'open') {
      throw new UnprocessableEntityException(
        'Payout period must be closed before recording payouts',
      );
    }

    const courier = await this.dataSource
      .getRepository(Courier)
      .findOne({ where: { id: dto.courier_id, owner_id: ownerId } });
    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    let payout: Payout;
    try {
      payout = await this.dataSource.getRepository(Payout).save(
        this.dataSource.getRepository(Payout).create({
          owner_id: ownerId,
          payout_period_id: periodId,
          courier_id: dto.courier_id,
          amount: dto.amount,
          reference_note: dto.reference_note ?? null,
        }),
      );
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException('Courier already paid in this period');
      }
      throw err;
    }

    return this.mapPayoutToDto(payout);
  }

  // ---------------------------------------------------------------------------
  // US3 — Courier self-service earnings + payout history
  // ---------------------------------------------------------------------------

  async getCourierEarnings(
    courierId: string,
    ownerId: string,
    query: EarningsQuery,
  ): Promise<PaginatedCourierEarningsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const qb = this.dataSource
      .getRepository(CourierEarning)
      .createQueryBuilder('ce')
      .where('ce.courier_id = :courierId AND ce.owner_id = :ownerId', {
        courierId,
        ownerId,
      })
      .orderBy('ce.earned_at', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.from) {
      qb.andWhere('ce.earned_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('ce.earned_at <= :to', { to: `${query.to}T23:59:59.999Z` });
    }

    const [earnings, total] = await qb.getManyAndCount();

    const data: CourierEarningsResponseDto[] = earnings.map((e) => ({
      id: e.id,
      order_id: e.order_id,
      amount: String(e.amount),
      earned_at: e.earned_at,
    }));

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

  async getCourierPayouts(
    courierId: string,
    ownerId: string,
    query: PayoutsHistoryQuery,
  ): Promise<PaginatedCourierPayoutsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const [payouts, total] = await this.dataSource
      .getRepository(Payout)
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.payout_period', 'pp')
      .where('p.courier_id = :courierId AND p.owner_id = :ownerId', {
        courierId,
        ownerId,
      })
      .orderBy('p.paid_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const data: CourierPayoutItemDto[] = payouts.map((p) => ({
      id: p.id,
      payout_period_id: p.payout_period_id,
      period_start_date: p.payout_period.start_date,
      period_end_date: p.payout_period.end_date,
      amount: String(p.amount),
      reference_note: p.reference_note,
      paid_at: p.paid_at,
    }));

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

  // ---------------------------------------------------------------------------
  // US4 — Pending (unpaid) couriers for a closed period
  // ---------------------------------------------------------------------------

  async getPendingCouriers(
    ownerId: string,
    periodId: string,
  ): Promise<PendingCouriersResponseDto> {
    const period = await this.findPeriodOrFail(ownerId, periodId);

    if (period.status === 'open') {
      throw new ConflictException(
        'Payout period must be closed before viewing pending couriers',
      );
    }

    const allCouriers = await this.aggregateCourierEarnings(ownerId, period);
    const paidCourierIds = await this.getPaidCourierIds(periodId);

    const pending = allCouriers.filter(
      (c) => !paidCourierIds.has(c.courier_id),
    );

    return {
      period_id: periodId,
      couriers: pending.map((c) => ({
        courier_id: c.courier_id,
        courier_name: c.courier_name,
        delivery_count: c.delivery_count,
        total_amount: c.total_amount,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findPeriodOrFail(
    ownerId: string,
    periodId: string,
  ): Promise<PayoutPeriod> {
    const period = await this.dataSource
      .getRepository(PayoutPeriod)
      .findOne({ where: { id: periodId, owner_id: ownerId } });
    if (!period) {
      throw new NotFoundException('Payout period not found');
    }
    return period;
  }

  private async aggregateCourierEarnings(
    ownerId: string,
    period: PayoutPeriod,
  ): Promise<CourierSummaryItemDto[]> {
    // Include all earnings from start_date 00:00 to end_date 23:59:59.999
    const startTs = `${period.start_date}T00:00:00.000Z`;
    const endTs = `${period.end_date}T23:59:59.999Z`;

    const rows = await this.dataSource
      .createQueryBuilder()
      .select('ce.courier_id', 'courier_id')
      .addSelect('c.first_name', 'first_name')
      .addSelect('c.last_name', 'last_name')
      .addSelect('COUNT(ce.id)', 'delivery_count')
      .addSelect('SUM(ce.amount)', 'total_amount')
      .from(CourierEarning, 'ce')
      .innerJoin(Courier, 'c', 'c.id = ce.courier_id')
      .where('ce.owner_id = :ownerId', { ownerId })
      .andWhere('ce.earned_at >= :startTs', { startTs })
      .andWhere('ce.earned_at <= :endTs', { endTs })
      .groupBy('ce.courier_id')
      .addGroupBy('c.first_name')
      .addGroupBy('c.last_name')
      .orderBy('SUM(ce.amount)', 'DESC')
      .getRawMany<{
        courier_id: string;
        first_name: string;
        last_name: string;
        delivery_count: string;
        total_amount: string;
      }>();

    return rows.map((r) => ({
      courier_id: r.courier_id,
      courier_name: `${r.first_name} ${r.last_name}`,
      delivery_count: parseInt(r.delivery_count, 10),
      total_amount: parseFloat(r.total_amount).toFixed(2),
      is_paid: false, // overridden by caller
    }));
  }

  private async getPaidCourierIds(periodId: string): Promise<Set<string>> {
    const payouts = await this.dataSource
      .getRepository(Payout)
      .find({ where: { payout_period_id: periodId }, select: ['courier_id'] });
    return new Set(payouts.map((p) => p.courier_id));
  }

  private mapPeriodToDto(period: PayoutPeriod): PayoutPeriodResponseDto {
    const dto = new PayoutPeriodResponseDto();
    dto.id = period.id;
    dto.owner_id = period.owner_id;
    dto.start_date = period.start_date;
    dto.end_date = period.end_date;
    dto.status = period.status;
    dto.created_by = period.created_by;
    dto.created_at = period.created_at;
    dto.updated_at = period.updated_at;
    return dto;
  }

  private mapPayoutToDto(payout: Payout): PayoutResponseDto {
    const dto = new PayoutResponseDto();
    dto.id = payout.id;
    dto.owner_id = payout.owner_id;
    dto.payout_period_id = payout.payout_period_id;
    dto.courier_id = payout.courier_id;
    dto.amount = String(payout.amount);
    dto.reference_note = payout.reference_note;
    dto.paid_at = payout.paid_at;
    dto.created_at = payout.created_at;
    return dto;
  }
}
