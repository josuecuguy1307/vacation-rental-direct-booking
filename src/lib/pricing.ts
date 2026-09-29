/**
 * Cálculo de precios — SIEMPRE en servidor.
 * Nunca se confía en montos enviados por el cliente: la API solo recibe
 * fechas + adultos/niños + addon ids con cantidades, y recalcula todo
 * contra la DB.
 *
 * Modelo por temporada con split semana/finde (Etapas 8 + 8.5):
 *   base_noche   = de la season que cubre esa noche (o del default de la
 *                  propiedad): weekday_price_cents para noches de domingo a
 *                  jueves, weekend_price_cents para noches de VIERNES y
 *                  SÁBADO (la noche del domingo es weekday).
 *   extra_noche  = max(0, huéspedes - included_guests) × extra_guest_price
 *                  (los extras NO varían por temporada ni por día)
 *   alojamiento  = Σ (base_noche + extra_noche) noche a noche
 *   mascotas     = pet_count × pet_price_cents (cargo por estadía)
 *   base         = alojamiento + extras(cajita) + mascotas + cleaning_fee
 *   garantía     = guarantee_cents (reembolsable; se cobra COMPLETA, no se prorratea)
 *   total        = base + garantía
 *   anticipo     = base × deposit_percentage + garantía
 *
 * Una noche N pertenece a una season si date_start <= N < date_end
 * (intervalo medio-abierto '[)', igual que las reservas). Si varias seasons
 * cubren la misma noche gana la de mayor priority.
 *
 * Todo el dinero se computa en CENTAVOS (enteros) y se expone en dólares.
 */

export type AddonRow = {
  id: string;
  price: number;
  type: "per_stay" | "per_night" | "per_person";
};

export type AddonSelection = { addon_id: string; quantity: number };

export type SeasonRow = {
  id?: string;
  name: string;
  date_start: string;        // YYYY-MM-DD, inclusivo
  date_end: string;          // YYYY-MM-DD, exclusivo
  weekday_price_cents: number;  // noches dom-jue
  weekend_price_cents: number;  // noches vie y sáb
  priority: number;
};

export type NightLine = {
  date: string;             // noche que EMPIEZA en esta fecha
  base_price: number;       // dólares (base de la season o default)
  season: string | null;    // nombre de la season aplicada, null = default
  weekend: boolean;         // true = noche de viernes o sábado
  extra_guests_fee: number; // dólares de huéspedes extra en esa noche
};

export type Quote = {
  nights: number;
  adults: number;
  children: number;
  guests: number;             // adultos + niños (todos cuentan igual)
  included_guests: number;    // cubiertos por el precio base
  extra_guests: number;       // huéspedes del 5to en adelante
  extra_guest_fee: number;    // dólares por huésped extra por noche
  nightly: NightLine[];       // desglose auditable noche a noche
  base_lodging_total: number; // Σ bases
  extra_guests_total: number; // Σ extras por huésped
  lodging_total: number;      // base + extras por huésped
  extras_total: number;       // cajita / experiencias
  pets: number;               // cantidad de mascotas
  pet_unit_price: number;     // dólares por mascota (config)
  pets_total: number;         // dólares: pets × pet_unit_price
  cleaning_fee: number;
  guarantee: number;          // dólares: garantía reembolsable (0 = sin garantía)
  total: number;
  deposit_amount: number;
  addon_lines: Array<{
    addon_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

/** Tope duro de noches por estadía: acota el desglose nightly (memoria,
 *  jsonb en price_breakdown) y evita que una reserva pending bloquee el
 *  calendario por años. */
export const MAX_NIGHTS = 60;

const toDollars = (cents: number) => Math.round(cents) / 100;
const toCents = (dollars: number) => Math.round(dollars * 100);

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z");
  return Math.round(ms / 86_400_000);
}

/** ¿La noche que EMPIEZA en `date` es de finde? (viernes o sábado) */
export function isWeekendNight(date: string): boolean {
  const dow = new Date(Date.parse(date + "T00:00:00Z")).getUTCDay(); // 0=dom … 5=vie 6=sáb
  return dow === 5 || dow === 6;
}

export type DefaultPrices = {
  weekdayCents: number;  // properties.weekday_price_cents
  weekendCents: number;  // properties.weekend_price_cents
};

/**
 * Base de la noche que empieza en `date`: season de mayor priority que la
 * cubre (o el default de la propiedad), y dentro de ella weekday o weekend
 * según el día de la semana. Empate de priority: gana la season de
 * date_start más reciente (la más específica), luego orden por nombre.
 */
export function baseForNight(
  date: string,
  seasons: SeasonRow[],
  defaults: DefaultPrices
): { cents: number; season: string | null; weekend: boolean } {
  let best: SeasonRow | null = null;
  for (const s of seasons) {
    if (s.date_start <= date && date < s.date_end) {
      if (
        !best ||
        s.priority > best.priority ||
        (s.priority === best.priority &&
          (s.date_start > best.date_start ||
            (s.date_start === best.date_start && s.name < best.name)))
      ) {
        best = s;
      }
    }
  }
  const weekend = isWeekendNight(date);
  const cents = best
    ? (weekend ? best.weekend_price_cents : best.weekday_price_cents)
    : (weekend ? defaults.weekendCents : defaults.weekdayCents);
  return { cents: Math.round(cents), season: best ? best.name : null, weekend };
}

export function computeQuote(params: {
  defaultWeekdayCents: number;  // properties.weekday_price_cents (dom-jue)
  defaultWeekendCents: number;  // properties.weekend_price_cents (vie-sáb)
  extraGuestCents: number;      // properties.extra_guest_price_cents
  includedGuests: number;       // properties.included_guests
  maxGuests: number;            // capacidad dura (8)
  cleaningFee: number;          // dólares, por estadía
  depositPercentage: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  petCount?: number;            // mascotas (cargo por estadía)
  petPriceCents?: number;       // properties.pet_price_cents — $ por mascota
  guaranteeCents?: number;      // properties.guarantee_cents — garantía reembolsable
  seasons: SeasonRow[];         // filas reales de la DB que tocan el rango
  addons: AddonRow[];           // filas reales de la DB
  selections: AddonSelection[]; // lo que pidió el cliente (solo ids + qty)
}): Quote {
  const nights = nightsBetween(params.checkIn, params.checkOut);
  if (nights <= 0) throw new Error("Rango de fechas inválido");
  if (nights > MAX_NIGHTS) throw new Error(`Estadía máxima: ${MAX_NIGHTS} noches`);
  if (params.adults < 1) throw new Error("Se requiere al menos 1 adulto");
  if (params.children < 0) throw new Error("children inválido");

  const guests = params.adults + params.children;
  if (guests > params.maxGuests) {
    throw new Error(`Máximo ${params.maxGuests} huéspedes`);
  }

  const extra_guests = Math.max(0, guests - params.includedGuests);
  const extraNightCents = extra_guests * Math.round(params.extraGuestCents);

  // alojamiento noche a noche: base de la season + extras por huésped
  const nightly: NightLine[] = [];
  let baseCentsSum = 0;
  const start = Date.parse(params.checkIn + "T00:00:00Z");
  for (let i = 0; i < nights; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const { cents, season, weekend } = baseForNight(date, params.seasons, {
      weekdayCents: params.defaultWeekdayCents,
      weekendCents: params.defaultWeekendCents,
    });
    baseCentsSum += cents;
    nightly.push({
      date,
      base_price: toDollars(cents),
      season,
      weekend,
      extra_guests_fee: toDollars(extraNightCents),
    });
  }
  const extraCentsSum = extraNightCents * nights;
  const lodgingCents = baseCentsSum + extraCentsSum;

  // extras (cajita / experiencias) — precios de la DB
  const byId = new Map(params.addons.map((a) => [a.id, a]));
  const addon_lines = params.selections.map((sel) => {
    const addon = byId.get(sel.addon_id);
    if (!addon) throw new Error(`Addon no disponible: ${sel.addon_id}`);
    const qty = Math.max(1, Math.floor(sel.quantity));
    const multiplier =
      addon.type === "per_night" ? nights :
      addon.type === "per_person" ? guests :
      1; // per_stay
    const unitCents = toCents(Number(addon.price));
    return {
      addon_id: addon.id,
      quantity: qty,
      unit_price: toDollars(unitCents),
      line_total: toDollars(unitCents * qty * multiplier),
    };
  });

  const extrasCents = addon_lines.reduce((s, l) => s + toCents(l.line_total), 0);
  const cleaningCents = toCents(params.cleaningFee);

  // mascotas: cargo por estadía (parte del costo de la estadía, sujeto al anticipo)
  const petCount = Math.max(0, Math.floor(params.petCount ?? 0));
  const petUnitCents = Math.max(0, Math.round(params.petPriceCents ?? 0));
  const petsCents = petCount * petUnitCents;

  // garantía reembolsable: se cobra COMPLETA (no se prorratea con el anticipo);
  // al final de la estadía se le devuelve al huésped desde el panel.
  const guaranteeCents = Math.max(0, Math.round(params.guaranteeCents ?? 0));

  // base = estadía cobrable (alojamiento + extras + mascotas + limpieza)
  const baseTotalCents = lodgingCents + extrasCents + petsCents + cleaningCents;
  const totalCents = baseTotalCents + guaranteeCents;
  // el anticipo aplica el % a la base y suma la garantía COMPLETA:
  // "el total a pagar para confirmar incluye la garantía".
  const depositCents =
    Math.round(baseTotalCents * (params.depositPercentage / 100)) + guaranteeCents;

  return {
    nights,
    adults: params.adults,
    children: params.children,
    guests,
    included_guests: params.includedGuests,
    extra_guests,
    extra_guest_fee: toDollars(params.extraGuestCents),
    nightly,
    base_lodging_total: toDollars(baseCentsSum),
    extra_guests_total: toDollars(extraCentsSum),
    lodging_total: toDollars(lodgingCents),
    extras_total: toDollars(extrasCents),
    pets: petCount,
    pet_unit_price: toDollars(petUnitCents),
    pets_total: toDollars(petsCents),
    cleaning_fee: toDollars(cleaningCents),
    guarantee: toDollars(guaranteeCents),
    total: toDollars(totalCents),
    deposit_amount: toDollars(depositCents),
    addon_lines,
  };
}
