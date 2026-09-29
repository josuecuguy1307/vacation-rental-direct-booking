import type { Metadata } from "next";
import { SnacksPage } from "@/components/SnacksPage";
import { SITE } from "@/config/site.config";

/**
 * /snacks — carta de snacks de la casa (Etapa 10).
 * NO se linkea desde el home: vive para el QR impreso en la casa y para
 * mandar por WhatsApp. noindex: no debe aparecer en buscadores.
 */
export const metadata: Metadata = {
  title: `Snacks · ${SITE.name}`,
  description: `Snacks y antojos disponibles en ${SITE.name}.`,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  // token del link de snacks del huésped (/snacks?t=…); la API lo verifica
  const { t } = await searchParams;
  return <SnacksPage token={typeof t === "string" ? t : null} />;
}
