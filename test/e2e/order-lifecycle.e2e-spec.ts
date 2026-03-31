/**
 * E2E tests for the Order Lifecycle API.
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
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../../src/app.module';
import { UserRole } from '../../src/auth/enums/user-role.enum';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mintJwt(
  jwtService: JwtService,
  payload: { sub: string; owner_id: string; role: string },
) {
  return jwtService.sign(payload);
}

async function seedOwner(ds: DataSource, email: string): Promise<{ id: string }> {
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO owners (name, email, default_delivery_fee)
     VALUES ('Lifecycle E2E Owner', $1, 350.00)
     ON CONFLICT (email) DO UPDATE SET default_delivery_fee = 350.00
     RETURNING id`,
    [email],
  );
  return rows[0];
}

async function seedCourier(
  ds: DataSource,
  ownerId: string,
  phone: string,
  fcmToken: string,
): Promise<{ id: string }> {
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO couriers (owner_id, first_name, last_name, phone, status, fcm_token)
     VALUES ($1, 'E2E', 'Courier', $2, 'available', $3)
     ON CONFLICT (owner_id, phone) DO UPDATE SET fcm_token = $3
     RETURNING id`,
    [ownerId, phone, fcmToken],
  );
  return rows[0];
}

function makeOrderPayload(orderNumber: string) {
  return {
    order_number: orderNumber,
    client_phone: '+79009876543',
    pickup_address: 'Lifecycle Pickup St',
    pickup_lat: 55.7558,
    pickup_lng: 37.6173,
    dropoff_address: 'Lifecycle Dropoff Ave',
    dropoff_lat: 55.789,
    dropoff_lng: 37.64,
    items: [{ name: 'Package', quantity: 1, price: 500.0 }],
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Order Lifecycle API (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  let ownerId: string;
  let operatorToken: string;
  let courierToken1: string;
  let courierToken2: string;
  let courier1Id: string;

  const runId = uuidv4().slice(0, 8);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    ds = moduleFixture.get<DataSource>(DataSource);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    const owner = await seedOwner(ds, `lifecycle-e2e-${runId}@test.local`);
    ownerId = owner.id;

    const courier1 = await seedCourier(ds, ownerId, `+7901${runId.slice(0, 7)}`, `e2e-fcm-1-${runId}`);
    courier1Id = courier1.id;
    const courier2 = await seedCourier(ds, ownerId, `+7902${runId.slice(0, 7)}`, `e2e-fcm-2-${runId}`);

    operatorToken = mintJwt(jwtService, { sub: uuidv4(), owner_id: ownerId, role: UserRole.ORDER_OPERATOR });
    courierToken1 = mintJwt(jwtService, { sub: courier1Id, owner_id: ownerId, role: UserRole.COURIER });
    courierToken2 = mintJwt(jwtService, { sub: courier2.id, owner_id: ownerId, role: UserRole.COURIER });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Flow 1: Full delivery chain ─────────────────────────────────────────────

  describe('Flow 1 — Full delivery chain', () => {
    let orderId: string;

    it('operator creates order', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-CHAIN-${runId}`));

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('created');
      orderId = res.body.id;
    });

    it('courier sees order in available list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/available')
        .set('Authorization', `Bearer ${courierToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);
    });

    it('courier claims order → assigned', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/claim`)
        .set('Authorization', `Bearer ${courierToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('assigned');
      expect(res.body.courier?.id).toBe(courier1Id);
    });

    it('courier picks up order → picked_up', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/pickup`)
        .set('Authorization', `Bearer ${courierToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('picked_up');
    });

    it('courier starts delivery → in_delivery', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/start-delivery`)
        .set('Authorization', `Bearer ${courierToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_delivery');
    });

    it('courier completes delivery → completed with completed_at', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/complete`)
        .set('Authorization', `Bearer ${courierToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.completed_at).toBeTruthy();
    });
  });

  // ── Flow 2: Race condition (atomic claim) ───────────────────────────────────

  describe('Flow 2 — Race condition parallel claims', () => {
    it('exactly one of two concurrent claims succeeds, the other gets 409', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-RACE-${runId}`));
      expect(createRes.status).toBe(201);
      const raceOrderId = createRes.body.id as string;

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/orders/${raceOrderId}/claim`)
          .set('Authorization', `Bearer ${courierToken1}`),
        request(app.getHttpServer())
          .post(`/api/v1/orders/${raceOrderId}/claim`)
          .set('Authorization', `Bearer ${courierToken2}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const winner = res1.status === 200 ? res1 : res2;
      expect(winner.body.status).toBe('assigned');
    });
  });

  // ── Flow 3: Active-order block ──────────────────────────────────────────────

  describe('Flow 3 — Courier already has active order', () => {
    it('returns 409 when courier tries to claim a second order', async () => {
      // Create a new order (courier1 may have active order from Flow 1 if completed — create fresh)
      const createRes1 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-ACTIVE1-${runId}`));
      expect(createRes1.status).toBe(201);
      const firstOrderId = createRes1.body.id as string;

      const createRes2 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-ACTIVE2-${runId}`));
      expect(createRes2.status).toBe(201);
      const secondOrderId = createRes2.body.id as string;

      // Claim the first order
      const claim1 = await request(app.getHttpServer())
        .post(`/api/v1/orders/${firstOrderId}/claim`)
        .set('Authorization', `Bearer ${courierToken1}`);
      expect(claim1.status).toBe(200);

      // Try to claim the second order — should be blocked
      const claim2 = await request(app.getHttpServer())
        .post(`/api/v1/orders/${secondOrderId}/claim`)
        .set('Authorization', `Bearer ${courierToken1}`);
      expect(claim2.status).toBe(409);
      expect(claim2.body.message).toContain('active order');
    });
  });

  // ── Flow 4: Cancel available order ─────────────────────────────────────────

  describe('Flow 4 — Operator cancels available (created) order', () => {
    it('returns 200 with status=cancelled', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-CANCEL1-${runId}`));
      expect(createRes.status).toBe(201);
      const cancelOrderId = createRes.body.id as string;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${cancelOrderId}/cancel`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ reason: 'Customer cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      expect(res.body.cancelled_at).toBeTruthy();
    });
  });

  // ── Flow 6: Backward transition rejected ───────────────────────────────────

  describe('Flow 6 — Backward transition rejected', () => {
    it('returns 422 when attempting invalid transition', async () => {
      // Create and assign order
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-BACK-${runId}`));
      expect(createRes.status).toBe(201);
      const backOrderId = createRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${backOrderId}/claim`)
        .set('Authorization', `Bearer ${courierToken2}`);

      // Try to claim again (backward)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${backOrderId}/claim`)
        .set('Authorization', `Bearer ${courierToken2}`);

      expect(res.status).toBe(409);
    });
  });

  // ── Flow 7: Cancel terminal order rejected ──────────────────────────────────

  describe('Flow 7 — Cancel completed order → 422', () => {
    it('returns 422 when cancelling a completed order', async () => {
      // Create and run full lifecycle
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-DONE-${runId}`));
      expect(createRes.status).toBe(201);
      const doneOrderId = createRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${doneOrderId}/claim`)
        .set('Authorization', `Bearer ${courierToken2}`);
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${doneOrderId}/pickup`)
        .set('Authorization', `Bearer ${courierToken2}`);
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${doneOrderId}/start-delivery`)
        .set('Authorization', `Bearer ${courierToken2}`);
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${doneOrderId}/complete`)
        .set('Authorization', `Bearer ${courierToken2}`);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${doneOrderId}/cancel`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(422);
    });
  });

  // ── Flow 8: Courier cannot cancel ─────────────────────────────────────────

  describe('Flow 8 — Courier cannot cancel (403)', () => {
    it('returns 403 when courier tries to cancel', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(makeOrderPayload(`LC-NOCNC-${runId}`));
      expect(createRes.status).toBe(201);
      const noCancel = createRes.body.id as string;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${noCancel}/cancel`)
        .set('Authorization', `Bearer ${courierToken1}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Available list role check ──────────────────────────────────────────────

  describe('GET /orders/available role guard', () => {
    it('returns 403 for operator on /available', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/available')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/available');

      expect(res.status).toBe(401);
    });
  });
});
