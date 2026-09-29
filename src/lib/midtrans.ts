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
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";

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
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const transaction = await snap.createTransaction({
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.amount),
    },
    item_details: params.items.map((item) => ({
      id: item.id,
      name: item.name.substring(0, 50),
      price: Math.round(item.price),
      quantity: item.quantity,
    })),
    customer_details: {
      first_name: params.customerName ?? "Customer",
      email: params.customerEmail ?? "",
      phone: params.customerPhone ?? "",
    },
    enabled_payments: [
      "credit_card", "bank_transfer", "echannel",
      "gopay", "shopeepay", "qris", "indomaret", "alfamart",
    ],
    callbacks: {
      finish: appUrl ? `${appUrl}/orders/${params.orderId}/waiting` : undefined,
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
