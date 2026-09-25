import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInitialConfig } from '@/lib/draft/initial-config'
import {
  createTournamentFromDraft,
  fetchDraft,
  saveDraftPartial,
} from './tournament-drafts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDraft', () => {
  it('mapea el borrador y sus colaboradores al shape del store', async () => {
    const config = createInitialConfig()
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        draft: {
          id: 'd1',
          config,
          version: 3,
          tournament_draft_collaborators: [
            { user_id: 'u1', role: 'owner', name: 'Juanjo' },
            { user_id: 'u2', role: 'collaborator', name: null },
          ],
        },
      }),
    )

    const draft = await fetchDraft('d1')

    expect(fetchMock).toHaveBeenCalledWith('/api/torneos/draft/d1', { method: 'GET' })
    expect(draft).toEqual({
      id: 'd1',
      config,
      version: 3,
      collaborators: [
        { user_id: 'u1', role: 'owner', name: 'Juanjo' },
        { user_id: 'u2', role: 'collaborator', name: undefined },
      ],
    })
  })

  it('propaga el mensaje de error del server', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'No encontrado' }))
    await expect(fetchDraft('nope')).rejects.toThrow('No encontrado')
  })

  it('sin body de error, informa el status', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))
    await expect(fetchDraft('d1')).rejects.toThrow('Error 500')
  })
})

describe('createTournamentFromDraft', () => {
  it('devuelve el slug para navegar', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, tournament_id: 't1', slug: 'copa-club' }))
    await expect(createTournamentFromDraft('d1')).resolves.toEqual({ tournament_id: 't1', slug: 'copa-club' })
  })

  it('une el error con los detalles de validación', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: 'Config inválida',
        details: [{ message: 'Falta la cancha' }, { message: 'Falta la fecha' }],
      }),
    )
    await expect(createTournamentFromDraft('d1')).rejects.toThrow(
      'Config inválida · Falta la cancha; Falta la fecha',
    )
  })
})

describe('saveDraftPartial', () => {
  const base = { draftId: 'd1', partial: { name: 'Copa' }, version: 2, source: 'manual' as const }

  it('manda el partial con la versión y devuelve la config del server', async () => {
    const config = { ...createInitialConfig(), name: 'Copa' }
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, draft: { id: 'd1', version: 3, config } }))

    const result = await saveDraftPartial(base)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/torneos/draft/d1')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({
      config_partial: { name: 'Copa' },
      version: 2,
      source: 'manual',
    })
    expect(result).toEqual({ kind: 'ok', version: 3, config })
  })

  it('409 con config del server → conflict reconciliable', async () => {
    const serverConfig = { ...createInitialConfig(), name: 'Otro' }
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: 'conflict', current_version: 5, current_config: serverConfig }),
    )
    await expect(saveDraftPartial(base)).resolves.toEqual({
      kind: 'conflict',
      version: 5,
      config: serverConfig,
    })
  })

  it('409 sin config → conflict sin datos para reconciliar', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'conflict' }))
    await expect(saveDraftPartial(base)).resolves.toEqual({ kind: 'conflict', version: null, config: null })
  })

  it('error HTTP → kind error con el texto del server', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(saveDraftPartial(base)).resolves.toEqual({ kind: 'error', status: 500, message: 'boom' })
  })

  it('red caída → kind error con status 0, nunca lanza', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(saveDraftPartial(base)).resolves.toEqual({
      kind: 'error',
      status: 0,
      message: 'Failed to fetch',
    })
  })
})
