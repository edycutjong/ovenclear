import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal Stripe client over the REST API.
 *
 * The official SDK is deliberately not a dependency: the storefront needs
 * exactly two calls (create a Checkout Session, read one back) plus webhook
 * signature verification, and `fetch` + `node:crypto` cover all three. That
 * keeps the deployed image small, the cold start fast, and the supply chain
 * for a service that handles money as narrow as it can reasonably be.
 */

const API = 'https://api.stripe.com/v1';

export interface CheckoutSession {
  id: string;
  url: string | null;
  payment_status: string;
  status: string;
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
  customer_details: { email: string | null } | null;
  client_reference_id: string | null;
  payment_intent: string | null;
  metadata: Record<string, string>;
}

export class StripeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly type?: string,
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

/**
 * Stripe expects `application/x-www-form-urlencoded` with bracketed paths for
 * nested values (`line_items[0][price_data][currency]`).
 */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          parts.push(formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof v === 'object') {
      parts.push(formEncode(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

export class Stripe {
  constructor(private readonly secretKey: string) {}

  get isLive(): boolean {
    return this.secretKey.startsWith('sk_live');
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Stripe-Version': '2024-06-20',
    };
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      ...(body ? { body: formEncode(body) } : {}),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new StripeError(`non-JSON response from Stripe (${res.status}): ${text.slice(0, 200)}`, res.status);
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; type?: string } }).error;
      throw new StripeError(err?.message ?? `Stripe ${res.status}`, res.status, err?.type);
    }
    return json as T;
  }

  createCheckoutSession(params: {
    orderId: string;
    amountUsd: number;
    productName: string;
    productDescription: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    return this.request<CheckoutSession>(
      'POST',
      '/checkout/sessions',
      {
        mode: 'payment',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer_email: params.customerEmail,
        client_reference_id: params.orderId,
        metadata: { orderId: params.orderId },
        payment_intent_data: { metadata: { orderId: params.orderId } },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(params.amountUsd * 100),
              product_data: {
                name: params.productName,
                description: params.productDescription.slice(0, 500),
              },
            },
          },
        ],
      },
      // Same order never creates two sessions / two charges.
      `checkout:${params.orderId}`,
    );
  }

  retrieveSession(id: string): Promise<CheckoutSession> {
    return this.request<CheckoutSession>('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export class WebhookVerificationError extends Error {}

/**
 * Verify a `Stripe-Signature` header against the raw request body.
 *
 * Header shape: `t=<unix>,v1=<hex>[,v1=<hex>…]`. The signed payload is
 * `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret. Comparison is
 * timing-safe and the timestamp is checked against a tolerance so a captured
 * request cannot be replayed indefinitely.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): StripeEvent {
  if (!signatureHeader) throw new WebhookVerificationError('missing Stripe-Signature header');

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=', 2);
    if (!k || !v) continue;
    if (k.trim() === 't') timestamp = v.trim();
    if (k.trim() === 'v1') signatures.push(v.trim());
  }
  if (!timestamp) throw new WebhookVerificationError('no timestamp in Stripe-Signature');
  if (signatures.length === 0) throw new WebhookVerificationError('no v1 signature in Stripe-Signature');

  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) throw new WebhookVerificationError('unparseable timestamp');
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    throw new WebhookVerificationError(`timestamp outside ${toleranceSeconds}s tolerance (replay?)`);
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();
  const matched = signatures.some((sig) => {
    let given: Buffer;
    try {
      given = Buffer.from(sig, 'hex');
    } catch {
      return false;
    }
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) throw new WebhookVerificationError('signature mismatch');

  try {
    return JSON.parse(rawBody) as StripeEvent;
  } catch {
    throw new WebhookVerificationError('valid signature but body is not JSON');
  }
}
