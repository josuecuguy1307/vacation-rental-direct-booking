import { NextRequest, NextResponse } from "next/server";

/**
 * Puerta del panel de la dueña (Etapa 20).
 * - El panel vive internamente en /panel/** pero SOLO es accesible por la
 *   ruta discreta ADMIN_BASE_PATH (p.ej. /gestion-x7k2p9; obligatoria: sin ella el panel no se sirve): el middleware
 *   reescribe esa ruta hacia /panel y bloquea el acceso directo a /panel.
 * - noindex/nofollow vía X-Robots-Tag; nada del sitio público linkea aquí.
 * - La seguridad REAL no es la URL: todas las APIs /api/admin/* validan el
 *   JWT de Supabase server-side, y el login pasa por /api/panel/login con
 *   rate limit (5 intentos → 15 min).
 */
export function middleware(req: NextRequest) {
  // Ruta secreta del panel, definida por TI en ADMIN_BASE_PATH (ej. "/gestion-x7k2p9").
  // Sin ella (o mal formada) el panel queda DESACTIVADO: /panel responde 404 y no hay puerta.
  const raw = process.env.ADMIN_BASE_PATH?.trim();
  const base = raw && /^\/[A-Za-z0-9_-]{6,}$/.test(raw) ? raw : null;
  const { pathname } = req.nextUrl;

  if (base && (pathname === base || pathname.startsWith(base + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/panel" + pathname.slice(base.length);
    const res = NextResponse.rewrite(url);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  // acceso directo a /panel prohibido: la única puerta es la ruta discreta
  if (pathname === "/panel" || pathname.startsWith("/panel/")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  // corre en páginas (no en api/_next/assets) — el chequeo es barato
  matcher: ["/((?!api|_next/static|_next/image|assets|icon.png|favicon.ico).*)"],
};
