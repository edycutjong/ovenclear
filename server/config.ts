/**
 * Runtime configuration, read once at boot.
 *
 * Everything that differs between a laptop and Cloud Run lives here. The
 * server refuses to start in production without the values it genuinely
 * needs, rather than half-working and taking a real customer's money into a
 * broken pipeline.
 */

export type Mode = 'dev' | 'production';

export interface Config {
  mode: Mode;
  port: number;
  /** Public origin, used to build absolute Stripe redirect + QR URLs. */
  baseUrl: string;
  dataDir: string;
  priceUsd: number;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  geminiApiKey: string | null;
  /** Ed25519 keyring namespace. Secret in production; keys derive from it. */
  ledgerKeyNamespace: string;
  supportEmail: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function loadConfig(): Config {
  const mode: Mode = process.env.NODE_ENV === 'production' ? 'production' : 'dev';
  const port = envInt('PORT', 8080);
  const baseUrl = (clean(process.env.BASE_URL) ?? `http://localhost:${port}`).replace(/\/+$/, '');

  const cfg: Config = {
    mode,
    port,
    baseUrl,
    dataDir: clean(process.env.DATA_DIR) ?? '/tmp/ovenclear',
    priceUsd: envInt('PRICE_USD', 19),
    stripeSecretKey: clean(process.env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: clean(process.env.STRIPE_WEBHOOK_SECRET),
    geminiApiKey: clean(process.env.GEMINI_API_KEY),
    ledgerKeyNamespace: clean(process.env.LEDGER_KEY_NAMESPACE) ?? 'ovenclear-dev-INSECURE',
    supportEmail: clean(process.env.SUPPORT_EMAIL) ?? 'support@ovenclear.com',
  };

  if (mode === 'production') {
    const missing: string[] = [];
    if (!cfg.stripeSecretKey) missing.push('STRIPE_SECRET_KEY');
    if (!cfg.stripeWebhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    if (!clean(process.env.BASE_URL)) missing.push('BASE_URL');
    if (!clean(process.env.LEDGER_KEY_NAMESPACE)) missing.push('LEDGER_KEY_NAMESPACE');
    if (missing.length) {
      throw new Error(
        `refusing to start in production without: ${missing.join(', ')}. ` +
          'Set them (Secret Manager on Cloud Run) and redeploy.',
      );
    }
  }
  return cfg;
}

/** One-line boot banner so the deployed instance states its own posture. */
export function describe(cfg: Config): string {
  const stripe = cfg.stripeSecretKey
    ? cfg.stripeSecretKey.startsWith('sk_live')
      ? 'stripe=LIVE'
      : 'stripe=test'
    : 'stripe=OFF';
  return [
    `mode=${cfg.mode}`,
    `port=${cfg.port}`,
    `base=${cfg.baseUrl}`,
    stripe,
    `gemini=${cfg.geminiApiKey ? 'LIVE' : 'offline-mock'}`,
    `data=${cfg.dataDir}`,
  ].join(' · ');
}
