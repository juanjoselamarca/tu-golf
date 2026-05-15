/**
 * Logger del Sistema de Inbox (Agente 5A).
 *
 * Diseño:
 * - Cero deps externas (no pino, no winston).
 * - Output: JSON structured a console.log/warn/error → visible en Vercel
 *   Functions logs y agregable por queries.
 * - Redaction: bot tokens y strings tipo secret se reemplazan por [REDACTED]
 *   antes de imprimir.
 * - Bridge a Sentry: si `Sentry.captureException` está disponible en
 *   globalThis (cargado por @sentry/nextjs en el proyecto), errors se
 *   forwarean. No falla si no está.
 *
 * Nombre con sufijo -inbox para no chocar con un futuro logger general
 * del proyecto.
 */

export type LogLevel = 'info' | 'warn' | 'error';

const REDACT_PATTERNS: ReadonlyArray<RegExp> = [
  /bot\d+:[A-Za-z0-9_-]+/g, // Telegram bot tokens (formato <id>:<hash>)
  /sbp_[A-Za-z0-9]{40,}/g, // Supabase Management tokens
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, // JWT
];

function redact(value: string): string {
  return REDACT_PATTERNS.reduce<string>(
    (acc, pattern) => acc.replace(pattern, '[REDACTED]'),
    value,
  );
}

function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (typeof val === 'string') {
      out[key] = redact(val);
    } else if (val instanceof Error) {
      out[key] = { name: val.name, message: redact(val.message) };
    } else {
      out[key] = val;
    }
  }
  return out;
}

type SentryShape = {
  captureMessage?: (msg: string, level: string) => void;
  captureException?: (err: unknown) => void;
};

function getSentry(): SentryShape | null {
  const g = globalThis as unknown as { Sentry?: SentryShape };
  return g.Sentry ?? null;
}

export function log(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
): void {
  const safeMsg = redact(msg);
  const payload = {
    level,
    msg: safeMsg,
    ts: new Date().toISOString(),
    ...(data ? redactObject(data) : {}),
  };
  // eslint-disable-next-line no-console -- entrada controlada del logger
  console[level](JSON.stringify(payload));

  if (level === 'error') {
    const sentry = getSentry();
    sentry?.captureMessage?.(safeMsg, 'error');
  }
}
