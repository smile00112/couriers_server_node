import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCouriers1700000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE couriers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        first_name VARCHAR NOT NULL,
        last_name VARCHAR NOT NULL,
        phone VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'unavailable',
        fcm_token VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX idx_couriers_owner_phone ON couriers(owner_id, phone)');
    await queryRunner.query('CREATE INDEX idx_couriers_owner_id ON couriers(owner_id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_couriers_owner_phone');
    await queryRunner.query('DROP INDEX IF EXISTS idx_couriers_owner_id');
    await queryRunner.query('DROP TABLE IF EXISTS couriers CASCADE');
  }
}
