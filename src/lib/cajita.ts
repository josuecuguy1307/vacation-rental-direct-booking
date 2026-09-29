"use client";

/* ============================================================
   Catálogo de snacks (Etapa 10).
   La "cajita" (carrito de snacks dentro de la reserva) se retiró:
   los snacks ahora viven en la página /snacks (QR impreso en la
   casa) y se pagan aparte con un link de Payphone de monto
   editable. Aquí queda solo el catálogo desde la DB.
   ============================================================ */

import { useEffect, useState } from "react";
import { SITE } from "@/config/site.config";

export type SnackAddon = {
  id: string;
  name: string;
  price: number;
  category: string;
  image_url: string | null;
};

/* Catálogo de snacks desde la DB (addons activos con category='snack') */
export function useSnacksCatalog() {
  const [snacks, setSnacks] = useState<SnackAddon[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/properties/${SITE.slug}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        const all = (data.addons ?? []) as SnackAddon[];
        setSnacks(all.filter((a) => a.category === "snack"));
      } catch (e) {
        console.error("[snacks]", e);
        if (alive) setSnacks(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  return snacks;
}
