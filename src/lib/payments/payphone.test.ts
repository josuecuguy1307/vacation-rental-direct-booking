import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests de la integración Payphone (Etapa 9 — cajita embebida).
 * Supabase se reemplaza por un fake chainable con estado mutable y fetch se
 * stubea globalmente: nada sale a la red ni toca la DB real.
 */

// ── Fake de supabaseAdmin (estado mutable para verificar updates) ──────────

type FakeRow = Record<string, unknown> & { id: string };

const fakeDb = {
  rows: [] as FakeRow[],          // tabla payments
  reservations: [] as FakeRow[],  // tabla reservations (estado de la reserva)
  insertError: null as { code?: string; message: string } | null,
  nextId: 1,
};

function makeSupabaseFake() {
  return {
    from(table: string) {
      const store = table === "reservations" ? fakeDb.reservations : fakeDb.rows;
      return {
        // `await db.from('payments').insert({...})` → { error }
        insert(values: Record<string, unknown>) {
          if (fakeDb.insertError) {
            return Promise.resolve({ error: fakeDb.insertError });
          }
          store.push({ id: `pay-${fakeDb.nextId++}`, ...values });
          return Promise.resolve({ error: null });
        },
        // `db.from('...').select(...).eq(...).eq(...).single()` → { data }
        select(_cols: string) {
          const filters: Array<[string, unknown]> = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            single() {
              const row = store.find((r) => filters.every(([c, v]) => r[c] === v));
              return Promise.resolve({
                data: row ?? null,
                error: row ? null : { message: "no rows" },
              });
            },
          };
          return chain;
        },
        // `await db.from('payments').update({...}).eq('id', x)` → { error }
        update(values: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              const row = store.find((r) => r[col] === val);
              if (row) Object.assign(row, values);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => makeSupabaseFake(),
}));

import {
  confirmPayphoneTransaction,
  generatePaymentLink,
  newClientTransactionId,
  resolveBoxReturn,
} from "./payphone";

// ── Helpers de fetch ────────────────────────────────────────────────────────

const fetchMock = vi.fn();

/** Respuesta fake con .json() y .text() (suficiente para payphone.ts). */
function fakeResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return fakeResponse(JSON.stringify(body), status);
}

/** Última llamada a fetch: [url, init]. */
function lastFetchCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch no fue llamado");
  return [String(call[0]), (call[1] ?? {}) as RequestInit];
}

const RESERVATION_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const CONFIRM_URL = "https://paymentbox.payphonetodoesposible.com/api/confirm";
const LINKS_URL = "https://pay.payphonetodoesposible.com/api/Links";

beforeEach(() => {
  process.env.PAYPHONE_TOKEN = "tok-servidor-test";
  process.env.PAYPHONE_STORE_ID = "store-test-1";
  delete process.env.PAYPHONE_CONFIRM_URL;
  fakeDb.rows = [];
  fakeDb.reservations = [];
  fakeDb.insertError = null;
  fakeDb.nextId = 1;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── newClientTransactionId ──────────────────────────────────────────────────

describe("newClientTransactionId", () => {
  it("genera EXACTAMENTE 15 chars: 'CB' + 8 del uuid en mayúsculas + '-' + 4", () => {
    const id = newClientTransactionId(RESERVATION_UUID);
    expect(id).toHaveLength(15);
    // prefijo: CB + primeros 8 hex del uuid (sin guiones) en MAYÚSCULAS
    expect(id.startsWith("CBA1B2C3D4")).toBe(true);
    // guion en la posición 10
    expect(id[10]).toBe("-");
    // sufijo aleatorio [0-9A-Z]{4}
    expect(id.slice(11)).toMatch(/^[0-9A-Z]{4}$/);
    // formato completo
    expect(id).toMatch(/^CB[0-9A-F]{8}-[0-9A-Z]{4}$/);
  });

  it("200 llamadas producen ids mayoritariamente únicos", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(newClientTransactionId(RESERVATION_UUID));
    // espacio de 36^4 sufijos: colisiones casi imposibles en 200 intentos
    expect(ids.size).toBeGreaterThan(190);
  });
});

// ── confirmPayphoneTransaction ──────────────────────────────────────────────

describe("confirmPayphoneTransaction", () => {
  it("statusCode 3 → approved true + transactionId como string; request correcto", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 3, transactionStatus: "Approved", transactionId: 98765, amount: 9000 })
    );

    const r = await confirmPayphoneTransaction(777, "CBA1B2C3D4-XY99");

    expect(r.httpOk).toBe(true);
    expect(r.approved).toBe(true);
    expect(r.statusCode).toBe(3);
    expect(r.transactionId).toBe("98765"); // siempre string
    expect(r.amount).toBe(9000);

    // el fetch fue un POST con Bearer del SERVIDOR y body { id, clientTxId }
    const [url, init] = lastFetchCall();
    expect(url).toBe(CONFIRM_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-servidor-test");
    expect(JSON.parse(String(init.body))).toEqual({ id: 777, clientTxId: "CBA1B2C3D4-XY99" });
  });

  it("statusCode 2 (cancelada) → approved false", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 2, transactionStatus: "Canceled", transactionId: 111 })
    );
    const r = await confirmPayphoneTransaction(778, "CBA1B2C3D4-AA11");
    expect(r.httpOk).toBe(true);
    expect(r.approved).toBe(false);
    expect(r.statusCode).toBe(2);
  });

  it("HTTP 401 → httpOk false y approved false", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401));
    const r = await confirmPayphoneTransaction(779, "CBA1B2C3D4-BB22");
    expect(r.httpOk).toBe(false);
    expect(r.approved).toBe(false);
  });
});

// ── generatePaymentLink ─────────────────────────────────────────────────────

describe("generatePaymentLink", () => {
  const LONG_REFERENCE = "x".repeat(150);

  it("arma el POST a /api/Links correcto y devuelve la URL (texto plano)", async () => {
    fetchMock.mockResolvedValue(fakeResponse("https://payp.page.link/abcd"));

    const { link, clientTransactionId } = await generatePaymentLink(9000, LONG_REFERENCE, RESERVATION_UUID);
    expect(link).toBe("https://payp.page.link/abcd");
    expect(clientTransactionId).toMatch(/^CB/);

    const [url, init] = lastFetchCall();
    expect(url).toBe(LINKS_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-servidor-test");

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.oneTime).toBe(true);
    expect(body.expireIn).toBe(48);
    expect(body.amount).toBe(9000);
    expect(body.amount).toBe(body.amountWithoutTax); // amount = suma de desgloses
    expect(body.currency).toBe("USD");
    expect(body.storeId).toBe("store-test-1");
    expect(String(body.clientTransactionId).length).toBeLessThanOrEqual(15);
    expect(String(body.reference)).toHaveLength(100); // truncada a 100
  });

  it("acepta la respuesta como string JSON con comillas y la limpia", async () => {
    fetchMock.mockResolvedValue(fakeResponse('"https://payp.page.link/x"'));
    const { link } = await generatePaymentLink(5000, "Anticipo Mi Casa", RESERVATION_UUID);
    expect(link).toBe("https://payp.page.link/x");
  });

  it("registra el intento ANTES del POST y guarda el link en raw_response", async () => {
    fetchMock.mockResolvedValue(fakeResponse("https://payp.page.link/ok1"));
    await generatePaymentLink(7500, "ref", RESERVATION_UUID);

    const row = fakeDb.rows.find((r) => r.method === "link");
    expect(row).toBeTruthy();
    expect(row?.provider).toBe("payphone");
    expect(row?.amount_cents).toBe(7500);
    expect(row?.status).toBe("initiated");
    expect((row?.raw_response as { link?: string })?.link).toBe("https://payp.page.link/ok1");
  });

  it("HTTP 400 → lanza y el intento queda auditado como 'error'", async () => {
    fetchMock.mockResolvedValue(fakeResponse('{"message":"bad request"}', 400));
    await expect(generatePaymentLink(5000, "ref", RESERVATION_UUID)).rejects.toThrow(/Payphone Links 400/);
    // la fila se insertó ANTES del POST y quedó marcada como error
    const row = fakeDb.rows.find((r) => r.method === "link");
    expect(row?.status).toBe("error");
  });

  it("si el insert en payments falla → lanza SIN llamar al API de Links", async () => {
    fakeDb.insertError = { message: "db down" };
    await expect(generatePaymentLink(5000, "ref", RESERVATION_UUID)).rejects.toThrow(/registrar el intento/);
    expect(fetchMock).not.toHaveBeenCalled(); // ningún link vivo sin auditoría
  });

  it("sin PAYPHONE_STORE_ID el body NO lleva storeId (tienda default de la app)", async () => {
    delete process.env.PAYPHONE_STORE_ID;
    fetchMock.mockResolvedValue(fakeResponse("https://payp.page.link/sin-store"));
    await generatePaymentLink(5000, "ref", RESERVATION_UUID);
    const [, init] = lastFetchCall();
    expect("storeId" in JSON.parse(String(init.body))).toBe(false);
  });

  it("respuesta sin http:// → lanza", async () => {
    fetchMock.mockResolvedValue(fakeResponse("ok"));
    await expect(generatePaymentLink(5000, "ref", RESERVATION_UUID)).rejects.toThrow(/inesperada/);
  });

  it("amountCents no entero o ≤ 0 → lanza sin llamar a fetch", async () => {
    await expect(generatePaymentLink(50.5, "ref", RESERVATION_UUID)).rejects.toThrow(/entero positivo/);
    await expect(generatePaymentLink(0, "ref", RESERVATION_UUID)).rejects.toThrow(/entero positivo/);
    await expect(generatePaymentLink(-100, "ref", RESERVATION_UUID)).rejects.toThrow(/entero positivo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── resolveBoxReturn ────────────────────────────────────────────────────────

/** Siembra un intento en el fake db tal como lo registra preparePayphoneBox. */
function seedPayment(overrides: Partial<FakeRow> = {}): FakeRow {
  const row: FakeRow = {
    id: "pay-seed-1",
    reservation_id: "res-0001",
    provider: "payphone",
    method: "box",
    amount_cents: 9000,
    currency: "USD",
    status: "initiated",
    client_transaction_id: "CBA1B2C3D4-ZZ99", // 15 chars
    ...overrides,
  };
  fakeDb.rows.push(row);
  return row;
}

/** Siembra la reserva del intento (resolveBoxReturn la verifica antes de confirmar). */
function seedReservation(overrides: Partial<FakeRow> = {}): FakeRow {
  const row: FakeRow = {
    id: "res-0001",
    status: "pending",
    payment_status: "unpaid",
    ...overrides,
  };
  fakeDb.reservations.push(row);
  return row;
}

describe("resolveBoxReturn", () => {
  it("params inválidos → invalid (sin tocar fetch)", async () => {
    expect(await resolveBoxReturn({ id: null, clientTransactionId: "CBA1B2C3D4-ZZ99" })).toEqual({ kind: "invalid" });
    expect(await resolveBoxReturn({ id: "abc", clientTransactionId: "CBA1B2C3D4-ZZ99" })).toEqual({ kind: "invalid" });
    expect(await resolveBoxReturn({ id: "123", clientTransactionId: null })).toEqual({ kind: "invalid" });
    expect(await resolveBoxReturn({ id: "123", clientTransactionId: "X".repeat(16) })).toEqual({ kind: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clientTransactionId no registrado → unknown", async () => {
    const r = await resolveBoxReturn({ id: "123", clientTransactionId: "CBNOEXISTE-0000" });
    expect(r).toEqual({ kind: "unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("intento ya approved → already_approved SIN reconfirmar contra Payphone", async () => {
    seedPayment({ status: "approved" });
    const r = await resolveBoxReturn({ id: "123", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r).toEqual({ kind: "already_approved", reservationId: "res-0001" });
    expect(fetchMock).not.toHaveBeenCalled(); // idempotencia: nada que confirmar
  });

  it("confirm aprobada → approved + WebhookEvent y update del intento", async () => {
    const row = seedPayment();
    seedReservation();
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 3, transactionStatus: "Approved", transactionId: 55501, amount: 9000 })
    );

    const r = await resolveBoxReturn({ id: "55501", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r.kind).toBe("approved");
    if (r.kind !== "approved") return;
    expect(r.reservationId).toBe("res-0001");
    // evento listo para processPaymentEvent, idempotente por transacción
    expect(r.event.eventId).toBe("box:55501");
    expect(r.event.type).toBe("payment.succeeded");
    expect(r.event.reservationId).toBe("res-0001");
    expect(r.event.providerRef).toBe("55501");
    // el intento quedó auditado en payments
    expect(row.status).toBe("approved");
    expect(row.transaction_id).toBe("55501");
    expect(row.confirmed_at).toBeTruthy();
  });

  it("monto de Payphone distinto a amount_cents → error y status 'error'", async () => {
    const row = seedPayment({ amount_cents: 9000 });
    seedReservation();
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 3, transactionStatus: "Approved", transactionId: 55502, amount: 100 })
    );

    const r = await resolveBoxReturn({ id: "55502", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r).toEqual({ kind: "error", reservationId: "res-0001" });
    expect(row.status).toBe("error"); // defensa de monto: queda auditado como error
  });

  it("statusCode 2 (cancelada) → rejected y status 'rejected'", async () => {
    const row = seedPayment();
    seedReservation();
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 2, transactionStatus: "Canceled", transactionId: 55503 })
    );

    const r = await resolveBoxReturn({ id: "55503", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r).toEqual({ kind: "rejected", reservationId: "res-0001" });
    expect(row.status).toBe("rejected"); // la reserva puede reintentar el pago
  });

  it("reserva YA pagada por otro medio → stale/paid SIN confirmar (Payphone reversa solo)", async () => {
    const row = seedPayment();
    seedReservation({ status: "confirmed", payment_status: "paid" });

    const r = await resolveBoxReturn({ id: "55504", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r).toEqual({ kind: "stale", reservationId: "res-0001", reason: "paid" });
    // sin Confirm no hay captura: el doble cobro se reversa automáticamente
    expect(fetchMock).not.toHaveBeenCalled();
    expect(row.status).toBe("rejected"); // intento auditado como superseded
  });

  it("reserva cancelada/expirada → stale/cancelled SIN confirmar", async () => {
    const row = seedPayment();
    seedReservation({ status: "cancelled" });

    const r = await resolveBoxReturn({ id: "55505", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r).toEqual({ kind: "stale", reservationId: "res-0001", reason: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(row.status).toBe("rejected");
  });

  it("intento sin reserva (anomalía) → error sin confirmar", async () => {
    seedPayment(); // sin seedReservation
    const r = await resolveBoxReturn({ id: "55506", clientTransactionId: "CBA1B2C3D4-ZZ99" });
    expect(r).toEqual({ kind: "error", reservationId: "res-0001" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
