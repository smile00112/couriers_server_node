/**
 * E2E tests for the Orders HTTP API.
 *
 * Prerequisites: PostgreSQL + Redis must be running and all migrations applied.
 * Run with: pnpm test:e2e
 *
 * The tests mint JWT tokens directly (no login flow) because operator auth
 * is a future feature. Test data is isolated per-run via unique order numbers.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../../src/app.module';
import { UserRole } from '../../src/auth/enums/user-role.enum';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mintJwt(
  jwtService: JwtService,
  payload: { sub: string; owner_id: string; role: string },
) {
  return jwtService.sign(payload);
}

async function seedOwner(
  ds: DataSource,
  email: string,
): Promise<{ id: string }> {
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO owners (name, email, default_delivery_fee)
     VALUES ('E2E Test Owner', $1, 350.00)
     ON CONFLICT (email) DO UPDATE SET default_delivery_fee = 350.00
     RETURNING id`,
    [email],
  );
  return rows[0];
}

function makeOrderPayload(orderNumber: string) {
  return {
    order_number: orderNumber,
    client_phone: '+79001234567',
    pickup_address: 'Pickup St 1',
    pickup_lat: 55.7558,
    pickup_lng: 37.6173,
    dropoff_address: 'Dropoff Ave 2',
    dropoff_lat: 55.789,
    dropoff_lng: 37.64,
    items: [{ name: 'Pizza', quantity: 2, price: 850.0 }],
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Orders API (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;
  let ownerId: string;
  let operatorToken: string;
  let courierToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();

    ds = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);

    // Create a unique owner per test run to avoid cross-run pollution
    const email = `e2e-orders-${Date.now()}@test.local`;
    const owner = await seedOwner(ds, email);
    ownerId = owner.id;

    operatorToken = mintJwt(jwtService, {
      sub: uuidv4(),
      owner_id: ownerId,
      role: UserRole.ORDER_OPERATOR,
    });

    courierToken = mintJwt(jwtService, {
      sub: uuidv4(),
      owner_id: ownerId,
      role: UserRole.COURIER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/orders', () => {
    it('201 — creates order with correct fields', async () => {
      const orderNumber = `ORD-E2E-${uuidv4().slice(0, 8)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(orderNumber))
        .expect(201);

      expect(res.body).toMatchObject({
        order_number: orderNumber,
        status: 'created',
        delivery_fee: expect.any(Number),
        client: { phone: '+79001234567' },
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Pizza', quantity: 2 }),
        ]),
      });
      expect(res.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('201 — delivery_fee is snapshotted from owner.default_delivery_fee (350)', async () => {
      const orderNumber = `ORD-E2E-${uuidv4().slice(0, 8)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(orderNumber))
        .expect(201);

      expect(Number(res.body.delivery_fee)).toBe(350);
    });

    it('201 — reuses same client.id on second order with same phone', async () => {
      const phone = '+79002345678';
      const payload = (n: string) => ({
        ...makeOrderPayload(n),
        client_phone: phone,
      });

      const r1 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload(`ORD-E2E-A-${uuidv4().slice(0, 8)}`))
        .expect(201);

      const r2 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload(`ORD-E2E-B-${uuidv4().slice(0, 8)}`))
        .expect(201);

      expect(r1.body.client.id).toBe(r2.body.client.id);
    });

    it('201 — stores callback_url when provided', async () => {
      const orderNumber = `ORD-E2E-CB-${uuidv4().slice(0, 8)}`;
      const callbackUrl = 'https://partner.example.com/webhooks/orders/42';
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ ...makeOrderPayload(orderNumber), callback_url: callbackUrl })
        .expect(201);

      expect(res.body.callback_url).toBe(callbackUrl);
    });

    it('409 — duplicate order_number returns existingOrderId', async () => {
      const orderNumber = `ORD-E2E-DUP-${uuidv4().slice(0, 8)}`;
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(orderNumber))
        .expect(201);

      const r2 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(orderNumber))
        .expect(409);

      expect(r2.body.message).toContain('order_number');
      expect(r2.body.existingOrderId).toBe(r1.body.id);
    });

    it('400 — missing items array', async () => {
      const { items: _items, ...noItems } = makeOrderPayload(
        `ORD-E2E-${uuidv4().slice(0, 8)}`,
      );
      void _items;
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(noItems)
        .expect(400);
    });

    it('400 — empty items array', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ ...makeOrderPayload(`ORD-E2E-${uuidv4().slice(0, 8)}`), items: [] })
        .expect(400);
    });

    it('403 — Courier JWT is rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${courierToken}`)
        .send(makeOrderPayload(`ORD-E2E-${uuidv4().slice(0, 8)}`))
        .expect(403);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send(makeOrderPayload(`ORD-E2E-${uuidv4().slice(0, 8)}`))
        .expect(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /api/v1/orders', () => {
    it('200 — returns paginated list with meta', async () => {
      // Ensure at least one order exists
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`ORD-E2E-LIST-${uuidv4().slice(0, 8)}`))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        data: expect.any(Array),
        meta: {
          total: expect.any(Number),
          page: expect.any(Number),
          limit: expect.any(Number),
          total_pages: expect.any(Number),
        },
      });
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('200 — filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders?status=created')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      for (const order of res.body.data as Array<{ status: string }>) {
        expect(order.status).toBe('created');
      }
    });

    it('403 — Courier JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${courierToken}`)
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /api/v1/orders/:id', () => {
    it('200 — returns order with items and audit_entries', async () => {
      const orderNumber = `ORD-E2E-GET-${uuidv4().slice(0, 8)}`;
      const created = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(orderNumber))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${created.body.id as string}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: created.body.id,
        order_number: orderNumber,
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Pizza' }),
        ]),
        audit_entries: expect.arrayContaining([
          expect.objectContaining({ action: 'created' }),
        ]),
      });
    });

    it('404 — order belongs to different tenant', async () => {
      // Create a second owner and order
      const email2 = `e2e-orders-other-${Date.now()}@test.local`;
      const owner2 = await seedOwner(ds, email2);
      const token2 = mintJwt(jwtService, {
        sub: uuidv4(),
        owner_id: owner2.id,
        role: UserRole.ORDER_OPERATOR,
      });
      const created = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token2}`)
        .send(makeOrderPayload(`ORD-E2E-OTHER-${uuidv4().slice(0, 8)}`))
        .expect(201);

      // Tenant 1 cannot access tenant 2's order
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${created.body.id as string}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(404);
    });

    it('404 — non-existent id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${uuidv4()}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(404);
    });
  });
});
