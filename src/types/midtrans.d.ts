declare module "midtrans-client" {
  interface SnapOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey?: string;
  }

  interface TransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  interface ItemDetail {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }

  interface CustomerDetails {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  }

  interface SnapParameter {
    transaction_details: TransactionDetails;
    item_details?: ItemDetail[];
    customer_details?: CustomerDetails;
    enabled_payments?: string[];
    callbacks?: {
      finish?: string;
      pending?: string;
      error?: string;
    };
  }

  interface SnapResponse {
    token: string;
    redirect_url: string;
  }

  class Snap {
    constructor(options: SnapOptions);
    createTransaction(parameter: SnapParameter): Promise<SnapResponse>;
  }

  class CoreApi {
    constructor(options: SnapOptions);
    transaction: {
      status(orderId: string): Promise<Record<string, string>>;
      cancel(orderId: string): Promise<Record<string, string>>;
      refund(orderId: string, params?: Record<string, unknown>): Promise<Record<string, string>>;
    };
  }

  export type ParameterType = SnapParameter;
}

declare global {
  interface Window {
    snap?: {
      pay: (token: string, callbacks: {
        onSuccess?: (result: Record<string, string>) => void;
        onPending?: (result: Record<string, string>) => void;
        onError?: (result: Record<string, string>) => void;
        onClose?: () => void;
      }) => void;
      embed: (token: string, options: { embedId: string }) => void;
      hide: () => void;
    };
  }
}

export {};

// Fallback declaration for environments without @types/midtrans-client
declare module 'midtrans-client';
