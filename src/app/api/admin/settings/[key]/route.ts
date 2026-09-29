import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  DEFAULT_TIMELINE, getBanco, getDuena, getEffectiveTemplates,
  getEffectiveTimeline, getSetting, logAudit, setSetting, validateTemplateText,
} from "@/lib/panel";
import { TEMPLATES, type TemplateKey } from "@/lib/messaging/templates";

export const dynamic = "force-dynamic";

const KEYS = ["templates", "timeline", "banco", "duena"];

/**
 * GET/PUT /api/admin/settings/[key] — configuración editable del panel.
 * GET devuelve el valor EFECTIVO (default del código + override) y, para
 * templates/timeline, también el default inmutable (para "Restaurar").
 * PUT { value } guarda el override; PUT { restore: true [, item ] } lo borra.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const { key } = await params;
  if (!KEYS.includes(key)) return NextResponse.json({ error: "key desconocida" }, { status: 404 });

  const db = supabaseAdmin();
  switch (key) {
    case "templates":
      return NextResponse.json({
        efectivo: await getEffectiveTemplates(db),
        default: TEMPLATES,
        overrides: (await getSetting(db, "templates")) ?? {},
      });
    case "timeline":
      return NextResponse.json({
        efectivo: await getEffectiveTimeline(db),
        default: DEFAULT_TIMELINE,
        overrides: (await getSetting(db, "timeline")) ?? {},
      });
    case "banco":
      return NextResponse.json({ efectivo: await getBanco(db) });
    case "duena":
      return NextResponse.json({ efectivo: await getDuena(db) });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const actor = auth.user.email ?? "panel";
  const { key } = await params;
  if (!KEYS.includes(key)) return NextResponse.json({ error: "key desconocida" }, { status: 404 });

  let body: { value?: unknown; restore?: boolean; item?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // restaurar: borra el override completo o de un solo item
  if (body.restore) {
    if (body.item && (key === "templates" || key === "timeline")) {
      const current = ((await getSetting(db, key)) ?? {}) as Record<string, unknown>;
      delete current[body.item];
      await setSetting(db, key, current);
    } else {
      await setSetting(db, key, {});
    }
    logAudit(db, { actor, action: "restaurar_default", entity: "settings", entityId: key, detail: { item: body.item ?? "todo" } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (body.value === undefined) {
    return NextResponse.json({ error: "value requerido" }, { status: 400 });
  }

  // validación por tipo de setting
  if (key === "templates") {
    const v = body.value as Record<string, { asunto?: string; email?: string; whatsapp?: string }>;
    for (const [tplKey, tpl] of Object.entries(v)) {
      if (!(tplKey in TEMPLATES)) {
        return NextResponse.json({ error: `Plantilla desconocida: ${tplKey}` }, { status: 400 });
      }
      for (const campo of ["asunto", "email", "whatsapp"] as const) {
        const texto = tpl[campo];
        if (texto !== undefined) {
          const err = validateTemplateText(texto);
          if (err) return NextResponse.json({ error: `${tplKey}.${campo}: ${err}` }, { status: 400 });
        }
      }
      // no perder el {review_link} del mensaje de despedida
      if (tplKey === "despues_salida") {
        for (const campo of ["email", "whatsapp"] as const) {
          if (tpl[campo] !== undefined && !tpl[campo]!.includes("{review_link}")) {
            return NextResponse.json(
              { error: `despues_salida.${campo} debe incluir {review_link}` },
              { status: 400 }
            );
          }
        }
      }
    }
  }
  if (key === "timeline") {
    const v = body.value as Record<string, { offsetDays?: number; time?: string; enabled?: boolean }>;
    for (const [k, cfg] of Object.entries(v)) {
      if (!(k in DEFAULT_TIMELINE)) {
        return NextResponse.json({ error: `Mensaje desconocido: ${k}` }, { status: 400 });
      }
      if (cfg.offsetDays !== undefined && (!Number.isInteger(cfg.offsetDays) || Math.abs(cfg.offsetDays) > 30)) {
        return NextResponse.json({ error: `${k}: offsetDays debe ser entero (−30 a 30)` }, { status: 400 });
      }
      if (cfg.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cfg.time)) {
        return NextResponse.json({ error: `${k}: hora inválida (HH:MM)` }, { status: 400 });
      }
    }
  }

  await setSetting(db, key, body.value);
  logAudit(db, { actor, action: "editar_settings", entity: "settings", entityId: key, detail: body.value }).catch(() => {});
  return NextResponse.json({ ok: true });
}
