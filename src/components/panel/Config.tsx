"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { SITE } from "@/config/site.config";

/* Ajustes › tres secciones que antes vivían amontonadas en un solo tab
   "Config". Cada una gobierna una cosa distinta y se guarda por separado:
   - LaCasa        → property (wifi, horarios, limpieza, anticipo)
   - Banco         → datos de transferencia que ve el huésped
   - Notificaciones→ contacto de la dueña para avisos
   Los precios base viven en "Precios y temporadas" (misma tabla property,
   distinta intención) — así property deja de estar partido entre dos tabs
   de nivel superior: ambos quedan bajo la puerta Ajustes. */

type Banco = {
  bank_name: string; account_type: string; account_number: string;
  account_holder: string; holder_id: string;
};
type AvisoKey = "reserva_nueva" | "pago" | "cancelacion" | "mensajes_auto";
type Duena = {
  email: string; whatsapp: string; digest: "instant" | "daily"; review_link: string;
  avisos: Record<AvisoKey, boolean>;
};
/* timeline: solo lo que Notificaciones toca (avisos de llegada/salida). El
   resto del timeline se edita en Mensajes automáticos; aquí se preserva. */
type TlItem = { offsetDays: number; time: string; enabled: boolean };
type TlResp = { efectivo: Record<string, TlItem>; overrides: Record<string, Partial<TlItem>> };

const AVISOS: { k: AvisoKey; label: string; desc: string }[] = [
  { k: "reserva_nueva", label: "Reservas nuevas", desc: "Cuando entra una reserva" },
  { k: "pago", label: "Pagos recibidos", desc: "Comprobantes de transferencia y pagos con tarjeta" },
  { k: "cancelacion", label: "Pagos fallidos o cancelaciones", desc: "Cuando un pago se cae o se cancela" },
  { k: "mensajes_auto", label: "Copia de los mensajes automáticos", desc: "Un espejo de lo que se le envía al huésped" },
];
type Prop = {
  wifi_name: string | null; wifi_password: string | null;
  check_in_time: string | null; check_out_time: string | null;
  cleaning_fee: number; deposit_percentage: number;
};

/* ════════════ La casa (property operativo) ════════════ */
export function LaCasa() {
  const [prop, setProp] = useState<Prop | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api<{ property: Prop }>("/api/admin/property");
      setProp(p.property);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err && !prop) return <div className="pn-msg bad">{err}</div>;
  if (!prop) return <p className="pn-muted">Cargando…</p>;

  return (
    <>
      <h2>La casa</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="pn-card">
        <div className="grid2">
          <label className="f"><span>Nombre del wifi</span>
            <input type="text" value={prop.wifi_name ?? ""} onChange={(e) => setProp({ ...prop, wifi_name: e.target.value })} />
          </label>
          <label className="f"><span>Clave del wifi</span>
            <input type="text" value={prop.wifi_password ?? ""} onChange={(e) => setProp({ ...prop, wifi_password: e.target.value })} />
          </label>
        </div>
        <div className="grid2">
          <label className="f"><span>Hora de check-in</span>
            <input type="time" value={(prop.check_in_time ?? "15:00").slice(0, 5)} onChange={(e) => setProp({ ...prop, check_in_time: e.target.value })} />
          </label>
          <label className="f"><span>Hora de check-out</span>
            <input type="time" value={(prop.check_out_time ?? "11:00").slice(0, 5)} onChange={(e) => setProp({ ...prop, check_out_time: e.target.value })} />
          </label>
        </div>
        <div className="grid2">
          <label className="f"><span>Tarifa de limpieza ($)</span>
            <input type="number" min={0} step="0.01" value={prop.cleaning_fee} onChange={(e) => setProp({ ...prop, cleaning_fee: Number(e.target.value) })} />
          </label>
          <label className="f"><span>Anticipo para reservar (%)</span>
            <input type="number" min={10} max={100} value={prop.deposit_percentage} onChange={(e) => setProp({ ...prop, deposit_percentage: Number(e.target.value) })} />
          </label>
        </div>
        <p className="pn-muted">
          Con anticipo 100% el huésped paga todo al reservar. Si lo bajas (p. ej. 30),
          el sistema vuelve a cobrar el saldo restante automáticamente.
        </p>
        <button
          className="btn ok"
          disabled={busy}
          onClick={async () => {
            setBusy(true); setOk(""); setErr("");
            try {
              await api("/api/admin/property", {
                method: "PATCH",
                body: JSON.stringify({
                  wifi_name: prop.wifi_name || undefined,
                  wifi_password: prop.wifi_password || undefined,
                  check_in_time: prop.check_in_time || undefined,
                  check_out_time: prop.check_out_time || undefined,
                  cleaning_fee: prop.cleaning_fee,
                  deposit_percentage: prop.deposit_percentage,
                }),
              });
              setOk("Guardado ✓");
              await load();
            } catch (e) { setErr((e as Error).message); }
            finally { setBusy(false); }
          }}
        >
          Guardar casa
        </button>
      </div>
    </>
  );
}

/* ════════════ Cuenta bancaria ════════════ */
export function Banco() {
  const [banco, setBanco] = useState<Banco | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const b = await api<{ efectivo: Banco }>("/api/admin/settings/banco");
      setBanco(b.efectivo);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err && !banco) return <div className="pn-msg bad">{err}</div>;
  if (!banco) return <p className="pn-muted">Cargando…</p>;

  return (
    <>
      <h2>Cuenta bancaria</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="pn-card">
        <p className="pn-muted">
          Estos datos se muestran al huésped cuando elige pagar por transferencia.
        </p>
        <label className="f"><span>Banco</span>
          <input type="text" value={banco.bank_name} onChange={(e) => setBanco({ ...banco, bank_name: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="f"><span>Tipo de cuenta</span>
            <select value={banco.account_type} onChange={(e) => setBanco({ ...banco, account_type: e.target.value })}>
              <option>Ahorros</option>
              <option>Corriente</option>
            </select>
          </label>
          <label className="f"><span>N° de cuenta</span>
            <input type="text" value={banco.account_number} onChange={(e) => setBanco({ ...banco, account_number: e.target.value })} />
          </label>
        </div>
        <div className="grid2">
          <label className="f"><span>Titular</span>
            <input type="text" value={banco.account_holder} onChange={(e) => setBanco({ ...banco, account_holder: e.target.value })} />
          </label>
          <label className="f"><span>Cédula / RUC</span>
            <input type="text" value={banco.holder_id} onChange={(e) => setBanco({ ...banco, holder_id: e.target.value })} />
          </label>
        </div>
        <button
          className="btn ok"
          disabled={busy}
          onClick={async () => {
            setBusy(true); setOk(""); setErr("");
            try {
              await api("/api/admin/settings/banco", { method: "PUT", body: JSON.stringify({ value: banco }) });
              setOk("Guardado ✓");
              await load();
            } catch (e) { setErr((e as Error).message); }
            finally { setBusy(false); }
          }}
        >
          Guardar cuenta
        </button>
      </div>
    </>
  );
}

/* ════════════ Notificaciones (a qué correo y qué avisos) ════════════ */
export function Notificaciones() {
  const [duena, setDuena] = useState<Duena | null>(null);
  const [tl, setTl] = useState<TlResp | null>(null);
  const [checkin, setCheckin] = useState(true);   // aviso "hoy llega" (timeline dueno_checkin)
  const [checkout, setCheckout] = useState(true);  // aviso "hoy sale" (timeline dueno_checkout)
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [du, tlr] = await Promise.all([
        api<{ efectivo: Duena }>("/api/admin/settings/duena"),
        api<TlResp>("/api/admin/settings/timeline"),
      ]);
      setDuena(du.efectivo);
      setTl(tlr);
      setCheckin(tlr.efectivo.dueno_checkin?.enabled ?? true);
      setCheckout(tlr.efectivo.dueno_checkout?.enabled ?? true);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err && !duena) return <div className="pn-msg bad">{err}</div>;
  if (!duena || !tl) return <p className="pn-muted">Cargando…</p>;

  const setAviso = (k: AvisoKey, v: boolean) =>
    setDuena({ ...duena, avisos: { ...duena.avisos, [k]: v } });

  const guardar = async () => {
    setBusy(true); setOk(""); setErr("");
    try {
      // 1) contacto + qué avisos quiere (viven en settings/duena)
      await api("/api/admin/settings/duena", { method: "PUT", body: JSON.stringify({ value: duena }) });
      // 2) avisos de llegada/salida = on/off de los mensajes dueno_checkin/checkout
      //    del timeline (misma pieza que Mensajes automáticos; se preserva su horario)
      await api("/api/admin/settings/timeline", {
        method: "PUT",
        body: JSON.stringify({
          value: {
            ...tl.overrides,
            dueno_checkin: { ...tl.overrides.dueno_checkin, enabled: checkin },
            dueno_checkout: { ...tl.overrides.dueno_checkout, enabled: checkout },
          },
        }),
      });
      setOk("Guardado ✓");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Notificaciones</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="pn-card">
        <h3>A dónde te llegan</h3>
        <label className="f"><span>Tu correo (aquí llegan todos tus avisos)</span>
          <input type="email" value={duena.email} onChange={(e) => setDuena({ ...duena, email: e.target.value })} />
        </label>
        <label className="f"><span>Tu WhatsApp (con código de país, ej. {SITE.phoneCountryCode}…)</span>
          <input type="text" value={duena.whatsapp} onChange={(e) => setDuena({ ...duena, whatsapp: e.target.value })} />
        </label>
      </div>

      <div className="pn-card">
        <h3>Qué avisos quieres recibir</h3>
        <p className="pn-muted" style={{ marginTop: 0 }}>
          Enciende o apaga cada tipo. Lo que apagues no te llega ni por correo ni por WhatsApp.
        </p>
        {AVISOS.map(({ k, label, desc }) => (
          <label key={k} className="pn-toggle">
            <input type="checkbox" checked={duena.avisos[k]} onChange={(e) => setAviso(k, e.target.checked)} />
            <span className="tx"><b>{label}</b><span>{desc}</span></span>
          </label>
        ))}
        <label className="pn-toggle">
          <input type="checkbox" checked={checkin} onChange={(e) => setCheckin(e.target.checked)} />
          <span className="tx"><b>Cuando llega un huésped</b><span>Aviso el día del check-in, con las fechas de la estadía</span></span>
        </label>
        <label className="pn-toggle">
          <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
          <span className="tx"><b>Cuando sale un huésped</b><span>Aviso el día del check-out</span></span>
        </label>
        <p className="pn-muted" style={{ margin: "8px 0 0" }}>
          La hora exacta de los avisos de llegada y salida se ajusta en <b>Mensajes automáticos</b>.
        </p>
      </div>

      <div className="pn-card">
        <h3>Mensajes automáticos y reseñas</h3>
        <label className="f"><span>¿Cómo quieres la copia de los mensajes automáticos?</span>
          <select
            value={duena.digest}
            disabled={!duena.avisos.mensajes_auto}
            onChange={(e) => setDuena({ ...duena, digest: e.target.value as "instant" | "daily" })}
          >
            <option value="instant">Al instante (cada evento)</option>
            <option value="daily">Resumen diario por correo</option>
          </select>
        </label>
        <label className="f"><span>Link externo de reseñas (ej. Google, opcional)</span>
          <input type="text" value={duena.review_link} onChange={(e) => setDuena({ ...duena, review_link: e.target.value })} />
        </label>
      </div>

      <button className="btn ok" disabled={busy} onClick={guardar}>Guardar notificaciones</button>
    </>
  );
}
