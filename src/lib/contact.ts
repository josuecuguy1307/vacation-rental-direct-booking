import { getDuena } from "@/lib/panel";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CB } from "@/lib/site-data";
import type { ContactInfo } from "@/components/ContactContext";

/* Contacto público (WhatsApp) tomado de lo que la dueña configura en el panel
   (settings 'duena'.whatsapp; getDuena ya cae a env OWNER_WHATSAPP si está
   vacío). Como último recurso, el valor estático del sitio. Cacheado en
   memoria para no consultar la BD en cada render; nunca rompe el render
   (ante cualquier error devuelve el fallback). */

const FALLBACK: ContactInfo = {
  whatsapp: CB.whatsapp,
  whatsappShow: CB.whatsappShow,
  waMsg: CB.waMsg,
};
const TTL = 60_000; // 1 min — un cambio en el panel se refleja pronto
let cache: { info: ContactInfo; at: number } | null = null;

/* Muestra el número: respeta el formato que escribió la dueña (o al menos antepone "+"). */
function prettyWhatsApp(raw: string, digits: string): string {
  if (raw.includes(" ")) return raw.startsWith("+") ? raw : `+${raw}`;
  return `+${digits}`;
}

export async function getContactInfo(): Promise<ContactInfo> {
  if (cache && Date.now() - cache.at < TTL) return cache.info;
  try {
    const { whatsapp } = await getDuena(supabaseAdmin());
    const raw = (whatsapp ?? "").trim();
    const digits = raw.replace(/\D/g, ""); // wa.me necesita solo dígitos
    const info: ContactInfo = digits
      ? { whatsapp: digits, whatsappShow: prettyWhatsApp(raw, digits), waMsg: CB.waMsg }
      : FALLBACK;
    cache = { info, at: Date.now() };
    return info;
  } catch {
    return FALLBACK;
  }
}
