/**
 * Seed script for order-ingestion integration testing.
 *
 * Creates/updates a test Owner (default_delivery_fee=350.00) and a test Courier
 * with a dummy FCM token. Mints a test operator JWT directly (no operator user
 * table — operator auth is a future feature).
 *
 * Usage: pnpm seed:order-test
 * Output: owner_id and ACCESS_TOKEN printed to console.
 */
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../../src/auth/enums/user-role.enum';

dotenv.config();

const TEST_OPERATOR_UUID = '00000000-0000-0000-0000-000000000001';
const TEST_COURIER_FCM_TOKEN = 'test-fcm-token-001';

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

    // Find or create test owner with default_delivery_fee = 350.00
    const ownerRows: { id: string }[] = await qr.query(
      `INSERT INTO owners (name, email, default_delivery_fee)
       VALUES ('Test Owner (Order Ingestion)', 'order-test-owner@test.local', 350.00)
       ON CONFLICT (email) DO UPDATE
         SET default_delivery_fee = 350.00
       RETURNING id`,
    );
    const ownerId = ownerRows[0].id;

    // Find or create test courier with FCM token
    await qr.query(
      `INSERT INTO couriers (owner_id, first_name, last_name, phone, status, fcm_token)
       VALUES ($1, 'Test', 'Courier', '+79001112233', 'available', $2)
       ON CONFLICT DO NOTHING`,
      [ownerId, TEST_COURIER_FCM_TOKEN],
    );

    await qr.commitTransaction();

    // Mint operator JWT directly — no DB user needed
    const jwtService = new JwtService({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: {
        expiresIn: process.env.JWT_ACCESS_TTL
          ? parseInt(process.env.JWT_ACCESS_TTL, 10)
          : 3600,
      },
    });

    const accessToken = jwtService.sign({
      sub: TEST_OPERATOR_UUID,
      owner_id: ownerId,
      role: UserRole.ORDER_OPERATOR,
    });

    console.log('\n✅ Order test seed complete');
    console.log(`   owner_id    = ${ownerId}`);
    console.log(`   ACCESS_TOKEN = ${accessToken}\n`);
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
