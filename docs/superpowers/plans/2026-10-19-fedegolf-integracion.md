# Integración FedeGolf — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec `docs/superpowers/specs/2026-10-19-fedegolf-integracion-completa-design.md` en 8 fases;
este documento detalla la **Fase 0** a nivel de código. Las fases 1–7 se detallan (mismo formato) al empezar cada una,
con lo aprendido de la anterior — su alcance está fijado en el spec.

**Architecture (Fase 0):** Toda llamada a fedegolf.cl pasa por un `fedegolfFetch` canónico con timeout que traduce
fallas a un `FedegolfError` tipado (`credenciales` | `no_disponible` | `respuesta_inesperada`). Solo `credenciales`
—que únicamente puede emitir el login JSON ante un 400 con mensaje explícito— cambia el estado de la vinculación.
La lógica de `sync-indice` sale de la ruta a `src/lib/fedegolf/sincronizar-indice.ts` con dependencias inyectadas
y tests.

**Tech Stack:** Next.js 16 route handlers, Supabase JS, Vitest (pool vmThreads).

## Comportamiento real de fedegolf.cl (sondeado 19-oct-2026)

| Caso | Respuesta |
|------|-----------|
| Login JSON `services.php` OK | 302 (verificado jul-2026, en uso en prod) |
| Login JSON con clave/RUT incorrecto | **400** `{"msg":"Usuario o contraseña incorrectos","data":null}` |
| Login de página `/` con clave incorrecta | **200** y vuelve a renderizar el formulario (`name="lva"`), `#mensaje` vacío |
| Página de tarjetas autenticada (fixture `listado-20.html`) | no contiene `name="lva"` |

Conclusión: el login de página no distingue "clave mala" de forma confiable → **nunca** cambia estado. La señal
"sesión de página no autenticada" se detecta en la página de tarjetas (contiene el form de login).

## Archivos (Fase 0)

- Create `src/lib/fedegolf/http.ts` — `FEDEGOLF_BASE_URL`, `FEDEGOLF_USER_AGENT`, `FEDEGOLF_TIMEOUT_MS`,
  `FedegolfError`, `fedegolfFetch()`. Fuente única (hoy BASE_URL/USER_AGENT están triplicados).
- Create `src/lib/fedegolf/http.test.ts`
- Modify `src/lib/fedegolf/client.ts` — 7 `fetch` → `fedegolfFetch`; `fedegolfLogin` clasifica 400; `fedegolfGetIndice` JSON inválido → `respuesta_inesperada`.
- Modify `src/lib/fedegolf/page-login.ts`, `src/lib/fedegolf/tarjetas.ts` — `fedegolfFetch`; tarjetas detecta login form.
- Create `src/lib/fedegolf/sincronizar-indice.ts` + `.test.ts` — lógica de sync-indice.
- Modify `src/app/api/fedegolf/sync-indice/route.ts` — ruta delgada.
- Modify `src/app/api/fedegolf/sync-tarjetas/route.ts`, `tarjetas/route.ts` — `.maybeSingle()`.
- Modify `src/app/api/fedegolf/vincular/route.ts` — mensajes por `kind` (400 credenciales / 503 no disponible).
- Create `src/lib/fedegolf/vinculo-local.ts` + `.test.ts` — memo local "no vinculado" (24 h) para `FedegolfSync`.
- Modify `src/components/FedegolfSync.tsx` — no dispara nada si el memo dice no vinculado; tarjetas solo si vinculado.
- Modify `src/app/perfil/hooks/useFedegolfVincular.ts` — al vincular, limpiar el memo.

**B7 (rate limit persistente) se mueve a la Fase 1**: requiere migración y la Fase 1 ya trae la migración del estado
de vinculación; se hacen juntas en un solo PR de schema.

---

### Task 1: Cliente HTTP canónico con timeout y errores tipados

**Files:** Create `src/lib/fedegolf/http.ts`, `src/lib/fedegolf/http.test.ts`

- [ ] **Step 1: test que falla**

```ts
// src/lib/fedegolf/http.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fedegolfFetch, FedegolfError, esFedegolfError } from './http'

describe('fedegolfFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve la respuesta tal cual cuando fetch resuelve (cualquier status)', async () => {
    const res = { status: 302 } as Response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
    await expect(fedegolfFetch('https://www.fedegolf.cl/')).resolves.toBe(res)
  })

  it('pasa un AbortSignal con timeout', async () => {
    const f = vi.fn().mockResolvedValue({ status: 200 } as Response)
    vi.stubGlobal('fetch', f)
    await fedegolfFetch('https://www.fedegolf.cl/', { method: 'POST' })
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(f.mock.calls[0][1].method).toBe('POST')
  })

  it('error de red → FedegolfError no_disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const err = await fedegolfFetch('https://www.fedegolf.cl/').catch((e) => e)
    expect(err).toBeInstanceOf(FedegolfError)
    expect(err.kind).toBe('no_disponible')
  })

  it('timeout → FedegolfError no_disponible', async () => {
    const abort = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    const err = await fedegolfFetch('https://www.fedegolf.cl/').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })

  it('status 5xx → FedegolfError no_disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503 } as Response))
    const err = await fedegolfFetch('https://www.fedegolf.cl/').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })

  it('esFedegolfError sin kind acepta cualquier FedegolfError y rechaza Error genérico', () => {
    expect(esFedegolfError(new FedegolfError('credenciales', 'x'))).toBe(true)
    expect(esFedegolfError(new Error('x'))).toBe(false)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/fedegolf/http.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: implementación**

```ts
// src/lib/fedegolf/http.ts
/**
 * Fuente única del acceso HTTP a fedegolf.cl.
 *
 * Todo request pasa por `fedegolfFetch`: timeout fijo y fallas traducidas a un
 * `FedegolfError` con `kind`, para que quien llama distinga "FedeGolf no
 * responde" (transitorio, se reintenta) de "credenciales rechazadas" (el usuario
 * debe reconectar). Antes cualquier throw se trataba como clave mala y un corte
 * de fedegolf.cl desvinculaba al usuario en silencio.
 */

export const FEDEGOLF_BASE_URL = 'https://www.fedegolf.cl'
export const FEDEGOLF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
export const FEDEGOLF_TIMEOUT_MS = 10_000

export type FedegolfErrorKind = 'credenciales' | 'no_disponible' | 'respuesta_inesperada'

export class FedegolfError extends Error {
  readonly kind: FedegolfErrorKind
  constructor(kind: FedegolfErrorKind, message: string) {
    super(`fedegolf(${kind}): ${message}`)
    this.name = 'FedegolfError'
    this.kind = kind
  }
}

export function esFedegolfError(err: unknown, kind?: FedegolfErrorKind): err is FedegolfError {
  return err instanceof FedegolfError && (kind === undefined || err.kind === kind)
}

export async function fedegolfFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(FEDEGOLF_TIMEOUT_MS) })
  } catch (err) {
    const motivo = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    throw new FedegolfError('no_disponible', `sin respuesta de ${url} (${motivo})`)
  }
  if (res.status >= 500) {
    throw new FedegolfError('no_disponible', `${url} respondió ${res.status}`)
  }
  return res
}
```

- [ ] **Step 4:** `npx vitest run src/lib/fedegolf/http.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(fedegolf): cliente HTTP canónico con timeout y errores tipados`.

### Task 2: Login JSON clasifica credenciales vs no disponible; índice con JSON inválido

**Files:** Modify `src/lib/fedegolf/client.ts`; Create `src/lib/fedegolf/client.test.ts`

- [ ] **Step 1: test que falla**

```ts
// src/lib/fedegolf/client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fedegolfLogin, fedegolfGetIndice } from './client'
import { esFedegolfError } from './http'

function res(status: number, body: unknown = null, cookie: string | null = null): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      getSetCookie: () => (cookie ? [cookie] : []),
      get: (k: string) => (k.toLowerCase() === 'set-cookie' ? cookie : null),
    },
    json: async () => {
      if (body === '__invalid__') throw new SyntaxError('Unexpected token')
      return body
    },
  } as unknown as Response
}

describe('fedegolfLogin', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('302 → sesión', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(302, { data: null })))
    await expect(fedegolfLogin('1-9', 'x')).resolves.toMatchObject({ cookie: 'PHPSESSID=a1' })
  })

  it('400 con msg (respuesta real ante clave mala) → credenciales', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(400, { service: 'login', msg: 'Usuario o contraseña incorrectos', data: null })))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'credenciales')).toBe(true)
  })

  it('400 sin msg → respuesta_inesperada (no se asume clave mala)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(400, '__invalid__')))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('200 inesperado → respuesta_inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(200, {})))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('sin PHPSESSID inicial → no_disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(200, null, null)))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })

  it('red caída → no_disponible (nunca credenciales)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })
})

describe('fedegolfGetIndice', () => {
  afterEach(() => vi.unstubAllGlobals())
  const session = { cookie: 'PHPSESSID=a1' }

  it('parsea el índice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { indice: '8.3' })))
    await expect(fedegolfGetIndice(session, '1-9')).resolves.toEqual({ rut: '1-9', indice: 8.3 })
  })

  it('JSON inválido → respuesta_inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, '__invalid__')))
    const err = await fedegolfGetIndice(session, '1-9').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('4xx → respuesta_inesperada sin RUT en el mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(400, null)))
    const err = await fedegolfGetIndice(session, '12345678-9').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
    expect(err.message).not.toContain('12345678')
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/fedegolf/client.test.ts` → FAIL.
- [ ] **Step 3: implementación** en `client.ts`:
  - Borrar `const BASE_URL = ...`; `import { FEDEGOLF_BASE_URL as BASE_URL, FedegolfError, fedegolfFetch } from './http'`.
  - Los 7 `await fetch(` → `await fedegolfFetch(` (mismos argumentos).
  - En `fedegolfLogin`: `!sessionId` → `throw new FedegolfError('no_disponible', 'no se pudo obtener PHPSESSID inicial')`.
    Reemplazar el bloque `if (loginRes.status !== 302)` por:

```ts
  if (loginRes.status !== 302) {
    // Clave/RUT rechazado: fedegolf.cl responde 400 + {"msg":"Usuario o contraseña
    // incorrectos"} (sondeado 19-oct-2026). Solo ESA forma es "credenciales"; cualquier
    // otra respuesta es inesperada y NO debe tratarse como clave mala.
    let msg: unknown = null
    try {
      msg = ((await loginRes.json()) as { msg?: unknown } | null)?.msg ?? null
    } catch {
      msg = null
    }
    if (loginRes.status === 400 && typeof msg === 'string' && msg.trim()) {
      throw new FedegolfError('credenciales', msg)
    }
    throw new FedegolfError('respuesta_inesperada', `login respondió ${loginRes.status}`)
  }
```

  - En `fedegolfGetIndice`: el throw de status → `throw new FedegolfError('respuesta_inesperada', \`get_indice_rut respondió ${res.status}\`)` (sin RUT: es dato personal y viaja a logs). Envolver `await res.json()` en try/catch → `throw new FedegolfError('respuesta_inesperada', 'get_indice_rut devolvió JSON inválido')`.
- [ ] **Step 4:** tests nuevos + `src/lib/fedegolf/perfil.test.ts` → PASS.
- [ ] **Step 5:** commit `fix(fedegolf): el login distingue clave rechazada de FedeGolf caído`.

### Task 3: Login de página y tarjetas por el cliente canónico; sesión no autenticada detectable

**Files:** Modify `src/lib/fedegolf/page-login.ts`, `src/lib/fedegolf/tarjetas.ts`, `src/lib/fedegolf/page-login.test.ts`, `src/lib/fedegolf/tarjetas.test.ts`

- [ ] **Step 1: tests que fallan** — en `tarjetas.test.ts` agregar:

```ts
describe('fedegolfGetTarjetasIndice — sesión', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('si fedegolf.cl devuelve el formulario de login, la sesión no está autenticada', async () => {
    const loginForm = '<form id="contacto" method="post"><input type="hidden" name="lva" value="ab"></form>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, text: async () => loginForm } as unknown as Response))
    const err = await fedegolfGetTarjetasIndice({ cookie: 'PHPSESSID=x' }).catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('con la página real autenticada (fixture) parsea las tarjetas', async () => {
    const html = readFileSync(join(__dirname, '__fixtures__/listado-20.html'), 'utf8')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, text: async () => html } as unknown as Response))
    const { tarjetas } = await fedegolfGetTarjetasIndice({ cookie: 'PHPSESSID=x' })
    expect(tarjetas.length).toBeGreaterThan(0)
  })
})
```

  (importar `vi, afterEach`, `readFileSync`, `join`, `esFedegolfError` y `fedegolfGetTarjetasIndice` si el archivo no los importa ya).
  En `page-login.test.ts` agregar: red caída → `esFedegolfError(err, 'no_disponible')`; sin `lva` → `no_disponible`.

- [ ] **Step 2:** correr ambos → FAIL.
- [ ] **Step 3: implementación**
  - `page-login.ts`: borrar `BASE_URL`/`USER_AGENT` locales, importar `FEDEGOLF_BASE_URL as BASE_URL, FEDEGOLF_USER_AGENT as USER_AGENT, FedegolfError, fedegolfFetch` de `./http`; `fetch(` → `fedegolfFetch(`; el throw de PHPSESSID/lva → `new FedegolfError('no_disponible', 'no se pudo obtener PHPSESSID/lva para el login de página')`. Docblock: el status del POST no distingue clave mala (200 en ambos casos, sondeado 19-oct); la verificación real ocurre al leer las tarjetas.
  - `tarjetas.ts`: mismo reemplazo de constantes y `fetch`; tras `const html = await res.text()`:

```ts
  // Sesión de página no autenticada: fedegolf.cl devuelve de nuevo el formulario
  // de login (con su token `lva`) en vez del listado. La página autenticada nunca
  // lo trae (fixture listado-20.html). Es 'respuesta_inesperada' y no 'credenciales'
  // porque el login de página no permite saber POR QUÉ falló (sondeado 19-oct).
  if (/name=["']lva["']/i.test(html)) {
    throw new FedegolfError('respuesta_inesperada', 'sesión de página no autenticada')
  }
```

- [ ] **Step 4:** `npx vitest run src/lib/fedegolf` → PASS.
- [ ] **Step 5:** commit `fix(fedegolf): login de página y tarjetas con timeout; detectar sesión no autenticada`.

### Task 4: Lógica de sync-indice fuera de la ruta — FedeGolf caído nunca desvincula

**Files:** Create `src/lib/fedegolf/sincronizar-indice.ts`, `src/lib/fedegolf/sincronizar-indice.test.ts`; Modify `src/app/api/fedegolf/sync-indice/route.ts`

Contrato:

```ts
export type ResultadoSyncIndice =
  | { estado: 'no_vinculado' }
  | { estado: 'requiere_reconexion' }
  | { estado: 'cacheado'; indice: number | null }
  | { estado: 'degradado'; indice: number | null; motivo: FedegolfErrorKind | 'credenciales_almacenadas' }
  | { estado: 'sincronizado'; indice: number | null; indiceAnterior: number | null; cambio: boolean }
```

Respuesta HTTP (siempre 200, compatible con `FedegolfSync` y `useFedegolfRefresh`):
- `no_vinculado` → `{ ok:false, linked:false, error:'No hay cuenta FedeGolf vinculada' }` (string que /perfil matchea).
- `requiere_reconexion` → `{ ok:false, linked:false, requiere_reconexion:true, error:'Tu clave de FedeGolf cambió. Vuelve a vincular tu cuenta.' }`.
- `cacheado` / `degradado` → `{ ok:true, indice, indice_anterior:null, cambio:false, cached:true }` (+ `degradado:true`).
- `sincronizado` → forma actual `{ ok:true, indice, indice_anterior, cambio, cached:false }`.

- [ ] **Step 0:** leer `src/app/perfil/hooks/useFedegolfRefresh.ts` y confirmar que tolera 200 con `ok:false` + `error` (hoy espera 401/404 en esos casos); ajustarlo para mostrar `error` cuando `ok:false`.
- [ ] **Step 1: test que falla** — `sincronizar-indice.test.ts` con fakes en memoria (sin Supabase real):

```ts
import { describe, it, expect, vi } from 'vitest'
import { sincronizarIndice, type DepsSyncIndice, type CredencialesFedegolf } from './sincronizar-indice'
import { FedegolfError } from './http'

const AHORA = new Date('2026-10-19T12:00:00Z').getTime()
const credsBase: CredencialesFedegolf = {
  rut_encrypted: 'r', password_encrypted: 'p', activo: true,
  ultimo_sync: '2026-10-17T12:00:00Z', ultimo_indice: 8.3,
}

function deps(over: Partial<DepsSyncIndice> = {}): DepsSyncIndice & { marcarInactiva: ReturnType<typeof vi.fn>; guardarSync: ReturnType<typeof vi.fn>; registrarIndice: ReturnType<typeof vi.fn> } {
  return {
    leerCredenciales: vi.fn().mockResolvedValue(credsBase),
    decrypt: vi.fn((v: string) => v),
    login: vi.fn().mockResolvedValue({ cookie: 'PHPSESSID=x' }),
    getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: 8.1 }),
    marcarInactiva: vi.fn().mockResolvedValue(undefined),
    guardarSync: vi.fn().mockResolvedValue(undefined),
    registrarIndice: vi.fn().mockResolvedValue(undefined),
    reportar: vi.fn(),
    ahora: () => AHORA,
    ...over,
  } as never
}

describe('sincronizarIndice', () => {
  it('sin fila → no_vinculado', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue(null) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'no_vinculado' })
  })

  it('activo=false → requiere_reconexion, sin tocar FedeGolf', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, activo: false }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.login).not.toHaveBeenCalled()
  })

  it('dentro del cooldown → cacheado, sin tocar FedeGolf', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_sync: '2026-10-19T08:00:00Z' }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'cacheado', indice: 8.3 })
    expect(d.login).not.toHaveBeenCalled()
  })

  it('REGRESIÓN B1: FedeGolf caído en el login → degradado y NUNCA marca inactiva', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'no_disponible' })
    expect(d.marcarInactiva).not.toHaveBeenCalled()
    expect(d.guardarSync).not.toHaveBeenCalled()
  })

  it('respuesta inesperada en el login → degradado, no marca inactiva', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('respuesta_inesperada', '200')) })
    expect((await sincronizarIndice(d)).estado).toBe('degradado')
    expect(d.marcarInactiva).not.toHaveBeenCalled()
  })

  it('error desconocido (no FedegolfError) en el login → degradado, no marca inactiva', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new Error('boom')) })
    expect((await sincronizarIndice(d)).estado).toBe('degradado')
    expect(d.marcarInactiva).not.toHaveBeenCalled()
  })

  it('clave rechazada → marca inactiva y requiere_reconexion', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('credenciales', 'Usuario o contraseña incorrectos')) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.marcarInactiva).toHaveBeenCalledOnce()
  })

  it('REGRESIÓN B2: falla del índice → degradado (antes 500)', async () => {
    const d = deps({ getIndice: vi.fn().mockRejectedValue(new FedegolfError('respuesta_inesperada', 'json')) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'respuesta_inesperada' })
    expect(d.guardarSync).not.toHaveBeenCalled()
  })

  it('decrypt falla (clave de cifrado ausente/rotada) → degradado, NO desvincula', async () => {
    const d = deps({ decrypt: vi.fn(() => { throw new Error('FEDEGOLF_ENCRYPTION_KEY no configurada') }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'credenciales_almacenadas' })
    expect(d.marcarInactiva).not.toHaveBeenCalled()
    expect(d.reportar).toHaveBeenCalled()
  })

  it('índice cambió → guarda, registra historial, informa anterior', async () => {
    const d = deps()
    expect(await sincronizarIndice(d)).toEqual({ estado: 'sincronizado', indice: 8.1, indiceAnterior: 8.3, cambio: true })
    expect(d.guardarSync).toHaveBeenCalledWith(8.1)
    expect(d.registrarIndice).toHaveBeenCalledWith(8.1)
  })

  it('índice igual → guarda sync pero no registra historial', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: 8.3 }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'sincronizado', indice: 8.3, indiceAnterior: 8.3, cambio: false })
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('FedeGolf devuelve índice null → no pisa el perfil ni registra', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: null }) })
    const r = await sincronizarIndice(d)
    expect(r).toEqual({ estado: 'sincronizado', indice: null, indiceAnterior: 8.3, cambio: true })
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: implementación**

```ts
// src/lib/fedegolf/sincronizar-indice.ts
/**
 * Sync del índice oficial de UN usuario contra fedegolf.cl. Fuera de la ruta
 * (regla "el que toca, ordena") y con dependencias inyectadas para testearlo.
 *
 * Regla central: solo un rechazo EXPLÍCITO de credenciales (FedegolfError
 * 'credenciales', que emite únicamente el login JSON ante su 400) desactiva la
 * vinculación. FedeGolf caído, lento, respondiendo raro o un problema de NUESTRA
 * clave de cifrado → 'degradado': se devuelve el último índice conocido y se
 * reintenta en la próxima visita. Antes cualquier throw desvinculaba (B1).
 */
import type { FedegolfIndice, FedegolfSession } from './types'
import { esFedegolfError, type FedegolfErrorKind } from './http'
import { SYNC_INDICE_COOLDOWN_MS } from './sync-cooldown'

export interface CredencialesFedegolf {
  rut_encrypted: string
  password_encrypted: string
  activo: boolean
  ultimo_sync: string | null
  ultimo_indice: number | null
}

export interface DepsSyncIndice {
  leerCredenciales: () => Promise<CredencialesFedegolf | null>
  decrypt: (valor: string) => string
  login: (rut: string, password: string) => Promise<FedegolfSession>
  getIndice: (session: FedegolfSession, rut: string) => Promise<FedegolfIndice>
  marcarInactiva: () => Promise<void>
  /** Persiste ultimo_sync/ultimo_indice y, si no es null, profiles.indice. */
  guardarSync: (indice: number | null) => Promise<void>
  /** Inserta en indice_historial. */
  registrarIndice: (indice: number) => Promise<void>
  reportar: (err: unknown, paso: string) => void
  ahora: () => number
}

export type ResultadoSyncIndice =
  | { estado: 'no_vinculado' }
  | { estado: 'requiere_reconexion' }
  | { estado: 'cacheado'; indice: number | null }
  | { estado: 'degradado'; indice: number | null; motivo: FedegolfErrorKind | 'credenciales_almacenadas' }
  | { estado: 'sincronizado'; indice: number | null; indiceAnterior: number | null; cambio: boolean }

function motivoDe(err: unknown): FedegolfErrorKind {
  return esFedegolfError(err) ? err.kind : 'respuesta_inesperada'
}

export async function sincronizarIndice(deps: DepsSyncIndice): Promise<ResultadoSyncIndice> {
  const creds = await deps.leerCredenciales()
  if (!creds) return { estado: 'no_vinculado' }
  if (!creds.activo) return { estado: 'requiere_reconexion' }

  const cacheado = creds.ultimo_indice
  if (creds.ultimo_sync && deps.ahora() - new Date(creds.ultimo_sync).getTime() < SYNC_INDICE_COOLDOWN_MS) {
    return { estado: 'cacheado', indice: cacheado }
  }

  let rut: string
  let password: string
  try {
    rut = deps.decrypt(creds.rut_encrypted)
    password = deps.decrypt(creds.password_encrypted)
  } catch (err) {
    deps.reportar(err, 'decrypt_credenciales')
    return { estado: 'degradado', indice: cacheado, motivo: 'credenciales_almacenadas' }
  }

  let session: FedegolfSession
  try {
    session = await deps.login(rut, password)
  } catch (err) {
    if (esFedegolfError(err, 'credenciales')) {
      deps.reportar(err, 'login_credenciales_rechazadas')
      await deps.marcarInactiva()
      return { estado: 'requiere_reconexion' }
    }
    deps.reportar(err, 'login_fedegolf')
    return { estado: 'degradado', indice: cacheado, motivo: motivoDe(err) }
  }

  let indice: number | null
  try {
    indice = (await deps.getIndice(session, rut)).indice
  } catch (err) {
    deps.reportar(err, 'get_indice')
    return { estado: 'degradado', indice: cacheado, motivo: motivoDe(err) }
  }

  const cambio = indice !== cacheado
  await deps.guardarSync(indice)
  if (cambio && indice !== null) await deps.registrarIndice(indice)
  return { estado: 'sincronizado', indice, indiceAnterior: cacheado, cambio }
}
```

  Ruta delgada `src/app/api/fedegolf/sync-indice/route.ts`: arma `deps` con `supabase` (`.maybeSingle()` en `leerCredenciales`, select de las 5 columnas), `decrypt`, `fedegolfLogin`, `fedegolfGetIndice`; `guardarSync` hace los dos updates actuales (credenciales + `profiles.indice` si no es null) reportando sus errores con `captureError` como hoy; `registrarIndice` el insert actual con `fuente:'fedegolf_sync'`; `reportar` = `captureError(err, { context:'fedegolf/sync-indice', userId, level: 'warning', meta:{ paso } })` (nivel `error` para `decrypt_credenciales`). Luego mapea `ResultadoSyncIndice` a las respuestas listadas arriba. Mantiene el try/catch externo con 500 solo para fallas de Supabase/auth.
- [ ] **Step 4:** `npx vitest run src/lib/fedegolf` → PASS; `npx tsc --noEmit` → 0 errores.
- [ ] **Step 5:** commit `fix(fedegolf): un corte de FedeGolf ya no desvincula al usuario; lógica de sync fuera de la ruta`.

### Task 5: `.maybeSingle()` y vincular con mensajes por tipo de error

**Files:** Modify `src/app/api/fedegolf/sync-tarjetas/route.ts:36`, `src/app/api/fedegolf/tarjetas/route.ts:39`, `src/app/api/fedegolf/vincular/route.ts:52-60`

- [ ] **Step 1:** en sync-tarjetas y tarjetas: `.single()` → `.maybeSingle()` (el `if (credsError || !creds || !creds.activo)` siguiente ya cubre "sin fila"). Además, si hay `credsError`, `captureError` (hoy se traga en silencio).
- [ ] **Step 2:** en vincular, reemplazar el catch del login:

```ts
    } catch (err) {
      if (esFedegolfError(err, 'credenciales')) {
        return NextResponse.json({ error: 'RUT o clave incorrectos en FedeGolf' }, { status: 400 })
      }
      await captureError(err, { context: 'fedegolf/vincular', userId: user.id, level: 'warning', meta: { paso: 'login_fedegolf' } })
      return NextResponse.json(
        { error: 'FedeGolf no está respondiendo. Intenta de nuevo en unos minutos.' },
        { status: 503 }
      )
    }
```

  (`useFedegolfVincular` ya muestra copy limpio para 400 y `body.error` para el resto.)
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit `fix(fedegolf): sin 406 al no estar vinculado y vincular distingue clave mala de FedeGolf caído`.

### Task 6: `FedegolfSync` no consulta FedeGolf para usuarios no vinculados

**Files:** Create `src/lib/fedegolf/vinculo-local.ts` + `.test.ts`; Modify `src/components/FedegolfSync.tsx`, `src/app/perfil/hooks/useFedegolfVincular.ts`

- [ ] **Step 1: test que falla**

```ts
// src/lib/fedegolf/vinculo-local.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { recordarNoVinculado, sabemosQueNoEstaVinculado, olvidarVinculo, NO_VINCULADO_TTL_MS } from './vinculo-local'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, get length() { return m.size },
  }
}

describe('vinculo-local', () => {
  let s: Storage
  beforeEach(() => { s = memStorage() })

  it('sin memo → no sabemos', () => expect(sabemosQueNoEstaVinculado('u1', 0, s)).toBe(false))
  it('memo vigente → no vinculado', () => {
    recordarNoVinculado('u1', 1000, s)
    expect(sabemosQueNoEstaVinculado('u1', 1000 + NO_VINCULADO_TTL_MS - 1, s)).toBe(true)
  })
  it('memo vencido → vuelve a preguntar', () => {
    recordarNoVinculado('u1', 1000, s)
    expect(sabemosQueNoEstaVinculado('u1', 1000 + NO_VINCULADO_TTL_MS, s)).toBe(false)
  })
  it('es por usuario', () => {
    recordarNoVinculado('u1', 1000, s)
    expect(sabemosQueNoEstaVinculado('u2', 1000, s)).toBe(false)
  })
  it('olvidarVinculo borra el memo', () => {
    recordarNoVinculado('u1', 1000, s); olvidarVinculo('u1', s)
    expect(sabemosQueNoEstaVinculado('u1', 1000, s)).toBe(false)
  })
  it('storage que lanza (modo privado) → no rompe y no sabemos', () => {
    const roto = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } } as unknown as Storage
    expect(() => recordarNoVinculado('u1', 0, roto)).not.toThrow()
    expect(sabemosQueNoEstaVinculado('u1', 0, roto)).toBe(false)
  })
})
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: implementación**

```ts
// src/lib/fedegolf/vinculo-local.ts
/**
 * Memo por dispositivo de "este usuario no tiene FedeGolf vinculado", para que
 * FedegolfSync (montado en el layout raíz) no le pegue a /api/fedegolf/* en cada
 * carga a los usuarios sin cuenta vinculada (la gran mayoría). Dura 24 h; vincular
 * desde la app lo borra al instante. Si el storage no está disponible, se comporta
 * como "no sabemos" (pregunta al server, igual que antes).
 */
export const NO_VINCULADO_TTL_MS = 24 * 60 * 60 * 1000
const clave = (userId: string) => `gp:fedegolf-no-vinculado:${userId}`

function storagePorDefecto(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function recordarNoVinculado(userId: string, ahora = Date.now(), s = storagePorDefecto()): void {
  try { s?.setItem(clave(userId), String(ahora)) } catch { /* storage bloqueado */ }
}

export function sabemosQueNoEstaVinculado(userId: string, ahora = Date.now(), s = storagePorDefecto()): boolean {
  try {
    const v = Number(s?.getItem(clave(userId)))
    return Number.isFinite(v) && v > 0 && ahora - v < NO_VINCULADO_TTL_MS
  } catch {
    return false
  }
}

export function olvidarVinculo(userId: string, s = storagePorDefecto()): void {
  try { s?.removeItem(clave(userId)) } catch { /* storage bloqueado */ }
}
```

  `FedegolfSync.tsx`: al inicio del effect, `if (sabemosQueNoEstaVinculado(user.id)) return`. En el `.then` del sync-indice: si `data.linked === false` → `recordarNoVinculado(user.id)` y NO disparar tarjetas; si no, disparar `sync-tarjetas` (se mueve dentro del `.then`; un fallo del índice con `linked` desconocido —catch— igual dispara tarjetas para mantener la independencia D4). Actualizar el docblock.
  `useFedegolfVincular.ts`: tras vincular OK, `olvidarVinculo(userId)` (obtener `userId` de `useAuth()` si el hook no lo tiene).
- [ ] **Step 4:** tests → PASS; `npx tsc --noEmit` → 0.
- [ ] **Step 5:** commit `perf(fedegolf): no consultar FedeGolf en cada carga para usuarios sin cuenta vinculada`.

### Task 7: Verificación, revisión y PR

- [ ] `node --env-file=.env.local scripts/ci/evento-en-vivo.mjs` (exit 3 = esperar).
- [ ] `/pre-push` (tsc, lint de archivos tocados, `npm run test`, `npm run build`).
- [ ] `node scripts/expediente-review.mjs --intencion "Fase 0 FedeGolf: corte de FedeGolf no desvincula; timeouts; 406; sync solo para vinculados"` → `revisor-fable` (zona crítica: índice). Con APROBADO: label `fable-reviewed`.
- [ ] PR con label `operador:juanjo`; merge con checks verdes; confirmar deploy y que el sync de la cuenta vinculada siga OK (`ultimo_sync` avanza tras 24 h o forzando con el botón "Actualizar" de /perfil).
- [ ] `graphify update .`

## Fases 1–7

Alcance fijado en el spec. Se detallan en este archivo (sección nueva por fase) al iniciar cada una. Notas que ya
condicionan el diseño:
- **Fase 1:** verificar con un RUT real si `get_indice_rut` responde sin cookie (con RUT ficticio respondió 400 sin
  cookie). Si exige sesión, el cron usa una cookie anónima (`GET /`), nunca login con la clave del usuario.
  Migración: `estado` de vinculación + `ultimo_error(_at)` + tabla de intentos para el rate limit persistente (B7).
- La clave local `FEDEGOLF_ENCRYPTION_KEY` de `.env.local` no coincide con la de producción (sondeado 19-oct):
  los scripts locales no pueden descifrar credenciales de prod. Es correcto (separación), no un bug.
