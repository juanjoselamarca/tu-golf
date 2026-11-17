/**
 * Pestaña Juego de una Timba libre (maqueta ScorerC aprobada por Juanjo, 26-oct): arma lo que se muestra a partir
 * de la vista que entrega el servidor (`GET /api/ronda-libre/[codigo]/juego`). Función pura.
 *
 * Todo número sale de `VistaDelJuego` (puntos, ranking, marcadores, golpes recibidos): acá no se calcula ningún
 * neto ni se repite una regla del motor; solo se ordena y se le pone nombre.
 */
import {
  NOMBRE_FORMATO_PERSONALIZADO,
  NOMBRE_PLANTILLA,
  formatPuntosTimba,
  type Pareja,
} from '@/golf/formats/personalizado'
import type { VistaDelJuego } from './juego-de-la-ronda'

export interface ColumnaDelJuego {
  jugadorId: string
  nombre: string
}

export interface FilaRankingDelJuego {
  jugadorId: string
  nombre: string
  /** 1 = primero; los empatados comparten puesto (del motor). */
  puesto: number
  puntos: number
  texto: string
}

export interface MarcadorDeParejas {
  /** "Juan y Pedro", "Diego y Tomás". */
  parejas: [string, string]
  puntos: [number, number]
}

export interface CeldaDelJuego {
  jugadorId: string
  /** Puntos del hoyo ("+2", "0", "−1"), o "·" si el hoyo está pendiente. */
  texto: string
  /** Golpes que recibe en el hoyo (solo neto; 0 en gross). */
  golpesRecibidos: number
}

export type FilaDelJuego =
  | { tipo: 'tramo'; indice: number; marcador: MarcadorDeParejas }
  | { tipo: 'hoyo'; numero: number; pendiente: boolean; celdas: CeldaDelJuego[] }

export interface TablaDelJuego {
  titulo: string
  hoyosPuntuados: number
  totalHoyos: number
  columnas: ColumnaDelJuego[]
  ranking: FilaRankingDelJuego[]
  /** Parejas: el marcador del tramo en juego. `null` en juegos individuales. */
  marcadorActual: MarcadorDeParejas | null
  filas: FilaDelJuego[]
  esNeto: boolean
  /** Neto: nombres de quienes no tienen hándicap (`resultado.sinHandicap`); con alguno, nadie recibe golpes. */
  sinHandicap: string[]
}

/** Hoyo que alguien todavía no anota: no se puntúa (spec, "Hoyo pendiente y retiro"). */
export const TEXTO_HOYO_PENDIENTE = 'falta anotar'

/** Primer nombre de cada uno; si dos empiezan igual, se agrega la inicial del apellido. */
export function nombresCortos(nombres: readonly string[]): string[] {
  const partes = nombres.map(n => n.trim().split(/\s+/).filter(Boolean))
  const primeros = partes.map((p, i) => p[0] ?? `Jugador ${i + 1}`)
  return primeros.map((primero, i) => {
    const repetido = primeros.filter(p => p === primero).length > 1
    const apellido = partes[i][1]
    return repetido && apellido ? `${primero} ${apellido[0]}.` : primero
  })
}

export function armarTablaDelJuego(
  vista: VistaDelJuego,
  nombres: Readonly<Record<string, string>>,
  /** Hoyo en que va el scorer (manda el marcador y hasta dónde se listan los hoyos); `null` en la vista del grupo. */
  hoyoActual: number | null,
): TablaDelJuego {
  const { config, jugadorIds, resultado, golpesRecibidos } = vista
  const cortos = nombresCortos(jugadorIds.map(id => nombres[id] ?? ''))
  const nombreDe = new Map(jugadorIds.map((id, i) => [id, cortos[i]]))
  const nombre = (id: string) => nombreDe.get(id) ?? ''

  const nombreDePareja = ([a, b]: Pareja) => `${nombre(jugadorIds[a])} y ${nombre(jugadorIds[b])}`
  const marcadorDelTramo = (indice: number): MarcadorDeParejas | null => {
    const t = resultado.tramos.find(x => x.indice === indice)
    return t ? { parejas: [nombreDePareja(t.parejas[0]), nombreDePareja(t.parejas[1])], puntos: [...t.marcador] } : null
  }

  // Hasta dónde se listan los hoyos: el último con algún golpe (o puntuado), o el del scorer si va más adelante.
  const conGolpes = (i: number) =>
    resultado.hoyos[i].estado === 'puntuado' || Object.values(resultado.hoyos[i].scoreDeJuego).some(s => typeof s === 'number')
  let ultimo = -1
  resultado.hoyos.forEach((_, i) => { if (conGolpes(i)) ultimo = i })
  const ordenActual = hoyoActual == null ? -1 : resultado.hoyos.findIndex(h => h.numero === hoyoActual)
  if (ultimo >= 0 || ordenActual > 0) ultimo = Math.max(ultimo, ordenActual)
  const visibles = resultado.hoyos.slice(0, ultimo + 1)

  const separadores = config.unidad === 'parejas_rotativas'
  const filas: FilaDelJuego[] = []
  let tramoAnterior: number | null = null
  for (const h of visibles) {
    if (separadores && h.tramo != null && h.tramo !== tramoAnterior) {
      const marcador = marcadorDelTramo(h.tramo)
      if (marcador) filas.push({ tipo: 'tramo', indice: h.tramo, marcador })
      tramoAnterior = h.tramo
    }
    const pendiente = h.estado === 'pendiente'
    filas.push({
      tipo: 'hoyo',
      numero: h.numero,
      pendiente,
      celdas: jugadorIds.map(id => ({
        jugadorId: id,
        texto: pendiente ? TEXTO_HOYO_PENDIENTE : formatPuntosTimba(h.puntos[id] ?? 0),
        golpesRecibidos: golpesRecibidos[id]?.[h.numero] ?? 0,
      })),
    })
  }

  // Marcador en juego: el tramo del hoyo del scorer; si no, el del último hoyo listado; si no, el primero.
  let marcadorActual: MarcadorDeParejas | null = null
  if (config.unidad !== 'individual') {
    const referencia = ordenActual >= 0 ? resultado.hoyos[ordenActual] : visibles.at(-1) ?? resultado.hoyos[0]
    marcadorActual = marcadorDelTramo(referencia?.tramo ?? 0)
  }

  return {
    titulo: config.plantilla === 'personalizado_total' ? NOMBRE_FORMATO_PERSONALIZADO : NOMBRE_PLANTILLA[config.plantilla],
    hoyosPuntuados: resultado.hoyos.filter(h => h.estado === 'puntuado').length,
    totalHoyos: resultado.hoyos.length,
    columnas: jugadorIds.map(id => ({ jugadorId: id, nombre: nombre(id) })),
    ranking: resultado.ranking.map(r => ({
      jugadorId: r.jugadorId,
      nombre: nombre(r.jugadorId),
      puesto: r.puesto,
      puntos: r.puntos,
      texto: formatPuntosTimba(r.puntos),
    })),
    marcadorActual,
    filas,
    esNeto: config.modo === 'neto',
    sinHandicap: resultado.sinHandicap.map(nombre),
  }
}
