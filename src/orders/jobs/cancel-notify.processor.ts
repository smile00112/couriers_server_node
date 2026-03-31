import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { FirebaseService } from '../../firebase/firebase.service';
import { Courier } from '../../couriers/entities/courier.entity';
import { CANCEL_NOTIFY_QUEUE } from '../orders.module';

interface CancelNotifyJobData {
  courierId: string;
  orderId: string;
  ownerId: string;
}

@Processor(CANCEL_NOTIFY_QUEUE)
export class CancelNotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(CancelNotifyProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly firebaseService: FirebaseService,
  ) {
    super();
  }

  async process(job: Job<CancelNotifyJobData>): Promise<void> {
    const { courierId, orderId } = job.data;

    // Reload courier to get current fcm_token (may have changed since enqueue)
    const courier = await this.dataSource.getRepository(Courier).findOne({
      where: { id: courierId },
      select: ['id', 'fcm_token'],
    });

    if (!courier?.fcm_token) {
      this.logger.warn(
        `No FCM token for courier ${courierId} — skipping cancel notification (orderId=${orderId})`,
      );
      return;
    }

    const messaging = this.firebaseService.getMessaging();
    if (!messaging) {
      this.logger.warn('FCM is disabled or not initialized — skipping cancel notification');
      return;
    }

    try {
      await messaging.send({
        token: courier.fcm_token,
        data: { event: 'order_cancelled', orderId },
      });
    } catch (err) {
      // Per-courier FCM failure: log and return — do NOT rethrow.
      // An invalid token should not dead-letter the job.
      this.logger.error(
        `FCM cancel notification failed for courier ${courierId} (orderId=${orderId})`,
        err,
      );
    }
  }
}
