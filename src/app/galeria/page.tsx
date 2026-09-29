import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { PhotoTour } from "@/components/PhotoTour";
import { Dormitorios } from "@/components/Dormitorios";
import { Footer, WhatsAppFloat } from "@/components/Footer";
import { RevealObserver } from "@/components/RevealObserver";
import { SITE } from "@/config/site.config";

export const metadata: Metadata = {
  title: `Galería · ${SITE.name}`,
  description: "Recorrido fotográfico por cada espacio de la casa y sus recámaras.",
};

export default function Page() {
  return (
    <>
      <Header solid />
      <RevealObserver />
      <main className="page-offset">
        <PhotoTour />
        <Dormitorios />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
