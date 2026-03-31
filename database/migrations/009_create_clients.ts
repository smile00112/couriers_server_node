import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClients1700000009 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        phone VARCHAR(30) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX idx_clients_owner_phone ON clients(owner_id, phone)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_clients_owner_phone');
    await queryRunner.query('DROP TABLE IF EXISTS clients CASCADE');
  }
}
