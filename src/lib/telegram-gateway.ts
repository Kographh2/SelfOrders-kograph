type TelegramGatewayEnvelope<T> = {
  ok: boolean;
  result?: T;
  error?: string;
};

export class TelegramGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TelegramGatewayError";
  }
}

export async function telegramGatewayCall<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_GATEWAY_TOKEN;
  if (!token) throw new TelegramGatewayError("TOKEN_NOT_CONFIGURED");

  let response: Response;
  try {
    response = await fetch(`https://gatewayapi.telegram.org/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    throw new TelegramGatewayError("NETWORK_ERROR");
  }

  let envelope: TelegramGatewayEnvelope<T>;
  try {
    envelope = await response.json() as TelegramGatewayEnvelope<T>;
  } catch {
    throw new TelegramGatewayError("INVALID_RESPONSE");
  }
  if (!response.ok || !envelope.ok || envelope.result === undefined) {
    throw new TelegramGatewayError(envelope.error || `HTTP_${response.status}`);
  }
  return envelope.result;
}
