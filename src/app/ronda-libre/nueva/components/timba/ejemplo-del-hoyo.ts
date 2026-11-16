/**
 * Ejemplo en vivo de "elegir el juego": un hoyo par 4 con los jugadores de los casos dorados de la spec,
 * calculado con el MOTOR REAL (`calcularJuegoPersonalizado`). Al cambiar un valor de la frase, el ejemplo se
 * recalcula solo: nunca dice algo que el juego no vaya a hacer.
 *
 * Gross y sin puntos especiales: muestra cómo se reparten los duelos, que es lo que la frase explica.
 */
import {
  NOMBRE_DUELO, calcularJuegoPersonalizado, formatPuntosTimba, type ConfigJuego,
} from '@/golf/formats/personalizado'

const NOMBRES = ['Juan', 'Pedro', 'Diego', 'Tomás'] as const
const IDS = ['a', 'b', 'c', 'd'] as const
/** Individual: un mejor, dos al medio empatados, un peor (caso dorado 3/9). */
const GOLPES_INDIVIDUAL = [4, 5, 5, 6]
/** Parejas Juan+Pedro contra Diego+Tomás (caso dorado 6). */
const GOLPES_PAREJAS = [4, 6, 5, 5]
const PAR = 4

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export interface EjemploDelHoyo {
  /** "Par 4 · Juan 4 · Pedro 5 · Diego 5 · Tomás 6" */
  golpes: string
  /** Una línea por duelo (solo parejas). */
  duelos: string[]
  /** "Juan +2 · Pedro 0 · Diego 0 · Tomás −2" */
  puntos: string
}

export function ejemploDelHoyo(config: ConfigJuego): EjemploDelHoyo {
  const esParejas = config.unidad !== 'individual'
  const golpes = esParejas ? GOLPES_PAREJAS : GOLPES_INDIVIDUAL
  const resultado = calcularJuegoPersonalizado({
    // Las parejas del ejemplo son siempre Juan+Pedro contra Diego+Tomás (en una rotativa, el primer tramo).
    config: {
      ...config, modo: 'gross', puntitos: [],
      ...(esParejas ? { unidad: 'parejas_fijas' as const, parejas: [[0, 1], [2, 3]] as ConfigJuego['parejas'], sorteo: undefined } : {}),
    },
    jugadores: IDS.map(id => ({ id, courseHandicap: null })),
    hoyos: [{ numero: 1, par: PAR, strokeIndex: 1 }],
    scores: Object.fromEntries(IDS.map((id, i) => [id, { 1: golpes[i] }])),
    marcas: [],
  })
  const hoyo = resultado.hoyos[0]
  const duelos = esParejas
    ? hoyo.duelos.flatMap(d => {
        if (d.tipo === 'por_puesto' || !d.porPareja) return []
        const [jp, dt] = d.porPareja
        return [`${conMayuscula(NOMBRE_DUELO[d.tipo])}: Juan y Pedro ${formatPuntosTimba(jp)} · Diego y Tomás ${formatPuntosTimba(dt)}`]
      })
    : []
  return {
    golpes: esParejas
      ? `Par ${PAR} · Juan ${golpes[0]} y Pedro ${golpes[1]} contra Diego ${golpes[2]} y Tomás ${golpes[3]}`
      : `Par ${PAR} · ${NOMBRES.map((n, i) => `${n} ${golpes[i]}`).join(' · ')}`,
    duelos,
    puntos: NOMBRES.map((n, i) => `${n} ${formatPuntosTimba(hoyo.puntos[IDS[i]] ?? 0)}`).join(' · '),
  }
}
