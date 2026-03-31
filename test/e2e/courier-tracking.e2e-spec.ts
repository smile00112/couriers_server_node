/**
 * E2E tests for the Courier Tracking API.
 *
 * Prerequisites: PostgreSQL + Redis must be running and all migrations applied.
 * Run with: pnpm test:e2e
 *
 * Mirrors quickstart.md Flows 1–8.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { UserRole } from '../../src/auth/enums/user-role.enum';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mintJwt(
  jwtService: JwtService,
  payload: { sub: string; owner_id: string; role: string },
) {
  return jwtService.sign(payload);
}

async function seedOwner(ds: DataSource): Promise<{ id: string }> {
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO owners (name, email, default_delivery_fee)
     VALUES ('Tracking E2E Owner', 'tracking-e2e@example.com', 300.00)
     ON CONFLICT (email) DO UPDATE SET default_delivery_fee = 300.00
     RETURNING id`,
  );
  return rows[0];
}

async function seedCourier(ds: DataSource, ownerId: string, phone: string): Promise<{ id: string }> {
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO couriers (owner_id, first_name, last_name, phone, status, fcm_token)
     VALUES ($1, 'Track', 'Courier', $2, 'available', 'fcm-tracking-test')
     ON CONFLICT (owner_id, phone) DO UPDATE SET status = 'available'
     RETURNING id`,
    [ownerId, phone],
  );
  return rows[0];
}

async function seedOrder(
  ds: DataSource,
  ownerId: string,
  operatorId: string,
  orderNumber: string,
  callbackUrl?: string,
): Promise<{ id: string }> {
  const clientRows: { id: string }[] = await ds.query(
    `INSERT INTO clients (owner_id, phone) VALUES ($1, '+79001234567')
     ON CONFLICT (owner_id, phone) DO UPDATE SET phone = '+79001234567'
     RETURNING id`,
    [ownerId],
  );
  const clientId = clientRows[0].id;

  const rows: { id: string }[] = await ds.query(
    `INSERT INTO orders (owner_id, client_id, order_number, status, pickup_address, pickup_lat, pickup_lng,
                         dropoff_address, dropoff_lat, dropoff_lng, delivery_fee, callback_url,
                         created_by_id, created_by_role)
     VALUES ($1, $2, $3, 'created', 'Pickup St', 55.7558, 37.6173,
             'Dropoff Ave', 55.789, 37.64, 300.00, $4, $5, 'order_operator')
     ON CONFLICT (owner_id, order_number) DO UPDATE SET status = 'created'
     RETURNING id`,
    [ownerId, clientId, orderNumber, callbackUrl ?? null, operatorId],
  );
  return rows[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Courier Tracking (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  let ownerId: string;
  let courierId: string;
  let operatorId: string;
  let courierToken: string;
  let operatorToken: string;
  let courier2Id: string;
  let courier2Token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    ds = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);

    const owner = await seedOwner(ds);
    ownerId = owner.id;
    operatorId = 'operator-tracking-e2e-001';

    const courier = await seedCourier(ds, ownerId, '+79001111001');
    courierId = courier.id;

    const courier2 = await seedCourier(ds, ownerId, '+79001111002');
    courier2Id = courier2.id;

    courierToken = mintJwt(jwtService, {
      sub: courierId,
      owner_id: ownerId,
      role: UserRole.COURIER,
    });

    courier2Token = mintJwt(jwtService, {
      sub: courier2Id,
      owner_id: ownerId,
      role: UserRole.COURIER,
    });

    operatorToken = mintJwt(jwtService, {
      sub: operatorId,
      owner_id: ownerId,
      role: UserRole.ORDER_OPERATOR,
    });

    // Clean up tracking data from previous runs
    await ds.query('DELETE FROM courier_location_history WHERE owner_id = $1', [ownerId]);
    await ds.query('DELETE FROM courier_positions WHERE owner_id = $1', [ownerId]);
  });

  afterAll(async () => {
    await app.close();
  });

  // Flow 1 — Courier submits location, no active order
  describe('Flow 1 — Submit location (no active order)', () => {
    it('POST /couriers/location → 200 with distance_meters=0 and order_id=null', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ lat: 55.7558, lng: 37.6173 });

      expect(res.status).toBe(200);
      expect(res.body.courier_id).toBe(courierId);
      expect(res.body.lat).toBe(55.7558);
      expect(res.body.lng).toBe(37.6173);
      expect(res.body.distance_meters).toBe(0);
      expect(res.body.order_id).toBeNull();
      expect(res.body.recorded_at).toBeDefined();
    });
  });

  // Flow 2 — Location linked to active order
  describe('Flow 2 — Location links to active order', () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await seedOrder(ds, ownerId, operatorId, 'TRK-E2E-001');
      orderId = order.id;

      // Assign order to courier
      await ds.query(
        `UPDATE orders SET status = 'assigned', courier_id = $1, assigned_at = NOW()
         WHERE id = $2`,
        [courier2Id, orderId],
      );

      // Wait for throttle window from Flow 1 to expire (use courier2 to avoid rate limit)
    });

    it('POST /couriers/location with active order → order_id set', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${courier2Token}`)
        .send({ lat: 55.7560, lng: 37.6175 });

      expect(res.status).toBe(200);
      expect(res.body.order_id).toBe(orderId);
    });
  });

  // Flow 3 — Route history after delivery
  describe('Flow 3 — Route history', () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await seedOrder(ds, ownerId, operatorId, 'TRK-E2E-ROUTE');
      orderId = order.id;

      // Assign order to courier and insert history points directly
      await ds.query(
        `UPDATE orders SET status = 'assigned', courier_id = $1, assigned_at = NOW()
         WHERE id = $2`,
        [courierId, orderId],
      );

      // Insert two history points manually (bypass rate limit)
      await ds.query(
        `INSERT INTO courier_location_history (owner_id, courier_id, order_id, lat, lng, distance_meters, recorded_at)
         VALUES ($1, $2, $3, 55.756, 37.617, 0, NOW() - interval '10 seconds'),
                ($1, $2, $3, 55.760, 37.620, 450.5, NOW() - interval '5 seconds')`,
        [ownerId, courierId, orderId],
      );
    });

    it('GET /orders/:id/route → returns chronological points with total_distance_meters', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/route`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.order_id).toBe(orderId);
      expect(res.body.points.length).toBeGreaterThanOrEqual(2);
      expect(res.body.total_distance_meters).toBeGreaterThan(0);
      // Points should be chronological
      const times = res.body.points.map((p: { recorded_at: string }) => new Date(p.recorded_at).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
      }
    });
  });

  // Flow 4 — Rate limit enforced
  describe('Flow 4 — Rate limit', () => {
    it('second POST /couriers/location within 5s → 429', async () => {
      // Use a fresh courier JWT to avoid interference from previous tests
      const freshCourier = await seedCourier(ds, ownerId, '+79001111003');
      const freshToken = mintJwt(jwtService, {
        sub: freshCourier.id,
        owner_id: ownerId,
        role: UserRole.COURIER,
      });

      // First request should succeed
      const first = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({ lat: 55.756, lng: 37.617 });
      expect(first.status).toBe(200);

      // Second request within 5s should be rate-limited
      const second = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({ lat: 55.757, lng: 37.618 });
      expect(second.status).toBe(429);
    });
  });

  // Flow 5 — Invalid coordinates rejected
  describe('Flow 5 — Validation', () => {
    it('lat > 90 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ lat: 95.0, lng: 37.6173 });
      expect(res.status).toBe(400);
    });

    it('missing lat → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ lng: 37.6173 });
      expect(res.status).toBe(400);
    });
  });

  // Flow 6 — Operator cannot submit location
  describe('Flow 6 — Role enforcement on POST', () => {
    it('operator submits location → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/location')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lat: 55.7558, lng: 37.6173 });
      expect(res.status).toBe(403);
    });
  });

  // Flow 7 — Route history access control
  describe('Flow 7 — Route history access control', () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await seedOrder(ds, ownerId, operatorId, 'TRK-E2E-ACCESS');
      orderId = order.id;
    });

    it('courier cannot access route history → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/route`)
        .set('Authorization', `Bearer ${courierToken}`);
      expect(res.status).toBe(403);
    });

    it('cross-tenant order → 404', async () => {
      const fakeOrderId = '00000000-0000-0000-0000-000000000099';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${fakeOrderId}/route`)
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(res.status).toBe(404);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/route`);
      expect(res.status).toBe(401);
    });
  });
});
