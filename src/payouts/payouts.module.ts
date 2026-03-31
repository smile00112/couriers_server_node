import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutPeriod } from './entities/payout-period.entity';
import { Payout } from './entities/payout.entity';
import { CourierEarning } from '../orders/entities/courier-earning.entity';
import { Courier } from '../couriers/entities/courier.entity';
import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { CourierPayoutsController } from './courier-payouts.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayoutPeriod, Payout, CourierEarning, Courier]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PayoutsController, CourierPayoutsController],
  providers: [PayoutsService],
})
export class PayoutsModule {}
