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

const data = vi.hoisted(() => ({ saveDraftPartial: vi.fn() }))
vi.mock('@/lib/data/tournament-drafts', () => data)

import { useDraftStore } from './store'

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
  window.localStorage.clear()
  useDraftStore.getState().reset()
  // Default: cualquier PATCH que no configure el test explícitamente responde ok.
  data.saveDraftPartial.mockImplementation(async (p: { partial: Partial<TournamentConfig>; version: number }) =>
    serverOk(p.partial, p.version + 1),
  )
})

afterEach(() => {
  useDraftStore.getState().reset()
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

describe('autosave — conflicto 409 (otra pestaña / colaborador / IA)', () => {
  it('reconcilia con la config del server sin perder lo local y reintenta con la versión nueva', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')

    const serverConfig = { ...createInitialConfig(), date_start: '2026-10-10' }
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'conflict', version: 5, config: serverConfig })
    await store().flush()

    expect(store().config?.name).toBe('Copa')
    expect(store().config?.date_start).toBe('2026-10-10')
    expect(store().version).toBe(5)
    expect(store().syncStatus).toBe('conflict')
    expect(store().pendingChanges).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(2)
    expect(data.saveDraftPartial.mock.calls[1][0]).toMatchObject({ partial: { name: 'Copa' }, version: 5 })
    expect(store().config?.name).toBe('Copa')
  })

  it('409 sin config del server: queda en conflicto y no toca lo local', async () => {
    initStore()
    store().applyChange({ name: 'Copa' }, 'manual')
    data.saveDraftPartial.mockResolvedValueOnce({ kind: 'conflict', version: null, config: null })
    await store().flush()

    expect(store().config?.name).toBe('Copa')
    expect(store().syncStatus).toBe('conflict')
    expect(store().lastError).toMatch(/Recarga/)
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

    // Replay inmediato, sin esperar el debounce.
    expect(data.saveDraftPartial).toHaveBeenCalledTimes(1)
    expect(data.saveDraftPartial.mock.calls[0][0].partial).toEqual({ name: 'Pendiente' })
    await vi.advanceTimersByTimeAsync(0)
    expect(store().pendingChanges).toHaveLength(0)
    expect(store().config?.name).toBe('Pendiente')
  })
})

describe('autosave — cambio rechazado por el server (4xx)', () => {
  const rejected = (message: string): SaveDraftResult => ({ kind: 'rejected', status: 400, message })

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
})
