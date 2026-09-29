import { describe, expect, it } from "vitest";
import { isSnackCtid, newClientTransactionId } from "@/lib/payments/payphone";
import { computeSnackOrder, markOrderPaid, snackOrderSchema } from "./snacks-orders";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "99999999-8888-4777-8666-555555555555";

const ROWS = [
  { id: UUID_A, name: "Pringles", price: 1.5 },
  { id: UUID_B, name: "Nutella & Go", price: 2.5 },
];

describe("computeSnackOrder — el total SIEMPRE sale del servidor", () => {
  it("calcula items y total con precios de la DB", () => {
    const { items, total_cents } = computeSnackOrder(
      [{ addon_id: UUID_A, cantidad: 3 }, { addon_id: UUID_B, cantidad: 1 }],
      ROWS
    );
    expect(total_cents).toBe(3 * 150 + 250);
    expect(items[0]).toEqual({ addon_id: UUID_A, nombre: "Pringles", precio_unit_cents: 150, cantidad: 3 });
  });

  it("precios manipulados por el cliente se IGNORAN (el schema solo deja pasar id+cantidad)", () => {
    const malicioso = {
      items: [{ addon_id: UUID_A, cantidad: 2, precio_unit_cents: 1, price: 0.01, total: 0.02 }],
    };
    const parsed = snackOrderSchema.safeParse(malicioso);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // zod elimina los campos extra: al computar solo cuenta la DB
    expect("precio_unit_cents" in parsed.data.items[0]).toBe(false);
    const { total_cents } = computeSnackOrder(parsed.data.items, ROWS);
    expect(total_cents).toBe(300); // 2 × $1.50 de la DB, no $0.02
  });

  it("addon desconocido/inactivo → rechazado; carrito vacío → rechazado", () => {
    expect(() =>
      computeSnackOrder([{ addon_id: "00000000-0000-4000-8000-000000000000", cantidad: 1 }], ROWS)
    ).toThrow(/no está disponible/);
    expect(snackOrderSchema.safeParse({ items: [] }).success).toBe(false);
    expect(snackOrderSchema.safeParse({ items: [{ addon_id: UUID_A, cantidad: 25 }] }).success).toBe(false);
  });
});

describe("prefijos CB/SN — ruteo del retorno de la cajita", () => {
  it("reserva = CB…, snacks = SN…, ambos de 15 chars", () => {
    const cb = newClientTransactionId(UUID_A);
    const sn = newClientTransactionId(UUID_A, "SN");
    expect(cb.startsWith("CB")).toBe(true);
    expect(sn.startsWith("SN")).toBe(true);
    expect(cb).toHaveLength(15);
    expect(sn).toHaveLength(15);
  });

  it("isSnackCtid distingue los prefijos", () => {
    expect(isSnackCtid("SN11111122-AB12")).toBe(true);
    expect(isSnackCtid("CB11111122-AB12")).toBe(false);
    expect(isSnackCtid(null)).toBe(false);
    expect(isSnackCtid("")).toBe(false);
  });
});

describe("markOrderPaid — doble confirmación no duplica recibo", () => {
  /** Fake mínimo: update().eq().eq().select() con transición condicional. */
  function fakeDb(order: { id: string; status: string }) {
    return {
      from: () => ({
        update: (values: Record<string, unknown>) => {
          const filters: Array<[string, unknown]> = [];
          const chain = {
            eq(col: string, val: unknown) { filters.push([col, val]); return chain; },
            select() {
              const matches = filters.every(([c, v]) =>
                c === "id" ? order.id === v : c === "status" ? order.status === v : true
              );
              if (matches) {
                Object.assign(order, values);
                return Promise.resolve({ data: [{ id: order.id }], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
          return chain;
        },
      }),
    } as unknown as SupabaseClient;
  }

  it("la primera confirmación transiciona (true); la segunda NO (false)", async () => {
    const order = { id: "ord-1", status: "pending" };
    const db = fakeDb(order);
    const primera = await markOrderPaid(db, "ord-1", { email: "ana@mail.com" });
    expect(primera).toBe(true);            // → aquí se dispara recibo + WhatsApp
    expect(order.status).toBe("paid");
    const segunda = await markOrderPaid(db, "ord-1", { email: "ana@mail.com" });
    expect(segunda).toBe(false);           // recarga del retorno: sin duplicados
  });
});
