/**
 * Flujo completo de scripts/inbox-recuperar-archivos.mjs (recuperarPendientes) contra una
 * base en memoria: fusión con el álbum, varias pendientes del mismo álbum en una corrida,
 * álbum cerrado, y reversión cuando el álbum cambia mientras corre.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recuperarPendientes, PENDING_PREFIX } from '../../../scripts/inbox-recuperar-archivos.mjs';

type Row = Record<string, unknown> & { id: string };

function fakeSupabase(rows: Row[], opts: { antesDeUpdate?: (id: string) => void } = {}) {
  const uploads: string[] = [];
  const removed: string[] = [];
  const from = () => {
    const preds: ((r: Row) => boolean)[] = [];
    let payload: Record<string, unknown> | null = null;
    let order: string | null = null;
    let limit = Infinity;
    let conSelect = false;
    const run = () => {
      if (payload) {
        const idFilter = preds.length ? rows.find((r) => preds[0](r))?.id : undefined;
        if (idFilter) opts.antesDeUpdate?.(idFilter);
      }
      let hits = rows.filter((r) => preds.every((p) => p(r)));
      if (order) hits = [...hits].sort((a, b) => Number(a[order!]) - Number(b[order!]));
      hits = hits.slice(0, limit);
      if (payload) {
        for (const h of hits) Object.assign(h, structuredClone(payload));
        // Como PostgREST: un update solo devuelve filas si se encadenó .select().
        return { data: conSelect ? hits.map((h) => ({ id: h.id })) : null, error: null };
      }
      return { data: hits.map((h) => structuredClone(h)), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => ((conSelect = true), q),
      update: (p: Record<string, unknown>) => ((payload = p), q),
      like: (c: string, pat: string) => (preds.push((r) => String(r[c] ?? '').includes(pat.replace(/%/g, ''))), q),
      eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (preds.push((r) => r[c] !== v), q),
      in: (c: string, vs: unknown[]) => (preds.push((r) => vs.includes(r[c])), q),
      contains: (c: string, vs: string[]) => (preds.push((r) => vs.every((v) => (r[c] as string[]).includes(v))), q),
      containedBy: (c: string, vs: string[]) => (preds.push((r) => (r[c] as string[]).every((v) => vs.includes(v))), q),
      order: (c: string) => ((order = c), q),
      limit: (n: number) => ((limit = n), q),
      maybeSingle: async () => {
        const { data } = run();
        return { data: (data as unknown[])[0] ?? null, error: null };
      },
      then: (res: (r: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  };
  const storage = {
    from: () => ({
      upload: async (path: string) => (uploads.push(path), { error: null }),
      remove: async (paths: string[]) => (removed.push(...paths), { error: null }),
    }),
  };
  return { client: { from, storage }, uploads, removed };
}

const base = (over: Partial<Row> & { id: string }): Row => ({
  status: 'error',
  notas: null,
  fotos_paths: [],
  audio_path: null,
  caption: null,
  texto: null,
  telegram_media_group_id: 'g1',
  telegram_chat_id: 7,
  recibido_en: 0,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('/getFile')) {
      const id = new URL(url).searchParams.get('file_id');
      return new Response(JSON.stringify({ ok: true, result: { file_path: `photos/${id}.jpg` } }));
    }
    return new Response(new Uint8Array([1, 2, 3]));
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recuperarPendientes', () => {
  it('álbum de 3 con la 1ª (caption) y la 2ª fallidas: ambas van al reporte del álbum, no a la fila descartada', async () => {
    const rows = [
      base({ id: 'E1', recibido_en: 1, caption: 'scroll roto', notas: `${PENDING_PREFIX}f1` }),
      base({ id: 'E2', recibido_en: 2, notas: `${PENDING_PREFIX}f2` }),
      base({ id: 'R', recibido_en: 3, status: 'nuevo', fotos_paths: ['reports/r.jpg'] }),
    ];
    const { client } = fakeSupabase(rows);
    const res = await recuperarPendientes(client, '1:tok');
    expect(res).toEqual({ recuperados: 2, fallidos: 0, vacio: false });
    const R = rows.find((r) => r.id === 'R')!;
    expect(R.fotos_paths).toHaveLength(3);
    expect(R.caption).toBe('scroll roto');
    for (const id of ['E1', 'E2']) {
      const e = rows.find((r) => r.id === id)!;
      expect(e.status).toBe('descartado');
      expect(e.notas).toBe('fusionado en R');
    }
  });

  it('álbum ya resuelto: la foto queda en su propio reporte como nuevo (no se esconde en algo cerrado)', async () => {
    const rows = [
      base({ id: 'E', recibido_en: 1, notas: `${PENDING_PREFIX}f1` }),
      base({ id: 'R', recibido_en: 2, status: 'resuelto', fotos_paths: ['reports/r.jpg'] }),
    ];
    const { client } = fakeSupabase(rows);
    await recuperarPendientes(client, '1:tok');
    const E = rows.find((r) => r.id === 'E')!;
    expect(E.status).toBe('nuevo');
    expect(E.notas).toBeNull();
    expect(E.fotos_paths).toHaveLength(1);
    expect(rows.find((r) => r.id === 'R')!.fotos_paths).toEqual(['reports/r.jpg']);
  });

  it('sin álbum: el archivo queda en su reporte y pasa de error a nuevo', async () => {
    const rows = [base({ id: 'E', telegram_media_group_id: null, notas: `${PENDING_PREFIX}f1` })];
    const { client } = fakeSupabase(rows);
    await recuperarPendientes(client, '1:tok');
    expect(rows[0].status).toBe('nuevo');
    expect(rows[0].fotos_paths).toHaveLength(1);
  });

  it('el álbum cambia mientras corre: se revierte la fila pendiente y se borra lo subido', async () => {
    const rows = [
      base({ id: 'E', recibido_en: 1, notas: `${PENDING_PREFIX}f1` }),
      base({ id: 'R', recibido_en: 2, status: 'nuevo', fotos_paths: ['reports/r.jpg'] }),
    ];
    const { client, uploads, removed } = fakeSupabase(rows, {
      antesDeUpdate: (id) => {
        if (id === 'R') rows[1].fotos_paths = ['reports/r.jpg', 'reports/otra.jpg'];
      },
    });
    const res = await recuperarPendientes(client, '1:tok');
    expect(res.fallidos).toBe(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].notas).toBe(`${PENDING_PREFIX}f1`);
    expect(removed).toEqual(uploads);
  });

  it('sin pendientes no hace nada', async () => {
    const { client } = fakeSupabase([base({ id: 'R', status: 'nuevo' })]);
    expect(await recuperarPendientes(client, '1:tok')).toEqual({ recuperados: 0, fallidos: 0, vacio: true });
  });
});
