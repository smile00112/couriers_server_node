import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStaffUsers1700000021 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE staff_user_role AS ENUM ('owner', 'manager', 'order_operator')
    `);
    await queryRunner.query(`
      CREATE TABLE staff_users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id      UUID NOT NULL REFERENCES owners(id),
        name          VARCHAR(255) NOT NULL,
        email         VARCHAR(255) NOT NULL,
        role          staff_user_role NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_staff_users_email UNIQUE (email)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_staff_users_owner ON staff_users(owner_id, created_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_staff_users_owner');
    await queryRunner.query('DROP TABLE IF EXISTS staff_users');
    await queryRunner.query('DROP TYPE IF EXISTS staff_user_role');
  }
}
