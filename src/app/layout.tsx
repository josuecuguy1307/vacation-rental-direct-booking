import type { Metadata } from "next";
import "./globals.css";
import { getContactInfo } from "@/lib/contact";
import { ContactProvider } from "@/components/ContactContext";
import { SITE } from "@/config/site.config";

export const metadata: Metadata = {
  title: `${SITE.name} · ${SITE.tagline}`,
  description: SITE.description,
};

// El número de contacto sale de la config del panel (getContactInfo lee la BD),
// así que renderizamos en runtime para reflejar cambios sin re-deploy.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const contact = await getContactInfo();
  return (
    <html lang="es">
      <head>
        {/* Tipografías del diseño original (Marcellus + Mulish + alternativas) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Marcellus&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Mulish:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ContactProvider info={contact}>{children}</ContactProvider>
      </body>
    </html>
  );
}
