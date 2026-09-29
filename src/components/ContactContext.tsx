"use client";

import { createContext, useContext } from "react";
import { CB } from "@/lib/site-data";

/* Número de contacto de la web = el que la dueña configura en el panel
   (Notificaciones → "Tu WhatsApp"). Se resuelve en el server (layout) y se
   lee aquí desde los componentes cliente (Header, Footer, snacks…), en vez de
   estar quemado en site-data. Si no hay nada configurado, cae al valor
   estático del sitio. */
export type ContactInfo = { whatsapp: string; whatsappShow: string; waMsg: string };

const DEFAULT: ContactInfo = {
  whatsapp: CB.whatsapp,
  whatsappShow: CB.whatsappShow,
  waMsg: CB.waMsg,
};

const ContactCtx = createContext<ContactInfo>(DEFAULT);

export function ContactProvider({
  info,
  children,
}: {
  info: ContactInfo;
  children: React.ReactNode;
}) {
  return <ContactCtx.Provider value={info}>{children}</ContactCtx.Provider>;
}

export const useContact = () => useContext(ContactCtx);

/** Link de wa.me a partir del número (solo dígitos) + mensaje opcional. */
export const waHref = (whatsapp: string, msg?: string) =>
  `https://wa.me/${whatsapp}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
