/* global require */
const MidtransClient = require("midtrans-client") as {  // skipcq: JS-0359
  Snap: new (opts: { isProduction: boolean; serverKey: string; clientKey?: string }) => {
    createTransaction(p: {
      transaction_details: { order_id: string; gross_amount: number };
      item_details?: Array<{ id: string; name: string; price: number; quantity: number }>;
      customer_details?: { first_name?: string; email?: string; phone?: string };
      enabled_payments?: string[];
      callbacks?: { finish?: string };
    }): Promise<{ token: string; redirect_url: string }>;
  };
};

const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? "";
const CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
// Keep the server and browser on the same Midtrans environment. Older setups
// only define the public flag, while newer deployments can use the server flag.
const IS_PRODUCTION =
  (process.env.MIDTRANS_IS_PRODUCTION ?? process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION) === "true";

export const snap = new MidtransClient.Snap({
  isProduction: IS_PRODUCTION,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY,
});

export type MidtransItem = { id: string; name: string; price: number; quantity: number };

export async function createSnapTransaction(params: {
  orderId: string;
  amount: number;
  items: MidtransItem[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  finishUrl?: string;
  enabledPayments?: string[];
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const grossAmount = Math.round(params.amount);
  const itemDetails = params.items.map((item) => ({
    id: item.id.substring(0, 50),
    name: item.name.substring(0, 50),
    price: Math.round(item.price),
    quantity: Math.max(1, Math.trunc(item.quantity)),
  }));

  // Snap validates that item_details total exactly matches gross_amount.
  // Database prices and tax can contain fractional rupiah, while Snap accepts
  // integer rupiah, so include the rounding difference explicitly.
  const itemTotal = itemDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const adjustment = grossAmount - itemTotal;
  if (adjustment !== 0) {
    itemDetails.push({
      id: "order-adjustment",
      name: "Penyesuaian pembulatan",
      price: adjustment,
      quantity: 1,
    });
  }

  const customerDetails = {
    first_name: params.customerName?.trim() || "Customer",
    ...(params.customerEmail?.trim() ? { email: params.customerEmail.trim() } : {}),
    ...(params.customerPhone?.trim() ? { phone: params.customerPhone.trim() } : {}),
  };
  const transaction = await snap.createTransaction({
    transaction_details: {
      order_id: params.orderId,
      gross_amount: grossAmount,
    },
    item_details: itemDetails,
    customer_details: customerDetails,
    enabled_payments: params.enabledPayments ?? [
      "credit_card", "bank_transfer", "echannel",
      "gopay", "shopeepay", "qris", "indomaret", "alfamart",
    ],
    callbacks: {
      finish: params.finishUrl ?? (appUrl ? `${appUrl}/orders/${params.orderId}/waiting` : undefined),
    },
  });
  return { token: transaction.token, redirectUrl: transaction.redirect_url };
}

export async function verifyMidtransSignature(
  orderId: string, statusCode: string, grossAmount: string, incomingSignature: string
): Promise<boolean> {
  if (!SERVER_KEY) return false;
  const raw = `${orderId}${statusCode}${grossAmount}${SERVER_KEY}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computed = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === incomingSignature;
}

export const MIDTRANS_CLIENT_KEY = CLIENT_KEY;
