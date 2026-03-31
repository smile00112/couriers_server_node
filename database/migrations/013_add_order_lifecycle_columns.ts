import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderLifecycleColumns1700000013 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN courier_id UUID NULL REFERENCES couriers(id),
        ADD COLUMN assigned_at TIMESTAMPTZ NULL,
        ADD COLUMN picked_up_at TIMESTAMPTZ NULL,
        ADD COLUMN in_delivery_at TIMESTAMPTZ NULL,
        ADD COLUMN completed_at TIMESTAMPTZ NULL,
        ADD COLUMN cancelled_at TIMESTAMPTZ NULL
    `);
    await queryRunner.query(
      'CREATE INDEX idx_orders_courier_id ON orders(courier_id) WHERE courier_id IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_courier_id');
    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS cancelled_at,
        DROP COLUMN IF EXISTS completed_at,
        DROP COLUMN IF EXISTS in_delivery_at,
        DROP COLUMN IF EXISTS picked_up_at,
        DROP COLUMN IF EXISTS assigned_at,
        DROP COLUMN IF EXISTS courier_id
    `);
  }
}
