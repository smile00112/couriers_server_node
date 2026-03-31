import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourierLocationHistory1700000017 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE courier_location_history (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id         UUID NOT NULL REFERENCES owners(id),
        courier_id       UUID NOT NULL REFERENCES couriers(id),
        order_id         UUID NULL REFERENCES orders(id),
        lat              DECIMAL(10,7) NOT NULL,
        lng              DECIMAL(10,7) NOT NULL,
        distance_meters  DECIMAL(10,2) NOT NULL DEFAULT 0,
        recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_location_history_order ON courier_location_history(order_id, recorded_at ASC)
       WHERE order_id IS NOT NULL`,
    );
    await queryRunner.query(
      'CREATE INDEX idx_location_history_courier ON courier_location_history(courier_id, recorded_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_location_history_owner ON courier_location_history(owner_id, recorded_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_location_history_owner');
    await queryRunner.query('DROP INDEX IF EXISTS idx_location_history_courier');
    await queryRunner.query('DROP INDEX IF EXISTS idx_location_history_order');
    await queryRunner.query('DROP TABLE IF EXISTS courier_location_history');
  }
}
