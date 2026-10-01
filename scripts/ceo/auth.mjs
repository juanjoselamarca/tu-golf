/**
 * scripts/ceo/auth.mjs — sesión OAuth del plan Max para los agentes nocturnos.
 * (Movido desde ceo-autonomo.mjs. Fix: `checkAuth` es async y antes se llamaba
 * sin `await` — `if (!checkAuth())` evaluaba una Promise, siempre truthy, así que
 * el chequeo nunca bloqueó nada.)
 *
 * Bug 19-sep: el token expiró a medianoche. Fix 20-sep: refresh directo vía
 * platform.claude.com con el refreshToken + CLIENT_ID público (PKCE, sin secret).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { claudeBin } from './runner.mjs';

const OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const credPath = () => resolve(homedir(), '.claude/.credentials.json');

export async function refreshTokenDirect(log = () => {}) {
  if (!existsSync(credPath())) return false;
  const creds = JSON.parse(readFileSync(credPath(), 'utf8'));
  const oauth = creds.claudeAiOauth;
  if (!oauth?.refreshToken) return false;
  try {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: oauth.refreshToken, client_id: OAUTH_CLIENT_ID }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { log(`⚠ Token refresh HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return false; }
    const body = await res.json();
    if (!body.access_token) { log('⚠ Token refresh sin access_token'); return false; }
    creds.claudeAiOauth.accessToken = body.access_token;
    if (body.refresh_token) creds.claudeAiOauth.refreshToken = body.refresh_token;
    if (body.expires_in) creds.claudeAiOauth.expiresAt = Date.now() + body.expires_in * 1000;
    writeFileSync(credPath(), JSON.stringify(creds, null, 2));
    log(`✓ Token refrescado. Expira ${new Date(creds.claudeAiOauth.expiresAt).toISOString()}`);
    return true;
  } catch (e) {
    log(`⚠ Token refresh falló: ${e.message}`);
    return false;
  }
}

/** Refresca solo si el token vence en menos de 30 min. */
export async function tryRefreshToken(log = () => {}) {
  try {
    if (!existsSync(credPath())) return false;
    const oauth = JSON.parse(readFileSync(credPath(), 'utf8')).claudeAiOauth;
    if (!oauth) return false;
    if (!oauth.expiresAt) return true; // setup-token de larga duración
    if (oauth.expiresAt > Date.now() + 30 * 60 * 1000) return true;
    const min = Math.round((oauth.expiresAt - Date.now()) / 60000);
    log(`⟳ Token OAuth ${min > 0 ? `expira en ${min} min` : `expirado hace ${-min} min`}. Refrescando...`);
    return await refreshTokenDirect(log);
  } catch (e) {
    log(`⚠ tryRefreshToken: ${e.message}`);
    return false;
  }
}

export async function checkAuth(log = () => {}) {
  if (process.env.CEO_FAKE_WINDOWS) return true; // pruebas con CLI falso
  const refreshOk = await tryRefreshToken(log);
  const status = () => JSON.parse(execFileSync(claudeBin(), ['auth', 'status', '--json'], { encoding: 'utf8', timeout: 15000, windowsHide: true })).loggedIn === true;
  try {
    if (status()) return true;
    // Sesión caída: un intento de refresh directo antes de rendirse.
    return (await refreshTokenDirect(log)) && status();
  } catch (e) {
    log(`Auth check: ${e.message.slice(0, 160)}`);
    // Si el CLI no está en el PATH de Task Scheduler pero el token en disco es válido, se sigue.
    return refreshOk;
  }
}
