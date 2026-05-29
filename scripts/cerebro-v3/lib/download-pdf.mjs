/**
 * download-pdf.mjs — Descarga PDFs con cache local + sha256 + retry exponencial.
 * Usa User-Agent realista porque USGA y otros bloquean requests sin UA.
 */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE = resolve(__dirname, '..', '.cache', 'pdfs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function computeSha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function slugFromUrl(url) {
  return url.replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.pdf';
}

/**
 * Descarga un PDF a cache local. Idempotente: si ya está cacheado, devuelve
 * el path sin re-descargar.
 *
 * @param {string} url
 * @param {{ cacheDir?: string }} [opts]
 * @returns {Promise<{ path: string, hash: string, fromCache: boolean, sizeBytes: number }>}
 */
export async function downloadPdf(url, opts = {}) {
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE;
  await mkdir(cacheDir, { recursive: true });
  const filePath = join(cacheDir, slugFromUrl(url));

  // Cache hit
  try {
    const s = await stat(filePath);
    if (s.size > 1000) {
      const buf = await readFile(filePath);
      // Verificar que sigue siendo PDF válido
      if (buf.subarray(0, 4).toString('ascii') === '%PDF') {
        return { path: filePath, hash: computeSha256(buf), fromCache: true, sizeBytes: buf.length };
      }
    }
  } catch {
    // Cache miss
  }

  const maxRetries = 3;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/pdf,*/*;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error(`PDF too small: ${buf.length} bytes`);
      if (buf.subarray(0, 4).toString('ascii') !== '%PDF') {
        throw new Error(`Not a valid PDF (missing %PDF magic bytes)`);
      }
      await writeFile(filePath, buf);
      return { path: filePath, hash: computeSha256(buf), fromCache: false, sizeBytes: buf.length };
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw new Error(`downloadPdf failed after ${maxRetries} attempts: ${lastErr?.message}`);
}
