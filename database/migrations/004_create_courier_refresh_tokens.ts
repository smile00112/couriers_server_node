import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourierRefreshTokens1700000004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE courier_refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        courier_id UUID NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        revoked_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_refresh_tokens_courier ON courier_refresh_tokens(courier_id, revoked_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS courier_refresh_tokens CASCADE');
  }
}
