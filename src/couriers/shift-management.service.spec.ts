import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { ShiftManagementService } from './shift-management.service';
import { OrdersGateway } from '../gateways/orders.gateway';

const mockCourierId = 'courier-uuid-001';
const mockOwnerId = 'owner-uuid-001';
const mockShiftId = 'shift-uuid-001';
const now = new Date('2026-03-29T08:00:00.000Z');
const later = new Date('2026-03-29T16:30:00.000Z');

const mockUser = { userId: mockCourierId, ownerId: mockOwnerId, role: 'courier' };

function makeOpenShift(overrides?: Partial<{
  status: string;
  ended_at: Date | null;
}>) {
  return {
    id: mockShiftId,
    courier_id: mockCourierId,
    owner_id: mockOwnerId,
    status: 'open',
    started_at: now,
    ended_at: null as Date | null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeClosedShift() {
  return makeOpenShift({ status: 'closed', ended_at: later });
}

// ---------------------------------------------------------------------------
// DataSource factory
// ---------------------------------------------------------------------------

function makeQb(overrides?: Partial<Record<string, jest.Mock>>) {
  const qb: Record<string, jest.Mock> = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    innerJoinAndSelect: jest.fn(),
    select: jest.fn(),
    from: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getRawOne: jest.fn().mockResolvedValue({ cnt: '0' }),
    ...overrides,
  };
  // Each method returns `qb` (chainable) unless already overridden with a non-function
  for (const key of Object.keys(qb)) {
    if (typeof qb[key] === 'function' && !['execute', 'getOne', 'getManyAndCount', 'getMany', 'getCount', 'getRawOne'].includes(key)) {
      const orig = qb[key];
      qb[key] = jest.fn((...args: unknown[]) => {
        orig(...args);
        return qb;
      });
    }
  }
  return qb;
}

function makeDataSource(opts: {
  existingShift?: ReturnType<typeof makeOpenShift> | null;
  closedShift?: ReturnType<typeof makeOpenShift> | null;
  updateAffected?: number;
  courier?: { id: string; first_name: string; last_name: string; owner_id: string } | null;
  activeOrderCount?: number;
  saveThrows?: Error;
}) {
  const shiftQb = makeQb({
    execute: jest.fn().mockResolvedValue({ affected: opts.updateAffected ?? 0 }),
    getOne: jest.fn().mockResolvedValue(opts.closedShift ?? null),
    getManyAndCount: jest.fn().mockResolvedValue(
      opts.closedShift ? [[opts.closedShift], 1] : [[], 0]
    ),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(opts.activeOrderCount ?? 0),
  });

  const ordersQb = makeQb({
    getCount: jest.fn().mockResolvedValue(0),
  });

  const earningsQb = makeQb({
    getRawOne: jest.fn().mockResolvedValue({ cnt: '0' }),
  });

  const managerCreate = jest.fn((_E: unknown, data: unknown) => ({
    ...data as object,
    id: mockShiftId,
    started_at: now,
    ended_at: null,
    status: 'open',
  }));

  const managerSave = jest.fn().mockImplementation((_E: unknown, data?: unknown) => {
    if (opts.saveThrows) return Promise.reject(opts.saveThrows);
    const item = data ?? _E;
    return Promise.resolve({ ...item as object, id: mockShiftId, started_at: now, ended_at: null, status: 'open' });
  });

  const managerQb = makeQb({
    execute: jest.fn().mockResolvedValue({ affected: opts.updateAffected ?? 1 }),
    getOne: jest.fn().mockResolvedValue(opts.closedShift ?? null),
  });

  const manager = {
    create: managerCreate,
    save: managerSave,
    getRepository: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue(opts.existingShift ?? null),
      createQueryBuilder: jest.fn().mockReturnValue(shiftQb),
    })),
    createQueryBuilder: jest.fn().mockReturnValue(managerQb),
  };

  const ds = {
    transaction: jest.fn((fn: (m: typeof manager) => Promise<unknown>) => fn(manager)),
    getRepository: jest.fn((entity: unknown) => {
      const name = typeof entity === 'string' ? entity : String(entity);
      if (name === 'orders' || name.includes('Order')) {
        return { createQueryBuilder: jest.fn().mockReturnValue(ordersQb) };
      }
      if (name.includes('Courier') && !name.includes('Shift')) {
        return {
          findOne: jest.fn().mockResolvedValue(opts.courier ?? null),
          createQueryBuilder: jest.fn().mockReturnValue(shiftQb),
        };
      }
      return {
        findOne: jest.fn().mockResolvedValue(opts.existingShift ?? null),
        createQueryBuilder: jest.fn().mockReturnValue(shiftQb),
      };
    }),
    createQueryBuilder: jest.fn().mockReturnValue(earningsQb),
  };

  return ds;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShiftManagementService', () => {
  let service: ShiftManagementService;
  let mockGateway: { emitShiftOpened: jest.Mock; emitShiftClosed: jest.Mock };

  async function buildService(ds: ReturnType<typeof makeDataSource>) {
    mockGateway = { emitShiftOpened: jest.fn(), emitShiftClosed: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftManagementService,
        { provide: DataSource, useValue: ds },
        { provide: OrdersGateway, useValue: mockGateway },
      ],
    }).compile();
    service = module.get(ShiftManagementService);
  }

  describe('openShift()', () => {
    it('returns ShiftResponseDto with status=open on success', async () => {
      await buildService(makeDataSource({ updateAffected: 1 }));

      const result = await service.openShift(mockUser);

      expect(result.status).toBe('open');
      expect(result.courier_id).toBe(mockCourierId);
      expect(result.ended_at).toBeNull();
      expect(result.duration_minutes).toBeNull();
      expect(mockGateway.emitShiftOpened).toHaveBeenCalledWith(
        mockOwnerId,
        expect.objectContaining({ courierId: mockCourierId }),
      );
    });

    it('throws ConflictException when unique constraint violated (23505)', async () => {
      const error = Object.assign(
        new QueryFailedError('INSERT', [], new Error('duplicate')),
        { driverError: { code: '23505' } },
      );
      await buildService(makeDataSource({ saveThrows: error, updateAffected: 1 }));

      await expect(service.openShift(mockUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('closeShift()', () => {
    it('returns ShiftResponseDto with status=closed and duration_minutes >= 0', async () => {
      await buildService(makeDataSource({
        updateAffected: 1,
        closedShift: makeClosedShift(),
      }));

      const result = await service.closeShift(mockUser);

      expect(result.status).toBe('closed');
      expect(result.ended_at).toBeDefined();
      expect(result.duration_minutes).toBeGreaterThanOrEqual(0);
      expect(mockGateway.emitShiftClosed).toHaveBeenCalledWith(
        mockOwnerId,
        expect.objectContaining({ courierId: mockCourierId }),
      );
    });

    it('throws ConflictException when no open shift (affected=0)', async () => {
      await buildService(makeDataSource({ updateAffected: 0 }));

      await expect(service.closeShift(mockUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('getCurrentShift()', () => {
    it('returns ShiftResponseDto when open shift exists', async () => {
      await buildService(makeDataSource({ existingShift: makeOpenShift() }));

      const result = await service.getCurrentShift(mockUser);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('open');
    });

    it('returns null when no open shift', async () => {
      await buildService(makeDataSource({ existingShift: null }));

      const result = await service.getCurrentShift(mockUser);
      expect(result).toBeNull();
    });
  });

  describe('getCourierShifts()', () => {
    it('throws NotFoundException when courier not in tenant', async () => {
      await buildService(makeDataSource({ courier: null }));

      await expect(
        service.getCourierShifts('other-id', mockOwnerId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveShifts()', () => {
    it('returns active shifts with elapsed_minutes and active_order_count', async () => {
      const shiftWithCourier = {
        ...makeOpenShift({ status: 'open' }),
        started_at: new Date(Date.now() - 60 * 60 * 1000),
        courier: { first_name: 'Ivan', last_name: 'Petrov' },
      };

      const activeShiftsQb = makeQb({
        getMany: jest.fn().mockResolvedValue([shiftWithCourier]),
      });

      const ordersQb = makeQb({
        getCount: jest.fn().mockResolvedValue(2),
      });

      const ds = {
        transaction: jest.fn(),
        getRepository: jest.fn((entity: unknown) => {
          const name = typeof entity === 'string' ? entity : String(entity);
          if (name === 'orders' || name.includes('Order')) {
            return { createQueryBuilder: jest.fn().mockReturnValue(ordersQb) };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
            createQueryBuilder: jest.fn().mockReturnValue(activeShiftsQb),
          };
        }),
        createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
      };

      await buildService(ds as unknown as ReturnType<typeof makeDataSource>);

      const result = await service.getActiveShifts(mockOwnerId);

      expect(result.total).toBe(1);
      expect(result.data[0].courier_name).toBe('Ivan Petrov');
      expect(result.data[0].elapsed_minutes).toBeGreaterThanOrEqual(59);
      expect(result.data[0].active_order_count).toBe(2);
    });
  });
});
