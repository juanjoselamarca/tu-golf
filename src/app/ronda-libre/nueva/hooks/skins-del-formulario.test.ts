import { describe, it, expect } from 'vitest'
import { LIMITES_SKINS, type ContextoValidacionSkins } from '@/golf/formats/skins'
import { MENSAJE_SKINS_UN_CELULAR } from '@/golf/ronda-libre/skins-de-ronda-nueva'
import { MENSAJE_SKINS_SIN_DATOS_DE_CANCHA } from '@/lib/data/skins-ronda-nueva'
import {
  PROBLEMA_SKINS_CARGANDO, configSkinsParaEnviar, conPozoEscrito, problemaDelSkins, skinsPorDefecto,
} from './skins-del-formulario'

const listo = (chs: (number | null)[]): { estado: 'listo'; contexto: ContextoValidacionSkins } => ({
  estado: 'listo',
  contexto: {
    jugadores: chs.map(courseHandicap => ({ nombre: '', courseHandicap })),
    hoyos: Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 })),
  },
})
type ArgsProblema = Parameters<typeof problemaDelSkins>[0]
const args = (over: Partial<ArgsProblema> = {}): ArgsProblema => ({
  config: skinsPorDefecto(), modo: 'neto', adminMode: true, courseId: 'c1', holes: 18,
  nombres: ['Juanjo', 'Ross'], contexto: listo([10, 20]), ...over,
})

describe('skins en el formulario', () => {
  it('defaults del spec: neto al 100 %, repartir, sin validación, pozo 0, sin puntos especiales', () => {
    expect(skinsPorDefecto()).toMatchObject({
      modo: 'neto', hcpPct: 100, empateUltimoHoyo: 'repartir', validacion: false, pozoPorJugador: 0, puntitos: [],
    })
    // Cada llamada, una lista nueva (no se comparte el array del default).
    expect(skinsPorDefecto().puntitos).not.toBe(skinsPorDefecto().puntitos)
  })

  it('viaja con el modo de la ronda', () => {
    expect(configSkinsParaEnviar(skinsPorDefecto(), 'gross').modo).toBe('gross')
  })

  it('pozo: acepta miles chilenos, vacío = 0; letras o sobre el techo no entran', () => {
    const c = skinsPorDefecto()
    expect(conPozoEscrito(c, '20.000').pozoPorJugador).toBe(20000)
    expect(conPozoEscrito({ ...c, pozoPorJugador: 5000 }, '').pozoPorJugador).toBe(0)
    expect(conPozoEscrito(c, '20a')).toBe(c)
    expect(conPozoEscrito(c, String(LIMITES_SKINS.pozoPorJugador.max + 1))).toBe(c)
  })

  it('sin problemas: null', () => {
    expect(problemaDelSkins(args())).toBeNull()
  })

  it('lo de la ronda va primero, después cargando y error de lectura', () => {
    expect(problemaDelSkins(args({ adminMode: false, contexto: { estado: 'cargando' } }))?.detalle).toBe(MENSAJE_SKINS_UN_CELULAR)
    expect(problemaDelSkins(args({ contexto: { estado: 'cargando' } }))).toBe(PROBLEMA_SKINS_CARGANDO)
    expect(problemaDelSkins(args({ contexto: { estado: 'error' } }))?.detalle).toBe(MENSAJE_SKINS_SIN_DATOS_DE_CANCHA)
  })

  it('bloqueo del motor con el nombre que se ve ahora', () => {
    const p = problemaDelSkins(args({ contexto: listo([10, null]), nombres: ['Juanjo', ' Ross '] }))
    expect(p?.titulo).toBe('Revisa el skins')
    expect(p?.detalle).toContain('Ross no tiene hándicap')
    expect(problemaDelSkins(args({ contexto: listo([10, null]), modo: 'gross' }))).toBeNull()
  })

  it('contexto de otra lista de jugadores (recargando): cargando, nunca valida con datos ajenos', () => {
    expect(problemaDelSkins(args({ nombres: ['Juanjo', 'Ross', 'Max'] }))).toBe(PROBLEMA_SKINS_CARGANDO)
  })
})
