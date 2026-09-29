"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Booking, type PayReturn } from "@/components/Booking";
import { RevealObserver } from "@/components/RevealObserver";
import { type Stay } from "@/lib/ui";

/* Página /reservar: el wizard de reserva vive en su propia pantalla.
   Aquí también aterrizan los retornos de pago (?pago=exito|fallido|...)
   que mandan Payphone/Pichincha y el reintento de pago. */
export function BookingPage() {
  const [stay, setStay] = useState<Stay>({ checkIn: null, checkOut: null, adults: 4, children: 0, pets: 0 });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [payReturn, setPayReturn] = useState<PayReturn | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  };

  // Retorno del gateway de pago (?pago=exito|fallido|pendiente|expirado)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const pago = sp.get("pago");
    if (!pago) return;
    const rid = sp.get("reserva") ?? undefined;

    if (pago === "exito") {
      showToast("¡Pago confirmado! Tu reserva está confirmada ✓");
    } else if (pago === "fallido") {
      setPayReturn({ status: "fallido", rid });
      showToast("El pago no se completó — puedes reintentarlo");
    } else if (pago === "expirado") {
      showToast("La reserva expiró — elige nuevas fechas para volver a intentarlo");
    } else {
      showToast("Estamos verificando tu pago — te confirmaremos por correo");
    }
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-offset">
      <RevealObserver />
      <Booking
        stay={stay}
        setStay={setStay}
        toast={showToast}
        payReturn={payReturn}
        dismissPayReturn={() => setPayReturn(null)}
      />
      <div className={"toast" + (toastMsg ? " show" : "")}>
        {toastMsg && <><Icon n="check" /> {toastMsg}</>}
      </div>
    </div>
  );
}
