import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AUTH_CODE_DELIVERY_QUEUE } from '../../queues/queues.constants';

export interface CodeDeliveryJob {
  authCodeId: string;
  phone: string;
  channel: string;
  code: string;
  telegramChatId?: string | null;
}

@Injectable()
export class CodeDeliveryService {
  constructor(
    @InjectQueue(AUTH_CODE_DELIVERY_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(job: CodeDeliveryJob): Promise<void> {
    await this.queue.add('deliver', job, {
      jobId: job.authCodeId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      // Remove completed jobs so re-enqueuing the same authCodeId works (idempotent resend)
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
