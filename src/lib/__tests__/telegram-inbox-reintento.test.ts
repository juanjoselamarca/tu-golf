/**
 * getFile/downloadFile reintentan ante falla transitoria (16-nov-2026: un timeout de 8 s en
 * una sola pasada perdió las 6 fotos de un reporte) y no reintentan un 4xx definitivo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:fake-token-for-tests');

import {
  getFile,
  downloadFile,
  INBOX_PENDING_FILE_PREFIX,
  MIME_TO_EXT,
} from '@/lib/telegram-inbox';
import {
  PENDING_PREFIX,
  BY_EXT,
  pendingFileIds,
  removePending,
  nextStatus,
  fusionConAlbum,
  redact,
} from '../../../scripts/inbox-recuperar-archivos.mjs';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const abortErr = () =>
  Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('telegram-inbox: reintento de archivos', () => {
  it('getFile: timeout en el 1er intento → reintenta y resuelve', async () => {
    fetchMock
      .mockRejectedValueOnce(abortErr())
      .mockResolvedValueOnce(
        okJson({ ok: true, result: { file_path: 'photos/a.jpg', file_size: 10 } }),
      );
    const meta = await getFile('fid');
    expect(meta.filePath).toBe('photos/a.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('downloadFile: 502 y después OK → reintenta', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('x', { status: 502 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const buf = await downloadFile('photos/a.jpg');
    expect(buf.byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('dos timeouts seguidos → lanza (el webhook lo anota como pendiente)', async () => {
    fetchMock.mockRejectedValue(abortErr());
    await expect(downloadFile('photos/a.jpg')).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('4xx definitivo → no reintenta', async () => {
    fetchMock.mockResolvedValue(new Response('x', { status: 400 }));
    await expect(getFile('fid')).rejects.toThrow('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('el error nunca expone el token del bot', async () => {
    fetchMock.mockRejectedValue(abortErr());
    const err = await getFile('fid').catch((e: unknown) => e);
    expect(String(err instanceof Error ? err.message : err)).not.toMatch(/fake-token/);
  });
});

describe('scripts/inbox-recuperar-archivos.mjs', () => {
  it('usa el mismo prefijo que escribe el webhook', () => {
    expect(PENDING_PREFIX).toBe(INBOX_PENDING_FILE_PREFIX);
  });

  it('lee y borra líneas pendientes sin tocar el resto de las notas', () => {
    const notas = ['triage previo', `${PENDING_PREFIX}aaa`, `${PENDING_PREFIX}bbb`].join('\n');
    expect(pendingFileIds(notas)).toEqual(['aaa', 'bbb']);
    expect(removePending(notas, 'aaa')).toBe(['triage previo', `${PENDING_PREFIX}bbb`].join('\n'));
    expect(removePending(`${PENDING_PREFIX}aaa`, 'aaa')).toBeNull();
    expect(pendingFileIds(null)).toEqual([]);
  });

  it('cada tipo que recupera el script es uno que el webhook acepta (sin lista paralela)', () => {
    for (const [mime, ext] of Object.values(BY_EXT) as [string, string, string][]) {
      expect((MIME_TO_EXT as Record<string, string>)[mime]).toBe(ext);
    }
  });

  it('solo un reporte en error sin pendientes pasa a nuevo; otro status no se toca', () => {
    expect(nextStatus('error', 0)).toBe('nuevo');
    expect(nextStatus('error', 1)).toBe('error');
    expect(nextStatus('triaged', 0)).toBe('triaged');
    expect(nextStatus('en_progreso', 0)).toBe('en_progreso');
  });

  it('álbum de 3 donde falló la 1ª (la del caption): al fusionar queda 1 reporte con 3 fotos y el caption', () => {
    const hermana = {
      fotos_paths: ['reports/2026/11/b.jpg', 'reports/2026/11/c.jpg'],
      caption: null,
      texto: null,
      audio_path: null,
    };
    const fusion = fusionConAlbum(hermana, {
      fotos: ['reports/2026/11/a.jpg'],
      audio: null,
      caption: 'scroll roto en inscripción',
      texto: null,
    });
    expect(fusion.fotos_paths).toEqual([
      'reports/2026/11/b.jpg',
      'reports/2026/11/c.jpg',
      'reports/2026/11/a.jpg',
    ]);
    expect(fusion.caption).toBe('scroll roto en inscripción');
  });

  it('la fusión nunca pisa el caption que el álbum ya tiene', () => {
    const fusion = fusionConAlbum(
      { fotos_paths: [], caption: 'el del álbum', texto: null, audio_path: null },
      { fotos: ['x.jpg'], audio: null, caption: 'otro', texto: null },
    );
    expect(fusion.caption).toBe('el del álbum');
  });

  it('lo que imprime el script nunca lleva el token del bot', () => {
    const msg = 'Failed to parse URL from https://api.telegram.org/bot123:AbC-x_9/getFile?file_id=z';
    expect(redact(msg)).not.toMatch(/123:AbC/);
    expect(redact(msg)).toContain('bot[REDACTED]');
  });

  it('el script existe donde lo nombra el comentario del helper', () => {
    const p = path.resolve(__dirname, '../../../scripts/inbox-recuperar-archivos.mjs');
    expect(fs.existsSync(p)).toBe(true);
  });
});
