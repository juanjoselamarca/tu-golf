import { describe, it, expect } from 'vitest'
import { calcularMatchPlay } from './match-play'

describe('calcularMatchPlay — SI normalizado en la decisión del hoyo (P0 16-jul)', () => {
  // Máquina de Verdad P0-2: el detalle del hoyo MUESTRA los golpes con el stroke index
  // normalizado (siAlloc, permutación 1..N), pero la decisión de quién gana el hoyo usaba
  // el stroke_index CRUDO del catálogo. En 9 hoyos sobre una cancha de 18, el SI crudo no
  // es 1..9 (ej. un back-9 con SI 10..18), así que la diferencia de golpes se repartía a
  // hoyos que no correspondían — o a ninguno — y el match se decidía mal en silencio.
  it('9h con SI crudo fuera de rango (10..18): reparte golpes por rango, no por SI crudo', () => {
    // stroke_index crudo estrictamente alto (10..18): NO es permutación 1..9.
    const holes = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 10 }))
    const tie4 = Object.fromEntries(holes.map(h => [String(h.numero), 4])) // ambos gross 4 en todo

    const res = calcularMatchPlay(tie4, { ...tie4 }, holes, {
      courseHandicapA: 5, courseHandicapB: 0, totalHoles: 9, modo: 'neto',
    })

    // A (diff 5) recibe golpe en los 5 hoyos más difíciles → normSI 1..5 = numeros 1..5.
    // Con el SI crudo (todos >5) A no recibía NINGÚN golpe y los 9 quedaban empatados.
    expect(res.holesWonA).toBe(5)
    expect(res.holesWonB).toBe(0)
    expect(res.winner).toBe('a')
  })

  it('gross: sin handicap, hoyos empatados quedan all square (no se toca)', () => {
    const holes = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 10 }))
    const tie4 = Object.fromEntries(holes.map(h => [String(h.numero), 4]))
    const res = calcularMatchPlay(tie4, { ...tie4 }, holes, {
      courseHandicapA: 5, courseHandicapB: 0, totalHoles: 9, modo: 'gross',
    })
    expect(res.holesWonA).toBe(0)
    expect(res.holesWonB).toBe(0)
    expect(res.winner).toBeNull()
  })
})
