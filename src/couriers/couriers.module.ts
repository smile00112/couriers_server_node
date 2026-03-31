import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Courier } from './entities/courier.entity';
import { CourierPosition } from './entities/courier-position.entity';
import { CourierLocationHistory } from './entities/courier-location-history.entity';
import { CourierShift } from './entities/courier-shift.entity';
import { CourierTrackingService } from './courier-tracking.service';
import { CourierTrackingController } from './courier-tracking.controller';
import { LocationCallbackProcessor } from './jobs/location-callback.processor';
import { ShiftManagementService } from './shift-management.service';
import { ShiftManagementController } from './shift-management.controller';
import { CouriersAdminService } from './couriers-admin.service';
import { CouriersAdminController } from './couriers-admin.controller';
import { OrdersModule } from '../orders/orders.module';
import { LOCATION_CALLBACK_QUEUE } from '../queues/queues.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Courier, CourierPosition, CourierLocationHistory, CourierShift]),
    BullModule.registerQueue({
      name: LOCATION_CALLBACK_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnFail: false,
      },
    }),
    forwardRef(() => OrdersModule),
  ],
  controllers: [CourierTrackingController, ShiftManagementController, CouriersAdminController],
  providers: [CourierTrackingService, LocationCallbackProcessor, ShiftManagementService, CouriersAdminService],
  exports: [TypeOrmModule],
})
export class CouriersModule {}
