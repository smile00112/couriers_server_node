import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource, QueryFailedError } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrdersGateway } from '../gateways/orders.gateway';
import { Owner } from '../owners/entities/owner.entity';
import { Client } from '../clients/entities/client.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderAuditEntry } from './entities/order-audit-entry.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../auth/enums/user-role.enum';
import { NEW_ORDER_NOTIFY_QUEUE } from './orders.module';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  return Object.assign(new Owner(), {
    id: 'owner-uuid',
    name: 'Test Owner',
    email: 'owner@test.local',
    default_delivery_fee: 350,
    ...overrides,
  });
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return Object.assign(new Client(), {
    id: 'client-uuid',
    owner_id: 'owner-uuid',
    phone: '+79001234567',
    name: null,
    ...overrides,
  });
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return Object.assign(new Order(), {
    id: 'order-uuid',
    owner_id: 'owner-uuid',
    client_id: 'client-uuid',
    order_number: 'ORD-001',
    status: 'created',
    pickup_address: 'Pickup St 1',
    pickup_lat: 55.7,
    pickup_lng: 37.6,
    dropoff_address: 'Dropoff St 2',
    dropoff_lat: 55.8,
    dropoff_lng: 37.7,
    delivery_fee: 350,
    callback_url: null,
    created_by_id: 'operator-uuid',
    created_by_role: UserRole.ORDER_OPERATOR,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function makeSavedItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return Object.assign(new OrderItem(), {
    id: 'item-uuid',
    order_id: 'order-uuid',
    owner_id: 'owner-uuid',
    name: 'Pizza',
    quantity: 2,
    price: 850,
    ...overrides,
  });
}

const baseDto: CreateOrderDto = {
  order_number: 'ORD-001',
  client_phone: '+79001234567',
  pickup_address: 'Pickup St 1',
  pickup_lat: 55.7,
  pickup_lng: 37.6,
  dropoff_address: 'Dropoff St 2',
  dropoff_lat: 55.8,
  dropoff_lng: 37.7,
  items: [{ name: 'Pizza', quantity: 2, price: 850 }],
};

const authUser: AuthUser = {
  userId: 'operator-uuid',
  ownerId: 'owner-uuid',
  role: UserRole.ORDER_OPERATOR,
};

// ---------------------------------------------------------------------------
// Build a mock entity manager (em) used inside transaction callback
// ---------------------------------------------------------------------------
interface MockEm {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
}

function buildMockEm(overrides: Partial<MockEm> = {}): MockEm {
  return {
    findOne: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    create: jest.fn((Entity: new () => object, data: object) =>
      Object.assign(new Entity(), data),
    ),
    save: jest.fn(),
    ...overrides,
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let mockDataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let mockQueue: { add: jest.Mock };
  let mockGateway: { emitOrderCreated: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGateway = { emitOrderCreated: jest.fn() };

    mockDataSource = {
      transaction: jest.fn(),
      getRepository: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: OrdersGateway, useValue: mockGateway },
        { provide: getQueueToken(NEW_ORDER_NOTIFY_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // -------------------------------------------------------------------------
  describe('create()', () => {
    it('returns OrderResponseDto on happy path', async () => {
      const owner = makeOwner();
      const client = makeClient();
      const savedOrder = makeOrder();
      const savedItem = makeSavedItem();

      const em = buildMockEm({
        findOne: jest.fn().mockImplementation((Entity) => {
          if (Entity === Owner) return Promise.resolve(owner);
          if (Entity === Client) return Promise.resolve(client);
          return Promise.resolve(null);
        }),
        save: jest.fn().mockImplementation((Entity, data) => {
          if (Entity === Order) return Promise.resolve(savedOrder);
          if (Entity === OrderItem) return Promise.resolve([savedItem]);
          return Promise.resolve(data);
        }),
      });

      mockDataSource.transaction.mockImplementation(
        (cb: (em: MockEm) => Promise<unknown>) => cb(em),
      );

      const result = await service.create(baseDto, authUser);

      expect(result.id).toBe('order-uuid');
      expect(result.order_number).toBe('ORD-001');
      expect(result.status).toBe('created');
      expect(result.client.phone).toBe('+79001234567');
      expect(result.items).toHaveLength(1);
      expect(mockQueue.add).toHaveBeenCalledWith('notify', {
        orderId: 'order-uuid',
        ownerId: 'owner-uuid',
      });
    });

    it('snapshots delivery_fee from owner.default_delivery_fee', async () => {
      const owner = makeOwner({ default_delivery_fee: 999 });
      const client = makeClient();
      const savedOrder = makeOrder({ delivery_fee: 999 });
      const savedItem = makeSavedItem();

      const em = buildMockEm({
        findOne: jest.fn().mockImplementation((Entity) => {
          if (Entity === Owner) return Promise.resolve(owner);
          if (Entity === Client) return Promise.resolve(client);
          return Promise.resolve(null);
        }),
        save: jest.fn().mockImplementation((Entity, data) => {
          if (Entity === Order) {
            // Verify the delivery fee passed in matches owner fee
            expect((data as Partial<Order>).delivery_fee).toBe(999);
            return Promise.resolve(savedOrder);
          }
          if (Entity === OrderItem) return Promise.resolve([savedItem]);
          return Promise.resolve(data);
        }),
      });

      mockDataSource.transaction.mockImplementation(
        (cb: (em: MockEm) => Promise<unknown>) => cb(em),
      );

      const result = await service.create(baseDto, authUser);
      expect(result.delivery_fee).toBe(999);
    });

    it('throws NotFoundException when owner does not exist', async () => {
      const em = buildMockEm({
        findOne: jest.fn().mockResolvedValue(null),
      });

      mockDataSource.transaction.mockImplementation(
        (cb: (em: MockEm) => Promise<unknown>) => cb(em),
      );

      await expect(service.create(baseDto, authUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException with existingOrderId on duplicate order_number', async () => {
      const owner = makeOwner();
      const client = makeClient();
      const existingOrder = makeOrder({ id: 'existing-order-uuid' });

      const uniqueError = Object.assign(
        new QueryFailedError('INSERT', [], new Error('unique violation')),
        { driverError: { code: '23505' } },
      );

      const em = buildMockEm({
        findOne: jest.fn().mockImplementation((Entity, opts) => {
          if (Entity === Owner) return Promise.resolve(owner);
          if (Entity === Client) return Promise.resolve(client);
          // Second call to findOne(Order, ...) — lookup existing
          if (Entity === Order) return Promise.resolve(existingOrder);
          return Promise.resolve(null);
        }),
        save: jest.fn().mockImplementation((Entity) => {
          if (Entity === Order) return Promise.reject(uniqueError);
          return Promise.resolve({});
        }),
      });

      mockDataSource.transaction.mockImplementation(
        (cb: (em: MockEm) => Promise<unknown>) => cb(em),
      );

      await expect(service.create(baseDto, authUser)).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('order_number'),
          existingOrderId: 'existing-order-uuid',
        },
      });
    });

    it('creates a new client when none exists', async () => {
      const owner = makeOwner();
      const newClient = makeClient();
      const savedOrder = makeOrder();
      const savedItem = makeSavedItem();

      const em = buildMockEm({
        findOne: jest.fn().mockImplementation((Entity) => {
          if (Entity === Owner) return Promise.resolve(owner);
          if (Entity === Client) return Promise.resolve(null); // no existing client
          return Promise.resolve(null);
        }),
        save: jest.fn().mockImplementation((Entity, data) => {
          if (Entity === Client) return Promise.resolve(newClient);
          if (Entity === Order) return Promise.resolve(savedOrder);
          if (Entity === OrderItem) return Promise.resolve([savedItem]);
          return Promise.resolve(data);
        }),
      });

      mockDataSource.transaction.mockImplementation(
        (cb: (em: MockEm) => Promise<unknown>) => cb(em),
      );

      const result = await service.create(baseDto, authUser);
      expect(result.client.id).toBe('client-uuid');
      // Verify client was saved
      expect(em.save).toHaveBeenCalledWith(
        Client,
        expect.objectContaining({ phone: '+79001234567' }),
      );
    });
  });
});
