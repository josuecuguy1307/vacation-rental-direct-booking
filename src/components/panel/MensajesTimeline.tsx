"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { SITE } from "@/config/site.config";

/* Ajustes › Mensajes automáticos — FUSIÓN de los antiguos tabs "Mensajes"
   (el texto) y "Timeline" (cuándo se envía). Ahora cada mensaje se edita
   en un solo lugar: su texto Y su horario juntos.

   El timeline tiene 8 ítems; 6 son mensajes al huésped (con texto editable)
   y 2 son avisos internos a la dueña (dueno_checkin / dueno_checkout, sin
   texto). Los 8 conservan su on/off y su horario, como antes. */

type Tpl = { asunto: string; email: string; whatsapp: string };
type CampoTpl = keyof Tpl;
type TplResp = {
  efectivo: Record<string, Tpl>;
  default: Record<string, Tpl>;
  overrides: Record<string, Partial<Tpl>>;
};

type TlItem = { offsetDays: number; time: string; enabled: boolean };
type TlDef = TlItem & { anchor: "checkin" | "checkout" | "confirm"; label: string };
type TlResp = {
  efectivo: Record<string, TlItem>;
  default: Record<string, TlDef>;
  overrides: Record<string, Partial<TlItem>>;
};

const TPL_LABELS: Record<string, string> = {
  confirmacion: "Confirmación de reserva",
  antes_llegada: "Antes de la llegada",
  despues_primera_noche: "Después de la primera noche",
  antes_salida: "Antes de la salida",
  despues_salida: "Despedida + invitación a reseñar",
  recordatorio_saldo: "Recordatorio de saldo",
};

const ANCHOR_TXT: Record<string, string> = {
  checkin: "del check-in",
  checkout: "del check-out",
  confirm: "de la confirmación",
};

const VARS: { v: string; desc: string }[] = [
  { v: "nombre", desc: "Nombre del huésped" },
  { v: "codigo", desc: `Código ${SITE.bookingCodePrefix}-XXXXXXXX` },
  { v: "fecha_checkin", desc: "Fecha de llegada" },
  { v: "fecha_checkout", desc: "Fecha de salida" },
  { v: "hora_checkin", desc: "Hora de check-in" },
  { v: "hora_checkout", desc: "Hora de check-out" },
  { v: "huespedes", desc: "Nº de huéspedes" },
  { v: "maps_link", desc: "Link de Google Maps" },
  { v: "wifi_nombre", desc: "Nombre del wifi" },
  { v: "wifi_clave", desc: "Clave del wifi" },
  { v: "review_link", desc: "Link para reseñar" },
  { v: "whatsapp_anfitrion", desc: "Tu WhatsApp" },
  { v: "total", desc: "Total de la reserva" },
];

const SAMPLE: Record<string, string> = {
  nombre: "María", codigo: `${SITE.bookingCodePrefix}-AB12CD34`,
  fecha_checkin: "viernes, 17 de julio de 2026",
  fecha_checkout: "domingo, 19 de julio de 2026",
  hora_checkin: "15h00", hora_checkout: "11h00", huespedes: "4",
  maps_link: SITE.mapsUrl,
  wifi_nombre: SITE.name, wifi_clave: "TU_CLAVE_WIFI",
  review_link: "https://tu-dominio.com/resena/…",
  whatsapp_anfitrion: SITE.whatsappDisplay,
  total: "$250.00", pagado: "$250.00", saldo: "$0.00",
  saldo_frase: "Tu estadía está pagada por completo ✓",
  saldo_info: "", link_saldo: "",
};

const renderSample = (text: string) =>
  text.replace(/\{([a-z_]+)\}/g, (_, k) => SAMPLE[k] ?? `{${k}}`);

const offsetTxt = (def: TlDef, it: TlItem) => {
  if (def.anchor === "confirm") return "Se envía al confirmarse la reserva";
  const anchor = ANCHOR_TXT[def.anchor] ?? "";
  if (it.offsetDays === 0) return `El mismo día ${anchor}, a las ${it.time}`;
  if (it.offsetDays < 0) return `${-it.offsetDays} día(s) antes ${anchor}, a las ${it.time}`;
  return `${it.offsetDays} día(s) después ${anchor}, a las ${it.time}`;
};

export function MensajesAjustes() {
  const [tpl, setTpl] = useState<TplResp | null>(null);
  const [tl, setTl] = useState<TlResp | null>(null);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [draftTpl, setDraftTpl] = useState<Tpl | null>(null);
  const [draftTl, setDraftTl] = useState<TlItem | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // refs a los tres campos editables, para insertar variables en el cursor
  const asuntoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLTextAreaElement>(null);
  const whatsRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<CampoTpl>("email"); // último campo tocado (para el tap)
  const refFor = (campo: CampoTpl) =>
    campo === "asunto" ? asuntoRef : campo === "email" ? emailRef : whatsRef;

  /* Inserta {variable} en la posición del cursor del campo (o al final si no
     hay cursor). Una sola vía para arrastrar (drop) y para tocar (tap). */
  const insertarVar = (campo: CampoTpl, token: string, posOverride?: number) => {
    const node = refFor(campo).current;
    const at = posOverride ?? node?.selectionStart ?? node?.value.length ?? 0;
    setDraftTpl((d) => {
      if (!d) return d;
      const actual = d[campo] ?? "";
      const clamped = Math.min(at, actual.length);
      return { ...d, [campo]: actual.slice(0, clamped) + token + actual.slice(clamped) };
    });
    requestAnimationFrame(() => {
      const n = refFor(campo).current;
      if (!n) return;
      const caret = Math.min(at + token.length, n.value.length);
      n.focus();
      try { n.setSelectionRange(caret, caret); } catch { /* campo sin selección */ }
    });
  };

  const dropVar = (campo: CampoTpl) => (e: React.DragEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.preventDefault();
    const token = e.dataTransfer.getData("text/plain");
    if (token) insertarVar(campo, token, e.currentTarget.selectionStart ?? undefined);
    setDragging(false);
  };
  const allowDrop = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };

  const load = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        api<TplResp>("/api/admin/settings/templates"),
        api<TlResp>("/api/admin/settings/timeline"),
      ]);
      setTpl(t);
      setTl(l);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const abrir = (key: string) => {
    if (!tpl || !tl) return;
    setSelKey(key);
    setDraftTpl(tpl.efectivo[key] ? { ...tpl.efectivo[key] } : null);
    setDraftTl(tl.efectivo[key] ? { ...tl.efectivo[key] } : null);
    setOk(""); setErr("");
  };

  const cerrar = () => { setSelKey(null); setDraftTpl(null); setDraftTl(null); setOk(""); setErr(""); };

  const guardar = async () => {
    if (!selKey || !tpl || !tl) return;
    setBusy(true); setOk(""); setErr("");
    try {
      if (draftTpl) {
        await api("/api/admin/settings/templates", {
          method: "PUT", body: JSON.stringify({ value: { ...tpl.overrides, [selKey]: draftTpl } }),
        });
      }
      if (draftTl) {
        await api("/api/admin/settings/timeline", {
          method: "PUT",
          body: JSON.stringify({
            value: {
              ...tl.overrides,
              [selKey]: { offsetDays: draftTl.offsetDays, time: draftTl.time, enabled: draftTl.enabled },
            },
          }),
        });
      }
      setOk("Guardado ✓ — aplica a las próximas reservas confirmadas.");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restaurar = async () => {
    if (!selKey) return;
    if (!window.confirm("¿Volver este mensaje (texto y horario) a lo original? Tus cambios se pierden.")) return;
    setBusy(true); setOk(""); setErr("");
    try {
      if (draftTpl) {
        await api("/api/admin/settings/templates", { method: "PUT", body: JSON.stringify({ restore: true, item: selKey }) });
      }
      await api("/api/admin/settings/timeline", { method: "PUT", body: JSON.stringify({ restore: true, item: selKey }) });
      setOk("Restaurado al original ✓");
      await load();
      cerrar();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !tpl) return <div className="pn-msg bad">{err}</div>;
  if (!tpl || !tl) return <p className="pn-muted">Cargando…</p>;

  /* ── editor de un mensaje ── */
  if (selKey) {
    const def = tl.default[selKey];
    const hasText = !!draftTpl;
    const label = TPL_LABELS[selKey] ?? def?.label ?? selKey;
    const personalizado = !!tpl.overrides[selKey] || !!tl.overrides[selKey];
    return (
      <>
        <button className="pn-back" onClick={cerrar}>← Todos los mensajes</button>
        <h2 style={{ marginTop: 6 }}>{label}</h2>
        {ok && <div className="pn-msg ok">{ok}</div>}
        {err && <div className="pn-msg bad">{err}</div>}
        {personalizado && <span className="pn-badge info">Personalizado (hay original guardado)</span>}

        {/* cuándo se envía */}
        {draftTl && def && (
          <div className="pn-card" style={{ marginTop: 10 }}>
            <div className="pn-row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Cuándo se envía</h3>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={draftTl.enabled}
                  onChange={(e) => setDraftTl({ ...draftTl, enabled: e.target.checked })}
                  style={{ width: 22, height: 22 }}
                />
                {draftTl.enabled ? "Activo" : "Apagado"}
              </label>
            </div>
            <p className="pn-muted" style={{ margin: "6px 0" }}>{offsetTxt(def, draftTl)}</p>
            {def.anchor !== "confirm" && (
              <div className="grid2">
                <label className="f"><span>Días (− = antes, + = después)</span>
                  <input
                    type="number" min={-30} max={30} value={draftTl.offsetDays}
                    onChange={(e) => setDraftTl({ ...draftTl, offsetDays: Number(e.target.value) })}
                  />
                </label>
                <label className="f"><span>Hora</span>
                  <input
                    type="time" value={draftTl.time}
                    onChange={(e) => setDraftTl({ ...draftTl, time: e.target.value })}
                  />
                </label>
              </div>
            )}
            <p className="pn-muted" style={{ margin: 0 }}>
              Apagarlo también cancela los envíos ya programados de este mensaje.
            </p>
          </div>
        )}

        {/* texto (solo mensajes al huésped) */}
        {hasText && draftTpl ? (
          <>
            <div className="pn-card">
              <p className="pn-muted">
                Arrastra una variable adonde la quieras en el texto (o tócala para
                insertarla donde está el cursor). Al enviarse, cada una se reemplaza
                por el dato real — el ejemplo te muestra cómo se verá:
              </p>
              <div className="pn-vars">
                {VARS.map(({ v, desc }) => (
                  <button
                    type="button"
                    key={v}
                    className="pn-var-chip"
                    title={desc}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `{${v}}`);
                      e.dataTransfer.effectAllowed = "copy";
                      setDragging(true);
                    }}
                    onDragEnd={() => setDragging(false)}
                    onClick={() => insertarVar(lastField.current, `{${v}}`)}
                  >
                    <code>{`{${v}}`}</code>
                    <span className="ej">{SAMPLE[v] ?? "—"}</span>
                  </button>
                ))}
              </div>
              <label className="f"><span>Asunto del correo</span>
                <input
                  ref={asuntoRef}
                  type="text"
                  className={dragging ? "pn-droppable" : undefined}
                  value={draftTpl.asunto}
                  onChange={(e) => setDraftTpl({ ...draftTpl, asunto: e.target.value })}
                  onFocus={() => { lastField.current = "asunto"; }}
                  onDragOver={allowDrop}
                  onDrop={dropVar("asunto")}
                />
              </label>
              <label className="f"><span>Cuerpo del correo</span>
                <textarea
                  ref={emailRef}
                  className={dragging ? "pn-droppable" : undefined}
                  value={draftTpl.email}
                  onChange={(e) => setDraftTpl({ ...draftTpl, email: e.target.value })}
                  onFocus={() => { lastField.current = "email"; }}
                  onDragOver={allowDrop}
                  onDrop={dropVar("email")}
                />
              </label>
              <label className="f"><span>Texto de WhatsApp (referencial)</span>
                <textarea
                  ref={whatsRef}
                  className={dragging ? "pn-droppable" : undefined}
                  style={{ minHeight: 90 }}
                  value={draftTpl.whatsapp}
                  onChange={(e) => setDraftTpl({ ...draftTpl, whatsapp: e.target.value })}
                  onFocus={() => { lastField.current = "whatsapp"; }}
                  onDragOver={allowDrop}
                  onDrop={dropVar("whatsapp")}
                />
              </label>
              <p className="pn-muted">
                ℹ️ El WhatsApp real sale con las plantillas aprobadas en Meta; este texto es la
                referencia de contenido. El correo sí usa exactamente lo que escribas aquí.
              </p>
            </div>

            <div className="pn-card">
              <h3>Vista previa (con datos de ejemplo)</h3>
              <p><b>{renderSample(draftTpl.asunto)}</b></p>
              <div className="pn-preview">{renderSample(draftTpl.email)}</div>
            </div>
          </>
        ) : (
          <div className="pn-card">
            <p className="pn-muted" style={{ margin: 0 }}>
              📩 Es un aviso interno para ti (no lo recibe el huésped), así que no tiene texto editable —
              solo puedes elegir cuándo te llega o apagarlo.
            </p>
          </div>
        )}

        <div className="pn-row">
          <button className="btn ok" disabled={busy} onClick={guardar}>Guardar cambios</button>
          <button className="btn plain" disabled={busy} onClick={restaurar}>Restaurar original</button>
        </div>
      </>
    );
  }

  /* ── lista de mensajes ── */
  return (
    <>
      <h2>Mensajes automáticos</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}
      <p className="pn-muted">
        Se envían solos según su horario. Toca uno para editar su texto y cuándo se manda;
        el original nunca se pierde.
      </p>
      {Object.entries(tl.default).map(([key, def]) => {
        const it = tl.efectivo[key] ?? def;
        const hasText = !!tpl.efectivo[key];
        const personalizado = !!tpl.overrides[key] || !!tl.overrides[key];
        return (
          <button key={key} className="pn-item" onClick={() => abrir(key)} style={{ opacity: it.enabled ? 1 : 0.55 }}>
            <div className="pn-row" style={{ justifyContent: "space-between" }}>
              <b>{TPL_LABELS[key] ?? def.label}</b>
              <span className={`pn-badge ${personalizado ? "info" : "ok"}`}>
                {personalizado ? "Personalizado" : "Original"}
              </span>
            </div>
            <div className="pn-muted">
              {!it.enabled && <span className="pn-badge warn" style={{ marginRight: 6 }}>Apagado</span>}
              {offsetTxt(def, it)}{!hasText && " · aviso interno"}
            </div>
          </button>
        );
      })}
    </>
  );
}
