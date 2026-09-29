import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

/**
 * Simulador del gateway de Banco Pichincha — SOLO con
 * PICHINCHA_STUB_MODE=true (modo simulador sin credenciales).
 * Permite probar el flujo completo redirección → callback → confirmación
 * sin credenciales reales. Los botones llevan al callback con firma HMAC,
 * igual que lo haría la verificación real.
 */
export default async function SimuladorPago({
  searchParams,
}: {
  searchParams: Promise<{ rid?: string; amount?: string; desc?: string; sig?: string }>;
}) {
  const { rid, amount, desc, sig } = await searchParams;
  const secret = process.env.INTERNAL_WEBHOOK_SECRET ?? "";
  const enabled = process.env.PICHINCHA_STUB_MODE === "true";

  const expected = rid && amount
    ? createHmac("sha256", secret).update(`${rid}|${amount}`).digest("hex")
    : null;
  const valid = enabled && rid && amount && sig && expected === sig;

  if (!valid) {
    return (
      <main style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Pago no disponible</h1>
          <p style={{ color: "#666" }}>El enlace de pago es inválido o el simulador está desactivado.</p>
        </div>
      </main>
    );
  }

  // id único por intento, como lo haría el gateway real (permite reintentos
  // tras un pago cancelado sin chocar con la idempotencia de payment_events)
  const txId = `stub-${crypto.randomUUID().slice(0, 13)}`;
  const sign = (status: string) =>
    createHmac("sha256", secret).update(`${rid}|${txId}|${status}`).digest("hex");
  const cb = (status: string) =>
    `/api/payments/pichincha/callback?rid=${rid}&tx=${txId}&status=${status}&sig=${sign(status)}`;

  return (
    <main style={wrap}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={logo}>BP</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Banco Pichincha</div>
            <div style={{ fontSize: 12, color: "#888" }}>Botón de pagos · SIMULADOR</div>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "18px 0" }} />
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "#666" }}>{desc}</p>
        <p style={{ margin: 0, fontSize: 34, fontWeight: 800, color: "#0F265C" }}>${amount}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
          <a href={cb("approved")} style={{ ...btn, background: "#FFDD00", color: "#0F265C" }}>
            Aprobar pago
          </a>
          <a href={cb("cancelled")} style={{ ...btn, background: "#f1f1f1", color: "#444" }}>
            Cancelar
          </a>
        </div>
        <p style={{ fontSize: 11, color: "#aaa", marginTop: 18 }}>
          Entorno de pruebas — ninguna transacción real será procesada.
        </p>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "#0F265C", fontFamily: "system-ui, sans-serif", padding: 20,
};
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: "28px 30px", width: 360,
  boxShadow: "0 30px 80px rgba(0,0,0,.35)",
};
const logo: React.CSSProperties = {
  width: 42, height: 42, borderRadius: 10, background: "#FFDD00", color: "#0F265C",
  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900,
};
const btn: React.CSSProperties = {
  display: "block", textAlign: "center", padding: "14px 0", borderRadius: 10,
  fontWeight: 800, textDecoration: "none", fontSize: 15,
};
