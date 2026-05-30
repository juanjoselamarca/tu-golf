#!/usr/bin/env node
/**
 * verify-sources.mjs — Valida que las URLs de sources.config.json sean accesibles públicamente.
 * Uso: node scripts/cerebro-v3/verify-sources.mjs
 * Exit 0 si todas OK, 1 si alguna falla.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, 'sources.config.json');
const sources = JSON.parse(await readFile(configPath, 'utf8'));

console.log(`Verifying ${sources.length} sources...\n`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const results = [];
for (const s of sources) {
  try {
    // GET con Range para no descargar todo el PDF
    const res = await fetch(s.url_source, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/pdf,*/*;q=0.8',
        'Range': 'bytes=0-1023'
      }
    });
    const ct = res.headers.get('content-type') ?? '';
    const cl = res.headers.get('content-length');
    // PDF magic bytes: %PDF
    const buf = Buffer.from(await res.arrayBuffer());
    const isPdf = buf.subarray(0, 4).toString('ascii') === '%PDF';
    const ok = (res.ok || res.status === 206) && (isPdf || ct.includes('pdf'));
    results.push({ slug: s.slug, status: res.status, contentType: ct, contentLength: cl, isPdf, ok });
    console.log(`${ok ? '✓' : '✗'} ${s.slug.padEnd(32)} ${res.status}  ${ct.padEnd(24)} isPdf=${isPdf}`);
  } catch (e) {
    results.push({ slug: s.slug, status: 'NETWORK_ERROR', ok: false, err: e.message });
    console.log(`✗ ${s.slug.padEnd(32)} NETWORK_ERROR  ${e.message}`);
  }
}

const failed = results.filter(r => !r.ok);
console.log();
if (failed.length) {
  console.log(`${failed.length}/${results.length} fuentes fallaron:`);
  failed.forEach(f => console.log(`  - ${f.slug}: ${f.status}${f.err ? ' ('+f.err+')' : ''}`));
  console.log(`\nNota: si fedegolf-chile-reglamento falla con 404, no es bloqueante.`);
  console.log(`Marcar manualmente status='unavailable' después de la migración.`);
  process.exit(1);
}
console.log(`${results.length}/${results.length} URLs verificadas OK.`);
