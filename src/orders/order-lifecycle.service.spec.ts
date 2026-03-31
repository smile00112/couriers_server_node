import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OrderLifecycleService } from './order-lifecycle.service';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../auth/enums/user-role.enum';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockUser: AuthUser = {
  userId: 'courier-uuid-1',
  ownerId: 'owner-uuid-1',
  role: UserRole.COURIER,
};

const mockOrder = {
  id: 'order-uuid-1',
  owner_id: 'owner-uuid-1',
  order_number: 'ORD-001',
  status: 'created',
  courier_id: null as string | null,
  courier: null,
  pickup_address: 'Pickup St',
  dropoff_address: 'Dropoff Ave',
  delivery_fee: 350,
  callback_url: null as string | null,
  assigned_at: null,
  picked_up_at: null,
  in_delivery_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

function buildMocks() {
  const mockGateway = {
    server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
    emitStatusChanged: jest.fn(),
    emitOrderCancelled: jest.fn(),
  };

  const mockCancelQueue = { add: jest.fn() };
  const mockCallbackQueue = { add: jest.fn() };

  // Repository mock
  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockQbCount = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getCount: jest.fn() };

  // DataSource mock
  const mockUpdateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  const mockDs = {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQbCount),
    }),
    createQueryBuilder: jest.fn().mockReturnValue(mockUpdateQb),
    transaction: jest.fn(),
  };

  const service = new OrderLifecycleService(
    mockDs as any,
    mockGateway as any,
    mockCancelQueue as any,
    mockCallbackQueue as any,
  );

  return { service, mockDs, mockUpdateQb, mockQbCount, mockGateway, mockCancelQueue, mockCallbackQueue };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrderLifecycleService', () => {
  describe('claim()', () => {
    it('happy path: returns assigned order', async () => {
      const { service, mockDs, mockUpdateQb, mockQbCount } = buildMocks();
      const assignedOrder = { ...mockOrder, status: 'assigned', courier_id: mockUser.userId, courier: null, assigned_at: new Date() };

      mockQbCount.getCount.mockResolvedValue(0);
      mockUpdateQb.execute.mockResolvedValue({ affected: 1 });
      mockDs.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(assignedOrder),
        save: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(mockQbCount),
      });

      const result = await service.claim('order-uuid-1', mockUser);

      expect(result.status).toBe('assigned');
      expect(result.id).toBe('order-uuid-1');
    });

    it('throws ConflictException if courier already has active order', async () => {
      const { service, mockDs, mockQbCount } = buildMocks();

      mockQbCount.getCount.mockResolvedValue(1);
      mockDs.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ id: 'shift-uuid', status: 'open' }),
        save: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(mockQbCount),
      });

      await expect(service.claim('order-uuid-1', mockUser)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException with existingCourierId when order already taken', async () => {
      const { service, mockDs, mockUpdateQb, mockQbCount } = buildMocks();
      const takenOrder = { ...mockOrder, status: 'assigned', courier_id: 'other-courier' };

      mockQbCount.getCount.mockResolvedValue(0);
      mockUpdateQb.execute.mockResolvedValue({ affected: 0 });
      mockDs.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(takenOrder),
        save: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(mockQbCount),
      });

      try {
        await service.claim('order-uuid-1', mockUser);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as Record<string, unknown>;
        expect(response.existingCourierId).toBe('other-courier');
      }
    });
  });

  describe('advanceStatus()', () => {
    it('happy path: returns picked_up order', async () => {
      const { service, mockDs, mockUpdateQb } = buildMocks();
      const assignedOrder = { ...mockOrder, status: 'assigned', courier_id: mockUser.userId, courier: null };
      const pickedUpOrder = { ...assignedOrder, status: 'picked_up', picked_up_at: new Date() };

      const findOne = jest.fn()
        .mockResolvedValueOnce(assignedOrder)
        .mockResolvedValueOnce(pickedUpOrder);
      mockDs.getRepository.mockReturnValue({ findOne, save: jest.fn() });
      mockUpdateQb.execute.mockResolvedValue({ affected: 1 });

      const result = await service.advanceStatus('order-uuid-1', 'picked_up', mockUser);

      expect(result.status).toBe('picked_up');
    });

    it('complete: creates DeliveryRecord and CourierEarning in transaction', async () => {
      const { service, mockDs, mockUpdateQb } = buildMocks();
      const inDeliveryOrder = { ...mockOrder, status: 'in_delivery', courier_id: mockUser.userId, courier: null };
      const completedOrder = { ...inDeliveryOrder, status: 'completed', completed_at: new Date() };

      const findOne = jest.fn()
        .mockResolvedValueOnce(inDeliveryOrder)
        .mockResolvedValueOnce(completedOrder);
      mockDs.getRepository.mockReturnValue({ findOne, save: jest.fn() });

      const mockEm = {
        createQueryBuilder: jest.fn().mockReturnValue(mockUpdateQb),
        create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
        save: jest.fn(),
      };
      mockDs.transaction.mockImplementation((cb: (em: unknown) => Promise<void>) => cb(mockEm));

      await service.advanceStatus('order-uuid-1', 'completed', mockUser);

      expect(mockDs.transaction).toHaveBeenCalled();
      // DeliveryRecord and CourierEarning saved
      expect(mockEm.save).toHaveBeenCalledTimes(2);
    });

    it('throws UnprocessableEntityException for invalid backward transition', async () => {
      const { service, mockDs } = buildMocks();
      const completedOrder = { ...mockOrder, status: 'completed', courier_id: mockUser.userId, courier: null };

      mockDs.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(completedOrder), save: jest.fn() });

      await expect(
        service.advanceStatus('order-uuid-1', 'picked_up', mockUser),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ForbiddenException if courier is not the assigned courier', async () => {
      const { service, mockDs } = buildMocks();
      const assignedOrder = { ...mockOrder, status: 'assigned', courier_id: 'different-courier', courier: null };

      mockDs.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(assignedOrder), save: jest.fn() });

      await expect(
        service.advanceStatus('order-uuid-1', 'picked_up', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel()', () => {
    it('cancels a created order', async () => {
      const { service, mockDs, mockUpdateQb } = buildMocks();
      const createdOrder = { ...mockOrder, status: 'created', courier_id: null, courier: null };
      const cancelledOrder = { ...createdOrder, status: 'cancelled', cancelled_at: new Date() };

      const findOne = jest.fn()
        .mockResolvedValueOnce(createdOrder)
        .mockResolvedValueOnce(cancelledOrder);
      mockDs.getRepository.mockReturnValue({ findOne, save: jest.fn() });
      mockUpdateQb.execute.mockResolvedValue({ affected: 1 });

      const operatorUser: AuthUser = { userId: 'op-uuid', ownerId: 'owner-uuid-1', role: UserRole.ORDER_OPERATOR };
      const result = await service.cancel('order-uuid-1', undefined, operatorUser);

      expect(result.status).toBe('cancelled');
    });

    it('throws UnprocessableEntityException when cancelling a completed order', async () => {
      const { service, mockDs } = buildMocks();
      const completedOrder = { ...mockOrder, status: 'completed', courier_id: null, courier: null };

      mockDs.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(completedOrder), save: jest.fn() });

      const operatorUser: AuthUser = { userId: 'op-uuid', ownerId: 'owner-uuid-1', role: UserRole.ORDER_OPERATOR };

      await expect(
        service.cancel('order-uuid-1', undefined, operatorUser),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('enqueues FCM cancel notification when order has assigned courier', async () => {
      const { service, mockDs, mockUpdateQb, mockCancelQueue } = buildMocks();
      const assignedOrder = { ...mockOrder, status: 'assigned', courier_id: 'courier-uuid-1', courier: null };
      const cancelledOrder = { ...assignedOrder, status: 'cancelled', cancelled_at: new Date() };

      const findOne = jest.fn()
        .mockResolvedValueOnce(assignedOrder)
        .mockResolvedValueOnce(cancelledOrder);
      mockDs.getRepository.mockReturnValue({ findOne, save: jest.fn() });
      mockUpdateQb.execute.mockResolvedValue({ affected: 1 });

      const operatorUser: AuthUser = { userId: 'op-uuid', ownerId: 'owner-uuid-1', role: UserRole.ORDER_OPERATOR };
      await service.cancel('order-uuid-1', 'customer request', operatorUser);

      expect(mockCancelQueue.add).toHaveBeenCalledWith('notify', expect.objectContaining({
        courierId: 'courier-uuid-1',
        orderId: 'order-uuid-1',
      }));
    });
  });
});
