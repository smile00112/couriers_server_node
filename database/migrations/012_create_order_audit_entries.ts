import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrderAuditEntries1700000012 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE order_audit_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        actor_id UUID NOT NULL,
        actor_role VARCHAR(50) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_audit_order_created ON order_audit_entries(order_id, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_audit_owner_created ON order_audit_entries(owner_id, created_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_order_created');
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_owner_created');
    await queryRunner.query('DROP TABLE IF EXISTS order_audit_entries CASCADE');
  }
}
