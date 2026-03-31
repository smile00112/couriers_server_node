import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { PayoutsService } from './payouts.service';

const mockOwnerId = 'owner-uuid-001';
const mockPeriodId = 'period-uuid-001';
const mockCourierId = 'courier-uuid-001';

function makePeriod(status: 'open' | 'closed' = 'open') {
  return {
    id: mockPeriodId,
    owner_id: mockOwnerId,
    created_by: 'staff-uuid',
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    status,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeQb(overrides?: Partial<Record<string, jest.Mock>>) {
  const qb: Record<string, jest.Mock> = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    from: jest.fn(),
    innerJoin: jest.fn(),
    groupBy: jest.fn(),
    addGroupBy: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };

  // Chain all methods on the same object
  Object.keys(qb).forEach((key) => {
    if (
      key !== 'execute' &&
      key !== 'getMany' &&
      key !== 'getManyAndCount' &&
      key !== 'getRawMany'
    ) {
      (qb[key] as jest.Mock).mockReturnValue(qb);
    }
  });

  return qb;
}

function makeDataSource(
  repoOverrides?: Record<string, jest.Mock>,
  qbOverrides?: Partial<Record<string, jest.Mock>>,
) {
  const qb = makeQb(qbOverrides);

  const repo: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn((_, data) => data),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    ...repoOverrides,
  };

  const ds = {
    getRepository: jest.fn().mockReturnValue(repo),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };

  return { ds, repo, qb };
}

describe('PayoutsService', () => {
  let service: PayoutsService;
  let ds: ReturnType<typeof makeDataSource>['ds'];
  let repo: ReturnType<typeof makeDataSource>['repo'];
  let qb: ReturnType<typeof makeDataSource>['qb'];

  beforeEach(async () => {
    const built = makeDataSource();
    ds = built.ds;
    repo = built.repo;
    qb = built.qb;

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayoutsService, { provide: DataSource, useValue: ds }],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  // ---------------------------------------------------------------------------
  // US1 — createPeriod
  // ---------------------------------------------------------------------------

  describe('createPeriod', () => {
    const user = { userId: 'staff-uuid', ownerId: mockOwnerId, role: 'owner' };

    it('throws BadRequestException when end_date < start_date', async () => {
      await expect(
        service.createPeriod(user, {
          start_date: '2026-03-31',
          end_date: '2026-03-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates and returns period', async () => {
      const period = makePeriod('open');
      repo.save.mockResolvedValue(period);

      const result = await service.createPeriod(user, {
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('open');
      expect(result.start_date).toBe('2026-03-01');
    });
  });

  // ---------------------------------------------------------------------------
  // US1 — closePeriod
  // ---------------------------------------------------------------------------

  describe('closePeriod', () => {
    it('throws NotFoundException when period not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.closePeriod(mockOwnerId, mockPeriodId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when period already closed', async () => {
      repo.findOne.mockResolvedValue(makePeriod('closed'));
      await expect(
        service.closePeriod(mockOwnerId, mockPeriodId),
      ).rejects.toThrow(ConflictException);
    });

    it('closes an open period', async () => {
      repo.findOne.mockResolvedValue(makePeriod('open'));
      qb.execute.mockResolvedValue({ affected: 1 });

      const result = await service.closePeriod(mockOwnerId, mockPeriodId);
      expect(result.status).toBe('closed');
    });
  });

  // ---------------------------------------------------------------------------
  // US1 — getPeriodSummary with empty range
  // ---------------------------------------------------------------------------

  describe('getPeriodSummary', () => {
    it('throws NotFoundException when period not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.getPeriodSummary(mockOwnerId, mockPeriodId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty couriers array when no earnings in range', async () => {
      repo.findOne.mockResolvedValue(makePeriod('closed'));
      qb.getRawMany.mockResolvedValue([]);
      repo.find.mockResolvedValue([]);

      const result = await service.getPeriodSummary(mockOwnerId, mockPeriodId);
      expect(result.couriers).toHaveLength(0);
    });

    it('marks couriers as paid if payout exists', async () => {
      repo.findOne.mockResolvedValue(makePeriod('closed'));
      qb.getRawMany.mockResolvedValue([
        {
          courier_id: mockCourierId,
          first_name: 'John',
          last_name: 'Smith',
          delivery_count: '5',
          total_amount: '150.00',
        },
      ]);
      repo.find.mockResolvedValue([{ courier_id: mockCourierId }]);

      const result = await service.getPeriodSummary(mockOwnerId, mockPeriodId);
      expect(result.couriers[0].is_paid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // US2 — recordPayout
  // ---------------------------------------------------------------------------

  describe('recordPayout', () => {
    const dto = { courier_id: mockCourierId, amount: 150.0 };

    it('throws NotFoundException when period not found', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.recordPayout(mockOwnerId, mockPeriodId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when period is open', async () => {
      repo.findOne.mockResolvedValueOnce(makePeriod('open'));
      await expect(
        service.recordPayout(mockOwnerId, mockPeriodId, dto),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException when courier not found in tenant', async () => {
      repo.findOne
        .mockResolvedValueOnce(makePeriod('closed'))
        .mockResolvedValueOnce(null);
      await expect(
        service.recordPayout(mockOwnerId, mockPeriodId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException on duplicate payout (pg 23505)', async () => {
      repo.findOne
        .mockResolvedValueOnce(makePeriod('closed'))
        .mockResolvedValueOnce({ id: mockCourierId });

      const pgError = new QueryFailedError('', [], new Error());
      (pgError as unknown as { driverError: { code: string } }).driverError = {
        code: '23505',
      };
      repo.save.mockRejectedValue(pgError);

      await expect(
        service.recordPayout(mockOwnerId, mockPeriodId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('creates and returns payout record', async () => {
      const payout = {
        id: 'payout-uuid',
        owner_id: mockOwnerId,
        payout_period_id: mockPeriodId,
        courier_id: mockCourierId,
        amount: 150.0,
        reference_note: null,
        paid_at: new Date(),
        created_at: new Date(),
      };

      repo.findOne
        .mockResolvedValueOnce(makePeriod('closed'))
        .mockResolvedValueOnce({ id: mockCourierId });
      repo.save.mockResolvedValue(payout);

      const result = await service.recordPayout(mockOwnerId, mockPeriodId, dto);
      expect(result.courier_id).toBe(mockCourierId);
      expect(result.amount).toBe('150');
    });
  });

  // ---------------------------------------------------------------------------
  // US4 — getPendingCouriers
  // ---------------------------------------------------------------------------

  describe('getPendingCouriers', () => {
    it('throws NotFoundException when period not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.getPendingCouriers(mockOwnerId, mockPeriodId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when period is open', async () => {
      repo.findOne.mockResolvedValue(makePeriod('open'));
      await expect(
        service.getPendingCouriers(mockOwnerId, mockPeriodId),
      ).rejects.toThrow(ConflictException);
    });

    it('returns only unpaid couriers', async () => {
      repo.findOne.mockResolvedValue(makePeriod('closed'));
      qb.getRawMany.mockResolvedValue([
        {
          courier_id: 'c1',
          first_name: 'A',
          last_name: 'B',
          delivery_count: '3',
          total_amount: '90.00',
        },
        {
          courier_id: 'c2',
          first_name: 'C',
          last_name: 'D',
          delivery_count: '2',
          total_amount: '60.00',
        },
      ]);
      // c1 is already paid
      repo.find.mockResolvedValue([{ courier_id: 'c1' }]);

      const result = await service.getPendingCouriers(
        mockOwnerId,
        mockPeriodId,
      );
      expect(result.couriers).toHaveLength(1);
      expect(result.couriers[0].courier_id).toBe('c2');
    });

    it('returns empty list when all couriers paid', async () => {
      repo.findOne.mockResolvedValue(makePeriod('closed'));
      qb.getRawMany.mockResolvedValue([
        {
          courier_id: 'c1',
          first_name: 'A',
          last_name: 'B',
          delivery_count: '3',
          total_amount: '90.00',
        },
      ]);
      repo.find.mockResolvedValue([{ courier_id: 'c1' }]);

      const result = await service.getPendingCouriers(
        mockOwnerId,
        mockPeriodId,
      );
      expect(result.couriers).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // US3 — getCourierEarnings pagination
  // ---------------------------------------------------------------------------

  describe('getCourierEarnings', () => {
    it('returns paginated earnings', async () => {
      const earning = {
        id: 'e1',
        order_id: 'o1',
        amount: 30,
        earned_at: new Date(),
      };
      qb.getManyAndCount.mockResolvedValue([[earning], 1]);

      const result = await service.getCourierEarnings(
        mockCourierId,
        mockOwnerId,
        { page: 1, limit: 20 },
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
