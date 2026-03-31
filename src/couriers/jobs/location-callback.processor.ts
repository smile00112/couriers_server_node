import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LOCATION_CALLBACK_QUEUE } from '../../queues/queues.constants';

interface LocationCallbackJobData {
  courierId: string;
  orderId: string;
  callbackUrl: string;
  lat: number;
  lng: number;
  timestamp: string;
  ownerId: string;
}

@Processor(LOCATION_CALLBACK_QUEUE)
export class LocationCallbackProcessor extends WorkerHost {
  private readonly logger = new Logger(LocationCallbackProcessor.name);

  async process(job: Job<LocationCallbackJobData>): Promise<void> {
    const { courierId, orderId, callbackUrl, lat, lng, timestamp } = job.data;

    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courier_id: courierId,
        order_id: orderId,
        lat,
        lng,
        timestamp,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `Location callback HTTP ${response.status} for courier ${courierId} order ${orderId} (${callbackUrl}): ${text}`,
      );
      throw new Error(`Callback returned ${response.status}`);
    }

    this.logger.log(
      `Location callback delivered for courier ${courierId} order ${orderId}`,
    );
  }
}
