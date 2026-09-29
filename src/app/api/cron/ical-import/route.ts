import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseIcalFeed } from "@/lib/ical";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/ical-import — importa los .ics de Airbnb/Booking registrados
 * en ical_feeds y hace upsert en ical_blocks (clave: property+source+uid).
 * Elimina los bloqueos de cada feed que ya no aparecen (cancelaciones en la OTA).
 *
 * Protegido con CRON_SECRET (header Authorization: Bearer <CRON_SECRET>),
 * compatible con Vercel Cron. Configurar en vercel.json:
 *   { "crons": [{ "path": "/api/cron/ical-import", "schedule": "0 *\/2 * * *" }] }
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: feeds } = await db
    .from("ical_feeds")
    .select("id, property_id, source, url")
    .eq("active", true);

  const results: Array<{ source: string; imported?: number; removed?: number; error?: string }> = [];

  for (const feed of feeds ?? []) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": `${SITE.slug}-iCal-Sync/1.0` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const events = parseIcalFeed(await res.text());

      // upsert de los eventos actuales
      if (events.length) {
        const { error: upsertErr } = await db.from("ical_blocks").upsert(
          events.map((ev) => ({
            property_id: feed.property_id,
            source: feed.source,
            uid: ev.uid,
            start_date: ev.start,
            end_date: ev.end,
            summary: ev.summary ?? null,
          })),
          { onConflict: "property_id,source,uid" }
        );
        if (upsertErr) throw new Error(upsertErr.message);
      }

      // eliminar bloqueos de este feed que ya no existen (liberados en la OTA)
      const currentUids = events.map((e) => e.uid);
      let removed = 0;
      const deleteQuery = db
        .from("ical_blocks")
        .delete({ count: "exact" })
        .eq("property_id", feed.property_id)
        .eq("source", feed.source);
      const { count } = currentUids.length
        ? await deleteQuery.not("uid", "in", `(${currentUids.map((u) => `"${u}"`).join(",")})`)
        : await deleteQuery;
      removed = count ?? 0;

      await db
        .from("ical_feeds")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", feed.id);

      results.push({ source: feed.source, imported: events.length, removed });
    } catch (e) {
      console.error(`[ical-import] feed ${feed.source} falló:`, e);
      results.push({ source: feed.source, error: (e as Error).message });
    }
  }

  return NextResponse.json({ synced_at: new Date().toISOString(), feeds: results });
}
