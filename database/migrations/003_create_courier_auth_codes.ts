import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourierAuthCodes1700000003000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE courier_auth_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
        phone VARCHAR(30) NOT NULL,
        code VARCHAR(6) NOT NULL,
        channel VARCHAR(20) NOT NULL DEFAULT 'sms',
        used_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_auth_codes_lookup ON courier_auth_codes(owner_id, phone, used_at, expires_at)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_auth_codes_expires ON courier_auth_codes(expires_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS courier_auth_codes CASCADE');
  }
}
