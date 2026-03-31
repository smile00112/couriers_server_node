import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayoutPeriods1700000019000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payout_periods (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id   UUID NOT NULL REFERENCES owners(id),
        created_by UUID NOT NULL,
        start_date DATE NOT NULL,
        end_date   DATE NOT NULL,
        status     VARCHAR(10) NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_payout_period_dates CHECK (end_date >= start_date)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_payout_periods_owner ON payout_periods(owner_id, created_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_payout_periods_owner');
    await queryRunner.query('DROP TABLE IF EXISTS payout_periods');
  }
}
