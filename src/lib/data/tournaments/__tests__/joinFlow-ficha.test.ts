// La ficha de inscripción trae formato_juego con y sin sesión. El camino sin sesión tenía su propio SELECT
// sin esa columna y mostraba "Stroke Play" en un Scramble viejo al que llegó el link por WhatsApp (19-oct-2026).
import { describe, it, expect } from 'vitest'
import { fetchJoinInfo, fetchJoinInfoPublica } from '../joinFlow'

function admin(fila: Record<string, unknown> | null) {
  const selects: string[] = []
  const b: Record<string, unknown> = {}
  b.select = (cols: string) => { selects.push(cols); return b }
  b.eq = () => b
  b.maybeSingle = () => Promise.resolve({ data: fila, error: null })
  return { client: { from: () => b } as never, selects }
}

const fila = { id: 't1', status: 'open', organizer_id: 'o', format: 'stroke_play', formato_juego: 'scramble' }

describe('ficha de inscripción · columnas', () => {
  it('sin sesión pide formato_juego y devuelve el torneo visible', async () => {
    const a = admin(fila)
    const t = await fetchJoinInfoPublica(a.client, 'copa')
    expect(a.selects[0].split(", ")).toContain("formato_juego")
    expect(t?.formato_juego).toBe('scramble')
  })

  it('sin sesión no muestra un borrador', async () => {
    expect(await fetchJoinInfoPublica(admin({ ...fila, status: 'draft' }).client, 'copa')).toBeNull()
  })

  it('con y sin sesión piden exactamente las mismas columnas', async () => {
    const pub = admin(null)
    await fetchJoinInfoPublica(pub.client, 'copa')
    const auth = admin(null)
    await fetchJoinInfo(auth.client, 'copa', 'u1')
    expect(auth.selects[0]).toBe(pub.selects[0])
  })
})
