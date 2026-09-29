import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/server";
import { suggestDisplayName, verifyReviewToken } from "@/lib/reviews";
import { todayInPropertyTz } from "@/lib/dates";
import { ReviewForm } from "@/components/ReviewForm";
import { SITE } from "@/config/site.config";

/**
 * /resena/[token] — evaluación de la estadía (Etapa 14, estilo Airbnb).
 * El token firmado identifica la reserva: solo quien se hospedó lo recibe
 * (mensaje "después de la salida" del timeline). noindex: página privada.
 */
export const metadata: Metadata = {
  title: `Evalúa tu estadía · ${SITE.name}`,
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="resena-page">
      <div className="snacks-top">
        <img src="/assets/logo-white.png" alt={`${SITE.name}`} />
        <span>{SITE.location}</span>
      </div>
      <section className="section">
        <div className="wrap wrap--narrow">{children}</div>
      </section>
      <footer className="snacks-foot">
        <span>{SITE.name} · {SITE.location}</span>
      </footer>
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="resena-notice">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let reservationId: string | null = null;
  try {
    reservationId = verifyReviewToken(token);
  } catch {
    reservationId = null; // secret no configurado
  }
  if (!reservationId) {
    return (
      <Shell>
        <Notice
          title="Este link no es válido"
          text="El link de evaluación no es correcto o está incompleto. Revisa el mensaje que te enviamos después de tu estadía, o escríbenos por WhatsApp."
        />
      </Shell>
    );
  }

  const db = supabaseAdmin();
  const { data: reservation } = await db
    .from("reservations")
    .select("id, guest_name, status, check_in, check_out")
    .eq("id", reservationId)
    .single();

  if (!reservation || !["confirmed", "completed"].includes(reservation.status)) {
    return (
      <Shell>
        <Notice
          title="No encontramos tu reserva"
          text="Este link no corresponde a una estadía activa. Si crees que es un error, escríbenos por WhatsApp."
        />
      </Shell>
    );
  }

  // token de un solo uso en la práctica: si ya hay reseña, gracias y listo
  const { data: existing } = await db
    .from("reviews")
    .select("id, status")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (existing) {
    return (
      <Shell>
        <Notice
          title="Ya dejaste tu evaluación — ¡gracias! 🌿"
          text="Tu opinión nos ayuda muchísimo. La revisamos y la publicamos muy pronto. ¡Esperamos verte de nuevo!"
        />
      </Shell>
    );
  }

  if (reservation.check_out > todayInPropertyTz()) {
    return (
      <Shell>
        <Notice
          title="Tu evaluación se habilita después de tu salida"
          text="Disfruta tu estadía — al hacer el check-out podrás contarnos cómo te fue desde este mismo link."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <ReviewForm
        token={token}
        suggestedName={suggestDisplayName(reservation.guest_name)}
        checkIn={reservation.check_in}
        checkOut={reservation.check_out}
      />
    </Shell>
  );
}
