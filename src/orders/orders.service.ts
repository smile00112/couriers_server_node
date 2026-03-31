import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { OrdersGateway } from '../gateways/orders.gateway';
import { Owner } from '../owners/entities/owner.entity';
import { Client } from '../clients/entities/client.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderAuditEntry } from './entities/order-audit-entry.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  AuditEntryResponseDto,
  ClientSummaryDto,
  MetaDto,
  OrderDetailResponseDto,
  OrderItemResponseDto,
  OrderListResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { NEW_ORDER_NOTIFY_QUEUE } from './orders.module';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
    @InjectQueue(NEW_ORDER_NOTIFY_QUEUE) private readonly queue: Queue,
  ) {}

  async create(dto: CreateOrderDto, user: AuthUser): Promise<OrderResponseDto> {
    return this.dataSource.transaction(async (em) => {
      const owner = await em.findOne(Owner, {
        where: { id: user.ownerId },
      });
      if (!owner) {
        throw new NotFoundException('Owner not found');
      }

      // Find or create client (upsert-safe via catching unique violation)
      let client = await em.findOne(Client, {
        where: { owner_id: user.ownerId, phone: dto.client_phone },
      });
      if (!client) {
        client = em.create(Client, {
          owner_id: user.ownerId,
          phone: dto.client_phone,
          name: null,
        });
        try {
          client = await em.save(Client, client);
        } catch (err) {
          if (
            err instanceof QueryFailedError &&
            (err as QueryFailedError & { driverError: { code: string } })
              .driverError?.code === '23505'
          ) {
            // Race condition: another request inserted the client first
            const existing = await em.findOne(Client, {
              where: { owner_id: user.ownerId, phone: dto.client_phone },
            });
            if (!existing) throw err;
            client = existing;
          } else {
            throw err;
          }
        }
      }

      // Build order entity
      const order = em.create(Order, {
        owner_id: user.ownerId,
        client_id: client.id,
        order_number: dto.order_number,
        status: 'created',
        pickup_address: dto.pickup_address,
        pickup_lat: dto.pickup_lat,
        pickup_lng: dto.pickup_lng,
        dropoff_address: dto.dropoff_address,
        dropoff_lat: dto.dropoff_lat,
        dropoff_lng: dto.dropoff_lng,
        delivery_fee: owner.default_delivery_fee,
        callback_url: dto.callback_url ?? null,
        created_by_id: user.userId,
        created_by_role: user.role,
      });

      let savedOrder: Order;
      try {
        savedOrder = await em.save(Order, order);
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err as QueryFailedError & { driverError: { code: string } })
            .driverError?.code === '23505'
        ) {
          const existing = await em.findOne(Order, {
            where: { owner_id: user.ownerId, order_number: dto.order_number },
          });
          throw new ConflictException({
            message: 'Order with this order_number already exists',
            existingOrderId: existing?.id ?? null,
          });
        }
        throw err;
      }

      // Insert order items
      const items = dto.items.map((itemDto) =>
        em.create(OrderItem, {
          order_id: savedOrder.id,
          owner_id: user.ownerId,
          name: itemDto.name,
          quantity: itemDto.quantity,
          price: itemDto.price,
        }),
      );
      const savedItems = await em.save(OrderItem, items);

      // Insert audit entry
      const auditEntry = em.create(OrderAuditEntry, {
        order_id: savedOrder.id,
        owner_id: user.ownerId,
        action: 'created',
        actor_id: user.userId,
        actor_role: user.role,
        metadata: null,
      });
      await em.save(OrderAuditEntry, auditEntry);

      const payload = {
        id: savedOrder.id,
        order_number: savedOrder.order_number,
        status: savedOrder.status,
        pickup_address: savedOrder.pickup_address,
        dropoff_address: savedOrder.dropoff_address,
        delivery_fee: savedOrder.delivery_fee,
        client_phone: dto.client_phone,
        created_at: savedOrder.created_at,
      };

      // Emit Socket.IO event (non-blocking — gateway handles disconnect gracefully)
      try {
        this.ordersGateway.emitOrderCreated(user.ownerId, payload);
      } catch (err) {
        this.logger.error('Failed to emit order:created event', err);
      }

      // Enqueue BullMQ notification job
      await this.queue.add('notify', {
        orderId: savedOrder.id,
        ownerId: user.ownerId,
      });

      return this.mapToOrderResponse(savedOrder, client, savedItems);
    });
  }

  async findAll(
    query: { status?: string; page?: number; limit?: number },
    ownerId: string,
  ): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const repo = this.dataSource.getRepository(Order);
    const qb = repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.client', 'client')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.owner_id = :ownerId', { ownerId })
      .orderBy('order.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    const [orders, total] = await qb.getManyAndCount();

    const meta: MetaDto = {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };

    return {
      data: orders.map((o) =>
        this.mapToOrderResponse(o, o.client, o.items ?? []),
      ),
      meta,
    };
  }

  async findOne(id: string, ownerId: string): Promise<OrderDetailResponseDto> {
    const order = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.client', 'client')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.audit_entries', 'audit_entries')
      .where('order.id = :id AND order.owner_id = :ownerId', { id, ownerId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      ...this.mapToOrderResponse(order, order.client, order.items ?? []),
      audit_entries: (order.audit_entries ?? []).map((e) =>
        this.mapToAuditEntry(e),
      ),
    };
  }

  private mapToOrderResponse(
    order: Order,
    client: Client,
    items: OrderItem[],
  ): OrderResponseDto {
    const clientDto: ClientSummaryDto = {
      id: client.id,
      phone: client.phone,
      name: client.name,
    };

    const itemDtos: OrderItemResponseDto[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      price: Number(i.price),
    }));

    return {
      id: order.id,
      owner_id: order.owner_id,
      order_number: order.order_number,
      status: order.status,
      client: clientDto,
      pickup_address: order.pickup_address,
      pickup_lat: Number(order.pickup_lat),
      pickup_lng: Number(order.pickup_lng),
      dropoff_address: order.dropoff_address,
      dropoff_lat: Number(order.dropoff_lat),
      dropoff_lng: Number(order.dropoff_lng),
      delivery_fee: Number(order.delivery_fee),
      callback_url: order.callback_url,
      items: itemDtos,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }

  private mapToAuditEntry(e: OrderAuditEntry): AuditEntryResponseDto {
    return {
      id: e.id,
      action: e.action,
      actor_id: e.actor_id,
      actor_role: e.actor_role,
      created_at: e.created_at,
    };
  }
}
