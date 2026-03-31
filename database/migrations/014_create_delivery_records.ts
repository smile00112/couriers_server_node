import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeliveryRecords1700000014000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE delivery_records (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id     UUID NOT NULL REFERENCES owners(id),
        order_id     UUID NOT NULL UNIQUE REFERENCES orders(id),
        courier_id   UUID NOT NULL REFERENCES couriers(id),
        delivery_fee DECIMAL(10,2) NOT NULL,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_delivery_records_owner ON delivery_records(owner_id, completed_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_delivery_records_courier ON delivery_records(courier_id, completed_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_delivery_records_courier');
    await queryRunner.query('DROP INDEX IF EXISTS idx_delivery_records_owner');
    await queryRunner.query('DROP TABLE IF EXISTS delivery_records');
  }
}
