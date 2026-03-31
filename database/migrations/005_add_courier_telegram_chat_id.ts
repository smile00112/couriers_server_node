import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCourierTelegramChatId1700000005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE couriers ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE couriers DROP COLUMN IF EXISTS telegram_chat_id');
  }
}
