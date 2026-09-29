// @vitest-environment jsdom
//
// Tests del store de autosave del borrador de torneo.
//
// El caso central es el bug reportado por inbox (c894c74c): "al escribir se
// borra texto con delay". El organizador tipea mientras un PATCH está en vuelo;
// cuando la respuesta llega, la config del server (que no incluye lo tipeado
// después de enviar) pisaba el input. Regla: lo que el usuario está editando
// es la fuente de verdad; la respuesta del server nunca sobrescribe cambios
// hechos después de que ese save salió.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInitialConfig } from './initial-config'
import { deepMergeConfig } from './deep-merge-config'
import type { TournamentConfig } from './types'
import type { SaveDraftResult } from '@/lib/data/tournament-drafts'

const data = vi.hoisted(() => ({ saveDraftPartial: vi.fn(), fetchDraft: vi.fn() }))
vi.mock('@/lib/data/tournament-drafts', () => data)

import { selectRejectionMessage, useDraftStore } from './store'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function initStore(config: TournamentConfig = createInitialConfig(), version = 1) {
  useDraftStore.getState().init('d1', { config, version, collaborators: [] })
}

const store = () => useDraftStore.getState()

/** Simula la respuesta del server: aplica lo que se envió sobre la config dada. */
function serverOk(sent: Partial<TournamentConfig>, version: number, base = createInitialConfig()): SaveDraftResult {
  return { kind: 'ok', version, config: { ...base, ...sent } }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useDraftStore.getState().reset()
  window.localStorage.clear()
  // Default: cualquier PATCH que no configure el test explícitamente responde ok.
  data.saveDraftPartial.mockImplementation(async (p: { partial: Partial<TournamentConfig>; version: number }) =>
    serverOk(p.partial, p.version + 1),
  )
})

afterEach(() => {
  useDraftStore.getState().reset()
  window.localStorage.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('autosave — tecleo durante el round-trip (bug inbox c894c74c)', () => {
  it.each([
    ['name', (v: string) => ({ name: v })],
    ['description', (v: string) => ({ description: v })],
  ])('la respuesta del save no pisa lo tipeado después en `%s`', async (field, partialOf) => {
    initStore()
    store().applyChange(partialOf('T'), 'manual')
    store().applyChange(partialOf('To'), 'manual')

    // El PATCH sale con "To" y tarda en volver.
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0]).toMatchObject({ partial: partialOf('To'), version: 1 })

    // Mientras tanto el organizador sigue escribiendo.
    store().applyChange(partialOf('Tor'), 'manual')
    store().applyChange(partialOf('Torn'), 'manual')
    expect((store().config as unknown as Record<string, string>)[field]).toBe('Torn')

    // Vuelve la respuesta vieja: config del server con "To".
    inFlight.resolve(serverOk(partialOf('To'), 2))
    await flushing

    // Lo tipeado durante el vuelo sigue en pantalla y la versión avanzó.
    expect((store().config as unknown as Record<string, string>)[field]).toBe('Torn')
    expect(store().version).toBeGreaterThanOrEqual(2)
  })

  it('campos dentro de arrays con id (nombre de categoría) tampoco se pierden', async () => {
    const config = createInitialConfig()
    const cat = config.categories[0]
    initStore(config)
    const rename = (name: string) => ({ categories: [{ ...cat, name }] })

    store().applyChange(rename('Da'), 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    store().applyChange(rename('Damas'), 'manual')
    inFlight.resolve(serverOk(rename('Da'), 2, config))
    await flushing

    expect(store().config?.categories[0].name).toBe('Damas')
  })

  it('lo tipeado durante el vuelo se manda en un segundo PATCH con la versión nueva', async () => {
    initStore()
    store().applyChange({ name: 'To' }, 'manual')

    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()
    store().applyChange({ name: 'Torn' }, 'manual')
    inFlight.resolve(serverOk({ name: 'To' }, 2))
    await flushing

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0]).toMatchObject({ partial: { name: 'Torn' }, version: 2 })
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.name).toBe('Torn')
    expect(store().syncStatus).toBe('saved')
  })

  it('con la cola vacía al volver la respuesta, la config del server es la que queda', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    await store().flush()
    expect(store().config?.name).toBe('Copa')
    expect(store().version).toBe(2)
    expect(store().syncStatus).toBe('saved')

    // "Guardado" vuelve a "Sincronizado" (idle) a los 2s.
    vi.advanceTimersByTime(2000)
    expect(store().syncStatus).toBe('idle')
  })
})

describe('autosave — borrar un campo opcional (review C1)', () => {
  // Server realista: el partial viaja por JSON (undefined desaparece) y se
  // aplica con el mismo deepMergeConfig que usa la route.
  const realServer = (base: TournamentConfig) => {
    let current = base
    return async (p: { partial: Partial<TournamentConfig>; version: number }): Promise<SaveDraftResult> => {
      current = deepMergeConfig(current, JSON.parse(JSON.stringify(p.partial)))
      return { kind: 'ok', version: p.version + 1, config: current }
    }
  }

  it('borrar max_players con null → 200 → sigue vacío, y lo tipeado después no se corrompe', async () => {
    const config = { ...createInitialConfig(), registration: { mode: 'open_with_code' as const, max_players: 50 } }
    initStore(config)
    data.saveDraftPartial.mockImplementation(realServer(config))

    // El organizador borra el "50" (la sección manda null, no undefined).
    store().applyChange({ registration: { mode: 'open_with_code', max_players: null } }, 'manual')
    await store().flush()

    expect(store().config?.registration.max_players).toBeNull()
    expect(store().pendingChanges).toHaveLength(0)

    // Y tipea "4": tiene que quedar 4, no "504".
    store().applyChange({ registration: { mode: 'open_with_code', max_players: 4 } }, 'manual')
    await store().flush()
    expect(store().config?.registration.max_players).toBe(4)
  })

  it('con undefined el campo NO se borra ni local ni en el server (coherentes, sin revert)', async () => {
    const config = { ...createInitialConfig(), registration: { mode: 'open_with_code' as const, max_players: 50 } }
    initStore(config)
    data.saveDraftPartial.mockImplementation(realServer(config))

    store().applyChange({ registration: { mode: 'open_with_code', max_players: undefined } }, 'manual')
    expect(store().config?.registration.max_players).toBe(50)
    await store().flush()
    expect(store().config?.registration.max_players).toBe(50)
  })

  it('cambiar el tipo de premio limpia con null los campos que no aplican y el server los persiste así', async () => {
    const config = {
      ...createInitialConfig(),
      prizes: [{ id: 'p1', type: 'category_position' as const, description: '1° Neto', position: 1, kind: 'neto' as const }],
    }
    initStore(config)
    data.saveDraftPartial.mockImplementation(realServer(config))

    store().applyChange(
      { prizes: [{ ...config.prizes[0], type: 'long_drive', position: null, category_id: null, kind: null }] },
      'manual',
    )
    await store().flush()

    expect(store().config?.prizes[0]).toMatchObject({ type: 'long_drive', position: null, kind: null })
    expect(data.saveDraftPartial.mock.calls[0][0].partial.prizes[0].position).toBeNull()
  })
})

describe('autosave — compactación de la cola por key raíz (offline largo en cancha)', () => {
  const goOffline = async () => {
    data.saveDraftPartial.mockResolvedValue({ kind: 'error', status: 0, message: 'Failed to fetch' })
    store().applyChange({ name: 'x' }, 'manual')
    await store().flush()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    expect(store().syncStatus).toBe('offline')
  }

  it('500 teclas offline en `name` son un solo cambio en cola, en memoria y persistido', async () => {
    initStore()
    await goOffline()
    let text = ''
    for (let i = 0; i < 500; i++) {
      text += 'a'
      store().applyChange({ name: text }, 'manual')
    }
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().pendingChanges[0].partial).toEqual({ name: text })
    expect(store().config?.name).toBe(text)
    expect(JSON.parse(window.localStorage.getItem('draft:d1:queue') ?? '[]')).toHaveLength(1)
  })

  it('keys mezcladas: cada key se compacta en su lugar y el orden relativo se conserva', async () => {
    initStore()
    await goOffline()
    store().applyChange({ name: 'a' }, 'manual')
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    store().applyChange({ name: 'ab' }, 'manual')
    store().applyChange({ registration: { mode: 'invite_only' } }, 'manual')
    store().applyChange({ registration: { mode: 'invite_only', max_players: 8 } }, 'manual')
    store().applyChange({ date_start: '2026-10-11' }, 'manual')

    expect(store().pendingChanges.map((c) => c.partial)).toEqual([
      { name: 'ab' },
      { date_start: '2026-10-11' },
      { registration: { mode: 'invite_only', max_players: 8 } },
    ])
    expect(store().config).toMatchObject({
      name: 'ab',
      date_start: '2026-10-11',
      registration: { mode: 'invite_only', max_players: 8 },
    })
  })

  it('un partial multi-key se mergea sobre el pendiente que comparte alguna key (deep-merge, no reemplazo)', async () => {
    initStore()
    await goOffline()
    store().applyChange({ name: 'a' }, 'manual')
    store().applyChange({ name: 'ab', date_start: '2026-10-10' }, 'manual')
    expect(store().pendingChanges.map((c) => c.partial)).toEqual([{ name: 'ab', date_start: '2026-10-10' }])
  })

  it('la compactación nunca toca lo que está en vuelo: lo enviado sale por identidad y lo nuevo viaja después', async () => {
    initStore()
    store().applyChange({ name: 'To' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    store().applyChange({ name: 'Tor' }, 'manual')
    store().applyChange({ name: 'Torn' }, 'manual')
    expect(store().pendingChanges.map((c) => c.partial)).toEqual([{ name: 'To' }, { name: 'Torn' }])

    inFlight.resolve(serverOk({ name: 'To' }, 2))
    await flushing

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0]).toMatchObject({ partial: { name: 'Torn' }, version: 2 })
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.name).toBe('Torn')
  })

  // Verificación final: la compactación no puede dejar una corrección ANTES de
  // un rechazado (quedaría sin superar y volvería a pisar la pantalla).
  it('si el último cambio que toca la key es un rechazado, el nuevo va al final y lo supera (pantalla D2, sin rejected)', async () => {
    initStore()
    store().applyChange({ name: 'A', description: 'D1' }, 'manual')
    data.saveDraftPartial
      .mockResolvedValueOnce({
        kind: 'rejected',
        status: 400,
        message: 'descripción: regla del server',
        issues: [{ path: ['description'], message: 'regla del server' }],
      })
      // El reenvío de {name:'A'} recibe un 503: queda drenable y fuera de vuelo.
      .mockResolvedValueOnce({ kind: 'error', status: 503, message: 'Service Unavailable' })
    await store().flush()
    expect(store().pendingChanges.map((c) => [Object.keys(c.partial), !!c.rejected])).toEqual([
      [['name'], false],
      [['description'], true],
    ])

    data.saveDraftPartial.mockImplementation(async (p: { partial: Partial<TournamentConfig>; version: number }) =>
      serverOk(p.partial, p.version + 1),
    )
    store().applyChange({ name: 'B', description: 'D2' }, 'manual')

    expect(store().pendingChanges.some((c) => c.rejected)).toBe(false)
    expect(store().displayConfig?.description).toBe('D2')
    expect(store().displayConfig?.name).toBe('B')

    await store().flush()
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.description).toBe('D2')
    expect(store().syncStatus).toBe('saved')
  })

  it('si el último cambio que toca la key está en vuelo, la tecla nueva va al final (la pantalla no muestra el valor viejo)', async () => {
    initStore()
    store().applyChange({ name: 'A' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'error', status: 503, message: 'Service Unavailable' })
    await store().flush() // {name:'A'} queda drenable, fuera de vuelo

    // Un multi-key con name sale y queda en vuelo.
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    store().applyChange({ name: 'AB', date_start: '2026-10-10' }, 'manual') // compacta sobre {name:'A'}
    expect(store().pendingChanges).toHaveLength(1)
    const flushing = store().flush()

    store().applyChange({ name: 'ABC' }, 'manual')
    expect(store().pendingChanges.map((c) => c.partial)).toEqual([
      { name: 'AB', date_start: '2026-10-10' },
      { name: 'ABC' },
    ])
    expect(store().displayConfig?.name).toBe('ABC')

    inFlight.resolve(serverOk({ name: 'AB', date_start: '2026-10-10' }, 2))
    await flushing
    expect(data.saveDraftPartial.mock.calls.at(-1)?.[0]).toMatchObject({ partial: { name: 'ABC' }, version: 2 })
    expect(store().config?.name).toBe('ABC')
    expect(store().pendingChanges).toHaveLength(0)
  })

  it('offline → online: vuelve la red y todo lo compactado drena en un PATCH', async () => {
    initStore()
    await goOffline()
    for (const name of ['Copa', 'Copa d', 'Copa del', 'Copa del Club']) store().applyChange({ name }, 'manual')
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    expect(store().pendingChanges).toHaveLength(2)

    data.saveDraftPartial.mockImplementation(async (p: { partial: Partial<TournamentConfig>; version: number }) =>
      serverOk(p.partial, p.version + 1),
    )
    await vi.advanceTimersByTimeAsync(4000)

    const okCalls = data.saveDraftPartial.mock.calls.slice(-1)
    expect(okCalls[0][0].partial).toEqual({ name: 'Copa del Club', date_start: '2026-10-10' })
    expect(store().pendingChanges).toHaveLength(0)
    // El reintento salió a los 4 s de backoff; "Guardado" (2 s) ya pudo volver a "Sincronizado".
    expect(['saved', 'idle']).toContain(store().syncStatus)
    expect(store().config?.name).toBe('Copa del Club')
    expect(store().serverConfig?.name).toBe('Copa del Club')
  })
})

describe('autosave — un solo PATCH en vuelo por vez', () => {
  it('varios flush() concurrentes no mandan dos PATCH con la misma versión', async () => {
    initStore()
    store().applyChange({ name: 'To' }, 'manual')

    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const first = store().flush()

    // Dos pedidos más mientras el primero está en vuelo (debounce + timer + crear torneo).
    store().applyChange({ name: 'Torn' }, 'manual')
    const second = store().flush()
    const third = store().flush()

    inFlight.resolve(serverOk({ name: 'To' }, 2))
    await Promise.all([first, second, third])

    const versions = data.saveDraftPartial.mock.calls.map((c) => c[0].version)
    expect(versions).toEqual([1, 2])
    expect(new Set(versions).size).toBe(versions.length)
    expect(store().pendingChanges).toHaveLength(0)
  })

  it('el debounce de 500ms agrupa el tecleo en un solo PATCH', async () => {
    initStore()
    store().applyChange({ name: 'C' }, 'manual')
    store().applyChange({ name: 'Co' }, 'manual')
    store().applyChange({ name: 'Cop' }, 'manual')
    expect(data.saveDraftPartial).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Cop' })
  })

  it('cambios en el mismo sub-objeto dentro de un batch se combinan en profundidad', async () => {
    initStore()
    store().applyChange({ registration: { mode: 'invite_only' } }, 'manual')
    store().applyChange({ registration: { mode: 'invite_only', max_players: 20 } }, 'manual')
    store().applyChange({ registration: { max_players: 24 } as never }, 'manual')

    await store().flush()

    // Un solo PATCH cuyo partial, aplicado por el server con deepMerge, deja el
    // mismo estado que los tres applyChange aplicados en secuencia.
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({
      registration: { mode: 'invite_only', max_players: 24 },
    })
  })
})

describe('autosave — cambio de borrador con un PATCH en vuelo (review I2)', () => {
  it('la respuesta vieja se descarta y la cola del borrador nuevo drena en el mismo drenaje', async () => {
    initStore() // d1
    store().applyChange({ name: 'De A' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    // El organizador reanuda otro borrador mientras vuela el PATCH de A.
    store().reset()
    useDraftStore.getState().init('d2', { config: createInitialConfig(), version: 10, collaborators: [] })
    store().applyChange({ name: 'De B' }, 'manual')

    inFlight.resolve(serverOk({ name: 'De A' }, 2))
    await flushing

    expect(store().draftId).toBe('d2')
    expect(store().config?.name).toBe('De B')
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0]).toMatchObject({ draftId: 'd2', partial: { name: 'De B' }, version: 10 })
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().version).toBe(11)
    expect(store().syncStatus).toBe('saved')
  })

  it('lo que se guardó mientras volaba un reset() sale igual de la cola persistida del borrador viejo', async () => {
    initStore()
    store().applyChange({ name: 'Guardado en vuelo' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    store().reset()
    inFlight.resolve(serverOk({ name: 'Guardado en vuelo' }, 2))
    await flushing

    expect(JSON.parse(window.localStorage.getItem('draft:d1:queue') ?? '[]')).toHaveLength(0)
  })

  it('la respuesta de un PATCH que vuelve después de reset() no resucita el borrador', async () => {
    initStore()
    store().applyChange({ name: 'De A' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    store().reset()
    inFlight.resolve(serverOk({ name: 'De A' }, 2))
    await flushing

    expect(store().draftId).toBeNull()
    expect(store().config).toBeNull()
    expect(store().version).toBe(0)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
  })
})

describe('autosave — conflicto 409 (otra pestaña / colaborador / IA)', () => {
  // Review I3: el reintento es inmediato y dentro del mismo `flush()`, así
  // "Crear torneo" (que hace `await flush()`) no ve un falso "no se pudo guardar".
  it('reconcilia con la config del server sin perder lo local y reintenta YA con la versión nueva', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')

    const serverConfig = { ...createInitialConfig(), date_start: '2026-10-10' }
    data.saveDraftPartial
      .mockResolvedValueOnce({ kind: 'conflict', version: 5, config: serverConfig })
      // El reintento aplica nuestro partial sobre la config del server (con la fecha del colaborador).
      .mockResolvedValueOnce(serverOk({ name: 'Copa' }, 6, serverConfig))
    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0]).toMatchObject({ partial: { name: 'Copa' }, version: 5 })
    expect(store().config?.name).toBe('Copa')
    expect(store().config?.date_start).toBe('2026-10-10')
    expect(store().version).toBe(6)
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().syncStatus).toBe('saved')
  })

  it('si otro cliente gana la carrera 3 veces seguidas, corta el ciclo y reintenta con backoff', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    let serverVersion = 1
    data.saveDraftPartial.mockImplementation(async () => {
      serverVersion += 1
      return { kind: 'conflict', version: serverVersion, config: createInitialConfig() } as SaveDraftResult
    })

    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(3)
    expect(store().syncStatus).toBe('conflict')
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().config?.name).toBe('Copa')

    // Backoff: 1s después vuelve a intentar (y vuelve a ciclar hasta 3).
    await vi.advanceTimersByTimeAsync(1000)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(6)
  })

  it('409 por carrera del UPDATE (sin config) se reintenta en el acto: "Crear torneo" no ve la cola a medias', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'error', status: 409, message: 'Conflicto de versión, reintentando' })
    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(store().config?.name).toBe('Copa')
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().syncStatus).toBe('saved')
  })

  it('un conflicto con versión ≤ la del store no retrocede la config ("solo avanza")', async () => {
    initStore()
    useDraftStore.setState({ version: 9 })
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial
      .mockResolvedValueOnce({ kind: 'conflict', version: 9, config: { ...createInitialConfig(), name: 'Vieja' } })
      .mockResolvedValueOnce(serverOk({ name: 'Copa' }, 10))
    await store().flush()

    expect(data.saveDraftPartial.mock.calls[1][0].version).toBe(9)
    expect(store().config?.name).toBe('Copa')
    expect(store().version).toBe(10)
  })

  it('"Draft no editable" (409 definitivo) queda como rechazado, sin reintento', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'rejected', status: 409, message: 'Draft no editable', issues: [] })
    await store().flush()

    expect(store().syncStatus).toBe('rejected')
    expect(store().lastError).toBe('Draft no editable')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
  })
})

describe('autosave — errores y offline', () => {
  it('un error deja la cola y la config local intactas y reintenta con backoff', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'error', status: 500, message: 'boom' })
    await store().flush()

    expect(store().config?.name).toBe('Copa')
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().consecutiveFailures).toBe(1)
    expect(store().syncStatus).toBe('syncing')
    expect(store().lastError).toBe('boom')

    await vi.advanceTimersByTimeAsync(1000)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(store().syncStatus).toBe('saved')
    expect(store().config?.name).toBe('Copa')
  })

  it('tres fallos seguidos → offline, la cola queda persistida', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValue({ kind: 'error', status: 0, message: 'Failed to fetch' })

    await store().flush()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    expect(store().consecutiveFailures).toBe(3)
    expect(store().syncStatus).toBe('offline')
    expect(JSON.parse(window.localStorage.getItem('draft:d1:queue') ?? '[]')).toHaveLength(1)
  })

  it('init con cola persistida la aplica sobre la config del server y la reenvía', async () => {
    window.localStorage.setItem(
      'draft:d1:queue',
      JSON.stringify([{ partial: { name: 'Pendiente' }, source: 'manual', timestamp: 1 }]),
    )
    initStore()
    expect(store().config?.name).toBe('Pendiente')
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().syncStatus).toBe('syncing')

    // Replay inmediato, sin esperar el debounce.
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Pendiente' })
    await vi.advanceTimersByTimeAsync(0)
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.name).toBe('Pendiente')
  })
})

describe('validación en cliente — un partial inválido nunca sale del cliente', () => {
  const prizeWith = (over: Record<string, unknown>) => ({
    prizes: [{ id: 'p1', type: 'category_position' as const, description: 'Nuevo premio', position: 1, ...over }],
  })

  it('descripción de premio vacía: se ve en pantalla, no se encola ni se envía, y el chip lo dice', async () => {
    const config = { ...createInitialConfig(), ...prizeWith({}) }
    initStore(config)

    store().applyChange(prizeWith({ description: '' }), 'manual')
    await vi.advanceTimersByTimeAsync(1000)

    expect(data.saveDraftPartial).not.toHaveBeenCalled()
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.prizes[0].description).toBe('Nuevo premio')
    expect(store().displayConfig?.prizes[0].description).toBe('')
    expect(store().invalidChanges).toHaveLength(1)
    expect(store().invalidChanges[0].message).toBe('Premio 1 · descripción: obligatorio')
    expect(store().syncStatus).toBe('invalid')
  })

  it('al corregir, el partial válido reemplaza al inválido y se guarda normal', async () => {
    const config = { ...createInitialConfig(), ...prizeWith({}) }
    initStore(config)
    store().applyChange(prizeWith({ description: '' }), 'manual')
    store().applyChange(prizeWith({ description: 'M' }), 'manual')

    expect(store().invalidChanges).toHaveLength(0)
    expect(store().pendingChanges).toHaveLength(1)
    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial.prizes[0].description).toBe('M')
    expect(store().displayConfig?.prizes[0].description).toBe('M')
    expect(store().syncStatus).toBe('saved')
  })

  it('un inválido en una key no frena los cambios válidos de otras keys', async () => {
    initStore()
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: '' }] }, 'manual')
    store().applyChange({ name: 'Copa' }, 'manual')
    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Copa' })
    expect(store().config?.name).toBe('Copa')
    expect(store().invalidChanges).toHaveLength(1)
    // La cola quedó vacía pero hay un campo por corregir: el chip no dice "Guardado".
    expect(store().syncStatus).toBe('invalid')
  })

  it('valores fuera de rango que el input podría producir tampoco viajan (hoyo 19, drives 1.5)', async () => {
    initStore()
    store().applyChange({ prizes: [{ id: 'p1', type: 'long_drive', description: 'LD', hole_number: 19 }] }, 'manual')
    store().applyChange({ team_config: { min_drives_per_player: 1.5 } as never }, 'manual')
    await vi.advanceTimersByTimeAsync(1000)

    expect(data.saveDraftPartial).not.toHaveBeenCalled()
    expect(store().invalidChanges.map((i) => i.message)).toEqual([
      'Premio 1 · hoyo: máximo 18',
      'Equipos · mín. drives: debe ser un número entero',
    ])
  })

  // Tercera review C1: un partial multi-key se valida key por key. Con un premio
  // inválido en pantalla, elegir Match Play manda {format, modo, prizes('')}:
  // format y modo se guardan; prizes queda inválido aparte. Corregir el premio
  // después NO puede devolver el formato a Stroke Play.
  it('partial multi-key: las keys válidas se guardan y cada inválida queda aparte (Match Play no se pierde)', async () => {
    const config = { ...createInitialConfig(), ...prizeWith({}) }
    initStore(config)
    // Server con memoria: aplica cada PATCH sobre lo que ya guardó.
    let serverState: TournamentConfig = config
    data.saveDraftPartial.mockImplementation(async (p: { partial: Partial<TournamentConfig>; version: number }) => {
      serverState = deepMergeConfig(serverState, JSON.parse(JSON.stringify(p.partial)))
      return { kind: 'ok', version: p.version + 1, config: serverState } as SaveDraftResult
    })
    store().applyChange(prizeWith({ description: '' }), 'manual')
    expect(store().invalidChanges).toHaveLength(1)

    const prizesInvalid = store().displayConfig!.prizes
    store().applyChange({ format: 'match_play', modo: 'neto', prizes: prizesInvalid }, 'manual')
    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ format: 'match_play', modo: 'neto' })
    expect(store().config?.format).toBe('match_play')
    expect(store().displayConfig?.format).toBe('match_play')
    expect(store().invalidChanges.map((i) => Object.keys(i.partial))).toEqual([['prizes']])

    // Corregir el premio: solo viaja prizes; el formato sigue en Match Play.
    store().applyChange(prizeWith({ description: 'P' }), 'manual')
    await store().flush()
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual(prizeWith({ description: 'P' }))
    expect(store().invalidChanges).toHaveLength(0)
    expect(store().config?.format).toBe('match_play')
    expect(store().displayConfig?.prizes[0].description).toBe('P')
  })

  // Tercera review I2: también se valida la config completa resultante (como el
  // PATCH), quedándose con los issues de las keys que el partial toca.
  it('un partial que pasa el schema parcial pero deja la config completa inválida tampoco viaja', async () => {
    initStore()
    store().applyChange({ team_config: { size: 2 } as never }, 'manual')
    await vi.advanceTimersByTimeAsync(1000)

    expect(data.saveDraftPartial).not.toHaveBeenCalled()
    expect(store().invalidChanges).toHaveLength(1)
    expect(Object.keys(store().invalidChanges[0].partial)).toEqual(['team_config'])
    expect(store().invalidChanges[0].issues.every((i) => i.path[0] === 'team_config')).toBe(true)
  })

  it('descartar cambios no guardados con solo inválidos: la pantalla vuelve a lo válido sin ir al server', async () => {
    const config = { ...createInitialConfig(), ...prizeWith({}) }
    initStore(config)
    store().applyChange(prizeWith({ description: '' }), 'manual')

    await store().discardUnsaved()

    expect(data.fetchDraft).not.toHaveBeenCalled()
    expect(store().invalidChanges).toHaveLength(0)
    expect(store().displayConfig?.prizes[0].description).toBe('Nuevo premio')
    expect(store().syncStatus).toBe('saved')
  })
})

describe('autosave — cambio rechazado por el server (4xx)', () => {
  const rejected = (message: string, status = 403): SaveDraftResult => ({ kind: 'rejected', status, message, issues: [] })

  // Re-review A: un rechazo no puede revertir la corrección tipeada en vuelo.
  it('la corrección tipeada mientras volaba el PATCH rechazado gana y el rechazado desaparece', async () => {
    initStore()
    store().applyChange({ name: 'Copa vieja' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    store().applyChange({ name: 'Copa nueva' }, 'manual')
    inFlight.resolve(rejected('regla del server'))
    await flushing

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual({ name: 'Copa nueva' })
    expect(store().config?.name).toBe('Copa nueva')
    expect(store().displayConfig?.name).toBe('Copa nueva')
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().syncStatus).toBe('saved')
  })

  // Re-review B: un rechazo con path no envenena las otras keys del mismo lote.
  it('un cambio multi-key rechazado con path se parte: la key del issue queda marcada, las otras se guardan', async () => {
    initStore()
    store().applyChange({ name: 'Copa', prizes: [{ id: 'p1', type: 'special', description: 'x' }] }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({
      kind: 'rejected',
      status: 400,
      message: 'Premio 1 · descripción: regla del server',
      issues: [{ path: ['prizes', 0, 'description'], message: 'regla del server' }],
    })

    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual({ name: 'Copa' })
    expect(store().config?.name).toBe('Copa')
    expect(store().pendingChanges.map((c) => [Object.keys(c.partial), !!c.rejected])).toEqual([[['prizes'], true]])
  })

  it('lote mixto con path: se marca solo la key del issue y las otras se guardan', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: 'x' }] }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({
      kind: 'rejected',
      status: 400,
      message: 'config resultante inválido · premio 1 · descripción: regla del server',
      issues: [{ path: ['prizes', 0, 'description'], message: 'regla del server' }],
    })

    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual({ name: 'Copa' })
    expect(store().config?.name).toBe('Copa')
    expect(store().pendingChanges.map((c) => [Object.keys(c.partial)[0], !!c.rejected])).toEqual([['prizes', true]])
    expect(store().syncStatus).toBe('rejected')
  })

  it('lote mixto sin path: se reenvía por key y se marca solo la que el server rechaza', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    data.saveDraftPartial
      .mockResolvedValueOnce(rejected('sin detalle', 400)) // lote {name, date_start}
      .mockImplementationOnce(async (p: { partial: Partial<TournamentConfig>; version: number }) =>
        serverOk(p.partial, p.version + 1),
      ) // {name} solo → ok
      .mockResolvedValueOnce(rejected('sin detalle', 400)) // {date_start} solo → rechazado

    await store().flush()

    const partials = data.saveDraftPartial.mock.calls.map((c) => Object.keys(c[0].partial))
    expect(partials).toEqual([['name', 'date_start'], ['name'], ['date_start']])
    expect(store().config?.name).toBe('Copa')
    expect(store().pendingChanges.map((c) => [Object.keys(c.partial)[0], c.rejected])).toEqual([['date_start', 'sin detalle']])
  })

  // Tercera review I1: si los issues apuntan a keys que el lote no toca, la
  // base del borrador es la inválida (p. ej. formato copiado sin validar).
  it('base inválida: el lote inocente queda bloqueado (no rechazado), sin loop, y se libera cuando un ok arregla la base', async () => {
    initStore()
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: 'Hoyo en uno' }] }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({
      kind: 'rejected',
      status: 400,
      message: 'formato: opción inválida',
      issues: [{ path: ['format'], message: 'Invalid option', code: 'invalid_value' }],
    })

    await store().flush()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(store().pendingChanges[0].rejected).toBeUndefined()
    expect(store().pendingChanges[0].blocked).toEqual({ keys: ['format'], message: 'formato: opción inválida' })
    expect(store().syncStatus).toBe('rejected')
    expect(selectRejectionMessage(store())).toBe('formato: opción inválida')

    // El organizador arregla el formato: viaja solo, y al confirmar libera el premio.
    store().applyChange({ format: 'stroke_play' }, 'manual')
    await store().flush()

    const partials = data.saveDraftPartial.mock.calls.map((c) => Object.keys(c[0].partial))
    expect(partials).toEqual([['prizes'], ['format'], ['prizes']])
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().syncStatus).toBe('saved')
    expect(store().config?.prizes[0].description).toBe('Hoyo en uno')
  })

  // Cuarta review I2: la base inválida se muestra desde el principio, no recién
  // cuando algo queda bloqueado; y descartar no la esconde.
  it('una base inválida del server se detecta al cargar y se limpia cuando un ok arregla la key', async () => {
    const badBase = { ...createInitialConfig(), format: 'stroke' as never }
    initStore(badBase)

    expect(store().baseIssues.map((i) => i.path[0])).toEqual(['format'])
    expect(store().syncStatus).toBe('idle')

    store().applyChange({ name: 'Copa' }, 'manual')
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: 'x' }] }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({
      kind: 'rejected',
      status: 400,
      message: 'formato: opción inválida',
      issues: [{ path: ['format'], message: 'Invalid option', code: 'invalid_value' }],
    })
    await store().flush()
    await store().discardUnsaved()
    // Descartar el lote bloqueado no esconde el problema de la base.
    expect(store().baseIssues.map((i) => i.path[0])).toEqual(['format'])

    store().applyChange({ format: 'stroke_play' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(serverOk({ format: 'stroke_play' }, 2, badBase))
    await store().flush()
    expect(store().baseIssues).toEqual([])
  })

  it('el motivo se deriva de la cola, no de lastError (que se limpia en cada envío)', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('motivo del server'))
    await store().flush()
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    await store().flush()

    expect(store().lastError).toBeNull()
    expect(selectRejectionMessage(store())).toBe('motivo del server')
  })

  it('descartar cambios no guardados con rechazados: vuelve a la última config confirmada por el server, sin GET', async () => {
    const config = { ...createInitialConfig(), name: 'Del server' }
    initStore(config)
    store().applyChange({ name: 'Rechazado' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('regla del server'))
    await store().flush()
    expect(store().config?.name).toBe('Rechazado')
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(serverOk({ date_start: '2026-10-10' }, 2, config))
    await store().flush()

    await store().discardUnsaved()

    expect(data.fetchDraft).not.toHaveBeenCalled()
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.name).toBe('Del server')
    expect(store().displayConfig?.name).toBe('Del server')
    expect(store().config?.date_start).toBe('2026-10-10')
    expect(store().syncStatus).toBe('saved')
  })

  // Cuarta review, crítico: descartar nunca borra un cambio ya guardado.
  // Secuencia: R rechazado → click Descartar con B1 en vuelo → B1 confirma v2 →
  // se tipea B2 (description) que se guarda en v3 → al terminar, la pantalla
  // tiene B2 y la versión es 3; R desapareció; el server no se pisa.
  it('descartar con cambios guardándose mientras tanto: lo guardado queda en pantalla y la versión es la del server', async () => {
    initStore()
    store().applyChange({ name: 'Rechazado' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('regla del server'))
    await store().flush()

    let serverState: TournamentConfig = createInitialConfig()
    const inFlightB1 = deferred<SaveDraftResult>()
    data.saveDraftPartial
      .mockReturnValueOnce(inFlightB1.promise)
      .mockImplementation(async (p: { partial: Partial<TournamentConfig>; version: number }) => {
        serverState = deepMergeConfig(serverState, JSON.parse(JSON.stringify(p.partial)))
        return { kind: 'ok', version: p.version + 1, config: serverState } as SaveDraftResult
      })
    store().applyChange({ date_start: '2026-10-10' }, 'manual') // B1
    const flushing = store().flush()
    const discarding = store().discardUnsaved()
    store().applyChange({ description: 'texto tipeado' }, 'manual') // B2, tipeado con el click ya hecho

    serverState = { ...serverState, date_start: '2026-10-10' }
    inFlightB1.resolve({ kind: 'ok', version: 2, config: serverState })
    await flushing
    await discarding

    expect(store().version).toBe(3)
    expect(store().displayConfig?.description).toBe('texto tipeado')
    expect(store().config?.date_start).toBe('2026-10-10')
    expect(store().config?.name).toBe('')
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().serverConfig?.description).toBe('texto tipeado')
  })

  // Tercera review C2: descartar no compite con un PATCH en vuelo.
  it('descartar con un cambio válido en vuelo espera a que confirme: el cambio no desaparece ni se pisa', async () => {
    initStore()
    store().applyChange({ name: 'Rechazado' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('regla del server'))
    await store().flush()

    // B (fecha) sale y todavía no volvió cuando el organizador aprieta Descartar.
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    const flushing = store().flush()
    const discarding = store().discardUnsaved()

    inFlight.resolve(serverOk({ date_start: '2026-10-10' }, 2))
    await flushing
    await discarding

    expect(data.fetchDraft).not.toHaveBeenCalled()
    expect(store().config?.date_start).toBe('2026-10-10')
    expect(store().config?.name).toBe('')
    expect(store().version).toBe(2)
    expect(store().pendingChanges).toHaveLength(0)
    expect(JSON.parse(window.localStorage.getItem('draft:d1:queue') ?? '[]')).toHaveLength(0)
  })

  it('descartar no toca un rechazo que llegó después del click ni pisa el estado de sesión/offline', async () => {
    initStore()
    store().applyChange({ name: 'Rechazado antes' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('regla 1'))
    await store().flush()

    // Otro cambio sale y es rechazado mientras el descarte espera el drenaje.
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    const flushing = store().flush()
    const discarding = store().discardUnsaved()
    inFlight.resolve(rejected('regla 2'))
    await flushing
    await discarding

    expect(store().pendingChanges.map((c) => c.rejected)).toEqual(['regla 2'])
    expect(store().config?.name).toBe('')

    useDraftStore.setState({ syncStatus: 'auth' })
    await store().discardUnsaved()
    expect(store().syncStatus).toBe('auth')
  })

  it('descartar no borra lo que se tipeó después del click, y con todo limpio vuelve a Sincronizado', async () => {
    const config = { ...createInitialConfig(), prizes: [{ id: 'p1', type: 'special' as const, description: 'ok' }] }
    initStore(config)
    store().applyChange({ name: 'Rechazado' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('regla del server'))
    await store().flush()

    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    const flushing = store().flush()
    const discarding = store().discardUnsaved()
    // Mientras el descarte espera, el organizador deja un premio inválido en pantalla.
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: '' }] }, 'manual')
    inFlight.resolve(serverOk({ date_start: '2026-10-10' }, 2, config))
    await flushing
    await discarding

    expect(store().invalidChanges).toHaveLength(1)
    expect(store().displayConfig?.prizes[0].description).toBe('')
    expect(store().syncStatus).toBe('invalid')

    // Y descartando también eso, con cola vacía, "Guardado" vuelve a "Sincronizado".
    await store().discardUnsaved()
    expect(store().syncStatus).toBe('saved')
    vi.advanceTimersByTime(2000)
    expect(store().syncStatus).toBe('idle')
  })

  // Tercera review I3: recargar no pierde lo inválido, y una cola vieja con
  // partials inválidos no envenena nada.
  it('recarga con inválidos persistidos: vuelven a pantalla con su error y no viajan', async () => {
    const config = { ...createInitialConfig(), prizes: [{ id: 'p1', type: 'special' as const, description: 'ok' }] }
    window.localStorage.setItem(
      'draft:d1:invalid',
      JSON.stringify([{ partial: { prizes: [{ id: 'p1', type: 'special', description: '' }] }, timestamp: 1 }]),
    )
    initStore(config)

    expect(data.saveDraftPartial).not.toHaveBeenCalled()
    expect(store().invalidChanges.map((i) => i.message)).toEqual(['Premio 1 · descripción: obligatorio'])
    expect(store().displayConfig?.prizes[0].description).toBe('')
    expect(store().config?.prizes[0].description).toBe('ok')
    expect(store().syncStatus).toBe('invalid')
  })

  it('un inválido persistido que ahora es válido se encola y viaja', async () => {
    window.localStorage.setItem('draft:d1:invalid', JSON.stringify([{ partial: { name: 'Copa' }, timestamp: 1 }]))
    initStore()

    expect(store().invalidChanges).toHaveLength(0)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Copa' })
    expect(window.localStorage.getItem('draft:d1:invalid')).toBeNull()
  })

  it('cola de un cliente viejo con un partial inválido: las keys válidas viajan y la inválida queda en pantalla', async () => {
    window.localStorage.setItem(
      'draft:d1:queue',
      JSON.stringify([
        {
          partial: { name: 'Copa', prizes: [{ id: 'p1', type: 'special', description: '' }] },
          source: 'manual',
          timestamp: 1,
        },
      ]),
    )
    initStore()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Copa' })
    expect(store().invalidChanges.map((i) => Object.keys(i.partial))).toEqual([['prizes']])
    expect(JSON.parse(window.localStorage.getItem('draft:d1:queue') ?? '[]')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('draft:d1:invalid') ?? '[]')).toHaveLength(1)
  })

  it('lo inválido se persiste al tipear y se borra al corregir o descartar', () => {
    initStore()
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: '' }] }, 'manual')
    expect(JSON.parse(window.localStorage.getItem('draft:d1:invalid') ?? '[]')).toHaveLength(1)
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: 'ok' }] }, 'manual')
    expect(window.localStorage.getItem('draft:d1:invalid')).toBeNull()
  })

  // Cuarta review I1: salir del editor por navegación interna no pierde lo tipeado.
  it('reset() (salir del editor) conserva cola e inválidos persistidos, e init() los retoma al volver', async () => {
    initStore()
    store().applyChange({ name: 'Tipeado antes de irme' }, 'manual')
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: '' }] }, 'manual')
    // Se va del editor antes de que el debounce dispare.
    store().reset()
    expect(data.saveDraftPartial).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem('draft:d1:queue') ?? '[]')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('draft:d1:invalid') ?? '[]')).toHaveLength(1)

    // Vuelve: lo pendiente se reenvía, lo inválido vuelve a pantalla.
    initStore()
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Tipeado antes de irme' })
    expect(store().invalidChanges).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(store().config?.name).toBe('Tipeado antes de irme')
  })

  it('forgetPersisted() (torneo creado) borra cola e inválidos de este navegador', () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    store().applyChange({ prizes: [{ id: 'p1', type: 'special', description: '' }] }, 'manual')
    store().forgetPersisted()
    expect(window.localStorage.getItem('draft:d1:queue')).toBeNull()
    expect(window.localStorage.getItem('draft:d1:invalid')).toBeNull()
  })

  it('recarga con una cola que tenía rechazados: se reintentan sin la marca', async () => {
    window.localStorage.setItem(
      'draft:d1:queue',
      JSON.stringify([{ partial: { name: 'Otra vez' }, source: 'manual', timestamp: 1, rejected: 'viejo motivo' }]),
    )
    initStore()

    expect(store().pendingChanges[0].rejected).toBeUndefined()
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.name).toBe('Otra vez')
  })

  it('401: la cola espera con estado de sesión y reintenta; al volver la sesión, guarda', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'error', status: 401, message: 'Tu sesión expiró. Vuelve a iniciar sesión.' })
    await store().flush()

    expect(store().syncStatus).toBe('auth')
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().pendingChanges[0].rejected).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1000)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(store().syncStatus).toBe('saved')
    expect(store().config?.name).toBe('Copa')
  })

  it('no reintenta, muestra el mensaje del server y la config local se conserva', async () => {
    initStore()
    store().applyChange({ name: '' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('config_partial inválido · name vacío'))

    await store().flush()

    expect(store().config?.name).toBe('')
    expect(store().syncStatus).toBe('rejected')
    expect(store().lastError).toBe('config_partial inválido · name vacío')
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().pendingChanges[0].rejected).toBe('config_partial inválido · name vacío')

    // Ni el backoff ni un flush manual lo vuelven a mandar.
    await vi.advanceTimersByTimeAsync(60_000)
    await store().flush()
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(store().syncStatus).toBe('rejected')
  })

  it('corregir el campo reemplaza el cambio rechazado, drena y se puede crear', async () => {
    initStore()
    store().applyChange({ name: '' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('name vacío'))
    await store().flush()
    expect(store().syncStatus).toBe('rejected')

    store().applyChange({ name: 'Copa' }, 'manual')
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().pendingChanges[0].rejected).toBeUndefined()

    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual({ name: 'Copa' })
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().syncStatus).toBe('saved')
    expect(store().config?.name).toBe('Copa')
  })

  it('un cambio en otro campo drena sin arrastrar el rechazado, y el chip sigue en rechazado', async () => {
    initStore()
    store().applyChange({ name: '' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce(rejected('name vacío'))
    await store().flush()

    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    await store().flush()

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual({ date_start: '2026-10-10' })
    expect(store().pendingChanges).toHaveLength(1)
    expect(store().pendingChanges[0].rejected).toBe('name vacío')
    expect(store().syncStatus).toBe('rejected')
    expect(store().config?.date_start).toBe('2026-10-10')
  })

  it('lo tipeado durante el vuelo de un PATCH rechazado se manda igual', async () => {
    initStore()
    store().applyChange({ name: '' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()
    store().applyChange({ date_start: '2026-10-10' }, 'manual')
    inFlight.resolve(rejected('name vacío'))
    await flushing

    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0].partial).toEqual({ date_start: '2026-10-10' })
    expect(store().pendingChanges.map((c) => c.rejected)).toEqual(['name vacío'])
  })
})

describe('applyServerConfig — respuesta del asistente IA', () => {
  it('toma la config del server pero conserva lo que el organizador está tipeando', () => {
    initStore()
    store().applyChange({ name: 'Copa del Cl' }, 'manual')

    const aiConfig = { ...createInitialConfig(), format: 'scramble' as const, name: '' }
    store().applyServerConfig(aiConfig, 4)

    expect(store().config?.format).toBe('scramble')
    expect(store().config?.name).toBe('Copa del Cl')
    expect(store().version).toBe(4)
    expect(store().pendingChanges).toHaveLength(1)
  })

  // Review I1: la IA persistió en v3 y respondió lento; mientras tanto el
  // autosave ya guardó v4. Aplicar la v3 revertiría lo guardado.
  it('una config con versión ≤ la del store se descarta (no revierte lo guardado)', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    await store().flush()
    expect(store().version).toBe(2)
    expect(store().config?.name).toBe('Copa')

    store().applyServerConfig({ ...createInitialConfig(), name: 'Vieja' }, 2)
    expect(store().config?.name).toBe('Copa')
    expect(store().version).toBe(2)

    store().applyServerConfig({ ...createInitialConfig(), name: 'Vieja' }, 1)
    expect(store().config?.name).toBe('Copa')
  })

  it('un 200 del autosave con versión ≤ la del store saca lo enviado de la cola pero no pisa la config', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    const inFlight = deferred<SaveDraftResult>()
    data.saveDraftPartial.mockReturnValueOnce(inFlight.promise)
    const flushing = store().flush()

    // La IA avanzó el store a v5 mientras el PATCH (v1 → v2) volaba.
    store().applyServerConfig({ ...createInitialConfig(), name: 'Copa', format: 'scramble' }, 5)
    inFlight.resolve(serverOk({ name: 'Copa' }, 2))
    await flushing

    expect(store().pendingChanges).toHaveLength(0)
    expect(store().version).toBe(5)
    expect(store().config?.format).toBe('scramble')
    expect(store().syncStatus).toBe('saved')
  })
})
