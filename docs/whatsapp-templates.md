# WhatsApp templates — ready to paste into WhatsApp Manager

> **Where**: [business.facebook.com](https://business.facebook.com) → WhatsApp Manager →
> Message templates → **Create template**.
> **Category: Utility** · **Language: Spanish (`es`)** (the guest messages of this template are
> written in Spanish; change the language and the texts together if you translate them) ·
> no header or buttons (body only) unless noted.
> The names must match `WA_TEMPLATES` in `src/lib/messaging/templates.ts` EXACTLY
> (that is where you change the mapping if you rename one).
>
> ⚠️ With Meta's test number the token is TEMPORARY (24 h) — see "Before production" at the end.
> The message bodies below are examples: replace `[NOMBRE DE TU CASA]` with your property's name.

---

## 1. `confirmacion_reserva`
Variables: {{1}} name · {{2}} code · {{3}} check-in date · {{4}} check-out date · {{5}} guests · {{6}} total

```
🌿 Hola {{1}}, ¡gracias por reservar [NOMBRE DE TU CASA]!

Tu reserva está confirmada ✓
Código: {{2}}
📅 Del {{3}} al {{4}} · {{5}} huésped(es)
Total pagado: {{6}}

Un día antes de tu llegada te enviaremos los detalles del check-in (cómo llegar, wifi y acceso). Cualquier duda, escríbenos por aquí. ¡Nos vemos pronto!
```

## 2. `antes_llegada`
Variables: {{1}} name · {{2}} check-in time · {{3}} Google Maps link · {{4}} wifi network · {{5}} wifi password

```
🌿 Hola {{1}}, ¡mañana te esperamos en [NOMBRE DE TU CASA]!

🕒 Check-in: desde las {{2}}
📍 Cómo llegar: {{3}}
📶 Wifi: {{4}} · clave: {{5}}

Al llegar al portón escríbenos por aquí y te recibimos. Si llegas más tarde de lo previsto, no pasa nada — solo avísanos. ¡Buen viaje! 🚗
```

## 3. `primera_noche`
Variables: {{1}} nombre

```
🌿 Hola {{1}}, ¿qué tal la primera noche en [NOMBRE DE TU CASA]?

Esperamos que la entrada haya sido fácil y que estén disfrutando la casa. Estamos aquí para lo que necesites: recomendaciones, algo de la casa, lo que sea — solo escríbenos por aquí. 😊
```

## 4. `antes_salida`
Variables: {{1}} name · {{2}} check-out date · {{3}} check-out time

```
🌿 Hola {{1}}, mañana {{2}} es tu check-out de [NOMBRE DE TU CASA] (hasta las {{3}}).

Antes de salir: deja las llaves donde te indicamos, apaga luces y A/C, y cierra bien puertas y ventanas.

¿Necesitas salir un poco más tarde? Escríbenos y vemos si es posible. 🙂
```

## 5. `despues_salida`
Variables: {{1}} name · {{2}} review link

```
🌿 Hola {{1}}, ¡gracias por quedarte en [NOMBRE DE TU CASA]!

Esperamos que se lleven lindos recuerdos de [TU CIUDAD]. Si tienes un minuto, nos ayudaría muchísimo una evaluación de tu experiencia: {{2}}

¡Esperamos verte de nuevo! 💚
```

## 6. `recordatorio_saldo`
Variables: {{1}} name · {{2}} balance · {{3}} payment link
(Only used when the deposit needed to confirm is below 100% — dormant with the default seed.)

```
🌿 ¡Hola {{1}}, hoy te esperamos en [NOMBRE DE TU CASA]!

Recordatorio: tu saldo pendiente es {{2}}. Puedes pagarlo aquí: {{3}}

O en efectivo al llegar, como prefieras. ¡Buen viaje! 🚗
```

## 7. `recibo_snacks`
Variables: {{1}} item summary ("Snack ×2, Candy ×1") · {{2}} total

```
🍫 ¡Gracias por tu compra en [NOMBRE DE TU CASA]!

Tu pedido: {{1}}
Total pagado: {{2}}

El recibo detallado llegó a tu correo. ¡Que los disfrutes! 🌿
```

## 8. `saldo_recibido`
Variables: {{1}} name · {{2}} code · {{3}} total

```
🌿 ¡Hola {{1}}! Recibimos el pago de tu saldo.

Tu reserva {{2}} está PAGADA POR COMPLETO ({{3}}). El recibo actualizado llegó a tu correo.

¡Nos vemos pronto! 💚
```

## 9. `aviso_dueno_reserva` (for the host)
Variables: {{1}} status ("nueva reserva" / "reserva confirmada") · {{2}} code · {{3}} guest · {{4}} dates · {{5}} total

```
🌿 [NOMBRE DE TU CASA] — {{1}}

Código: {{2}}
Huésped: {{3}}
Fechas: {{4}}
Total: {{5}}

Detalles completos en tu correo.
```

---

## Before production (also noted in the README)

1. **Permanent token**: the `WHATSAPP_TOKEN` you get with the test number is TEMPORARY
   (24 h). Create a **System User** in Meta Business → generate a permanent token with the
   `whatsapp_business_messaging` + `whatsapp_business_management` permissions → replace it in
   `.env.local` and Vercel.
2. **Real number**: Meta's test number only sends to registered recipients. For production,
   add your own number (a SIM/eSIM that can receive the verification SMS) in WhatsApp
   Manager → update `WHATSAPP_PHONE_NUMBER_ID`.
3. **Get the 9 templates above approved** (Meta takes from minutes to hours). While a
   template isn't approved, that message stays `failed_wa` and is retried — the email
   ALWAYS goes out anyway.
4. Business verification in Meta Business if you exceed the initial messaging limits.
