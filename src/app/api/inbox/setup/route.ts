/**
 * GET /api/inbox/setup?key=<INBOX_SETUP_SECRET>
 *
 * Configura el webhook de Telegram contra el dominio canónico de producción.
 * Idempotente: re-llamarlo simplemente re-pisa el setup.
 *
 * Se usa una sola vez después del primer deploy. También sirve como
 * health-check: si responde { ok: true }, las env vars llegaron al runtime.
 *
 * URL del webhook: hardcoded a https://golfersplus.vercel.app/api/inbox/webhook.
 *   NO usamos VERCEL_URL porque cambia con cada preview deploy y el bot
 *   quedaría apuntando a URLs muertas.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  setWebhook,
  getWebhookInfo,
  safeEqualHeader,
} from '@/lib/telegram-inbox';
import { log } from '@/lib/inbox-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CANONICAL_WEBHOOK_URL = 'https://golfersplus.vercel.app/api/inbox/webhook';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const expected = process.env.INBOX_SETUP_SECRET;
    if (!expected) {
      log('error', 'INBOX_SETUP_SECRET missing in runtime');
      return NextResponse.json({ ok: false, error: 'misconfigured' }, { status: 500 });
    }
    const provided = req.nextUrl.searchParams.get('key');
    if (!safeEqualHeader(provided, expected)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { ok: false, error: 'TELEGRAM_WEBHOOK_SECRET missing' },
        { status: 500 },
      );
    }

    const setResult = await setWebhook({
      url: CANONICAL_WEBHOOK_URL,
      secretToken: webhookSecret,
      allowedUpdates: ['message', 'edited_message'],
      dropPendingUpdates: true,
    });
    const info = await getWebhookInfo();

    return NextResponse.json({
      ok: true,
      webhookUrl: CANONICAL_WEBHOOK_URL,
      setWebhook: setResult,
      webhookInfo: info,
    });
  } catch (err) {
    log('error', 'inbox setup failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
