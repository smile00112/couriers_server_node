import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsController } from '../../src/payouts/payouts.controller';
import { CourierPayoutsController } from '../../src/payouts/courier-payouts.controller';
import { PayoutsService } from '../../src/payouts/payouts.service';

const mockOwnerId = 'owner-uuid-001';
const mockPeriodId = 'period-uuid-001';
const mockCourierId = 'courier-uuid-001';

const staffUser = { userId: 'staff-uuid', ownerId: mockOwnerId, role: 'owner' };
const courierUser = {
  userId: mockCourierId,
  ownerId: mockOwnerId,
  role: 'courier',
};

function makeReq(user: typeof staffUser) {
  return { user } as unknown as Request;
}

const mockPeriodResponse = {
  id: mockPeriodId,
  owner_id: mockOwnerId,
  start_date: '2026-03-01',
  end_date: '2026-03-31',
  status: 'open' as const,
  created_by: 'staff-uuid',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('PayoutsController', () => {
  let controller: PayoutsController;
  let service: jest.Mocked<PayoutsService>;

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<PayoutsService>> = {
      createPeriod: jest.fn().mockResolvedValue(mockPeriodResponse),
      listPeriods: jest.fn().mockResolvedValue({
        data: [mockPeriodResponse],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      }),
      closePeriod: jest
        .fn()
        .mockResolvedValue({ ...mockPeriodResponse, status: 'closed' }),
      getPeriodSummary: jest
        .fn()
        .mockResolvedValue({ period: mockPeriodResponse, couriers: [] }),
      recordPayout: jest.fn().mockResolvedValue({ id: 'payout-uuid' }),
      getPendingCouriers: jest
        .fn()
        .mockResolvedValue({ period_id: mockPeriodId, couriers: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [{ provide: PayoutsService, useValue: mockService }],
    }).compile();

    controller = module.get<PayoutsController>(PayoutsController);
    service = module.get(PayoutsService);
  });

  it('createPayoutPeriod calls service.createPeriod', async () => {
    const dto = { start_date: '2026-03-01', end_date: '2026-03-31' };
    await controller.createPayoutPeriod(
      makeReq(staffUser) as unknown as Parameters<
        typeof controller.createPayoutPeriod
      >[0],
      dto,
    );
    expect(service.createPeriod).toHaveBeenCalledWith(staffUser, dto);
  });

  it('listPayoutPeriods calls service.listPeriods with ownerId', async () => {
    await controller.listPayoutPeriods(
      makeReq(staffUser) as unknown as Parameters<
        typeof controller.listPayoutPeriods
      >[0],
      {},
    );
    expect(service.listPeriods).toHaveBeenCalledWith(mockOwnerId, {});
  });

  it('closePayoutPeriod calls service.closePeriod', async () => {
    await controller.closePayoutPeriod(
      makeReq(staffUser) as unknown as Parameters<
        typeof controller.closePayoutPeriod
      >[0],
      mockPeriodId,
    );
    expect(service.closePeriod).toHaveBeenCalledWith(mockOwnerId, mockPeriodId);
  });

  it('getPayoutPeriodSummary calls service.getPeriodSummary', async () => {
    await controller.getPayoutPeriodSummary(
      makeReq(staffUser) as unknown as Parameters<
        typeof controller.getPayoutPeriodSummary
      >[0],
      mockPeriodId,
    );
    expect(service.getPeriodSummary).toHaveBeenCalledWith(
      mockOwnerId,
      mockPeriodId,
    );
  });

  it('recordPayout calls service.recordPayout', async () => {
    const dto = { courier_id: mockCourierId, amount: 150 };
    await controller.recordPayout(
      makeReq(staffUser) as unknown as Parameters<
        typeof controller.recordPayout
      >[0],
      mockPeriodId,
      dto,
    );
    expect(service.recordPayout).toHaveBeenCalledWith(
      mockOwnerId,
      mockPeriodId,
      dto,
    );
  });

  it('getPendingCouriers calls service.getPendingCouriers', async () => {
    await controller.getPendingCouriers(
      makeReq(staffUser) as unknown as Parameters<
        typeof controller.getPendingCouriers
      >[0],
      mockPeriodId,
    );
    expect(service.getPendingCouriers).toHaveBeenCalledWith(
      mockOwnerId,
      mockPeriodId,
    );
  });
});

describe('CourierPayoutsController', () => {
  let controller: CourierPayoutsController;
  let service: jest.Mocked<PayoutsService>;

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<PayoutsService>> = {
      getCourierEarnings: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
      }),
      getCourierPayouts: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, total_pages: 0 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourierPayoutsController],
      providers: [{ provide: PayoutsService, useValue: mockService }],
    }).compile();

    controller = module.get<CourierPayoutsController>(CourierPayoutsController);
    service = module.get(PayoutsService);
  });

  it('getCourierEarnings calls service with courier userId and ownerId', async () => {
    await controller.getCourierEarnings(
      makeReq(courierUser) as unknown as Parameters<
        typeof controller.getCourierEarnings
      >[0],
      {},
    );
    expect(service.getCourierEarnings).toHaveBeenCalledWith(
      mockCourierId,
      mockOwnerId,
      {},
    );
  });

  it('getCourierPayoutHistory calls service with courier userId and ownerId', async () => {
    await controller.getCourierPayoutHistory(
      makeReq(courierUser) as unknown as Parameters<
        typeof controller.getCourierPayoutHistory
      >[0],
      {},
    );
    expect(service.getCourierPayouts).toHaveBeenCalledWith(
      mockCourierId,
      mockOwnerId,
      {},
    );
  });
});
