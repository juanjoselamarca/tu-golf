// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const getUser = vi.fn()
const from = vi.fn(() => {
  throw new Error('no debe tocar la base con un archivo inválido')
})
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}))

import { POST } from './route'

let n = 0
beforeEach(() => {
  vi.clearAllMocks()
  // Un usuario por test: el rate limit (5/min) es por usuario y en memoria.
  getUser.mockResolvedValue({ data: { user: { id: `u-garmin-${++n}` } }, error: null })
})

function req(form: FormData): NextRequest {
  return new Request('http://x/api/import/garmin-zip', { method: 'POST', body: form }) as unknown as NextRequest
}

function jsonFile(body: unknown, name = 'Golf-SCORECARD.json'): File {
  return new File([JSON.stringify(body)], name, { type: 'application/json' })
}

describe('POST /api/import/garmin-zip', () => {
  it('sin sesión responde 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(req(new FormData()))
    expect(res.status).toBe(401)
  })

  it('no descomprime ZIPs en el servidor: un ZIP crudo se rechaza sin leerlo', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'garmin.zip', { type: 'application/zip' }))
    const res = await POST(req(form))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Golf-SCORECARD\.json/)
    expect(from).not.toHaveBeenCalled()
  })

  it('JSON inválido o sin lista de tarjetas → 400, sin tocar la base', async () => {
    for (const cuerpo of ['{no es json', 'null', '{"data":{}}']) {
      const form = new FormData()
      form.append('scorecard_json', new File([cuerpo], 'Golf-SCORECARD.json'))
      const res = await POST(req(form))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/Golf-SCORECARD.json (—|no contiene)/)
    }
    expect(from).not.toHaveBeenCalled()
  })

  it('más de 2000 tarjetas → 413 antes del matching de canchas', async () => {
    const form = new FormData()
    form.append('scorecard_json', jsonFile({ data: Array.from({ length: 2001 }, (_, i) => ({ id: i, holes: [] })) }))
    const res = await POST(req(form))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/más de 2000 tarjetas/)
    expect(from).not.toHaveBeenCalled()
  })

  it('los JSONs extraídos por el navegador siguen pasando al matching de canchas', async () => {
    const form = new FormData()
    form.append('scorecard_json', jsonFile({ data: [{ id: 1, startTime: '2026-10-01T12:00:00', holesCompleted: 18, inProgress: false, strokes: 90, holes: [] }] }))
    form.append('course_json', jsonFile({ data: [{ '1': 'Los Leones' }] }, 'Golf-COURSE.json'))
    await POST(req(form))
    expect(from).toHaveBeenCalledWith('courses')
  })
})
