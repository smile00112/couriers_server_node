/**
 * E2E tests for the Work Shift Management API.
 *
 * Prerequisites: PostgreSQL + Redis must be running and all migrations applied.
 * Run with: pnpm test:e2e
 *
 * Mirrors quickstart.md Flows 1–10.
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
     VALUES ('Shift E2E Owner', 'shift-e2e@example.com', 300.00)
     ON CONFLICT (email) DO UPDATE SET default_delivery_fee = 300.00
     RETURNING id`,
  );
  return rows[0];
}

async function seedCourier(
  ds: DataSource,
  ownerId: string,
  phone: string,
): Promise<{ id: string }> {
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO couriers (owner_id, first_name, last_name, phone, status)
     VALUES ($1, 'Shift', 'Courier', $2, 'unavailable')
     ON CONFLICT (owner_id, phone) DO UPDATE SET status = 'unavailable'
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
): Promise<{ id: string }> {
  const clientRows: { id: string }[] = await ds.query(
    `INSERT INTO clients (owner_id, phone) VALUES ($1, '+79007770001')
     ON CONFLICT (owner_id, phone) DO UPDATE SET phone = '+79007770001'
     RETURNING id`,
    [ownerId],
  );
  const clientId = clientRows[0].id;
  const rows: { id: string }[] = await ds.query(
    `INSERT INTO orders (owner_id, client_id, operator_id, order_number, status,
                          pickup_address, pickup_lat, pickup_lng,
                          dropoff_address, dropoff_lat, dropoff_lng,
                          delivery_fee)
     VALUES ($1, $2, $3, $4, 'created', 'Pickup St 1', 55.7558, 37.6173,
             'Dropoff Ave 2', 55.789, 37.64, 300.00)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ownerId, clientId, operatorId, orderNumber],
  );
  return rows[0];
}

async function cleanupShifts(ds: DataSource, courierId: string): Promise<void> {
  await ds.query(
    "UPDATE couriers SET status = 'unavailable' WHERE id = $1",
    [courierId],
  );
  await ds.query(
    "DELETE FROM courier_shifts WHERE courier_id = $1",
    [courierId],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Shift Management E2E', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  let ownerId: string;
  let courierId1: string;
  let courierId2: string;
  let operatorId: string;
  let courier1Token: string;
  let courier2Token: string;
  let operatorToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    ds = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    const owner = await seedOwner(ds);
    ownerId = owner.id;

    const opRows: { id: string }[] = await ds.query(
      `INSERT INTO owners (name, email, default_delivery_fee)
       VALUES ('Shift Op', 'shift-op@example.com', 300.00)
       ON CONFLICT (email) DO UPDATE SET name = 'Shift Op'
       RETURNING id`,
    );
    operatorId = opRows[0].id;
    operatorToken = mintJwt(jwtService, {
      sub: operatorId,
      owner_id: ownerId,
      role: UserRole.ORDER_OPERATOR,
    });

    const c1 = await seedCourier(ds, ownerId, '+79001110001');
    courierId1 = c1.id;
    const c2 = await seedCourier(ds, ownerId, '+79001110002');
    courierId2 = c2.id;

    courier1Token = mintJwt(jwtService, { sub: courierId1, owner_id: ownerId, role: UserRole.COURIER });
    courier2Token = mintJwt(jwtService, { sub: courierId2, owner_id: ownerId, role: UserRole.COURIER });
  });

  afterAll(async () => {
    await cleanupShifts(ds, courierId1);
    await cleanupShifts(ds, courierId2);
    await app.close();
  });

  // Flow 1 — Courier opens a shift
  describe('Flow 1 — Open shift', () => {
    it('POST /couriers/shift/open → 201 with status=open', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/open')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(201);

      expect(res.body.status).toBe('open');
      expect(res.body.courier_id).toBe(courierId1);
      expect(res.body.ended_at).toBeNull();
      expect(res.body.duration_minutes).toBeNull();
    });

    it('POST /couriers/shift/open (duplicate) → 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/open')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(409);
    });
  });

  // Flow 2 — Courier checks current shift
  describe('Flow 2 — Get current shift', () => {
    it('GET /couriers/shift/current → 200 with open shift', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/couriers/shift/current')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(200);

      expect(res.body.status).toBe('open');
      expect(res.body.ended_at).toBeNull();
    });

    it('GET /couriers/shift/current (no shift) → 200 with null', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/couriers/shift/current')
        .set('Authorization', `Bearer ${courier2Token}`)
        .expect(200);

      expect(res.body).toBeNull();
    });
  });

  // Flow 3 — Order claim blocked without open shift
  describe('Flow 3 — Claim blocked without shift', () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await seedOrder(ds, ownerId, operatorId, 'SHIFT-E2E-001');
      orderId = order.id;
    });

    it('POST /orders/:id/claim (courier2, no shift) → 422', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/claim`)
        .set('Authorization', `Bearer ${courier2Token}`)
        .expect(422)
        .expect((res) => {
          expect(res.body.message).toBe('Courier does not have an open shift');
        });
    });

    // Flow 4 — Order claim succeeds with open shift
    it('POST /orders/:id/claim (courier1, has shift) → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/claim`)
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(200);

      expect(res.body.status).toBe('assigned');
    });
  });

  // Flow 5 — Courier closes shift
  describe('Flow 5 — Close shift', () => {
    it('POST /couriers/shift/close → 200 with ended_at and duration_minutes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/close')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(200);

      expect(res.body.status).toBe('closed');
      expect(res.body.ended_at).not.toBeNull();
      expect(typeof res.body.duration_minutes).toBe('number');
    });
  });

  // Flow 6 — Duplicate open / premature close rejected
  describe('Flow 6 — Conflict guards', () => {
    it('POST /couriers/shift/close (no open shift) → 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/close')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(409);
    });

    it('POST /couriers/shift/open → reopen courier1', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/open')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(201);
    });

    it('POST /couriers/shift/open (duplicate) → 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/open')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(409);
    });
  });

  // Flow 7 — Staff views shift history for a courier
  describe('Flow 7 — Staff: courier shift history', () => {
    it('GET /couriers/:id/shifts → 200 paginated with closed shifts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/couriers/${courierId1}/shifts?page=1&limit=10`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /couriers/:id/shifts (cross-tenant) → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/couriers/00000000-0000-0000-0000-000000000000/shifts`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(404);
    });

    it('GET /couriers/:id/shifts (courier token) → 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/couriers/${courierId1}/shifts`)
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(403);
    });
  });

  // Flow 8 — Staff views all active shifts
  describe('Flow 8 — Staff: active shifts', () => {
    beforeAll(async () => {
      // Ensure courier2 has an open shift
      await request(app.getHttpServer())
        .post('/api/v1/couriers/shift/open')
        .set('Authorization', `Bearer ${courier2Token}`);
    });

    it('GET /couriers/active-shifts → 200 with open shifts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/couriers/active-shifts')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);
      const names: string[] = res.body.data.map((d: { courier_name: string }) => d.courier_name);
      expect(names.some((n) => n.includes('Shift'))).toBe(true);
    });

    it('GET /couriers/active-shifts (courier token) → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/couriers/active-shifts')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(403);
    });
  });

  // Flow 10 — Courier views own shift history
  describe('Flow 10 — Courier: own shift history', () => {
    it('GET /couriers/shift/history → 200 paginated list newest first', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/couriers/shift/history?page=1&limit=20')
        .set('Authorization', `Bearer ${courier1Token}`)
        .expect(200);

      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.data)).toBe(true);
      const closed = res.body.data.filter((s: { status: string }) => s.status === 'closed');
      closed.forEach((s: { duration_minutes: number }) => {
        expect(typeof s.duration_minutes).toBe('number');
      });
    });
  });
});
