import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/properties/[slug] — datos públicos de la propiedad. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = supabaseAnon();

  const { data: property, error } = await db
    .from("properties")
    .select(
      "id, slug, name, description, base_price_per_night, weekday_price_cents, weekend_price_cents, extra_guest_price_cents, included_guests, cleaning_fee, max_guests, min_nights, deposit_percentage, location, amenities, images, check_in_time, check_out_time"
    )
    .eq("slug", slug)
    .eq("active", true)
    .single();

  if (error || !property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const [{ data: addons }, { data: reviews }] = await Promise.all([
    db.from("addons")
      .select("id, name, description, price, type, category, image_url")
      .eq("property_id", property.id)
      .eq("active", true)
      .order("price"),
    db.from("reviews")
      .select("guest_name, rating, comment, date")
      .eq("property_id", property.id)
      .eq("status", "published")
      .order("date", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    ...property,
    addons: addons ?? [],
    reviews: reviews ?? [],
  });
}
