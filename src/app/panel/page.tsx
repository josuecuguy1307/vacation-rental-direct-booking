import type { Metadata } from "next";
import PanelApp from "@/components/panel/PanelApp";
import { SITE } from "@/config/site.config";
import "./panel.css";
import "./reservas.css";

/* El panel vive detrás de ADMIN_BASE_PATH (middleware): la ruta /panel
   directa devuelve 404 y la ruta discreta se reescribe aquí. noindex
   por metadata Y por header X-Robots-Tag; no aparece en el sitemap. */

export const metadata: Metadata = {
  title: `Panel · ${SITE.name}`,
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function PanelPage() {
  return <PanelApp />;
}
