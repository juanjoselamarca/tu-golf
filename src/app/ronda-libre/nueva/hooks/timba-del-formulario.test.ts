import { describe, it, expect } from 'vitest'
import { cambiarUnidad, formatPuntosTimba } from '@/golf/formats/personalizado'
import {
  MENSAJE_TIMBA_UN_CELULAR, TITULO_REVISA_EL_JUEGO, prepararJuegoDeRondaNueva,
} from '@/golf/ronda-libre/juego-de-ronda-nueva'
import { MENSAJE_FALTA_NOMBRE, problemaDeLaTimbaEnJugadores, problemaParaCrearLaTimba } from './useTimbaDeLaRonda'
import {
  configParaEnviar, conCompanero, conConfig, parejasFijas, problemaDeLaTimba, sortear, sorteoVigente,
  timbaDePlantilla, tramosDelSorteo,
} from './timba-del-formulario'

const CUATRO = ['creador', 'r1', 'r2', 'r3']
const jug = (ids: string[], indice: number | null = 10) => ids.map((id, i) => ({ id, nombre: ['Juan', 'Pedro', 'Diego', 'Tomás'][i], indice }))

describe('Timba en el asistente', () => {
  it('una plantilla de parejas parte sin parejas ni sorteo: los elige el creador', () => {
    expect(timbaDePlantilla('colombiana').config.sorteo).toBeUndefined()
    expect(timbaDePlantilla('subterranea').config.parejas).toBeUndefined()
  })

  it('parejas fijas por identidad: reordenar o quitar rivales no corre a nadie de pareja', () => {
    const t = conCompanero(timbaDePlantilla('subterranea'), 'r2')
    expect(parejasFijas(t, CUATRO)).toEqual([[0, 2], [1, 3]])
    expect(parejasFijas(t, ['creador', 'r2', 'r1', 'r3'])).toEqual([[0, 1], [2, 3]])
    expect(parejasFijas(t, ['creador', 'r1', 'r3'])).toBeUndefined()
    expect(parejasFijas(conCompanero(t, 'otro'), CUATRO)).toBeUndefined()
  })

  it('el sorteo vale solo con los mismos jugadores en el mismo orden', () => {
    const t = sortear(timbaDePlantilla('colombiana'), CUATRO, () => 0)
    expect(sorteoVigente(t, CUATRO)).toEqual(t.sorteo?.orden)
    expect(new Set(t.sorteo?.orden).size).toBe(3)
    expect(sorteoVigente(t, ['creador', 'r2', 'r1', 'r3'])).toBeUndefined()
    expect(tramosDelSorteo([1, 0, 2])).toEqual([[[0, 2], [1, 3]], [[0, 1], [2, 3]], [[0, 3], [1, 2]]])
  })

  it('cambiar la unidad borra parejas y sorteo; cambiar un valor los conserva', () => {
    const t = sortear(timbaDePlantilla('colombiana'), CUATRO)
    expect(conConfig(t, { ...t.config, puntitos: [] }).sorteo).toEqual(t.sorteo)
    expect(conConfig(t, cambiarUnidad(t.config, 'parejas_fijas')).sorteo).toBeNull()
  })

  it('configParaEnviar: modo de la ronda + parejas/sorteo en índices', () => {
    const fijas = conCompanero(timbaDePlantilla('subterranea'), 'r3')
    expect(configParaEnviar(fijas, CUATRO, 'neto')).toMatchObject({ modo: 'neto', parejas: [[0, 3], [1, 2]] })
    const rot = sortear(timbaDePlantilla('colombiana'), CUATRO, () => 0.5)
    expect(configParaEnviar(rot, CUATRO, 'gross').sorteo).toEqual(rot.sorteo?.orden)
  })

  it('validador canónico con mensajes humanos: Colombiana con 3, neto sin hándicap, 27 hoyos neto, parejas', () => {
    const col = timbaDePlantilla('colombiana')
    expect(problemaDeLaTimba(col, jug(CUATRO.slice(0, 3)), 18, 'gross', { conParejas: false })?.detalle)
      .toContain('La Colombiana es para 4 jugadores.')
    const dos = timbaDePlantilla('dos_cero_dos')
    const sinHcp = [...jug(['creador', 'r1']), { id: 'r2', nombre: 'Diego', indice: null }]
    expect(problemaDeLaTimba(dos, sinHcp, 18, 'neto', { conParejas: true })?.detalle)
      .toBe('Para jugar neto, Diego necesita hándicap.')
    expect(problemaDeLaTimba(dos, jug(CUATRO), 27, 'neto', { conParejas: true })?.detalle)
      .toContain('el juego neto es para rondas de 9 o 18 hoyos')
    expect(problemaDeLaTimba(dos, jug(CUATRO), 18, 'gross', { conParejas: true })).toBeNull()
    // Parejas: no frenan en Jugadores; sí en Confirmar, hasta elegirlas / sortear.
    expect(problemaDeLaTimba(col, jug(CUATRO), 18, 'gross', { conParejas: false })).toBeNull()
    expect(problemaDeLaTimba(col, jug(CUATRO), 18, 'gross', { conParejas: true })?.detalle).toBe('Falta sortear el orden de las parejas.')
    expect(problemaDeLaTimba(sortear(col, CUATRO), jug(CUATRO), 18, 'gross', { conParejas: true })).toBeNull()
    const sub = timbaDePlantilla('subterranea')
    expect(problemaDeLaTimba(sub, jug(CUATRO), 18, 'gross', { conParejas: true })?.detalle).toBe('Elige las dos parejas: cada jugador en una sola.')
  })

  it('lo que pasa en el asistente lo acepta la API (misma función que el servidor)', () => {
    const t = conCompanero(timbaDePlantilla('subterranea'), 'r1')
    const r = prepararJuegoDeRondaNueva({
      reglasJuego: configParaEnviar(t, CUATRO, 'gross'), modoDeLaRonda: 'gross',
      jugadores: jug(CUATRO).map(j => ({ nombre: j.nombre, indice: j.indice })), holes: 18, courseId: 'c1', adminMode: true,
      nuevoId: () => crypto.randomUUID(),
    })
    expect(r.ok).toBe(true)
    expect(formatPuntosTimba(-2)).toBe('−2')
  })

  it('sin «Yo anoto por todos» (admin_mode) la Timba no se crea: mismo mensaje en la UI y en la API', () => {
    const t = conCompanero(timbaDePlantilla('subterranea'), 'r1')
    const r = prepararJuegoDeRondaNueva({
      reglasJuego: configParaEnviar(t, CUATRO, 'gross'), modoDeLaRonda: 'gross',
      jugadores: jug(CUATRO).map(j => ({ nombre: j.nombre, indice: j.indice })), holes: 18, courseId: 'c1', adminMode: false,
      nuevoId: () => crypto.randomUUID(),
    })
    expect(r).toEqual({ ok: false, error: MENSAJE_TIMBA_UN_CELULAR })
    expect(problemaParaCrearLaTimba(t, jug(CUATRO), 18, 'gross', 'c1', false)).toEqual({ titulo: TITULO_REVISA_EL_JUEGO, detalle: MENSAJE_TIMBA_UN_CELULAR })
    expect(problemaDeLaTimbaEnJugadores(t, jug(CUATRO), 18, 'gross', 'c1', false)).toEqual({ titulo: TITULO_REVISA_EL_JUEGO, detalle: MENSAJE_TIMBA_UN_CELULAR })
    expect(problemaDeLaTimbaEnJugadores(t, jug(CUATRO), 18, 'gross', 'c1', true)).toBeNull()
  })

  it('una fila de jugador sin nombre avisa eso, no "es para 4" (el usuario ve 4 tarjetas)', () => {
    const t = timbaDePlantilla('colombiana')
    const tres = CUATRO.slice(0, 3)
    expect(problemaDeLaTimbaEnJugadores(t, jug(tres), 18, 'gross', 'c1', true, 1)).toEqual({ titulo: TITULO_REVISA_EL_JUEGO, detalle: MENSAJE_FALTA_NOMBRE })
    expect(problemaDeLaTimbaEnJugadores(t, jug(tres), 18, 'gross', 'c1', true, 0)?.detalle).not.toBe(MENSAJE_FALTA_NOMBRE)
  })
})
