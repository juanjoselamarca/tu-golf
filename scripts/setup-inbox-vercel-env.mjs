#!/usr/bin/env node
/**
 * setup-inbox-vercel-env.mjs
 *
 * Sincroniza las 4 env vars del Sistema de Inbox (Agente 5A) con Vercel:
 *   - TELEGRAM_BOT_TOKEN          (de .env.local — el usuario lo pegó tras BotFather)
 *   - TELEGRAM_WEBHOOK_SECRET     (generado random si .env.local no lo tiene)
 *   - INBOX_SETUP_SECRET          (generado random si .env.local no lo tiene)
 *   - TELEGRAM_ALLOWED_CHAT_ID    (lo subimos vacío si no está; se completa después
 *                                  del primer /start)
 *
 * Sigue el patrón de scripts/rotate-e2e-callback-secret.mjs:
 *   - Lee token de Vercel desde el auth.json de la CLI (NO usa `vercel env add`
 *     porque tiene bug Windows con stdin pipe — memoria
 *     reference_vercel_env_add_windows_bug.md).
 *   - DELETE entradas existentes en /v9/projects/<id>/env
 *   - POST nuevas en /v10/projects/<id>/env con type='encrypted' y target
 *     ['production', 'preview', 'development'].
 *
 * Idempotente: re-correrlo simplemente re-pisa los valores. Los secrets random
 * NO se regeneran si ya existen en .env.local — si querés rotar, borralos
 * primero de .env.local.
 *
 * Uso:
 *   node --env-file=.env.local scripts/setup-inbox-vercel-env.mjs
 *
 * También actualiza .env.local con los secrets generados (idempotente: no toca
 * los que ya están).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';

const VERCEL_AUTH_PATH =
  process.platform === 'win32'
    ? `${os.homedir()}/AppData/Roaming/com.vercel.cli/Data/auth.json`
    : `${os.homedir()}/.config/com.vercel.cli/Data/auth.json`;

// Mismos IDs que usa rotate-e2e-callback-secret.mjs.
const PROJECT_ID = 'prj_jb9iJB9pDVOicuv4pV9D3IqTheMK';
const TEAM_ID = 'team_GgasSxd8sEmfPOnVeE5uQFAt';

const TARGETS = ['production', 'preview', 'development'];

const log = (msg) => console.log(`[setup-inbox-env] ${msg}`);
const fatal = (msg, err) => {
  console.error(`[setup-inbox-env] FATAL: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
};

function api(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.vercel.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null });
          } catch {
            resolve({ status: res.statusCode, body: d });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function readEnvLocal() {
  const path = '.env.local';
  if (!fs.existsSync(path)) return {};
  const txt = fs.readFileSync(path, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function appendToEnvLocal(updates) {
  const path = '.env.local';
  let txt = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  // No queremos romper línea final si ya existe
  if (txt.length > 0 && !txt.endsWith('\n')) txt += '\n';
  if (!txt.includes('# Inbox System (Agente 5A)')) {
    txt += '\n# Inbox System (Agente 5A)\n';
  }
  for (const [key, val] of Object.entries(updates)) {
    txt += `${key}=${val}\n`;
  }
  fs.writeFileSync(path, txt, 'utf8');
}

async function main() {
  log('1. Leyendo .env.local...');
  const env = readEnvLocal();
  const newToEnvLocal = {};

  if (!env.TELEGRAM_BOT_TOKEN) {
    fatal(
      'TELEGRAM_BOT_TOKEN missing en .env.local. Creá el bot en BotFather primero y pegalo.',
    );
  }

  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    env.TELEGRAM_WEBHOOK_SECRET = crypto.randomBytes(24).toString('base64url');
    newToEnvLocal.TELEGRAM_WEBHOOK_SECRET = env.TELEGRAM_WEBHOOK_SECRET;
    log('   ✓ Generado TELEGRAM_WEBHOOK_SECRET (32 chars)');
  } else {
    log('   ✓ TELEGRAM_WEBHOOK_SECRET ya existía en .env.local');
  }

  if (!env.INBOX_SETUP_SECRET) {
    env.INBOX_SETUP_SECRET = crypto.randomBytes(24).toString('base64url');
    newToEnvLocal.INBOX_SETUP_SECRET = env.INBOX_SETUP_SECRET;
    log('   ✓ Generado INBOX_SETUP_SECRET (32 chars)');
  } else {
    log('   ✓ INBOX_SETUP_SECRET ya existía en .env.local');
  }

  // TELEGRAM_ALLOWED_CHAT_ID puede estar vacío en este punto — se completa
  // después del primer /start del bot.
  if (env.TELEGRAM_ALLOWED_CHAT_ID === undefined) {
    env.TELEGRAM_ALLOWED_CHAT_ID = '';
    newToEnvLocal.TELEGRAM_ALLOWED_CHAT_ID = '';
    log('   ⚠ TELEGRAM_ALLOWED_CHAT_ID vacío (se completa post-deploy)');
  }

  if (Object.keys(newToEnvLocal).length > 0) {
    appendToEnvLocal(newToEnvLocal);
    log(`   ✓ Actualizadas ${Object.keys(newToEnvLocal).length} vars en .env.local`);
  }

  log('2. Leyendo token de Vercel CLI...');
  let auth;
  try {
    auth = JSON.parse(fs.readFileSync(VERCEL_AUTH_PATH, 'utf8'));
  } catch (e) {
    fatal(`No pude leer ${VERCEL_AUTH_PATH}. ¿Está logueado vercel CLI?`, e);
  }
  const token = auth.token;
  if (!token) fatal('auth.json no tiene token');

  const targetVars = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'INBOX_SETUP_SECRET',
    'TELEGRAM_ALLOWED_CHAT_ID',
  ];

  log('3. Listando env existentes en Vercel...');
  const list = await api(token, 'GET', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`);
  if (list.status !== 200) fatal(`GET env devolvió ${list.status}`, list.body);
  const existing = list.body.envs.filter((e) => targetVars.includes(e.key));
  log(`   Encontradas ${existing.length} entries de inbox`);

  log('4. Borrando entries existentes (idempotencia)...');
  for (const e of existing) {
    const del = await api(
      token,
      'DELETE',
      `/v9/projects/${PROJECT_ID}/env/${e.id}?teamId=${TEAM_ID}`,
    );
    if (del.status !== 200) fatal(`DELETE ${e.id} devolvió ${del.status}`);
    log(`   ✓ Borrada ${e.key} (target=${(e.target || []).join(',')})`);
  }

  log('5. Creando entries nuevas (type=encrypted, target=prod+preview+dev)...');
  for (const key of targetVars) {
    const value = env[key];
    if (value === undefined) {
      log(`   ⊘ skip ${key} (undefined)`);
      continue;
    }
    if (value === '') {
      log(`   ⊘ skip ${key} (vacío — se setea después)`);
      continue;
    }
    const post = await api(token, 'POST', `/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
      key,
      value,
      type: 'encrypted',
      target: TARGETS,
    });
    if (post.status !== 201) {
      fatal(`POST ${key} devolvió ${post.status}`, post.body);
    }
    log(`   ✓ Creada ${key}`);
  }

  console.log('');
  console.log('✅ Vercel env sync completa.');
  console.log('   Vars subidas:', targetVars.filter((k) => env[k]).join(', '));
  if (!env.TELEGRAM_ALLOWED_CHAT_ID) {
    console.log('');
    console.log('   ⚠ TELEGRAM_ALLOWED_CHAT_ID vacío.');
    console.log('   Después del primer /start del bot, correr:');
    console.log('     node --env-file=.env.local scripts/setup-inbox-vercel-env.mjs');
    console.log('   con TELEGRAM_ALLOWED_CHAT_ID ya seteado en .env.local.');
  }
}

main().catch((e) => fatal('Excepción no atrapada', e));
