import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourierShifts1700000018 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE courier_shifts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id    UUID NOT NULL REFERENCES owners(id),
        courier_id  UUID NOT NULL REFERENCES couriers(id),
        status      VARCHAR(20) NOT NULL DEFAULT 'open',
        started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at    TIMESTAMPTZ NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_courier_shifts_one_open
       ON courier_shifts(courier_id)
       WHERE status = 'open'`,
    );
    await queryRunner.query(
      'CREATE INDEX idx_courier_shifts_owner ON courier_shifts(owner_id, started_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_courier_shifts_courier ON courier_shifts(courier_id, started_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_courier_shifts_courier');
    await queryRunner.query('DROP INDEX IF EXISTS idx_courier_shifts_owner');
    await queryRunner.query('DROP INDEX IF EXISTS idx_courier_shifts_one_open');
    await queryRunner.query('DROP TABLE IF EXISTS courier_shifts');
  }
}
