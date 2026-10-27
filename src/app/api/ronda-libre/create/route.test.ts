import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// --- mocks ---

const CREADOR_ID = '11111111-1111-4111-8111-111111111111'
const OTRO_USUARIO_ID = '22222222-2222-4222-8222-222222222222'

type Llamada = { tabla: string; op: string; payload?: unknown }
let llamadas: Llamada[] = []
let fallaEquipos = false
let borradoVacio = false
/** Código con que falla el INSERT de jugadores cuando alguna fila trae `perfil_sugerido_id`. */
let fallaInsertConSugerencia: string | null = null

/** Builder encadenable y "thenable" como el de PostgREST que registra cada escritura. */
function builder(tabla: string) {
  let op = 'select'
  let payload: unknown
  const resultado = () => {
    if (tabla === 'rondas_libres' && op === 'insert') return { data: { id: 'ronda-1' }, error: null }
    if (tabla === 'ronda_libre_jugadores' && op === 'insert') {
      const filas = payload as Array<{ nombre: string }>
      if (fallaInsertConSugerencia && filas.some(f => 'perfil_sugerido_id' in f)) {
        return { data: null, error: { message: 'columna o FK de perfil_sugerido_id', code: fallaInsertConSugerencia } }
      }
      return { data: filas.map((f, i) => ({ id: `jug-${i}`, nombre: f.nombre })), error: null }
    }
    if (tabla === 'ronda_equipos' && op === 'insert') {
      return fallaEquipos
        ? { data: null, error: { message: 'boom', code: '500' } }
        : { data: { id: `eq-${llamadas.filter(l => l.tabla === 'ronda_equipos').length}` }, error: null }
    }
    if (tabla === 'rondas_libres' && op === 'delete') {
      return { data: borradoVacio ? [] : [{ id: 'ronda-1' }], error: null }
    }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'limit']) b[m] = vi.fn(() => b)
  for (const m of ['insert', 'delete', 'update']) {
    b[m] = vi.fn((p?: unknown) => {
      op = m
      payload = p
      llamadas.push({ tabla, op: m, payload: p })
      return b
    })
  }
  b.single = vi.fn(() => Promise.resolve(resultado()))
  b.maybeSingle = vi.fn(() => Promise.resolve(resultado()))
  b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(resultado()).then(res, rej)
  return b
}

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: CREADOR_ID } } }) },
    from: (tabla: string) => builder(tabla),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitHeaders: () => ({}),
}))

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}))

// Plan del creador: free salvo que el test diga otra cosa. Se mockea la capa de
// datos y NO el gate, para que corra la cadena real checkModoAccess → canAccess.
let tierDelCreador: 'free' | 'pro' = 'free'
// `true` = la lectura del plan falla (red, timeout, RLS): getSubscription lanza.
let planIlegible = false
vi.mock('@/lib/data/billing/subscription', () => {
  class SubscriptionReadError extends Error {}
  return {
    SubscriptionReadError,
    getSubscription: async () => {
      if (planIlegible) throw new SubscriptionReadError('fetch failed')
      return {
        tier: tierDelCreador, status: 'active', trialRoundsRemaining: null, trialEndsAt: null,
        isFoundingMember: false, isAdmin: false,
      }
    },
  }
})

// Handicap de equipo: el real, salvo que el test lo haga fallar o devolver sin tabla.
let handicapsDeEquipo: 'real' | 'lanza' | 'sin-tabla' = 'real'
vi.mock('@/lib/data/ronda-libre-equipos', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/data/ronda-libre-equipos')>()
  return {
    ...real,
    handicapsDeEquipoDeRondaNueva: async (...args: Parameters<typeof real.handicapsDeEquipoDeRondaNueva>) => {
      if (handicapsDeEquipo === 'lanza') throw new Error('PostgREST caído')
      if (handicapsDeEquipo === 'sin-tabla') return args[2].map(() => ({ completo: null, juego: null }))
      return real.handicapsDeEquipoDeRondaNueva(...args)
    },
  }
})

// Perfiles que existen en la base (lo lee el cliente de servicio). `'lanza'` = la base no responde.
let perfilesEnLaBase: string[] | 'lanza' = []
const perfilesQueExisten = vi.fn(async (ids: readonly string[]) => {
  if (perfilesEnLaBase === 'lanza') throw new Error('timeout')
  const base = perfilesEnLaBase
  return new Set(ids.filter(id => base.includes(id)))
})
vi.mock('@/lib/data/perfiles-existentes', () => ({
  perfilesQueExisten: (ids: readonly string[]) => perfilesQueExisten(ids),
}))

import { POST } from './route'

function req(body: unknown) {
  return new Request('http://test/api/ronda-libre/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as NextRequest
}

const jugador = (nombre: string, user_id: string | null = null) => ({
  nombre, user_id, handicap: 12, tees: 'blanco',
})

function payload(over: Record<string, unknown> = {}) {
  return {
    course_id: null,
    course_name: 'Club de Golf Los Leones',
    tees: 'blanco',
    holes: 18,
    fecha: '2026-10-17',
    hoyo_inicio: 1,
    formato_juego: 'best_ball',
    modo_juego: 'gross',
    admin_mode: true,
    jugadores: [jugador('Juanjo', CREADOR_ID), jugador('Nico'), jugador('Pedro'), jugador('Tomás')],
    equipos: [
      { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
      { nombre: 'Equipo 2', jugadorIndices: [2, 3] },
    ],
    ...over,
  }
}

const escrituras = (tabla: string, op = 'insert') => llamadas.filter(l => l.tabla === tabla && l.op === op)

beforeEach(() => {
  llamadas = []
  fallaEquipos = false
  borradoVacio = false
  fallaInsertConSugerencia = null
  handicapsDeEquipo = 'real'
  perfilesEnLaBase = []
  perfilesQueExisten.mockClear()
  tierDelCreador = 'free'
  vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/ronda-libre/create — gate Pro del modo neto', () => {
  const match = (modo: 'gross' | 'neto') => payload({
    formato_juego: 'match_play',
    modo_juego: modo,
    jugadores: [jugador('Juanjo', CREADOR_ID), jugador('Nico')],
    equipos: undefined,
  })

  it('free + match play neto → 403 pro_required y no se crea nada', async () => {
    const res = await POST(req(match('neto')))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'pro_required', feature: 'match-play-neto', requiredTier: 'pro' })
    expect(body.message).toMatch(/plan Pro/)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('no se pudo leer el plan + match play neto → 503 reintentable, no 403 pro_required', async () => {
    planIlegible = true
    try {
      const res = await POST(req(match('neto')))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body).toEqual({ error: 'plan_unavailable', message: 'No pudimos verificar tu plan. Intenta de nuevo en unos segundos.' })
      expect(escrituras('rondas_libres')).toHaveLength(0)
    } finally {
      planIlegible = false
    }
  })

  it('free + best ball neto → 403 (no es sólo match play)', async () => {
    const res = await POST(req(payload({ modo_juego: 'neto' })))
    expect(res.status).toBe(403)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('free + match play gross → se crea (gross es libre)', async () => {
    const res = await POST(req(match('gross')))
    expect(res.status).toBe(200)
    expect(escrituras('rondas_libres')[0].payload).toMatchObject({ formato_juego: 'match_play', modo_juego: 'gross' })
  })

  it('Pro + match play neto → se crea en neto', async () => {
    tierDelCreador = 'pro'
    const res = await POST(req(match('neto')))
    expect(res.status).toBe(200)
    expect(escrituras('rondas_libres')[0].payload).toMatchObject({ modo_juego: 'neto' })
  })

  it('paywall apagado → free crea match play neto', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'false')
    const res = await POST(req(match('neto')))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/ronda-libre/create — validación de entrada', () => {
  it('una posición de equipo fuera de la lista se rechaza ANTES de crear nada', async () => {
    const res = await POST(req(payload({
      equipos: [
        { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
        { nombre: 'Equipo 2', jugadorIndices: [2, 7] },
      ],
    })))
    expect(res.status).toBe(400)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('un jugador en dos equipos se rechaza aunque los tamaños cuadren', async () => {
    const res = await POST(req(payload({
      equipos: [
        { nombre: 'Equipo 1', jugadorIndices: [0, 0] },
        { nombre: 'Equipo 2', jugadorIndices: [1, 1] },
      ],
    })))
    expect(res.status).toBe(400)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('una fecha que no existe en el calendario es 400, no un 500 de Postgres', async () => {
    const res = await POST(req(payload({ fecha: '2026-02-30' })))
    expect(res.status).toBe(400)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('las reglas de la UI corren también en el servidor (match play = 2 jugadores)', async () => {
    const res = await POST(req(payload({ formato_juego: 'match_play', equipos: undefined })))
    expect(res.status).toBe(400)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })
})

describe('POST /api/ronda-libre/create — escritura', () => {
  it('crea la ronda por equipos con cada jugador en su equipo', async () => {
    const res = await POST(req(payload()))
    expect(res.status).toBe(200)
    const miembros = escrituras('ronda_equipo_jugadores').map(l => (l.payload as Array<{ jugador_id: string }>).map(m => m.jugador_id))
    expect(miembros).toEqual([['jug-0', 'jug-1'], ['jug-2', 'jug-3']])
    expect(escrituras('rondas_libres', 'delete')).toHaveLength(0)
  })

  it('el user_id de un rival lo decide el servidor, no el body', async () => {
    const res = await POST(req(payload({
      formato_juego: 'stroke_play',
      equipos: undefined,
      jugadores: [jugador('Juanjo', CREADOR_ID), jugador('Otro', OTRO_USUARIO_ID)],
    })))
    expect(res.status).toBe(200)
    const filas = escrituras('ronda_libre_jugadores')[0].payload as Array<{ user_id: string | null }>
    expect(filas.map(f => f.user_id)).toEqual([CREADOR_ID, null])
  })

  it('si un equipo no se graba, la ronda se deshace en vez de quedar sin equipos', async () => {
    fallaEquipos = true
    const res = await POST(req(payload()))
    expect(res.status).toBe(500)
    expect(escrituras('rondas_libres', 'delete')).toHaveLength(1)
  })

  it('scramble guarda los dos handicaps de equipo (35/15 sobre el handicap de cada jugador)', async () => {
    const res = await POST(req(payload({ formato_juego: 'scramble' })))
    expect(res.status).toBe(200)
    // Sin cancha: course handicap = índice (12). 0,35×12 + 0,15×12 = 6.
    const equipos = escrituras('ronda_equipos').map(l => l.payload as { handicap_equipo: number; handicap_equipo_juego: number })
    expect(equipos.map(e => [e.handicap_equipo, e.handicap_equipo_juego])).toEqual([[6, 6], [6, 6]])
  })

  it('si el cálculo del handicap de equipo falla, no se crea nada (no queda una ronda sin equipos)', async () => {
    handicapsDeEquipo = 'lanza'
    const res = await POST(req(payload({ formato_juego: 'scramble' })))
    expect(res.status).toBe(500)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('un equipo de bola compartida sin handicap de equipo es 400 antes de crear nada (no juega con 0)', async () => {
    handicapsDeEquipo = 'sin-tabla'
    const res = await POST(req(payload({ formato_juego: 'foursome' })))
    expect(res.status).toBe(400)
    expect(escrituras('rondas_libres')).toHaveLength(0)
  })

  it('si el deshacer no borra nada (RLS devuelve 0 filas sin error), queda registrado', async () => {
    fallaEquipos = true
    borradoVacio = true
    const { captureError } = await import('@/lib/error-tracking')
    const res = await POST(req(payload()))
    expect(res.status).toBe(500)
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'deshacer ronda borró 0 filas' }),
      expect.objectContaining({ context: 'ronda-libre.create.deshacer' }),
    )
  })
})

describe('POST /api/ronda-libre/create — cuenta elegida para un rival (perfil_sugerido_id)', () => {
  const NICO_ID = '33333333-3333-4333-8333-333333333333'
  const PEDRO_ID = '44444444-4444-4444-8444-444444444444'
  const conCuenta = (nombre: string, perfil: string) => ({ ...jugador(nombre), perfil_sugerido_id: perfil })
  const stroke = (jugadores: unknown[]) => payload({ formato_juego: 'stroke_play', equipos: undefined, jugadores })
  type Fila = { user_id: string | null; perfil_sugerido_id?: string | null }
  const filas = () => escrituras('ronda_libre_jugadores')[0].payload as Fila[]

  it('se graba la cuenta elegida en perfil_sugerido_id y el user_id del rival sigue null (#581)', async () => {
    perfilesEnLaBase = [NICO_ID]
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Nico', NICO_ID), jugador('Tomás')])))
    expect(res.status).toBe(200)
    expect(filas().map(f => f.user_id)).toEqual([CREADOR_ID, null, null])
    expect(filas().map(f => f.perfil_sugerido_id ?? null)).toEqual([null, NICO_ID, null])
  })

  it('una cuenta que no existe es 400 con el nombre del rival, antes de crear nada', async () => {
    perfilesEnLaBase = [NICO_ID]
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Nico', NICO_ID), conCuenta('Pedro', PEDRO_ID)])))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No encontramos la cuenta de Pedro. Vuelve a buscar su cuenta o elige «Invitado».')
    expect(llamadas.filter(l => l.op === 'insert')).toHaveLength(0)
  })

  it('la misma cuenta en dos rivales es 400, antes de crear nada', async () => {
    perfilesEnLaBase = [NICO_ID]
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Nico', NICO_ID), conCuenta('Nicolás', NICO_ID)])))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Nicolás está dos veces en la ronda')
    expect(llamadas.filter(l => l.op === 'insert')).toHaveLength(0)
  })

  it('el creador no puede elegirse a sí mismo como rival', async () => {
    perfilesEnLaBase = [CREADOR_ID]
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Juanjo bis', CREADOR_ID)])))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Tú ya juegas esta ronda')
    expect(llamadas.filter(l => l.op === 'insert')).toHaveLength(0)
  })

  it('si la base no responde, la ronda se crea igual sin la sugerencia (y queda registrado)', async () => {
    perfilesEnLaBase = 'lanza'
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Nico', NICO_ID)])))
    expect(res.status).toBe(200)
    expect(filas().every(f => !('perfil_sugerido_id' in f))).toBe(true)
    const { captureError } = await import('@/lib/error-tracking')
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'ronda-libre.create.perfil-sugerido' }))
  })

  // El invariante: la sugerencia nunca impide jugar. Columna aún no aplicada en
  // prod (PGRST204/42703), cuenta borrada entre la validación y el INSERT (23503),
  // permisos (42501) o el rollback de la migración: la ronda se crea sin ella.
  it.each(['PGRST204', '42703', '23503', '42501'])(
    'si el INSERT con la sugerencia falla (%s), se reintenta una vez sin ella y la ronda se crea',
    async (code) => {
      const { captureError } = await import('@/lib/error-tracking')
      vi.mocked(captureError).mockClear()
      perfilesEnLaBase = [NICO_ID]
      fallaInsertConSugerencia = code
      const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Nico', NICO_ID)])))
      expect(res.status).toBe(200)
      const inserts = escrituras('ronda_libre_jugadores')
      expect(inserts).toHaveLength(2)
      expect((inserts[0].payload as Fila[]).some(f => f.perfil_sugerido_id === NICO_ID)).toBe(true)
      const reintento = inserts[1].payload as Fila[]
      expect(reintento.every(f => !('perfil_sugerido_id' in f))).toBe(true)
      expect(reintento.map(f => f.user_id)).toEqual([CREADOR_ID, null])
      expect(escrituras('rondas_libres', 'delete')).toHaveLength(0)
      expect(captureError).toHaveBeenCalledWith(
        expect.objectContaining({ code }),
        expect.objectContaining({ context: 'ronda-libre.create.perfil-sugerido-insert', level: 'warning' }),
      )
    },
  )

  it('un INSERT que falla por otra causa no se reintenta: 500 y la ronda se deshace', async () => {
    perfilesEnLaBase = [NICO_ID]
    fallaInsertConSugerencia = '23514'
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), conCuenta('Nico', NICO_ID)])))
    expect(res.status).toBe(500)
    expect(escrituras('ronda_libre_jugadores')).toHaveLength(1)
    expect(escrituras('rondas_libres', 'delete')).toHaveLength(1)
  })

  it('sin cuentas elegidas no se consulta la base ni se nombra la columna', async () => {
    const res = await POST(req(stroke([jugador('Juanjo', CREADOR_ID), jugador('Nico')])))
    expect(res.status).toBe(200)
    expect(perfilesQueExisten).not.toHaveBeenCalled()
    expect(filas().every(f => !('perfil_sugerido_id' in f))).toBe(true)
  })

  it('al creador y a un invitado no se les graba sugerencia aunque el body la traiga', async () => {
    perfilesEnLaBase = [NICO_ID, PEDRO_ID]
    const res = await POST(req(stroke([
      { ...jugador('Juanjo', CREADOR_ID), perfil_sugerido_id: PEDRO_ID },
      { ...conCuenta('Nico', NICO_ID), is_guest: true },
    ])))
    expect(res.status).toBe(200)
    expect(perfilesQueExisten).not.toHaveBeenCalled()
    expect(filas().every(f => !('perfil_sugerido_id' in f))).toBe(true)
  })
})
