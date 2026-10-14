import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { downloadPdf, computeSha256 } from '../download-pdf.mjs';
import { rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

const CACHE_DIR = resolve('scripts/cerebro-v3/.cache/pdfs-test');

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

describe('downloadPdf', () => {
  const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 'x')]);
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url !== '/doc.pdf') {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(PDF);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((done) => server.close(done)));

  it('downloads the PDF, hashes it and caches it', async () => {
    const { path, hash, fromCache, sizeBytes } = await downloadPdf(`${baseUrl}/doc.pdf`, { cacheDir: CACHE_DIR });
    expect(fromCache).toBe(false);
    expect(hash).toBe(computeSha256(PDF));
    expect(sizeBytes).toBe(PDF.length);
    expect(await readFile(path)).toEqual(PDF);
  });

  it('serves the second call from the cache', async () => {
    const { fromCache, hash } = await downloadPdf(`${baseUrl}/doc.pdf`, { cacheDir: CACHE_DIR });
    expect(fromCache).toBe(true);
    expect(hash).toBe(computeSha256(PDF));
  });

  it('throws after retrying an HTTP error', async () => {
    await expect(
      downloadPdf(`${baseUrl}/missing.pdf`, { cacheDir: CACHE_DIR })
    ).rejects.toThrow(/failed after 3 attempts/);
  });
});
