/**
 * Tests del webhook de Inbox (Agente 5A).
 *
 * Cobertura crítica (8 escenarios) — alineada con directiva CERO FALLOS:
 *  1. 401 sin header secret_token
 *  2. 401 con secret_token incorrecto (longitud distinta — no crashea timingSafeEqual)
 *  3. /start exento del allowlist (bootstrap, sin chat_id válido)
 *  4. Mensaje texto válido + chat autorizado → INSERT en DB
 *  5. chat_id no autorizado → 200 silencioso, NO insert, NO sendMessage
 *  6. mime_type no whitelist → sendMessage error y NO insert
 *  7. file_size > 10MB → sendMessage error, NO download, NO insert
 *  8. media_group_id con row reciente (<60s) → UPDATE, no INSERT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Env stubs ANTES de importar la route.
// ──────────────────────────────────────────────
vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:fake-token-for-tests');
vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'secret-correcto-aaaa');
vi.stubEnv('TELEGRAM_ALLOWED_CHAT_ID', '987654321');
vi.stubEnv('INBOX_SETUP_SECRET', 'setup-secret-bbbb');

// ──────────────────────────────────────────────
// Mock de @/lib/telegram-inbox: spies sobre sendMessage, getFile, downloadFile.
// safeEqualHeader y extFromMime los dejamos reales para que el test sea
// representativo del path crítico de seguridad.
// ──────────────────────────────────────────────
const sendMessageSpy = vi.fn<(chatId: number, text: string) => Promise<void>>(
  async () => undefined,
);
const getFileSpy = vi.fn<
  (fileId: string) => Promise<{
    filePath: string;
    fileSize: number;
    mimeType: string | null;
  }>
>();
const downloadFileSpy = vi.fn<(filePath: string) => Promise<ArrayBuffer>>();

vi.mock('@/lib/telegram-inbox', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/telegram-inbox')>(
      '@/lib/telegram-inbox',
    );
  return {
    ...actual,
    sendMessage: (chatId: number, text: string) => sendMessageSpy(chatId, text),
    getFile: (fileId: string) => getFileSpy(fileId),
    downloadFile: (filePath: string) => downloadFileSpy(filePath),
  };
});

// ──────────────────────────────────────────────
// Mock de @/lib/supabaseAdmin con un builder fluent que registra todas
// las operaciones para assertion.
// ──────────────────────────────────────────────
type Captured = {
  inserts: unknown[];
  updates: { match: Record<string, unknown>; payload: unknown }[];
  deletes: { match: Record<string, unknown> }[];
  selectMaybeSingleReturn: unknown;
  selectListReturn: unknown[];
  selectCountReturn: number;
  uploads: { bucket: string; path: string; contentType: string }[];
  uploadError: { message: string } | null;
};

let captured: Captured;

function makeMockSupabase() {
  type ChainState = {
    table: string;
    filters: Record<string, unknown>;
    isUpdate: { payload: unknown } | null;
    isDelete: boolean;
    isCount: boolean;
  };

  const chain = (state: ChainState) => {
    const api: Record<string, unknown> = {};
    api.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      state.isCount = !!opts?.count;
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      state.filters[col] = val;
      return api;
    };
    api.gte = (col: string, val: unknown) => {
      state.filters[`${col}__gte`] = val;
      return api;
    };
    api.order = () => api;
    api.limit = () => api;
    api.maybeSingle = async () => ({
      data: captured.selectMaybeSingleReturn,
      error: null,
    });
    api.insert = async (payload: unknown) => {
      captured.inserts.push(payload);
      return { data: null, error: null };
    };
    api.update = (payload: unknown) => {
      state.isUpdate = { payload };
      return api;
    };
    api.delete = () => {
      state.isDelete = true;
      return api;
    };
    // Final resolution as a Promise for update/delete chains
    api.then = (resolve: (r: { data: null; error: null }) => unknown) => {
      if (state.isUpdate) {
        captured.updates.push({
          match: state.filters,
          payload: state.isUpdate.payload,
        });
      } else if (state.isDelete) {
        captured.deletes.push({ match: state.filters });
      } else if (state.isCount) {
        // Already handled below for count path
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    // Para count path: select + eq → resolves directly to { count, error }
    Object.defineProperty(api, 'count_resolve', {
      get: async () => ({ count: captured.selectCountReturn, error: null }),
    });
    return api;
  };

  // Custom from() returns chain + .select() that supports count via .then()
  return {
    from: (table: string) => {
      const state: ChainState = {
        table,
        filters: {},
        isUpdate: null,
        isDelete: false,
        isCount: false,
      };
      const c = chain(state) as Record<string, unknown>;
      // Override select for count head: returns thenable resolving to {count}
      const origSelect = c.select as (
        cols?: string,
        opts?: { count?: string; head?: boolean },
      ) => unknown;
      c.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
        origSelect(cols, opts);
        if (opts?.count === 'exact' && opts?.head) {
          // count path: when .eq() is chained then awaited
          const countApi: Record<string, unknown> = {
            eq: (_col: string, _val: unknown) => countApi,
            then: (resolve: (r: { count: number; error: null }) => unknown) =>
              Promise.resolve({
                count: captured.selectCountReturn,
                error: null,
              }).then(resolve),
          };
          return countApi;
        }
        // list path: returns thenable resolving to { data, error }
        const listApi: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            state.filters[col] = val;
            return listApi;
          },
          gte: (col: string, val: unknown) => {
            state.filters[`${col}__gte`] = val;
            return listApi;
          },
          order: () => listApi,
          limit: () => listApi,
          maybeSingle: async () => ({
            data: captured.selectMaybeSingleReturn,
            error: null,
          }),
          then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({
              data: captured.selectListReturn,
              error: null,
            }).then(resolve),
        };
        return listApi;
      };
      return c;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (
          path: string,
          _data: ArrayBuffer,
          opts: { contentType: string },
        ) => {
          captured.uploads.push({ bucket, path, contentType: opts.contentType });
          return captured.uploadError
            ? { error: captured.uploadError }
            : { error: null };
        },
      }),
    },
  };
}

vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => makeMockSupabase(),
}));

// ──────────────────────────────────────────────
// Import después de los mocks
// ──────────────────────────────────────────────
// eslint-disable-next-line import/first
import { POST } from '../route';

// ──────────────────────────────────────────────
// Helpers para construir requests
// ──────────────────────────────────────────────
const VALID_SECRET = 'secret-correcto-aaaa';
const ALLOWED_CHAT = 987654321;
const OTHER_CHAT = 555;

function buildRequest(
  body: unknown,
  secret: string | null = VALID_SECRET,
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) {
    headers['X-Telegram-Bot-Api-Secret-Token'] = secret;
  }
  return new Request('http://localhost/api/inbox/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function textMessage(
  text: string,
  chatId: number = ALLOWED_CHAT,
  overrides: Record<string, unknown> = {},
) {
  return {
    update_id: 1,
    message: {
      message_id: Math.floor(Math.random() * 100000),
      date: nowUnix(),
      chat: { id: chatId },
      from: { id: chatId },
      text,
      ...overrides,
    },
  };
}

beforeEach(() => {
  captured = {
    inserts: [],
    updates: [],
    deletes: [],
    selectMaybeSingleReturn: null,
    selectListReturn: [],
    selectCountReturn: 0,
    uploads: [],
    uploadError: null,
  };
  sendMessageSpy.mockClear();
  getFileSpy.mockReset();
  downloadFileSpy.mockReset();
});

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('POST /api/inbox/webhook', () => {
  it('1. 401 sin header X-Telegram-Bot-Api-Secret-Token', async () => {
    const req = buildRequest(textMessage('hola'), null);
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(401);
  });

  it('2. 401 con secret_token incorrecto (longitud distinta, no crashea)', async () => {
    const req = buildRequest(textMessage('hola'), 'longitud-claramente-distinta');
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(401);
    expect(captured.inserts).toHaveLength(0);
  });

  it('3. /start exento del allowlist (bootstrap)', async () => {
    const req = buildRequest(textMessage('/start', OTHER_CHAT));
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(200);
    // Debe haber respondido con chat_id (sin pedir allowlist)
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    const [chatId, body] = sendMessageSpy.mock.calls[0];
    expect(chatId).toBe(OTHER_CHAT);
    expect(body).toContain(String(OTHER_CHAT));
  });

  it('4. Mensaje texto válido + chat autorizado → INSERT en DB', async () => {
    const req = buildRequest(textMessage('el scorer cuelga en hoyo 14'));
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(200);
    expect(captured.inserts).toHaveLength(1);
    const inserted = captured.inserts[0] as { texto: string; status: string };
    expect(inserted.texto).toBe('el scorer cuelga en hoyo 14');
    expect(inserted.status).toBe('nuevo');
    expect(sendMessageSpy).toHaveBeenCalledWith(ALLOWED_CHAT, '✓ recibido');
  });

  it('5. chat_id no autorizado → 200 silencioso, NO insert, NO sendMessage', async () => {
    const req = buildRequest(textMessage('intruso', OTHER_CHAT));
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(200);
    expect(captured.inserts).toHaveLength(0);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('6. mime_type no whitelist → sendMessage error y NO insert (caso éxito)', async () => {
    getFileSpy.mockResolvedValue({
      filePath: 'photos/abc.pdf',
      fileSize: 1000,
      mimeType: 'application/pdf', // No whitelisted
    });
    const req = buildRequest({
      update_id: 2,
      message: {
        message_id: 42,
        date: nowUnix(),
        chat: { id: ALLOWED_CHAT },
        from: { id: ALLOWED_CHAT },
        photo: [{ file_id: 'small' }, { file_id: 'large' }],
      },
    });
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(200);
    // Esperamos al menos un sendMessage de error
    const errorCalls = sendMessageSpy.mock.calls.filter((c) =>
      String(c[1]).includes('no soportado'),
    );
    expect(errorCalls.length).toBeGreaterThan(0);
    // El insert puede haber ocurrido con status='error' (registro del fallo),
    // pero NO debe haber ningún insert con status='nuevo' ni upload.
    const successInserts = captured.inserts.filter(
      (i) => (i as { status: string }).status === 'nuevo',
    );
    expect(successInserts).toHaveLength(0);
    expect(captured.uploads).toHaveLength(0);
    expect(downloadFileSpy).not.toHaveBeenCalled();
  });

  it('7. file_size > 10MB → sendMessage error, NO download, NO upload', async () => {
    getFileSpy.mockResolvedValue({
      filePath: 'photos/huge.jpg',
      fileSize: 11 * 1024 * 1024, // 11MB
      mimeType: 'image/jpeg',
    });
    const req = buildRequest({
      update_id: 3,
      message: {
        message_id: 43,
        date: nowUnix(),
        chat: { id: ALLOWED_CHAT },
        from: { id: ALLOWED_CHAT },
        photo: [{ file_id: 'huge' }],
      },
    });
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(200);
    expect(downloadFileSpy).not.toHaveBeenCalled();
    expect(captured.uploads).toHaveLength(0);
    const errorCalls = sendMessageSpy.mock.calls.filter((c) =>
      String(c[1]).includes('muy grande'),
    );
    expect(errorCalls.length).toBeGreaterThan(0);
  });

  it('8. media_group_id con row reciente → UPDATE merge, no INSERT', async () => {
    // El select de findRecentMediaGroup devuelve una row existente:
    captured.selectMaybeSingleReturn = {
      id: 'uuid-existing-row',
      fotos_paths: ['reports/2026/05/old.jpg'],
      caption: 'álbum 1',
    };
    // Setup descarga OK para la foto nueva:
    getFileSpy.mockResolvedValue({
      filePath: 'photos/new.jpg',
      fileSize: 500_000,
      mimeType: 'image/jpeg',
    });
    downloadFileSpy.mockResolvedValue(new ArrayBuffer(500_000));

    const req = buildRequest({
      update_id: 4,
      message: {
        message_id: 50,
        date: nowUnix(),
        chat: { id: ALLOWED_CHAT },
        from: { id: ALLOWED_CHAT },
        photo: [{ file_id: 'foto2' }],
        media_group_id: 'group-xyz',
      },
    });
    const resp = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(resp.status).toBe(200);
    // Debe haber UPDATE merge, no INSERT nuevo
    expect(captured.updates.length).toBeGreaterThan(0);
    const mergeUpdate = captured.updates.find(
      (u) =>
        (u.payload as { fotos_paths?: string[] }).fotos_paths !== undefined,
    );
    expect(mergeUpdate).toBeDefined();
    const fotos = (mergeUpdate?.payload as { fotos_paths: string[] }).fotos_paths;
    expect(fotos.length).toBe(2); // 1 existing + 1 nuevo
    expect(captured.inserts).toHaveLength(0);
  });
});
