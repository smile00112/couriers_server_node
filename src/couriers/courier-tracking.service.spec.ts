import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { CourierTrackingService } from './courier-tracking.service';
import { LOCATION_CALLBACK_QUEUE } from './couriers.module';
import { OrdersGateway } from '../gateways/orders.gateway';
import { DataSource } from 'typeorm';

const mockCourierId = 'courier-uuid-001';
const mockOwnerId = 'owner-uuid-001';
const mockOrderId = 'order-uuid-001';

const mockUser = {
  userId: mockCourierId,
  ownerId: mockOwnerId,
  role: 'courier',
};

function makeDataSource(opts: {
  activeOrder?: { id: string; callback_url: string | null } | null;
  previousPosition?: { lat: number; lng: number } | null;
  historyPoints?: Array<{
    id: string;
    courier_id: string;
    lat: number;
    lng: number;
    distance_meters: number;
    recorded_at: Date;
  }>;
  order?: { id: string; courier_id: string | null } | null;
}) {
  const repoMap: Record<string, unknown> = {};

  repoMap['Order'] = {
    findOne: jest.fn(({ where }) => {
      // getOrderRoute uses { id, owner_id }
      if (where?.id) return Promise.resolve(opts.order ?? null);
      // submitLocation active order lookup uses array of status conditions
      if (Array.isArray(where)) return Promise.resolve(opts.activeOrder ?? null);
      return Promise.resolve(opts.activeOrder ?? null);
    }),
    find: jest.fn(() => Promise.resolve(opts.historyPoints ?? [])),
  };

  repoMap['CourierPosition'] = {
    findOne: jest.fn(() => Promise.resolve(opts.previousPosition ?? null)),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
  };

  repoMap['CourierLocationHistory'] = {
    save: jest.fn((data: unknown) => Promise.resolve({ id: 'hist-uuid-001', ...data as object })),
    find: jest.fn(() => Promise.resolve(opts.historyPoints ?? [])),
  };

  return {
    getRepository: jest.fn((entity: { name: string }) => repoMap[entity.name] ?? {}),
    query: jest.fn(() => Promise.resolve([])),
  };
}

describe('CourierTrackingService', () => {
  let service: CourierTrackingService;
  let mockDataSource: ReturnType<typeof makeDataSource>;
  let mockGateway: Partial<OrdersGateway>;
  let mockQueue: { add: jest.Mock };

  async function buildService(opts: Parameters<typeof makeDataSource>[0]) {
    mockDataSource = makeDataSource(opts);
    mockGateway = { emitLocationUpdated: jest.fn() };
    mockQueue = { add: jest.fn(() => Promise.resolve()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourierTrackingService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: OrdersGateway, useValue: mockGateway },
        { provide: getQueueToken(LOCATION_CALLBACK_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(CourierTrackingService);
  }

  describe('submitLocation()', () => {
    it('first update: distance_meters=0, order_id=null when no active order and no previous position', async () => {
      await buildService({ activeOrder: null, previousPosition: null });

      const result = await service.submitLocation(
        { lat: 55.7558, lng: 37.6173 },
        mockUser,
      );

      expect(result.distance_meters).toBe(0);
      expect(result.order_id).toBeNull();
      expect(result.courier_id).toBe(mockCourierId);
      expect(result.lat).toBe(55.7558);
      expect(result.lng).toBe(37.6173);
    });

    it('second update: distance_meters>0 when previous position exists', async () => {
      await buildService({
        activeOrder: null,
        previousPosition: { lat: 55.7558, lng: 37.6173 },
      });

      const result = await service.submitLocation(
        { lat: 55.760, lng: 37.620 },
        mockUser,
      );

      expect(result.distance_meters).toBeGreaterThan(0);
    });

    it('with active order: order_id set in response', async () => {
      await buildService({
        activeOrder: { id: mockOrderId, callback_url: null },
        previousPosition: null,
      });

      const result = await service.submitLocation(
        { lat: 55.7558, lng: 37.6173 },
        mockUser,
      );

      expect(result.order_id).toBe(mockOrderId);
    });

    it('with active order having callback_url: enqueues location-callback job', async () => {
      await buildService({
        activeOrder: { id: mockOrderId, callback_url: 'https://example.com/webhook' },
        previousPosition: null,
      });

      await service.submitLocation({ lat: 55.7558, lng: 37.6173 }, mockUser);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({
          courierId: mockCourierId,
          orderId: mockOrderId,
          callbackUrl: 'https://example.com/webhook',
        }),
      );
    });

    it('with active order but no callback_url: does NOT enqueue job', async () => {
      await buildService({
        activeOrder: { id: mockOrderId, callback_url: null },
        previousPosition: null,
      });

      await service.submitLocation({ lat: 55.7558, lng: 37.6173 }, mockUser);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('emits courier:location_updated via gateway', async () => {
      await buildService({ activeOrder: null, previousPosition: null });

      await service.submitLocation({ lat: 55.7558, lng: 37.6173 }, mockUser);

      expect(mockGateway.emitLocationUpdated).toHaveBeenCalledWith(
        mockOwnerId,
        expect.objectContaining({
          courierId: mockCourierId,
          lat: 55.7558,
          lng: 37.6173,
        }),
      );
    });
  });

  describe('getOrderRoute()', () => {
    it('returns route with chronological points and correct total distance', async () => {
      const points = [
        {
          id: 'p1',
          courier_id: mockCourierId,
          lat: 55.7558,
          lng: 37.6173,
          distance_meters: 0,
          recorded_at: new Date('2026-01-01T10:00:00Z'),
        },
        {
          id: 'p2',
          courier_id: mockCourierId,
          lat: 55.760,
          lng: 37.620,
          distance_meters: 500.5,
          recorded_at: new Date('2026-01-01T10:05:00Z'),
        },
      ];

      await buildService({
        order: { id: mockOrderId, courier_id: mockCourierId },
        historyPoints: points,
      });

      const result = await service.getOrderRoute(mockOrderId, mockOwnerId);

      expect(result.order_id).toBe(mockOrderId);
      expect(result.courier_id).toBe(mockCourierId);
      expect(result.total_distance_meters).toBeCloseTo(500.5);
      expect(result.points).toHaveLength(2);
      expect(result.points[0].id).toBe('p1');
      expect(result.points[1].id).toBe('p2');
    });

    it('throws NotFoundException when order does not belong to tenant', async () => {
      await buildService({ order: null });

      await expect(
        service.getOrderRoute('nonexistent-order', mockOwnerId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
