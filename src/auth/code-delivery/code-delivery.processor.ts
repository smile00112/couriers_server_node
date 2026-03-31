import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { AUTH_CODE_DELIVERY_QUEUE } from '../../queues/queues.constants';
import { CodeDeliveryJob } from './code-delivery.service';

@Processor(AUTH_CODE_DELIVERY_QUEUE)
export class CodeDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(CodeDeliveryProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async process(job: Job<CodeDeliveryJob>): Promise<void> {
    const { authCodeId, phone, channel, code, telegramChatId } = job.data;

    if (this.config.get<string>('AUTH_CODE_FIXED')) {
      this.logger.log(
        `[TEST MODE] code=${code} channel=${channel} phone=${phone} authCodeId=${authCodeId}`,
      );
      return;
    }

    if (channel === 'sms') {
      await this.deliverViaSms(phone, code);
    } else if (channel === 'telegram') {
      await this.deliverViaTelegram(telegramChatId ?? null, code, authCodeId);
    } else {
      this.logger.error(`Unknown delivery channel: ${channel}`);
    }
  }

  private async deliverViaSms(phone: string, code: string): Promise<void> {
    // TODO: integrate with SMS gateway provider
    this.logger.log(`SMS delivery to ${phone}: code=${code}`);
    throw new InternalServerErrorException('SMS gateway not configured');
  }

  private async deliverViaTelegram(
    chatId: string | null,
    code: string,
    authCodeId: string,
  ): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error(
        `TELEGRAM_BOT_TOKEN not configured; authCodeId=${authCodeId}`,
      );
      throw new InternalServerErrorException('Telegram bot not configured');
    }
    if (!chatId) {
      this.logger.error(`No telegram_chat_id for authCodeId=${authCodeId}`);
      throw new InternalServerErrorException(
        'Courier has no Telegram chat linked',
      );
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Your login code: ${code}`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        `Telegram API error for authCodeId=${authCodeId}: ${body}`,
      );
      throw new InternalServerErrorException('Telegram delivery failed');
    }
  }
}
