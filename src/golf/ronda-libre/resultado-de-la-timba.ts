/**
 * Resultado final de una Timba libre (maqueta Final aprobada por Juanjo): quién ganó y por cuánto, el ranking de
 * puntos, cómo terminó cada tramo de parejas y los puntos especiales de cada uno. Función pura.
 *
 * Igual que la pestaña Juego (`tabla-del-juego.ts`), todo número sale de `VistaDelJuego` (`GET /juego`): acá no se
 * calcula ningún punto ni se repite una regla del motor; solo se ordena, se agrega y se le pone nombre.
 */
import { nombreDelPuntito, NOMBRE_PUNTITO } from '@/golf/formats/personalizado'
import type { Pareja } from '@/golf/formats/personalizado'
import type { VistaDelJuego } from './juego-de-la-ronda'
import { armarTablaDelJuego, nombresCortos, TEXTO_NO_SE_JUGO } from './tabla-del-juego'

export interface FilaDelResultado {
  jugadorId: string
  nombre: string
  /** 1 = primero; los empatados comparten puesto (del motor). */
  puesto: number
  puntos: number
  texto: string
  /** Hoyo desde el que se retiró (`VistaDelJuego.retiros`); `null` si jugó hasta el final. */
  retiradoDesde: number | null
}

export interface TramoDelResultado {
  /** "Juan y Pedro", "Diego y Tomás". */
  parejas: [string, string]
  puntos: [number, number]
  /** `false`: ningún hoyo del tramo se puntuó (ronda cerrada antes de llegar). */
  jugado: boolean
  /** "14 – 8"; sin jugar, "No se jugó" (un "0 – 0" se leería como empate). */
  marcador: string
  /** Índice (0 o 1) de la pareja que ganó el tramo; `null` si empataron o no se jugó. */
  ganadora: 0 | 1 | null
}

export interface PuntoEspecialDelResultado {
  /** "Chipingo · Pedro ×2" ("Chipingo · Pedro" si una vez): cuántas veces lo hizo (solo los que cuentan). */
  texto: string
  puntitoId: string
  jugadorId: string
  veces: number
}

export interface ResultadoDeLaTimba {
  /** "La Colombiana · 18 hoyos · Gross"; cerrada antes, "La Colombiana · 12 de 18 hoyos · Gross". */
  encabezado: string
  /** "Ganó Pedro", "Empate entre Pedro y Juan"; en parejas fijas, "Ganaron Juan y Pedro" o "Empate entre las parejas". */
  titular: string
  /** "Por un punto sobre Juan." · "Con +12 cada uno." · `''` si no se jugó ningún hoyo. */
  bajada: string
  ranking: FilaDelResultado[]
  /** Parejas (rotativas o fijas); `null` en juegos individuales. */
  tramos: TramoDelResultado[] | null
  /** "Hoyos 1–6, 7–12 y 13–18. Ganador de cada tramo en negrita." */
  notaTramos: string | null
  /** `null` si el juego no tiene puntos especiales; `[]` si los tiene y nadie hizo ninguno. */
  puntosEspeciales: PuntoEspecialDelResultado[] | null
}

/** "Pedro", "Pedro y Juan", "Pedro, Juan y Diego". */
export function unirNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

/** Cierra la oración con punto, sin duplicarlo si termina en un nombre abreviado ("Maximiliano U."). */
function conPunto(frase: string): string {
  return frase.endsWith('.') ? frase : `${frase}.`
}

/** "un punto", "3 puntos". */
export function textoDePuntos(n: number): string {
  return n === 1 ? 'un punto' : `${n} puntos`
}

/**
 * Hoyos de un tramo en orden de juego, en tramos consecutivos: [1..6] → "1–6"; saliendo del 10, el que pasa del 18,
 * [16,17,18,1,2,3] → "16–18 y 1–3" (nunca "16–3", que se lee como 16 a 3 hacia atrás).
 */
export function rangoDeHoyos(hoyos: readonly number[]): string {
  const tramos: number[][] = []
  for (const h of hoyos) {
    const actual = tramos.at(-1)
    if (actual && h === actual.at(-1)! + 1) actual.push(h)
    else tramos.push([h])
  }
  return unirNombres(tramos.map(t => (t.length === 1 ? String(t[0]) : `${t[0]}–${t.at(-1)}`)))
}

/** Tramos de la nota: con "y" salvo que alguno ya tenga una "y" adentro (el que pasa del 18), ahí con " · ". */
function unirTramos(rangos: readonly string[]): string {
  return rangos.some(r => r.includes(' y ')) ? rangos.join(' · ') : unirNombres(rangos)
}

/** "18 hoyos"; cerrada antes del final, "12 de 18 hoyos" (los que se jugaron de verdad). */
function textoDeHoyos(jugados: number, total: number): string {
  return jugados < total ? `${jugados} de ${total} hoyos` : `${total} hoyos`
}

export function armarResultadoDeLaTimba(
  vista: VistaDelJuego,
  nombres: Readonly<Record<string, string>>,
): ResultadoDeLaTimba {
  const { config, jugadorIds, resultado, retiros } = vista
  const tabla = armarTablaDelJuego(vista, nombres, null)
  const cortos = nombresCortos(jugadorIds.map(id => nombres[id] ?? ''))
  const nombreDe = new Map(jugadorIds.map((id, i) => [id, cortos[i]]))
  const nombre = (id: string) => nombreDe.get(id) ?? ''

  const ranking: FilaDelResultado[] = tabla.ranking.map(r => ({ ...r, retiradoDesde: retiros[r.jugadorId] ?? null }))

  // Titular: el ganador y por cuánto; con empate arriba, los empatados y sus puntos. En parejas fijas manda el
  // marcador de las parejas: dos compañeros empatan siempre en el ranking individual y no son "empate".
  const nombreDePareja = ([a, b]: Pareja) => `${nombre(jugadorIds[a])} y ${nombre(jugadorIds[b])}`
  const primeros = ranking.filter(r => r.puesto === 1)
  const fijas = config.unidad === 'parejas_fijas' ? resultado.tramos[0] : undefined
  let titular: string
  let bajada: string
  if (tabla.hoyosPuntuados === 0) {
    // Cerrada sin un solo hoyo puntuado: no hay ganador ni empate que contar.
    titular = 'No se jugó ningún hoyo'
    bajada = ''
  } else if (fijas) {
    const [a, b] = fijas.marcador
    if (a === b) {
      titular = 'Empate entre las parejas'
      bajada = `Con ${textoDePuntos(a)} cada una.`
    } else {
      const g = a > b ? 0 : 1
      titular = `Ganaron ${nombreDePareja(fijas.parejas[g])}`
      bajada = conPunto(`Por ${textoDePuntos(Math.abs(a - b))} sobre ${nombreDePareja(fijas.parejas[1 - g])}`)
    }
  } else if (primeros.length === 1) {
    const ganador = primeros[0]
    const segundoPuesto = ranking.find(r => r.puesto > 1)?.puesto
    const segundos = ranking.filter(r => r.puesto === segundoPuesto)
    titular = `Ganó ${ganador.nombre}`
    bajada = segundos.length > 0
      ? conPunto(`Por ${textoDePuntos(ganador.puntos - segundos[0].puntos)} sobre ${unirNombres(segundos.map(s => s.nombre))}`)
      : `Con ${ganador.texto}.`
  } else {
    titular = primeros.length === ranking.length && ranking.length > 2
      ? 'Empate entre todos'
      : `Empate entre ${unirNombres(primeros.map(p => p.nombre))}`
    bajada = `Con ${primeros[0]?.texto ?? '0'} cada uno.`
  }

  // Parejas: cada tramo con su marcador y la pareja que lo ganó.
  const conParejas = config.unidad !== 'individual' && resultado.tramos.length > 0
  const tramos: TramoDelResultado[] | null = conParejas
    ? resultado.tramos.map(t => {
        const jugado = resultado.hoyos.some(h => h.estado === 'puntuado' && t.hoyos.includes(h.numero))
        return {
          parejas: [nombreDePareja(t.parejas[0]), nombreDePareja(t.parejas[1])],
          puntos: [t.marcador[0], t.marcador[1]],
          jugado,
          marcador: jugado ? `${t.marcador[0]} – ${t.marcador[1]}` : TEXTO_NO_SE_JUGO,
          ganadora: !jugado || t.marcador[0] === t.marcador[1] ? null : t.marcador[0] > t.marcador[1] ? 0 : 1,
        }
      })
    : null
  const notaTramos = !conParejas
    ? null
    : resultado.tramos.length > 1
      ? `Hoyos ${unirTramos(resultado.tramos.map(t => rangoDeHoyos(t.hoyos)))}. Ganador de cada tramo en negrita.`
      : 'Ganador en negrita.'

  // Puntos especiales: cuántas veces lo hizo cada uno (solo los que cuentan), en el orden de la config.
  const activos = config.puntitos.filter(p => p.activo)
  let puntosEspeciales: PuntoEspecialDelResultado[] | null = null
  if (activos.length > 0) {
    const veces = new Map<string, number>()
    for (const h of resultado.hoyos) {
      if (h.estado !== 'puntuado') continue
      for (const e of h.especiales) {
        if (!e.cuenta) continue
        const clave = `${e.puntitoId}\u0000${e.jugadorId}`
        veces.set(clave, (veces.get(clave) ?? 0) + 1)
      }
    }
    puntosEspeciales = []
    const puntitos = [...activos.map(p => ({ id: p.id, nombre: nombreDelPuntito(p) }))]
    // Una marca de un punto que ya no está en la config (no debería pasar) igual se muestra, con el nombre del tipo.
    for (const h of resultado.hoyos) for (const e of h.especiales) {
      if (e.cuenta && !puntitos.some(p => p.id === e.puntitoId)) {
        puntitos.push({ id: e.puntitoId, nombre: e.tipo === 'propio' ? 'Punto propio' : NOMBRE_PUNTITO[e.tipo] })
      }
    }
    for (const p of puntitos) {
      const deEste = jugadorIds
        .map(id => ({ id, n: veces.get(`${p.id}\u0000${id}`) ?? 0 }))
        .filter(x => x.n > 0)
        .sort((a, b) => b.n - a.n)
      for (const x of deEste) {
        // "Pedro ×2": veces, no puntos (un "Pedro 2" se lee como 2 puntos).
        const veces = x.n > 1 ? ` ×${x.n}` : ''
        puntosEspeciales.push({ texto: `${p.nombre} · ${nombre(x.id)}${veces}`, puntitoId: p.id, jugadorId: x.id, veces: x.n })
      }
    }
  }

  return {
    encabezado: `${tabla.titulo} · ${textoDeHoyos(tabla.hoyosPuntuados, resultado.hoyos.length)} · ${config.modo === 'neto' ? 'Neto' : 'Gross'}`,
    titular,
    bajada,
    ranking,
    tramos,
    notaTramos,
    puntosEspeciales,
  }
}

/** "1. Pedro +35". El retirado lo dice, para que nadie lea sus puntos como de una ronda completa. */
function lineaDelRanking(r: FilaDelResultado): string {
  return `${r.puesto}. ${r.nombre} ${r.texto}${r.retiradoDesde != null ? ` (se retiró en el hoyo ${r.retiradoDesde})` : ''}`
}

/**
 * Texto para compartir al grupo por WhatsApp: el juego, el ranking de puntos y las parejas. El link a la ronda NO va
 * acá: viaja como `url` del `SharePayload` y la cascada de compartir lo agrega una sola vez (`shareableText`).
 * Termina en salto de línea para que el link quede en su propia línea.
 */
export function textoParaCompartirLaTimba(r: ResultadoDeLaTimba, cancha: string): string {
  const lineas = [
    `${r.encabezado}${cancha ? ` · ${cancha}` : ''}`,
    r.bajada ? `${conPunto(r.titular)} ${r.bajada}` : conPunto(r.titular),
    '',
    ...r.ranking.map(lineaDelRanking),
  ]
  if (r.tramos?.length) {
    lineas.push('', 'Parejas')
    for (const t of r.tramos) {
      lineas.push(t.jugado ? `${t.parejas[0]} ${t.marcador} ${t.parejas[1]}` : `${t.parejas[0]} vs ${t.parejas[1]}: no se jugó`)
    }
  }
  if (r.puntosEspeciales?.length) {
    lineas.push('', `Puntos especiales: ${r.puntosEspeciales.map(p => p.texto).join(', ')}`)
  }
  return `${lineas.join('\n')}\n`
}
