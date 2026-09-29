import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Story } from "@/components/Story";
import { Amenities } from "@/components/Amenities";
import { KnowBefore } from "@/components/KnowBefore";
import { Footer, WhatsAppFloat } from "@/components/Footer";
import { RevealObserver } from "@/components/RevealObserver";
import { SITE } from "@/config/site.config";

export const metadata: Metadata = {
  title: `La casa · ${SITE.name}`,
  description:
    "Nuestra historia, todo lo que la casa ofrece y lo que debes saber antes de tu viaje.",
};

export default function Page() {
  return (
    <>
      <Header solid />
      <RevealObserver />
      <main className="page-offset">
        <Story />
        <Amenities />
        <KnowBefore />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
