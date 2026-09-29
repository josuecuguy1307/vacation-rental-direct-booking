/* ============================================================
   BUSINESS IDENTITY — the one file you edit to customize the
   name, contact details, location and brand texts.

   Every value below is a generic EXAMPLE: replace it with your own
   before publishing. Secrets and keys do NOT go here (they go in
   .env.local — see .env.example and the README).

   This file is also imported from browser components:
   never put anything private in it.
   ============================================================ */

export const SITE = {
  /** Business name: header, emails, PDF receipts, page titles. */
  name: "Mi Casa Vacacional",
  /** Short phrase under the logo / on the home page. */
  tagline: "Tu refugio para descansar.",
  /** Search-engine description (meta description). */
  description:
    "Casa vacacional de alquiler con reservas directas. Reserva en línea, sin intermediarios.",
  /** Technical slug of the property (API URL and row of the `properties` table).
   *  Must match the `slug` in supabase/seed.sql. */
  slug: "mi-casa",
  /** Booking-code prefix the guest sees (e.g. RES-1A2B3C4D). */
  bookingCodePrefix: "RES",

  /* ── Location ── */
  /** Short line under the logo: "City · Region · Country". */
  location: "Tu Ciudad · Tu Región · Tu País",
  /** Human-readable address (footer, receipts). */
  address: "Calle Ejemplo 123 · Tu Ciudad",
  /** City/area used in sentences: "A few minutes from the center of {cityLabel}". */
  cityLabel: "tu ciudad",
  /** The property's IANA time zone: defines when "today" starts for active
   *  bookings, messages and snacks. E.g. "America/Bogota", "Europe/Madrid". */
  timezone: "UTC",
  /** Language/region for formatting dates and amounts ("es-MX", "es-CO", "es-ES"…). */
  locale: "es-MX",
  /** Country code (no "+") used to complete a local phone number that starts with 0. */
  phoneCountryCode: "52",
  /** Country preselected in the booking form, and phone prefix. */
  defaultCountry: "México",
  defaultPhonePrefix: "+52 ",
  phonePlaceholder: "+52 55 0000 0000",
  /** Short Google Maps link to your property ("How to get there" button). */
  mapsUrl: "https://maps.google.com/?q=Z%C3%B3calo+Ciudad+de+M%C3%A9xico",
  /** Text used to center the embedded map (your listing name + city).
   *  The example value points at a public landmark: REPLACE IT. */
  mapsQuery: "Zócalo, Ciudad de México",
  /** Fallback map coordinates. */
  lat: 0,
  lng: 0,
  zoom: 14,

  /* ── Public contact (shown on the site and in emails) ── */
  /** Host WhatsApp: digits only, with country code, no "+". */
  whatsapp: "000000000000",
  /** How that number is displayed. */
  whatsappDisplay: "+00 000 000 000",
  /** Pre-filled message when opening WhatsApp from the site. */
  whatsappMessage: "Hola, quisiera saber más sobre la casa",
  /** Instagram username without "@" (empty = not shown). */
  instagram: "tu_cuenta",
  /** URL of your Facebook page (empty = not shown). */
  facebook: "",
  /** Public contact email (footer and receipts). */
  email: "reservas@example.com",

  /* ── FALLBACK values for the booking form ──
     Only shown while the database loads or if the API does not respond. The REAL
     figures (seasonal prices, limits, deposit) live in the `properties` / `seasons`
     tables (see supabase/seed.sql and the admin panel). */
  fallback: {
    nightlyPrice: 100,        // USD per night (base price)
    cleaningFee: 20,          // service fee
    depositPct: 1,            // fraction paid to confirm (1 = full payment)
    minNights: 2,
    includedGuests: 4,        // covered by the base price
    extraGuestPerNight: 20,   // USD per extra guest per night
    maxGuests: 8,
  },

  /* ── Message tone ── */
  /** Email signature: "{hostSignature} de {name}". */
  hostSignature: "Tus anfitriones",
} as const;

export type SiteConfig = typeof SITE;
