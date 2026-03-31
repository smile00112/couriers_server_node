import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderAuditEntry } from './entities/order-audit-entry.entity';
import { DeliveryRecord } from './entities/delivery-record.entity';
import { CourierEarning } from './entities/courier-earning.entity';
import { Client } from '../clients/entities/client.entity';
import { Courier } from '../couriers/entities/courier.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderLifecycleController } from './order-lifecycle.controller';
import { NewOrderNotifyProcessor } from './jobs/new-order-notify.processor';
import { CancelNotifyProcessor } from './jobs/cancel-notify.processor';
import { OrderCallbackProcessor } from './jobs/order-callback.processor';
import { OrdersGateway } from '../gateways/orders.gateway';
import { AuthModule } from '../auth/auth.module';
import {
  NEW_ORDER_NOTIFY_QUEUE,
  CANCEL_NOTIFY_QUEUE,
  ORDER_CALLBACK_QUEUE,
} from '../queues/queues.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderAuditEntry,
      DeliveryRecord,
      CourierEarning,
      Client,
      Courier,
    ]),
    BullModule.registerQueue(
      {
        name: NEW_ORDER_NOTIFY_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnFail: false,
        },
      },
      {
        name: CANCEL_NOTIFY_QUEUE,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnFail: false,
        },
      },
      {
        name: ORDER_CALLBACK_QUEUE,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnFail: false,
        },
      },
    ),
    forwardRef(() => AuthModule),
  ],
  controllers: [OrdersController, OrderLifecycleController],
  providers: [
    OrdersService,
    OrderLifecycleService,
    OrdersGateway,
    NewOrderNotifyProcessor,
    CancelNotifyProcessor,
    OrderCallbackProcessor,
  ],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
