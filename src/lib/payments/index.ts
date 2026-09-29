import { BankTransferProvider } from "./bank-transfer";
import { PayPhoneProvider } from "./payphone";
import { PichinchaProvider } from "./pichincha";
import type { PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = {
  bank_transfer: new BankTransferProvider(),
  pichincha: new PichinchaProvider(),
  payphone: new PayPhoneProvider(),
};

/** Provider activo según env (default: transferencia bancaria). */
export function getPaymentProvider(name?: string): PaymentProvider {
  const key = name ?? process.env.PAYMENT_PROVIDER ?? "bank_transfer";
  const provider = providers[key];
  if (!provider) throw new Error(`Payment provider desconocido: ${key}`);
  return provider;
}

export * from "./types";
