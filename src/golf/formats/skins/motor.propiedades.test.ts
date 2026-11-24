import { describe, it, expect } from 'vitest'
import {
  calcularSkins,
  esHoyoResuelto,
  FUERA_DEL_HOYO as X,
  EMPATES_ULTIMO_HOYO,
  type EntradaSkins,
  type ScoreSkins,
} from './index'

/** PRNG determinista (Park–Miller): una falla se reproduce con la misma semilla. */
function prng(semilla: number) {
  let s = semilla % 2147483647 || 1
  const azar = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1))
  const uno = <T,>(xs: readonly T[]): T => xs[entre(0, xs.length - 1)]
  return { azar, entre, uno }
}

function barajarSI(r: ReturnType<typeof prng>, n: number): number[] {
  const si = Array.from({ length: n }, (_, i) => i + 1)
  for (let i = n - 1; i > 0; i--) {
    const j = r.entre(0, i)
    ;[si[i], si[j]] = [si[j], si[i]]
  }
  return si
}

/**
 * Una ronda al azar. `completa` = todos anotan todo (salvo retiros). La mitad de las veces el orden del arrastre
 * no es el de numeración (sale por el 10 / por el 5) y cada retirado deja de jugar la cola de ESE orden.
 */
function rondaAlAzar(semilla: number, completa: boolean): EntradaSkins {
  const r = prng(semilla)
  const n = r.uno([9, 18])
  const si = barajarSI(r, n)
  const numerados = si.map((s, i) => ({ numero: i + 1, par: r.uno([3, 4, 4, 5]), si: s }))
  const salida = r.azar() < 0.5 ? 0 : r.entre(1, n - 1)
  const hoyos = [...numerados.slice(salida), ...numerados.slice(0, salida)]
  const cuantos = r.entre(2, 12)
  const jugadores = Array.from({ length: cuantos }, (_, i) => {
    const retiro = r.azar() < 0.1 ? r.entre(1, n - 1) : null
    return {
      id: `j${i}`,
      handicapDeJuego: r.entre(-3, 30),
      hoyosQueNoJuega: retiro == null ? [] : hoyos.slice(retiro).map(h => h.numero),
    }
  })
  const scores: Record<string, Record<number, ScoreSkins>> = {}
  for (const j of jugadores) {
    scores[j.id] = {}
    for (const h of hoyos) {
      if (j.hoyosQueNoJuega.includes(h.numero)) continue
      if (!completa && r.azar() < 0.15) continue
      scores[j.id][h.numero] = r.azar() < 0.08 ? X : h.par + r.entre(-2, 3)
    }
  }
  const especialesValidos = r.azar() < 0.4
    ? Array.from({ length: r.entre(1, 4) }, (_, k) => {
        // Como en la cancha: el punto se marca en un hoyo que el jugador juega.
        const j = r.uno(jugadores)
        const jugables = hoyos.filter(h => !j.hoyosQueNoJuega.includes(h.numero))
        return { jugadorId: j.id, hoyo: (jugables.length ? r.uno(jugables) : r.uno(hoyos)).numero, puntitoId: `p${k}` }
      }).filter(e => !jugadores.find(j => j.id === e.jugadorId)!.hoyosQueNoJuega.includes(e.hoyo))
    : []
  return {
    opciones: {
      modo: r.uno(['neto', 'gross'] as const),
      empateUltimoHoyo: r.uno(EMPATES_ULTIMO_HOYO),
      validacion: r.azar() < 0.5,
      pozoPorJugador: r.uno([0, 2000, 30000, 33333]),
    },
    jugadores, hoyos, scores, especialesValidos,
  }
}

const SEMILLAS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13)

describe('propiedades del motor de skins (400 rondas al azar)', () => {
  it('la muestra no es vacía: la gran mayoría de las rondas se puede liquidar y hay de todos los estados', () => {
    const rondas = SEMILLAS.map(s => calcularSkins(rondaAlAzar(s, false)))
    expect(rondas.filter(r => r.liquidable).length).toBeGreaterThan(SEMILLAS.length * 0.8)
    const estados = new Set(rondas.flatMap(r => r.hoyos.map(h => h.estado)))
    for (const e of ['por_jugar', 'en_disputa', 'por_validar', 'ganado', 'arrastre', 'repartido', 'perdido']) expect(estados.has(e as never), e).toBe(true)
  })

  it('ronda completa: cada skin de hoyo termina cobrado o perdido, nunca se crea ni se pierde de más', () => {
    for (const s of SEMILLAS) {
      const e = rondaAlAzar(s, true)
      const r = calcularSkins(e)
      expect(r.definitivo, `semilla ${s}`).toBe(r.liquidable)
      const cobradosEnHoyos = r.hoyos.reduce((t, h) => t + (h.estado === 'ganado' || h.estado === 'repartido' ? h.valor : 0), 0)
      const perdidos = r.hoyos.reduce((t, h) => t + (h.estado === 'perdido' ? h.valor : 0), 0)
      expect(cobradosEnHoyos + perdidos, `semilla ${s}`).toBe(e.hoyos.length)
      const especiales = e.especialesValidos!.length
      expect(r.skinsCobrados, `semilla ${s}`).toBeCloseTo(cobradosEnHoyos + especiales, 9)
    }
  })

  it('la plata cuadra: con pozo, la suma de lo que se cobra es exactamente el pozo (pesos enteros, nunca negativos)', () => {
    for (const s of SEMILLAS) {
      for (const completa of [true, false]) {
        const r = calcularSkins(rondaAlAzar(s, completa))
        const suma = r.jugadores.reduce((t, j) => t + j.cobra, 0)
        expect(r.jugadores.every(j => Number.isInteger(j.cobra) && j.cobra >= 0), `semilla ${s}`).toBe(true)
        if (r.liquidable && r.pozoTotal > 0 && (r.skinsCobrados > 0 || r.devolucion)) expect(suma, `semilla ${s}`).toBe(r.pozoTotal)
        else expect(suma, `semilla ${s}`).toBe(0)
        const netos = r.jugadores.reduce((t, j) => t + j.neto, 0)
        if (r.liquidable && r.pozoTotal > 0 && (r.skinsCobrados > 0 || r.devolucion)) expect(netos, `semilla ${s}`).toBe(0)
      }
    }
  })

  it('el ganador de un hoyo tiene un neto estrictamente mejor que todos los demás que anotaron golpes; X nunca gana', () => {
    for (const s of SEMILLAS) {
      const r = calcularSkins(rondaAlAzar(s, false))
      for (const h of r.hoyos) {
        if (h.estado !== 'ganado') continue
        const g = h.netos[h.ganador!]
        expect(typeof g, `semilla ${s} hoyo ${h.numero}`).toBe('number')
        for (const [id, n] of Object.entries(h.netos)) {
          if (id !== h.ganador && typeof n === 'number') expect(n, `semilla ${s} hoyo ${h.numero}`).toBeGreaterThan(g as number)
        }
      }
    }
  })

  // Completar con la ronda completa de la misma semilla no sirve (otro azar). Se completa de tres maneras: bogeys
  // (nunca validan), pares (validan los netos con golpe) y al azar entre birdie y doble (validan a veces).
  it.each(['bogey', 'par', 'azar'] as const)('anotar más scores (completando con %s) nunca cambia el estado ni el ganador de un hoyo resuelto', (relleno) => {
    for (const s of SEMILLAS) {
      const parcial = rondaAlAzar(s, false)
      const antes = calcularSkins(parcial)
      const r = prng(s + 7)
      const scores: Record<string, Record<number, ScoreSkins>> = {}
      for (const j of parcial.jugadores) {
        scores[j.id] = { ...parcial.scores[j.id] } as Record<number, ScoreSkins>
        for (const h of parcial.hoyos) {
          if (j.hoyosQueNoJuega?.includes(h.numero)) continue
          if (scores[j.id][h.numero] !== undefined) continue
          scores[j.id][h.numero] = relleno === 'bogey' ? h.par + 1 : relleno === 'par' ? h.par : h.par + r.entre(-1, 2)
        }
      }
      const despues = calcularSkins({ ...parcial, scores })
      antes.hoyos.forEach((h, i) => {
        if (!esHoyoResuelto(h.estado)) return
        expect(despues.hoyos[i].estado, `semilla ${s} hoyo ${h.numero}`).toBe(h.estado)
        expect(despues.hoyos[i].ganador, `semilla ${s} hoyo ${h.numero}`).toBe(h.ganador)
        if (!h.valorProvisional) expect(despues.hoyos[i].valor, `semilla ${s} hoyo ${h.numero}`).toBe(h.valor)
        else expect(despues.hoyos[i].valor, `semilla ${s} hoyo ${h.numero}`).toBeGreaterThanOrEqual(h.valor)
      })
    }
  })

  it('el orden de los jugadores no cambia los skins de nadie, y la plata a lo más en $1 (resto)', () => {
    for (const s of SEMILLAS.slice(0, 150)) {
      const e = rondaAlAzar(s, true)
      const a = calcularSkins(e)
      const b = calcularSkins({ ...e, jugadores: [...e.jugadores].reverse() })
      for (const j of a.jugadores) {
        const otro = b.jugadores.find(x => x.id === j.id)!
        expect(otro.skins, `semilla ${s}`).toBeCloseTo(j.skins, 9)
        expect(Math.abs(otro.cobra - j.cobra), `semilla ${s}`).toBeLessThanOrEqual(1)
      }
    }
  })
})
