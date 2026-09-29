import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeasonRow } from "@/lib/pricing";

/**
 * Seasons de la propiedad que tocan el rango de noches [from, to).
 * Mismo predicado de solapamiento en todas las rutas: una season con
 * [date_start, date_end) toca el rango si date_start < to y date_end > from.
 */
export async function fetchSeasonsForRange(
  db: SupabaseClient,
  propertyId: string,
  from: string,
  to: string
): Promise<SeasonRow[]> {
  const { data, error } = await db
    .from("seasons")
    .select("id, name, date_start, date_end, weekday_price_cents, weekend_price_cents, priority")
    .eq("property_id", propertyId)
    .lt("date_start", to)
    .gt("date_end", from);
  if (error) throw new Error(`No se pudieron leer las temporadas: ${error.message}`);
  return (data ?? []).map((s) => ({
    ...s,
    weekday_price_cents: Number(s.weekday_price_cents),
    weekend_price_cents: Number(s.weekend_price_cents),
    priority: Number(s.priority),
  }));
}
