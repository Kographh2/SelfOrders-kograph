declare module 'midtrans-client' {
  interface SnapOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey?: string;
  }
  interface SnapParameter {
    transaction_details: { order_id: string; gross_amount: number };
    item_details?: Array<{ id: string; name: string; price: number; quantity: number }>;
    customer_details?: { first_name?: string; email?: string; phone?: string };
    enabled_payments?: string[];
    callbacks?: { finish?: string; pending?: string; error?: string };
  }
  interface SnapResponse { token: string; redirect_url: string }
  class Snap {
    constructor(options: SnapOptions);
    createTransaction(parameter: SnapParameter): Promise<SnapResponse>;
  }
  class CoreApi {
    constructor(options: SnapOptions);
    transaction: {
      status(orderId: string): Promise<Record<string, string>>;
      cancel(orderId: string): Promise<Record<string, string>>;
    };
  }
}
