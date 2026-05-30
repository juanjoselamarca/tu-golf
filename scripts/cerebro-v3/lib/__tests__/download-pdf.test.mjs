import { describe, it, expect, afterAll } from 'vitest';
import { downloadPdf, computeSha256 } from '../download-pdf.mjs';
import { rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_DIR = resolve('scripts/cerebro-v3/.cache/pdfs-test');
const TEST_URL = 'https://assets-us-01.kc-usercontent.com/c42c7bf4-dca7-00ea-4f2e-373223f80f76/48712d47-76dc-4fd3-add1-53972c021580/2023%20Rules%20of%20Golf.pdf';

afterAll(async () => {
  await rm(CACHE_DIR, { recursive: true, force: true });
});

describe('computeSha256', () => {
  it('hash determinístico', () => {
    const h1 = computeSha256(Buffer.from('hello'));
    const h2 = computeSha256(Buffer.from('hello'));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes diferentes para inputs diferentes', () => {
    const h1 = computeSha256(Buffer.from('hello'));
    const h2 = computeSha256(Buffer.from('world'));
    expect(h1).not.toBe(h2);
  });
});

// Descarga un PDF real de 16MB de un CDN externo. NO pertenece a la suite unit
// rápida del pre-push: depende de red + del CDN, es lento (120s) y flakea sin
// conexión. Corre solo con RUN_LIVE_HTTP=1 (CI de ingestión / verificación manual).
// El body solo registra it()s (sin side-effects top-level), así que skipIf es seguro.
describe.skipIf(!process.env.RUN_LIVE_HTTP)('downloadPdf (live HTTP)', () => {
  it('descarga PDF real, calcula sha256, cachea', async () => {
    const { path, hash, fromCache, sizeBytes } = await downloadPdf(TEST_URL, { cacheDir: CACHE_DIR });
    expect(fromCache).toBe(false);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(sizeBytes).toBeGreaterThan(100_000);
    const buf = await readFile(path);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    // Descarga live de un PDF de 16MB; bajo carga concurrente del suite completo
    // 60s no alcanza (en aislamiento corre ~50s). 120s evita el flake.
  }, 120_000);

  it('segunda llamada devuelve fromCache=true', async () => {
    const { fromCache, hash: hash1 } = await downloadPdf(TEST_URL, { cacheDir: CACHE_DIR });
    expect(fromCache).toBe(true);
    // Hash debe ser idéntico al de la primera descarga
    const { hash: hash2 } = await downloadPdf(TEST_URL, { cacheDir: CACHE_DIR });
    expect(hash1).toBe(hash2);
  }, 60_000);

  it('URL inválida lanza después de retries', async () => {
    await expect(
      downloadPdf('https://example.invalid/not-a-pdf.pdf', { cacheDir: CACHE_DIR })
    ).rejects.toThrow(/failed after 3 attempts/);
  }, 30_000);
});
