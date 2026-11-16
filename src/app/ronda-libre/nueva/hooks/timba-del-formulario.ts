/**
 * La Timba libre dentro del asistente de nueva ronda (funciones puras).
 *
 * La config se arma en el paso Formato, cuando todavía no se sabe quiénes juegan; las parejas y el sorteo
 * dependen de los jugadores y se eligen en Confirmar. Por eso acá se guardan por IDENTIDAD del formulario (como
 * los equipos, `equipos-del-formulario.ts`) y se traducen a índices recién al enviar: agregar, quitar o
 * reordenar a un rival no puede correr a nadie de pareja (contrato de la spec, cláusula 2).
 */
import {
  COMBINACIONES_DE_4, crearConfigDePlantilla, sortearOrdenDeParejas, validarJuegoPersonalizado,
  type Azar, type ConfigJuego, type Pareja, type PlantillaJuego,
} from '@/golf/formats/personalizado'
import type { ModoJuego } from '@/golf/core/rules'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'

export interface TimbaDelFormulario {
  /** Config SIN parejas ni sorteo (los agrega `configParaEnviar`). El modo lo manda el de la ronda. */
  config: ConfigJuego
  /** Parejas fijas: id (del formulario) del compañero del creador. Con 4 jugadores define las dos parejas. */
  companeroDelCreador: string | null
  /** Parejas que rotan: el orden sorteado y los jugadores (ids, en orden) con que se sorteó. */
  sorteo: { orden: [number, number, number]; jugadorIds: string[] } | null
}

function sinParejas(config: ConfigJuego): ConfigJuego {
  const c: ConfigJuego = { ...config }
  delete c.parejas
  delete c.sorteo
  return c
}

/** Timba recién elegida de una plantilla: las parejas las elige el creador y el sorteo se hace con un botón. */
export function timbaDePlantilla(plantilla: PlantillaJuego): TimbaDelFormulario {
  return { config: sinParejas(crearConfigDePlantilla(plantilla)), companeroDelCreador: null, sorteo: null }
}

/** Cambia la config. Si cambia la unidad, las parejas y el sorteo elegidos dejan de valer. */
export function conConfig(timba: TimbaDelFormulario, config: ConfigJuego): TimbaDelFormulario {
  const mismaUnidad = config.unidad === timba.config.unidad
  return {
    config: sinParejas(config),
    companeroDelCreador: mismaUnidad ? timba.companeroDelCreador : null,
    sorteo: mismaUnidad ? timba.sorteo : null,
  }
}

export function conCompanero(timba: TimbaDelFormulario, companeroId: string): TimbaDelFormulario {
  return { ...timba, companeroDelCreador: companeroId }
}

/** Sortea el orden de las 3 combinaciones de parejas con los jugadores de ahora. */
export function sortear(timba: TimbaDelFormulario, jugadorIds: readonly string[], azar: Azar = Math.random): TimbaDelFormulario {
  return { ...timba, sorteo: { orden: sortearOrdenDeParejas(azar), jugadorIds: [...jugadorIds] } }
}

/** Las dos parejas fijas en índices de `jugadorIds`, o `undefined` si todavía no se pueden armar. */
export function parejasFijas(timba: TimbaDelFormulario, jugadorIds: readonly string[]): [Pareja, Pareja] | undefined {
  if (jugadorIds.length !== 4 || !timba.companeroDelCreador) return undefined
  const companero = jugadorIds.indexOf(timba.companeroDelCreador)
  if (companero < 1) return undefined
  const [c, d] = [1, 2, 3].filter(i => i !== companero)
  return [[0, companero], [c, d]]
}

/** El sorteo, solo si se hizo con los mismos jugadores en el mismo orden que ahora. */
export function sorteoVigente(timba: TimbaDelFormulario, jugadorIds: readonly string[]): [number, number, number] | undefined {
  const s = timba.sorteo
  if (!s || s.jugadorIds.length !== jugadorIds.length || s.jugadorIds.some((id, i) => id !== jugadorIds[i])) return undefined
  return s.orden
}

/** Parejas de cada tramo (en índices), en el orden sorteado. */
export function tramosDelSorteo(orden: readonly number[]): [Pareja, Pareja][] {
  return orden.map(i => COMBINACIONES_DE_4[i])
}

/** La config que viaja a `POST /create` (`reglas_juego`): con el modo de la ronda, las parejas y el sorteo. */
export function configParaEnviar(timba: TimbaDelFormulario, jugadorIds: readonly string[], modo: ModoJuego): ConfigJuego {
  const config: ConfigJuego = { ...timba.config, modo }
  if (config.unidad === 'parejas_fijas') {
    const parejas = parejasFijas(timba, jugadorIds)
    if (parejas) config.parejas = parejas
  }
  if (config.unidad === 'parejas_rotativas') {
    const sorteo = sorteoVigente(timba, jugadorIds)
    if (sorteo) config.sorteo = sorteo
  }
  return config
}

export interface JugadorDeLaTimba { id: string; nombre: string; indice: number | null }

/**
 * Lo que impide crear la Timba, con el validador canónico (`validarJuegoPersonalizado`, el mismo de la API).
 *
 * `conParejas: false` es para el paso Jugadores: las parejas y el sorteo se eligen DESPUÉS, en Confirmar, así que
 * ahí no pueden frenar. Se validan con unas parejas cualquiera para que el resto (cantidad de jugadores,
 * hándicap para neto, hoyos) sí avise en el paso donde se arregla.
 */
export function problemaDeLaTimba(
  timba: TimbaDelFormulario,
  jugadores: readonly JugadorDeLaTimba[],
  holes: number,
  modo: ModoJuego,
  { conParejas }: { conParejas: boolean },
): ProblemaDeLaRonda | null {
  const config = configParaEnviar(timba, jugadores.map(j => j.id), modo)
  if (!conParejas) {
    if (config.unidad === 'parejas_fijas') config.parejas ??= COMBINACIONES_DE_4[0]
    if (config.unidad === 'parejas_rotativas') config.sorteo ??= [0, 1, 2]
  }
  const r = validarJuegoPersonalizado(config, {
    // En la creación el validador solo pregunta SI cada uno tiene hándicap (igual que `prepararJuegoDeRondaNueva`).
    jugadores: jugadores.map(j => ({ nombre: j.nombre.trim(), courseHandicap: j.indice })),
    cantidadHoyos: holes,
  })
  return r.ok ? null : { titulo: 'Revisa el juego', detalle: r.errores.join(' ') }
}
