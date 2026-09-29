import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildIcalFeed } from "@/lib/ical";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * GET /api/ical/[property].ics — feed de reservas confirmadas para que
 * Airbnb/Booking lo importen y bloqueen esas fechas allá.
 * Acepta el slug con o sin extensión .ics.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ property: string }> }
) {
  const { property } = await params;
  const slug = property.replace(/\.ics$/i, "");

  const db = supabaseAdmin();
  const { data: prop } = await db
    .from("properties")
    .select("id, name")
    .eq("slug", slug)
    .single();
  if (!prop) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const { data: reservations } = await db
    .from("reservations")
    .select("id, check_in, check_out")
    .eq("property_id", prop.id)
    .eq("status", "confirmed")
    .gte("check_out", new Date().toISOString().slice(0, 10))
    .order("check_in");

  const ics = buildIcalFeed(
    prop.name,
    (reservations ?? []).map((r) => ({
      uid: `${r.id}@${SITE.slug}`,
      start: r.check_in,
      end: r.check_out,
      summary: "Reservado (web directa)",
    }))
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
