/**
 * Seed script for auth integration testing.
 * Creates one Owner, one Courier with phone auth, and one Courier with password auth.
 *
 * Usage: pnpm seed:auth-test
 */
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_DATABASE ?? 'couriers',
  username: process.env.DB_USERNAME ?? 'couriers',
  password: process.env.DB_PASSWORD ?? 'couriers',
  entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
  synchronize: false,
});

async function seed() {
  await ds.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();

  try {
    await qr.startTransaction();

    // Create owner
    const [owner] = await qr.query(
      `INSERT INTO owners (name, email)
       VALUES ('Test Owner', 'owner@test.local')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const ownerId: string = owner.id;

    // Create phone-auth courier
    await qr.query(
      `INSERT INTO couriers (owner_id, first_name, last_name, phone, status)
       VALUES ($1, 'Phone', 'Courier', '+79001234567', 'available')
       ON CONFLICT DO NOTHING`,
      [ownerId],
    );

    // Create password-auth courier
    const passwordHash = await bcrypt.hash('Test1234!', 12);
    await qr.query(
      `INSERT INTO couriers (owner_id, first_name, last_name, phone, status, login, password_hash)
       VALUES ($1, 'Password', 'Courier', '+79009999999', 'available', 'courier_test', $2)
       ON CONFLICT DO NOTHING`,
      [ownerId, passwordHash],
    );

    await qr.commitTransaction();
    console.log(`Seed complete. owner_id=${ownerId}`);
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
