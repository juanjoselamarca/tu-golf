import { describe, it, expect } from 'vitest'
import { calcularScramble } from '@/golf/formats/scramble'
import { esHandicapDeClubValido, handicapsDeEquipoDeClub } from './equipos-de-club'

// SI de 18 hoyos realista: los impares adelante, los pares atrás.
const SI_18 = [7, 15, 1, 11, 3, 17, 9, 5, 13, 8, 16, 2, 12, 4, 18, 10, 6, 14]
const HOYOS_18 = SI_18.map((si, i) => ({ numero: i + 1, par: 4, stroke_index: si }))
// 9 hoyos: los de adelante con su SI de 18 (impares, no 1..9). calcularScramble los normaliza.
const HOYOS_9 = HOYOS_18.slice(0, 9)

function golpesRecibidos(handicapDelClub: number, hoyos: typeof HOYOS_18) {
  const { completo, juego } = handicapsDeEquipoDeClub(handicapDelClub)
  const r = calcularScramble(
    { id: 'e1', nombre: 'Los Tigres', scores: {}, teamHandicap: completo, teamHandicapJuego: juego },
    hoyos,
    hoyos.length * 4,
  )
  return { total: r.holes.reduce((s, h) => s + h.strokesRecibidos, 0), mostrado: r.teamHandicap, porHoyo: r.holes.map(h => h.strokesRecibidos) }
}

describe('calcularScramble con el hándicap del club: reparte exactamente ese número', () => {
  it.each([0, 8, 18, 36])('18 hoyos, hándicap %i', (hcp) => {
    const { total, mostrado } = golpesRecibidos(hcp, HOYOS_18)
    expect(total).toBe(hcp)
    expect(mostrado).toBe(hcp)
  })

  it.each([0, 8, 18])('9 hoyos, hándicap %i (tal cual, no se parte)', (hcp) => {
    const { total, mostrado } = golpesRecibidos(hcp, HOYOS_9)
    expect(total).toBe(hcp)
    expect(mostrado).toBe(hcp)
  })

  it('9 hoyos con 18: 2 golpes en cada hoyo; 36 en 18 hoyos también', () => {
    expect(golpesRecibidos(18, HOYOS_9).porHoyo).toEqual(Array(9).fill(2))
    expect(golpesRecibidos(36, HOYOS_18).porHoyo).toEqual(Array(18).fill(2))
  })

  it('9 hoyos con 8: los golpes van a los 8 hoyos más difíciles de la vuelta (SI 17 no recibe)', () => {
    const { porHoyo } = golpesRecibidos(8, HOYOS_9)
    expect(porHoyo[HOYOS_9.findIndex(h => h.stroke_index === 17)]).toBe(0)
    expect(porHoyo.filter(g => g === 1)).toHaveLength(8)
  })

  // 36 en 9 hoyos (4 golpes por hoyo) no es un caso del modo: el validador lo frena (máximo 18). El motor reparte
  // hasta 3 vueltas (27 en 9 hoyos), así que si el tope se subiera sin mirar esto se perderían golpes en silencio.
  it('36 en 9 hoyos: fuera del rango del modo y el motor no lo reparte completo', () => {
    expect(esHandicapDeClubValido(36, 9)).toBe(false)
    expect(golpesRecibidos(36, HOYOS_9).total).toBeLessThan(36)
  })
})
