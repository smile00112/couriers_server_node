import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1700000010000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES clients(id),
        order_number VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'created',
        pickup_address TEXT NOT NULL,
        pickup_lat DECIMAL(10,7) NOT NULL,
        pickup_lng DECIMAL(10,7) NOT NULL,
        dropoff_address TEXT NOT NULL,
        dropoff_lat DECIMAL(10,7) NOT NULL,
        dropoff_lng DECIMAL(10,7) NOT NULL,
        delivery_fee DECIMAL(10,2) NOT NULL,
        callback_url TEXT,
        created_by_id UUID NOT NULL,
        created_by_role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX idx_orders_owner_order_number ON orders(owner_id, order_number)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_orders_owner_status ON orders(owner_id, status)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_orders_owner_created_at ON orders(owner_id, created_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_orders_client_id ON orders(client_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_owner_order_number');
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_owner_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_owner_created_at');
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_client_id');
    await queryRunner.query('DROP TABLE IF EXISTS orders CASCADE');
  }
}
