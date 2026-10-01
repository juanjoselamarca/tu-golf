/**
 * scripts/ceo/sql-proxy.mjs — intermediario local de SQL de SOLO LECTURA para
 * los agentes nocturnos.
 *
 * Por qué: el 01-oct-2026 a las 05:26 un agente nocturno aplicó a prod tres
 * migraciones desde un PR sin mergear (#468 → hotfix #470). La regla en papel no
 * alcanza. Los agentes ya no reciben SUPABASE_ACCESS_TOKEN; el scheduler (que sí
 * lo tiene en memoria) levanta este servidor en 127.0.0.1 y reenvía cada consulta
 * a la Management API con `read_only: true`, que ejecuta como
 * `supabase_read_only_user` (verificado 01-oct: sin permisos de escritura en
 * public ni de DDL; `set transaction read write` no le da privilegios).
 *
 * El agente lo usa sin saberlo: `scripts/run-sql.mjs` detecta CEO_SQL_PROXY.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const MAX_BODY = 1024 * 1024;

/** https://<ref>.supabase.co → <ref>. null si no tiene ese formato. */
export function projectRefFromUrl(url) {
  return String(url || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;
}

export function startSqlProxy({ accessToken, projectRef, log = () => {}, upstream = 'https://api.supabase.com' }) {
  const secret = randomBytes(16).toString('hex');
  const endpoint = `${upstream}/v1/projects/${projectRef}/database/query`;

  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== `/${secret}/query`) {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', async () => {
      let query;
      try { query = JSON.parse(body).query; } catch { query = null; }
      if (typeof query !== 'string' || !query.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'query vacía' }));
        return;
      }
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          // read_only va SIEMPRE: el cuerpo del agente no puede cambiarlo.
          body: JSON.stringify({ query, read_only: true }),
          signal: AbortSignal.timeout(120000),
        });
        const text = await r.text();
        log(`SQL proxy: ${r.status} (${query.length} chars)`);
        res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(text);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: `proxy: ${e.message}` }));
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/${secret}/query`,
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}
