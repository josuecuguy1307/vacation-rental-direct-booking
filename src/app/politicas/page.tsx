import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Policies } from "@/components/Policies";
import { Footer, WhatsAppFloat } from "@/components/Footer";
import { RevealObserver } from "@/components/RevealObserver";
import { SITE } from "@/config/site.config";

export const metadata: Metadata = {
  title: `Políticas y seguridad · ${SITE.name}`,
  description:
    "Reglas de la casa, qué hacer durante tu estadía, cancelación y pagos, y seguridad de la propiedad.",
};

export default function Page() {
  return (
    <>
      <Header solid />
      <RevealObserver />
      <main className="page-offset">
        <Policies />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
