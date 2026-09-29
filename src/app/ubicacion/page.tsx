import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Location } from "@/components/Location";
import { Footer, WhatsAppFloat } from "@/components/Footer";
import { RevealObserver } from "@/components/RevealObserver";
import { SITE } from "@/config/site.config";

export const metadata: Metadata = {
  title: `Ubicación · ${SITE.name}`,
  description: `Cómo llegar a ${SITE.name} y qué hay cerca.`,
};

export default function Page() {
  return (
    <>
      <Header solid />
      <RevealObserver />
      <main className="page-offset">
        <Location />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
