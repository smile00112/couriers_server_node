import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnerDefaultDeliveryFee1700000007000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE owners
        ADD COLUMN default_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE owners DROP COLUMN default_delivery_fee
    `);
  }
}
