/**
 * Seed script for order-lifecycle integration testing.
 *
 * Creates/updates a test Owner (default_delivery_fee=350.00) and two test Couriers
 * with FCM tokens. Mints operator + two courier JWTs directly.
 *
 * Usage: pnpm seed:order-lifecycle-test
 * Output: owner_id, OPERATOR_TOKEN, COURIER_TOKEN_1, COURIER_TOKEN_2 printed to console.
 */
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../../src/auth/enums/user-role.enum';

dotenv.config();

const TEST_OPERATOR_UUID = '00000000-0000-0000-0000-000000000002';

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

    // Upsert owner with default_delivery_fee = 350.00
    const ownerRows: { id: string }[] = await qr.query(
      `INSERT INTO owners (name, email, default_delivery_fee)
       VALUES ('Test Owner (Lifecycle)', 'lifecycle-test-owner@test.local', 350.00)
       ON CONFLICT (email) DO UPDATE
         SET default_delivery_fee = 350.00
       RETURNING id`,
    );
    const ownerId = ownerRows[0].id;

    // Upsert Courier 1
    const courier1Rows: { id: string }[] = await qr.query(
      `INSERT INTO couriers (owner_id, first_name, last_name, phone, status, fcm_token)
       VALUES ($1, 'Courier', 'One', '+79001111111', 'available', 'lifecycle-fcm-001')
       ON CONFLICT (owner_id, phone) DO UPDATE
         SET fcm_token = 'lifecycle-fcm-001', status = 'available'
       RETURNING id`,
      [ownerId],
    );
    const courier1Id = courier1Rows[0].id;

    // Upsert Courier 2
    const courier2Rows: { id: string }[] = await qr.query(
      `INSERT INTO couriers (owner_id, first_name, last_name, phone, status, fcm_token)
       VALUES ($1, 'Courier', 'Two', '+79002222222', 'available', 'lifecycle-fcm-002')
       ON CONFLICT (owner_id, phone) DO UPDATE
         SET fcm_token = 'lifecycle-fcm-002', status = 'available'
       RETURNING id`,
      [ownerId],
    );
    const courier2Id = courier2Rows[0].id;

    await qr.commitTransaction();

    const jwtService = new JwtService({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: {
        expiresIn: process.env.JWT_ACCESS_TTL
          ? parseInt(process.env.JWT_ACCESS_TTL, 10)
          : 3600,
      },
    });

    const operatorToken = jwtService.sign({
      sub: TEST_OPERATOR_UUID,
      owner_id: ownerId,
      role: UserRole.ORDER_OPERATOR,
    });

    const courierToken1 = jwtService.sign({
      sub: courier1Id,
      owner_id: ownerId,
      role: UserRole.COURIER,
    });

    const courierToken2 = jwtService.sign({
      sub: courier2Id,
      owner_id: ownerId,
      role: UserRole.COURIER,
    });

    console.log('\n✅ Order lifecycle seed complete');
    console.log(`   OWNER_ID        = ${ownerId}`);
    console.log(`   OPERATOR_TOKEN  = ${operatorToken}`);
    console.log(`   COURIER_TOKEN_1 = ${courierToken1}`);
    console.log(`   COURIER_TOKEN_2 = ${courierToken2}\n`);
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
