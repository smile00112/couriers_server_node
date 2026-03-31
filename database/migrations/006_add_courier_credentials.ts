import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCourierCredentials1700000006000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE couriers
        ADD COLUMN IF NOT EXISTS login VARCHAR(100),
        ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_couriers_owner_login
        ON couriers(owner_id, login)
        WHERE login IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_couriers_owner_login');
    await queryRunner.query(`
      ALTER TABLE couriers
        DROP COLUMN IF EXISTS login,
        DROP COLUMN IF EXISTS password_hash
    `);
  }
}
