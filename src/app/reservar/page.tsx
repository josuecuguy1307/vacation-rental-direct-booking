import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer, WhatsAppFloat } from "@/components/Footer";
import { BookingPage } from "@/components/BookingPage";
import { SITE } from "@/config/site.config";

export const metadata: Metadata = {
  title: `Reservar · ${SITE.name}`,
  description: "Elige tus fechas, arma tu estadía y confirma con el pago completo.",
};

export default function Page() {
  return (
    <>
      <Header solid />
      <BookingPage />
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
