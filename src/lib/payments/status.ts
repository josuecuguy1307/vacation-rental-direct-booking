/** Estados de pago de la reserva (Etapa 17):
 *  unpaid → deposit_paid (anticipo 30%) → fully_paid (saldo cobrado).
 *  'paid' es legacy y equivale a deposit_paid. */
export const DEPOSIT_PAID = ["paid", "deposit_paid", "fully_paid"];
export const FULLY_PAID = "fully_paid";

export const hasDeposit = (s: string | null | undefined) => !!s && DEPOSIT_PAID.includes(s);
export const isFullyPaid = (s: string | null | undefined) => s === FULLY_PAID;
