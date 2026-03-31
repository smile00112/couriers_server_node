import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { OrdersGateway } from '../gateways/orders.gateway';
import { Order } from './entities/order.entity';
import { OrderAuditEntry } from './entities/order-audit-entry.entity';
import { DeliveryRecord } from './entities/delivery-record.entity';
import { CourierEarning } from './entities/courier-earning.entity';
import { OrderLifecycleResponseDto, CourierSummaryDto } from './dto/order-lifecycle-response.dto';
import {
  AvailableOrderDto,
  AvailableOrdersListDto,
} from './dto/available-orders-response.dto';
import { CANCEL_NOTIFY_QUEUE, ORDER_CALLBACK_QUEUE } from '../queues/queues.constants';
import { CourierShift } from '../couriers/entities/courier-shift.entity';

const COURIER_TRANSITIONS: Record<string, string> = {
  assigned: 'picked_up',
  picked_up: 'in_delivery',
  in_delivery: 'completed',
};

const OPERATOR_TRANSITIONS: Record<string, string> = {
  created: 'cancelled',
  assigned: 'cancelled',
  picked_up: 'cancelled',
  in_delivery: 'cancelled',
};

const TIMESTAMP_COLUMN: Record<string, string> = {
  assigned: 'assigned_at',
  picked_up: 'picked_up_at',
  in_delivery: 'in_delivery_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
};

const CALLBACK_TRIGGER_STATUSES = new Set(['picked_up', 'completed', 'cancelled']);

@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
    @InjectQueue(CANCEL_NOTIFY_QUEUE) private readonly cancelQueue: Queue,
    @InjectQueue(ORDER_CALLBACK_QUEUE) private readonly callbackQueue: Queue,
  ) {}

  async getAvailableOrders(
    query: { page?: number; limit?: number },
    ownerId: string,
  ): Promise<AvailableOrdersListDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const [orders, total] = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.owner_id = :ownerId', { ownerId })
      .andWhere("o.status = 'created'")
      .orderBy('o.created_at', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const data: AvailableOrderDto[] = orders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      pickup_address: o.pickup_address,
      dropoff_address: o.dropoff_address,
      delivery_fee: Number(o.delivery_fee),
      created_at: o.created_at,
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

  async claim(id: string, user: AuthUser): Promise<OrderLifecycleResponseDto> {
    // Check courier has an open shift
    const openShift = await this.dataSource
      .getRepository(CourierShift)
      .findOne({ where: { courier_id: user.userId, owner_id: user.ownerId, status: 'open' } });
    if (!openShift) {
      throw new UnprocessableEntityException('Courier does not have an open shift');
    }

    // Check courier has no active order (FR-016)
    const activeCount = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.courier_id = :courierId', { courierId: user.userId })
      .andWhere('o.owner_id = :ownerId', { ownerId: user.ownerId })
      .andWhere("o.status NOT IN ('completed', 'cancelled')")
      .getCount();

    if (activeCount > 0) {
      throw new ConflictException({ message: 'Courier already has an active order' });
    }

    // Atomic UPDATE: only succeeds if status='created' AND courier_id IS NULL
    const result = await this.dataSource
      .createQueryBuilder()
      .update(Order)
      .set({
        status: 'assigned',
        courier_id: user.userId,
        assigned_at: () => 'NOW()',
        updated_at: () => 'NOW()',
      })
      .where('id = :id', { id })
      .andWhere('owner_id = :ownerId', { ownerId: user.ownerId })
      .andWhere("status = 'created'")
      .andWhere('courier_id IS NULL')
      .execute();

    if (result.affected === 0) {
      // Order was already taken — load for error detail
      const existing = await this.dataSource.getRepository(Order).findOne({
        where: { id, owner_id: user.ownerId },
      });
      if (!existing) throw new NotFoundException('Order not found');
      throw new ConflictException({
        message: 'Order is no longer available',
        existingCourierId: existing.courier_id,
      });
    }

    const order = await this.loadOrder(id, user.ownerId);

    await this.appendAuditEntry(order.id, user, 'status_changed', {
      from: 'created',
      to: 'assigned',
    });

    this.emitStatusChanged(order, 'created');
    // Also emit to couriers room so others see the order disappear
    this.ordersGateway.server
      ?.to(`tenant:${order.owner_id}:couriers`)
      .emit('order:status_changed', this.buildStatusChangedPayload(order, 'created'));

    await this.enqueueCallbackIfNeeded(order, 'assigned');

    return this.mapToDto(order);
  }

  async advanceStatus(
    id: string,
    targetStatus: string,
    user: AuthUser,
  ): Promise<OrderLifecycleResponseDto> {
    const order = await this.loadOrder(id, user.ownerId);

    if (COURIER_TRANSITIONS[order.status] !== targetStatus) {
      throw new UnprocessableEntityException(
        `Cannot transition from '${order.status}'`,
      );
    }

    if (order.courier_id !== user.userId) {
      throw new ForbiddenException('Not the assigned courier');
    }

    const previousStatus = order.status;
    const tsColumn = TIMESTAMP_COLUMN[targetStatus];

    if (targetStatus === 'completed') {
      await this.dataSource.transaction(async (em) => {
        await em
          .createQueryBuilder()
          .update(Order)
          .set({
            status: targetStatus,
            [tsColumn]: () => 'NOW()',
            updated_at: () => 'NOW()',
          })
          .where('id = :id AND owner_id = :ownerId', {
            id,
            ownerId: user.ownerId,
          })
          .execute();

        const now = new Date();

        const deliveryRecord = em.create(DeliveryRecord, {
          owner_id: user.ownerId,
          order_id: id,
          courier_id: user.userId,
          delivery_fee: order.delivery_fee,
          completed_at: now,
        });
        await em.save(DeliveryRecord, deliveryRecord);

        const earning = em.create(CourierEarning, {
          owner_id: user.ownerId,
          courier_id: user.userId,
          order_id: id,
          amount: order.delivery_fee,
          earned_at: now,
        });
        await em.save(CourierEarning, earning);
      });
    } else {
      await this.dataSource
        .createQueryBuilder()
        .update(Order)
        .set({
          status: targetStatus,
          [tsColumn]: () => 'NOW()',
          updated_at: () => 'NOW()',
        })
        .where('id = :id AND owner_id = :ownerId', {
          id,
          ownerId: user.ownerId,
        })
        .execute();
    }

    const updated = await this.loadOrder(id, user.ownerId);

    await this.appendAuditEntry(id, user, 'status_changed', {
      from: previousStatus,
      to: targetStatus,
    });

    this.emitStatusChanged(updated, previousStatus);
    await this.enqueueCallbackIfNeeded(updated, targetStatus);

    return this.mapToDto(updated);
  }

  async cancel(
    id: string,
    reason: string | undefined,
    user: AuthUser,
  ): Promise<OrderLifecycleResponseDto> {
    const order = await this.loadOrder(id, user.ownerId);

    if (OPERATOR_TRANSITIONS[order.status] !== 'cancelled') {
      throw new UnprocessableEntityException(
        `Cannot transition from '${order.status}'`,
      );
    }

    const previousStatus = order.status;
    const previousCourierId = order.courier_id;

    const result = await this.dataSource
      .createQueryBuilder()
      .update(Order)
      .set({
        status: 'cancelled',
        cancelled_at: () => 'NOW()',
        courier_id: () => 'NULL',
        updated_at: () => 'NOW()',
      })
      .where('id = :id', { id })
      .andWhere('owner_id = :ownerId', { ownerId: user.ownerId })
      .andWhere("status NOT IN ('completed', 'cancelled')")
      .execute();

    if (result.affected === 0) {
      throw new UnprocessableEntityException(
        `Cannot transition from '${order.status}'`,
      );
    }

    const updated = await this.loadOrder(id, user.ownerId);

    await this.appendAuditEntry(id, user, 'status_changed', {
      from: previousStatus,
      to: 'cancelled',
      reason,
    });

    // Notify assigned courier via FCM if order had one
    if (previousCourierId) {
      await this.cancelQueue.add('notify', {
        courierId: previousCourierId,
        orderId: id,
        ownerId: user.ownerId,
      });
    }

    // Emit to staff room
    this.emitStatusChanged(updated, previousStatus);
    // Emit to couriers room
    try {
      const payload = this.buildStatusChangedPayload(updated, previousStatus);
      this.ordersGateway.server
        ?.to(`tenant:${updated.owner_id}:couriers`)
        .emit('order:cancelled', payload);
    } catch (err) {
      this.logger.error('Failed to emit order:cancelled to couriers room', err);
    }

    await this.enqueueCallbackIfNeeded(updated, 'cancelled');

    return this.mapToDto(updated);
  }

  private async loadOrder(id: string, ownerId: string): Promise<Order> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id, owner_id: ownerId },
      relations: ['courier'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async appendAuditEntry(
    orderId: string,
    user: AuthUser,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.getRepository(OrderAuditEntry).save({
      order_id: orderId,
      owner_id: user.ownerId,
      action,
      actor_id: user.userId,
      actor_role: user.role,
      metadata,
    });
  }

  private buildStatusChangedPayload(order: Order, previousStatus: string) {
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      previous_status: previousStatus,
      courier_id: order.courier_id,
      updated_at: order.updated_at,
    };
  }

  private emitStatusChanged(order: Order, previousStatus: string): void {
    try {
      this.ordersGateway.emitStatusChanged(
        order.owner_id,
        this.buildStatusChangedPayload(order, previousStatus),
      );
    } catch (err) {
      this.logger.error('Failed to emit order:status_changed', err);
    }
  }

  private async enqueueCallbackIfNeeded(
    order: Order,
    status: string,
  ): Promise<void> {
    if (order.callback_url && CALLBACK_TRIGGER_STATUSES.has(status)) {
      await this.callbackQueue.add('send', {
        orderId: order.id,
        callbackUrl: order.callback_url,
        eventStatus: status,
        ownerId: order.owner_id,
      });
    }
  }

  private mapToDto(order: Order): OrderLifecycleResponseDto {
    let courier: CourierSummaryDto | null = null;
    if (order.courier) {
      courier = {
        id: order.courier.id,
        first_name: order.courier.first_name,
        last_name: order.courier.last_name,
        phone: order.courier.phone,
      };
    }

    return {
      id: order.id,
      owner_id: order.owner_id,
      order_number: order.order_number,
      status: order.status,
      courier,
      pickup_address: order.pickup_address,
      dropoff_address: order.dropoff_address,
      delivery_fee: Number(order.delivery_fee),
      callback_url: order.callback_url,
      assigned_at: order.assigned_at,
      picked_up_at: order.picked_up_at,
      in_delivery_at: order.in_delivery_at,
      completed_at: order.completed_at,
      cancelled_at: order.cancelled_at,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }
}
