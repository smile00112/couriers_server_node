import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourierPositions1700000016 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE courier_positions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id    UUID NOT NULL REFERENCES owners(id),
        courier_id  UUID NOT NULL UNIQUE REFERENCES couriers(id),
        lat         DECIMAL(10,7) NOT NULL,
        lng         DECIMAL(10,7) NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_courier_positions_owner ON courier_positions(owner_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_courier_positions_owner');
    await queryRunner.query('DROP TABLE IF EXISTS courier_positions');
  }
}
