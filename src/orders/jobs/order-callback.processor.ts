import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ORDER_CALLBACK_QUEUE } from '../orders.module';

interface CallbackJobData {
  orderId: string;
  callbackUrl: string;
  eventStatus: string;
  ownerId: string;
}

@Processor(ORDER_CALLBACK_QUEUE)
export class OrderCallbackProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderCallbackProcessor.name);

  async process(job: Job<CallbackJobData>): Promise<void> {
    const { orderId, callbackUrl, eventStatus } = job.data;

    // Callback delivery is best-effort: HTTP failure causes BullMQ to retry (5 attempts,
    // exponential backoff). The order state was already committed before this job was
    // enqueued, so retries are idempotent — partner deduplicates by order_id + status.
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderId,
        status: eventStatus,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `Callback HTTP ${response.status} for order ${orderId} (${callbackUrl}): ${text}`,
      );
      throw new Error(`Callback returned ${response.status}`);
    }

    this.logger.log(`Callback delivered for order ${orderId} status=${eventStatus}`);
  }
}
