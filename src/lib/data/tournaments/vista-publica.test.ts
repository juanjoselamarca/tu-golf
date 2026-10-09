import { describe, it, expect } from 'vitest'
import { idsConHandicapOculto, vistaPublica, filaPublica } from './vista-publica'
import type { Player } from '@/lib/golf-data'

const jugadores = [
  { id: 'cuenta', handicap_de_perfil: true },
  { id: 'invitado', handicap_de_perfil: false },
  { id: 'plano' },
]
const p = (id: string): Player => ({
  pos: 1, id, name: id, country: 'CL', cat: 'General', hcp: 18, hcpDisplay: 20,
  today: 0, total: 0, holes: 18, status: 'F', scores: [],
})

describe('ocultar handicap en el board público', () => {
  it('sin sesión se ocultan sólo los jugadores con el índice del perfil', () => {
    expect([...idsConHandicapOculto(jugadores, false)]).toEqual(['cuenta'])
  })
  it('con sesión no se oculta nada', () => {
    expect(idsConHandicapOculto(jugadores, true).size).toBe(0)
  })
  it('filaPublica (torneo gross sin sesión) anula hcp sólo de los ocultos y no muta la entrada', () => {
    const vista = vistaPublica({ visorConSesion: false, caminoRondaLibre: true, modoJuego: 'gross', formatoJuego: 'stroke_play' })
    const entrada = [p('cuenta'), p('invitado')]
    const out = entrada.map((x) => filaPublica(x, vista, new Set(['cuenta'])))
    expect(out[0]).toMatchObject({ hcp: null, hcpDisplay: null })
    expect(out[1]).toMatchObject({ hcp: 18, hcpDisplay: 20 })
    expect(entrada[0].hcp).toBe(18)
  })
})

describe('vistaPublica', () => {
  const base = { caminoRondaLibre: true, modoJuego: 'neto' as const, formatoJuego: 'stableford' as const }
  it('sin sesión + neto: solo bruto, en gross y stroke play', () => {
    expect(vistaPublica({ ...base, visorConSesion: false })).toEqual({ sinNeto: true, soloBruto: true, modo: 'gross', formato: 'stroke_play' })
  })
  it('con sesión: todo como el torneo', () => {
    expect(vistaPublica({ ...base, visorConSesion: true })).toEqual({ sinNeto: false, soloBruto: false, modo: 'neto', formato: 'stableford' })
  })
  it('legacy (decisión 2): sin cambios aunque no haya sesión', () => {
    expect(vistaPublica({ ...base, visorConSesion: false, caminoRondaLibre: false }).sinNeto).toBe(false)
  })
  it('sin sesión + gross: sin neto pero el formato se conserva (puntos gross)', () => {
    expect(vistaPublica({ ...base, modoJuego: 'gross', visorConSesion: false })).toEqual({ sinNeto: true, soloBruto: false, modo: 'gross', formato: 'stableford' })
  })
})

describe('filaPublica', () => {
  it('no deja pasar netTotal ni campos que no estén en la lista explícita', () => {
    const fila = { ...p('x'), netTotal: 54, stablefordTotal: 54, campoNuevo: 1 } as Player
    const vista = vistaPublica({ visorConSesion: false, caminoRondaLibre: true, modoJuego: 'neto', formatoJuego: 'stableford' })
    const out = filaPublica(fila, vista, new Set())
    expect(out).not.toHaveProperty('netTotal')
    expect(out).not.toHaveProperty('stablefordTotal')
    expect(out).not.toHaveProperty('campoNuevo')
    expect(out.hcp).toBeNull()
  })
})
