import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { FirebaseService } from '../../firebase/firebase.service';
import { Courier } from '../../couriers/entities/courier.entity';
import { NEW_ORDER_NOTIFY_QUEUE } from '../../queues/queues.constants';

interface NotifyJobData {
  orderId: string;
  ownerId: string;
}

@Processor(NEW_ORDER_NOTIFY_QUEUE)
export class NewOrderNotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NewOrderNotifyProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly firebaseService: FirebaseService,
  ) {
    super();
  }

  async process(job: Job<NotifyJobData>): Promise<void> {
    const { orderId, ownerId } = job.data;

    // NOTE (FR-008 / research.md Decision 4): "available" is currently defined as
    // "has FCM token". The open-work-shift filter is intentionally deferred to
    // feature 005. Only couriers with an fcm_token are notified here.
    const couriers = await this.dataSource.getRepository(Courier).find({
      where: { owner_id: ownerId },
      select: ['id', 'fcm_token'],
    });

    const messaging = this.firebaseService.getMessaging();
    if (!messaging) {
      this.logger.warn('FCM is disabled or not initialized — skipping notifications');
      return;
    }

    for (const courier of couriers) {
      if (!courier.fcm_token) continue;

      try {
        await messaging.send({
          token: courier.fcm_token,
          data: { orderId },
        });
      } catch (err) {
        // Per-courier FCM failure: log and continue — do NOT propagate.
        // Propagating would cause BullMQ to retry the entire job (dead-letter risk)
        // when only one courier's token was invalid.
        this.logger.error(
          `FCM send failed for courier ${courier.id} (orderId=${orderId})`,
          err,
        );
      }
    }
  }
}
