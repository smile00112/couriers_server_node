import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayouts1700000020000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payouts (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id          UUID NOT NULL REFERENCES owners(id),
        payout_period_id  UUID NOT NULL REFERENCES payout_periods(id),
        courier_id        UUID NOT NULL REFERENCES couriers(id),
        amount            DECIMAL(10,2) NOT NULL,
        reference_note    TEXT,
        paid_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_payout_period_courier UNIQUE (payout_period_id, courier_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_payouts_period ON payouts(payout_period_id, courier_id)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_payouts_courier ON payouts(courier_id, paid_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_payouts_courier');
    await queryRunner.query('DROP INDEX IF EXISTS idx_payouts_period');
    await queryRunner.query('DROP TABLE IF EXISTS payouts');
  }
}
