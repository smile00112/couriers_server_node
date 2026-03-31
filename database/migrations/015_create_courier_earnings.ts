import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourierEarnings1700000015000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE courier_earnings (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id   UUID NOT NULL REFERENCES owners(id),
        courier_id UUID NOT NULL REFERENCES couriers(id),
        order_id   UUID NOT NULL UNIQUE REFERENCES orders(id),
        amount     DECIMAL(10,2) NOT NULL,
        earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_courier_earnings_courier ON courier_earnings(courier_id, earned_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_courier_earnings_owner ON courier_earnings(owner_id, earned_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_courier_earnings_owner');
    await queryRunner.query('DROP INDEX IF EXISTS idx_courier_earnings_courier');
    await queryRunner.query('DROP TABLE IF EXISTS courier_earnings');
  }
}
