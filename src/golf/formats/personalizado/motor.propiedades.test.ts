import { describe, it, expect } from 'vitest'
import {
  calcularJuegoPersonalizado,
  crearConfigDePlantilla,
  validarJuegoPersonalizado,
  LIMITES_JUEGO,
  TIPOS_PUNTITO,
  type ConfigJuego,
  type MarcaPuntito,
  type PuntitoConfig,
} from './index'

/** PRNG determinista (Park–Miller): una falla se reproduce con la misma semilla. */
function prng(semilla: number) {
  let s = semilla % 2147483647 || 1
  const azar = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1))
  const uno = <T,>(xs: readonly T[]): T => xs[entre(0, xs.length - 1)]
  return { azar, entre, uno }
}

function configAlAzar(r: ReturnType<typeof prng>, n: number): ConfigJuego {
  const plantilla = n === 4 ? r.uno(['colombiana', 'dos_cero_dos', 'subterranea', 'subterror'] as const) : r.uno(['dos_cero_dos', 'subterror'] as const)
  const base = crearConfigDePlantilla(plantilla, r.azar)
  const dividir = base.unidad !== 'individual' && r.azar() < 0.3
  const valorDuelo = () => (dividir ? 2 * r.entre(1, 5) : r.entre(LIMITES_JUEGO.valorDuelo.min, LIMITES_JUEGO.valorDuelo.max))
  const duelos: ConfigJuego['duelos'] =
    base.unidad === 'individual'
      ? [{ tipo: 'por_puesto', tablas: { '3': [0, 0, 0].map(() => r.entre(-10, 10)), '4': [0, 0, 0, 0].map(() => r.entre(-10, 10)) } }]
      : (['mejor_bola', 'peor_bola', 'suma'] as const)
          .filter(() => r.azar() < 0.7)
          .map(tipo => ({ tipo, valor: valorDuelo(), perdedorResta: r.azar() < 0.5 }))
  const puntitos: PuntitoConfig[] = TIPOS_PUNTITO.filter(() => r.azar() < 0.5).map(tipo => ({
    id: tipo,
    tipo,
    nombre: tipo === 'propio' ? 'Árbol' : undefined,
    valor: r.entre(1, 10),
    destino: r.uno(['individual', 'pareja'] as const),
    activo: r.azar() < 0.9,
  }))
  if (duelos.length === 0 && !puntitos.some(p => p.activo)) puntitos.push({ id: 'chipingo', tipo: 'chipingo', valor: 1, destino: 'individual', activo: true })
  return {
    ...base,
    plantilla: 'personalizado_total',
    modo: r.uno(['gross', 'neto'] as const),
    handicap: r.uno(['diferencia_mas_bajo', 'completo'] as const),
    repartoPareja: dividir ? 'dividir' : 'total_a_cada_uno',
    duelos,
    puntitos,
  }
}

describe('propiedades del motor (miles de juegos y tarjetas al azar)', () => {
  it('nunca falla, nunca da decimales y los totales cuadran con el detalle', () => {
    for (let semilla = 1; semilla <= 3000; semilla++) {
      const r = prng(semilla)
      const n = r.entre(3, 4)
      const config = configAlAzar(r, n)
      const cantidadHoyos = r.uno([9, 18, 27])
      const ids = ['a', 'b', 'c', 'd'].slice(0, n)
      const jugadores = ids.map(id => ({ id, courseHandicap: r.entre(-4, 40) }))
      const ctx = { jugadores: jugadores.map(j => ({ nombre: j.id, courseHandicap: j.courseHandicap })), cantidadHoyos }
      const validacion = validarJuegoPersonalizado(config, ctx)
      expect(validacion, `semilla ${semilla}`).toMatchObject({ ok: true })

      // Salida en un hoyo al azar; SI como permutación de 1..N.
      const salida = r.entre(1, cantidadHoyos)
      const numeros = Array.from({ length: cantidadHoyos }, (_, i) => ((salida - 1 + i) % cantidadHoyos) + 1)
      const si = Array.from({ length: cantidadHoyos }, (_, i) => i + 1).sort(() => r.azar() - 0.5)
      const hoyos = numeros.map(numero => ({ numero, par: r.uno([3, 4, 5]), strokeIndex: si[numero - 1] }))

      const scores: Record<string, Record<number, number>> = {}
      for (const id of ids) {
        scores[id] = {}
        for (const h of hoyos) if (r.azar() < 0.92) scores[id][h.numero] = r.entre(1, 10)
      }
      const marcas: MarcaPuntito[] = []
      for (let k = r.entre(0, 30); k > 0; k--) {
        marcas.push({ jugadorId: r.uno(ids), hoyo: r.uno(hoyos).numero, puntitoId: r.uno([...TIPOS_PUNTITO, 'fantasma']) })
      }
      const retiros = r.azar() < 0.2 ? { [r.uno(ids)]: r.uno(hoyos).numero } : undefined

      const res = calcularJuegoPersonalizado({ config, jugadores, hoyos, scores, marcas, retiros, rondaCerrada: r.azar() < 0.3 })

      expect(res.hoyos).toHaveLength(cantidadHoyos)
      for (const id of ids) {
        expect(Number.isInteger(res.totales[id]), `semilla ${semilla}`).toBe(true)
        const suma = res.hoyos.reduce((acc, h) => acc + h.puntos[id], 0)
        expect(suma, `semilla ${semilla}`).toBe(res.totales[id])
      }
      for (const h of res.hoyos) {
        for (const id of ids) expect(Number.isInteger(h.puntos[id]), `semilla ${semilla}`).toBe(true)
        if (h.estado === 'pendiente') expect(Object.values(h.puntos).every(p => p === 0)).toBe(true)
        if (h.marcadorParejas && h.estado === 'puntuado') {
          const duelosPareja = h.duelos.reduce((acc, d) => [acc[0] + (d.porPareja?.[0] ?? 0), acc[1] + (d.porPareja?.[1] ?? 0)], [0, 0])
          const especiales = [0, 1].map(p => h.especiales.filter(e => e.cuenta && h.parejas![p].includes(ids.indexOf(e.jugadorId))).reduce((a, e) => a + e.puntos, 0))
          expect(h.marcadorParejas, `semilla ${semilla}`).toEqual([duelosPareja[0] + especiales[0], duelosPareja[1] + especiales[1]])
        }
        const greenies = h.especiales.filter(e => e.tipo === 'greenie' && e.cuenta)
        expect(greenies.length).toBeLessThanOrEqual(1)
      }
      // Golpes recibidos: lo que bajó el neto en toda la ronda = los golpes del juego (tope: 3 vueltas; plus: 1).
      const minimo = Math.min(...jugadores.map(j => j.courseHandicap))
      ids.forEach((id, i) => {
        if (!hoyos.every(h => typeof scores[id][h.numero] === 'number')) return
        const ch = jugadores[i].courseHandicap
        const base = config.modo === 'gross' ? 0 : config.handicap === 'completo' ? ch : ch - minimo
        const esperado = base >= 0 ? Math.min(base, 3 * cantidadHoyos) : -Math.min(-base, cantidadHoyos)
        const recibidos = res.hoyos.reduce((acc, h) => acc + (scores[id][h.numero] - (h.scoreDeJuego[id] as number)), 0)
        expect(recibidos, `semilla ${semilla}`).toBe(esperado)
      })
      // Lo que suma cada pareja en un duelo cuadra con lo que ganó: entero a cada uno, o la mitad con dividir.
      for (const h of res.hoyos) {
        for (const d of h.duelos) {
          if (!d.porPareja || !h.parejas) continue
          h.parejas.forEach(([x, y], p) => {
            const sumaIntegrantes = d.porJugador[ids[x]] + d.porJugador[ids[y]]
            const esperado = config.repartoPareja === 'dividir' ? d.porPareja![p] : 2 * d.porPareja![p]
            expect(sumaIntegrantes, `semilla ${semilla}`).toBe(esperado)
          })
        }
      }
      for (const t of res.tramos) {
        const marcador = res.hoyos.filter(h => h.tramo === t.indice && h.marcadorParejas).reduce((a, h) => [a[0] + h.marcadorParejas![0], a[1] + h.marcadorParejas![1]], [0, 0])
        expect(t.marcador).toEqual(marcador)
      }
      if (config.unidad === 'parejas_rotativas') {
        expect(res.tramos.map(t => t.hoyos.length)).toEqual([cantidadHoyos / 3, cantidadHoyos / 3, cantidadHoyos / 3])
      }
    }
  })

  it('cambiar el orden de las marcas no cambia nada salvo cuál greenie vale', () => {
    for (let semilla = 1; semilla <= 300; semilla++) {
      const r = prng(semilla)
      const config: ConfigJuego = { ...crearConfigDePlantilla('dos_cero_dos', r.azar), puntitos: [{ id: 'sandy', tipo: 'sandy', valor: 2, destino: 'individual', activo: true }] }
      const ids = ['a', 'b', 'c']
      const hoyos = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, strokeIndex: i + 1 }))
      const scores = Object.fromEntries(ids.map(id => [id, Object.fromEntries(hoyos.map(h => [h.numero, r.entre(3, 6)]))]))
      const marcas: MarcaPuntito[] = ids.flatMap(id => hoyos.filter(() => r.azar() < 0.3).map(h => ({ jugadorId: id, hoyo: h.numero, puntitoId: 'sandy' })))
      const jugadores = ids.map(id => ({ id, courseHandicap: 0 }))
      const a = calcularJuegoPersonalizado({ config, jugadores, hoyos, scores, marcas })
      const b = calcularJuegoPersonalizado({ config, jugadores, hoyos, scores, marcas: [...marcas].reverse() })
      expect(b.totales).toEqual(a.totales)
    }
  })
})
