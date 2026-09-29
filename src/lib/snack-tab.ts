import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInPropertyTz } from "@/lib/dates";
import { computeSnackOrder, type SnackOrderInput } from "@/lib/snacks-orders";

/* ============================================================
   Snacks como CUENTA (tab) por reserva — Etapa 21.
   Los consumos se ligan a la reserva ACTIVA (una sola a la vez)
   y se acumulan como snack_orders status='pending'. La dueña los
   liquida al final (pending → paid + settled_*) desde el panel.
   ============================================================ */

export type ActiveReservation = { id: string; guest_name: string };
export type TabItem = { nombre: string; precio_unit_cents: number; cantidad: number };

/** La (única) reserva confirmada cuyo rango [check_in, check_out) cubre hoy. */
export async function getActiveReservation(db: SupabaseClient): Promise<ActiveReservation | null> {
  const hoy = todayInPropertyTz();
  const { data } = await db
    .from("reservations")
    .select("id, guest_name")
    .eq("status", "confirmed")
    .lte("check_in", hoy)
    .gt("check_out", hoy)
    .order("check_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveReservation | null) ?? null;
}

/** Esa reserva, SOLO si está confirmada y su rango [check_in, check_out) cubre hoy. */
export async function getActiveReservationById(
  db: SupabaseClient,
  id: string
): Promise<ActiveReservation | null> {
  const hoy = todayInPropertyTz();
  const { data } = await db
    .from("reservations")
    .select("id, guest_name")
    .eq("id", id)
    .eq("status", "confirmed")
    .lte("check_in", hoy)
    .gt("check_out", hoy)
    .maybeSingle();
  return (data as ActiveReservation | null) ?? null;
}

/** Consumos PENDIENTES (tab abierto) de una reserva, agregados por nombre. */
export async function getTab(
  db: SupabaseClient,
  reservationId: string
): Promise<{ items: TabItem[]; total_cents: number }> {
  const { data } = await db
    .from("snack_orders")
    .select("items, total_cents")
    .eq("reservation_id", reservationId)
    .eq("status", "pending");
  const map = new Map<string, TabItem>();
  let total = 0;
  for (const o of (data ?? []) as { items: TabItem[]; total_cents: number }[]) {
    total += o.total_cents;
    for (const it of o.items ?? []) {
      const prev = map.get(it.nombre) ?? {
        nombre: it.nombre, precio_unit_cents: it.precio_unit_cents, cantidad: 0,
      };
      prev.cantidad += it.cantidad;
      map.set(it.nombre, prev);
    }
  }
  return { items: [...map.values()], total_cents: total };
}

/** Total ya liquidado (paid) de snacks de una reserva. */
export async function getSettledTotal(db: SupabaseClient, reservationId: string): Promise<number> {
  const { data } = await db
    .from("snack_orders")
    .select("total_cents")
    .eq("reservation_id", reservationId)
    .eq("status", "paid");
  return ((data ?? []) as { total_cents: number }[]).reduce((s, r) => s + r.total_cents, 0);
}

/** Agrega un consumo al tab de la reserva (precios SIEMPRE del servidor). */
export async function addToTab(
  db: SupabaseClient,
  reservationId: string,
  selections: SnackOrderInput["items"]
): Promise<{ total_cents: number }> {
  const { data: rows } = await db
    .from("addons")
    .select("id, name, price")
    .eq("category", "snack")
    .eq("active", true)
    .in("id", selections.map((s) => s.addon_id));
  const order = computeSnackOrder(selections, rows ?? []); // lanza si algo es inválido
  const { error } = await db.from("snack_orders").insert({
    reservation_id: reservationId,
    items: order.items,
    total_cents: order.total_cents,
    status: "pending",
  });
  if (error) throw new Error("No se pudo agregar a la cuenta");
  return { total_cents: order.total_cents };
}

/** La dueña liquida el tab: pending → paid (+ método/quién/cuándo). Atómico. */
export async function settleTab(
  db: SupabaseClient,
  reservationId: string,
  method: "transfer" | "cash",
  by: string | null
): Promise<{ count: number; total_cents: number }> {
  const { data, error } = await db
    .from("snack_orders")
    .update({
      status: "paid",
      settled_method: method,
      settled_by: by,
      settled_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId)
    .eq("status", "pending")
    .select("total_cents");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { total_cents: number }[];
  return { count: rows.length, total_cents: rows.reduce((s, r) => s + r.total_cents, 0) };
}
