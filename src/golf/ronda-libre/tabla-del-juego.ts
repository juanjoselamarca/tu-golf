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
  formatPuntosConUnidad,
  formatPuntosTimba,
  nombreDelPuntito,
  type Pareja,
} from '@/golf/formats/personalizado'
import type { VistaDelJuego } from './juego-de-la-ronda'
import type { HcpMostrado } from '@/lib/data/ronda-libre-live-api'
import {
  estadoDelTramo,
  etiquetasUnicas,
  fraseDelEstado,
  ganadorDelHoyoDeParejas,
  hoyoDelJuegoConGolpes,
  indiceDelTramoDestacado,
  letrasDeLosPuntitos,
  tituloDelTramo,
  type EstadoDelTramo,
  type FraseDelEstado,
  type GanadorDelHoyo,
} from './juego-en-vivo'

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
  /** "18 pts" (total con unidad, sin signo +). */
  textoConUnidad: string
  /** Distancia al primero ("a 1 pt"); `null` para quien va primero, empatado con él, o retirado. */
  diferencia: string | null
  /** Hoyo desde el que se retiró (`VistaDelJuego.retiros`); `null` si sigue jugando. */
  retiradoDesde: number | null
  /** HCP de 18 a mostrar (`VistaDelJuego.hcpAMostrar`): número, `SIN_INDICE` o `null`. Se pinta si `muestraHcp`. */
  hcp: HcpMostrado
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
  /** No jugó el hoyo (retirado): se muestra "—", no 0. */
  noJugo: boolean
  /** Letras de los puntos especiales que le contaron en el hoyo ("G", "S"). */
  especiales: string[]
}

export interface ParejaDelTramo {
  /** "Pancho y Tomás". */
  nombre: string
  jugadores: [string, string]
  /** Lo que va en la casilla de un hoyo que ganó ("PT"): no se repite con la de la otra pareja. */
  etiqueta: string
}

export interface CasillaDelTramo {
  numero: number
  ganador: GanadorDelHoyo
}

export interface TramoDelJuego {
  indice: number
  /** "Hoyos 7 a 12". */
  titulo: string
  primerHoyo: number
  estado: EstadoDelTramo
  parejas: [ParejaDelTramo, ParejaDelTramo]
  marcador: [number, number]
  casillas: CasillaDelTramo[]
  /** "Nico se retiró en el hoyo 8": retirados que no juegan (todo o parte de) este tramo. */
  retiros: string[]
}

export interface LetraDePuntito {
  letra: string
  /** En minúscula ("greenie"): va en la leyenda. */
  nombre: string
}

export type FilaDelJuego =
  | { tipo: 'tramo'; indice: number; marcador: MarcadorDeParejas }
  /** `pendiente`: sin puntos que mostrar; `sinJugar`: además, nadie lo jugó (no es que falte anotar). */
  | { tipo: 'hoyo'; numero: number; pendiente: boolean; sinJugar: boolean; celdas: CeldaDelJuego[] }

export interface TablaDelJuego {
  titulo: string
  hoyosPuntuados: number
  totalHoyos: number
  columnas: ColumnaDelJuego[]
  ranking: FilaRankingDelJuego[]
  /** Frase de arriba: quién va ganando y cuántos hoyos van. */
  frase: FraseDelEstado
  /** Tramos de parejas, en orden de juego (uno solo en parejas fijas). Vacío en juegos individuales. */
  tramos: TramoDelJuego[]
  /** Índice en `tramos` del que va en la tarjeta grande (`indiceDelTramoDestacado`); -1 sin parejas. */
  tramoDestacado: number
  filas: FilaDelJuego[]
  /** Letras de los puntos especiales que aparecen en la tabla, para la leyenda. */
  letrasEnLaTabla: LetraDePuntito[]
  esNeto: boolean
  /**
   * Se ven los golpes recibidos (puntitos en la tabla y leyenda): neto y todos con hándicap.
   * Fuente única del predicado para la vista.
   */
  muestraGolpesRecibidos: boolean
  /**
   * Antes del primer hoyo, en neto, cada fila muestra el HCP de 18 en vez de los puntos (nunca "recibe N golpes").
   * No en una ronda cerrada: si se cerró sin golpes, "No se jugó".
   */
  muestraHcp: boolean
  /** La ronda ya estaba cerrada (`VistaDelJuego.rondaCerrada`). */
  rondaCerrada: boolean
  /** Neto: nombres de quienes no tienen hándicap (`resultado.sinHandicap`); con alguno, nadie recibe golpes. */
  sinHandicap: string[]
}

/** Hoyo que alguien todavía no anota: no se puntúa (spec, "Hoyo pendiente y retiro"). */
export const TEXTO_HOYO_PENDIENTE = 'falta anotar'
/** Hoyo o tramo que nadie jugó (ronda cerrada antes de llegar): no reparte puntos. */
export const TEXTO_NO_SE_JUGO = 'No se jugó'
/** Celda de un retirado en un hoyo puntuado: no jugó, no es que haya hecho 0. */
export const TEXTO_NO_JUGO = '—'

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
  const { config, jugadorIds, resultado, golpesRecibidos, retiros } = vista
  const cortos = nombresCortos(jugadorIds.map(id => nombres[id] ?? ''))
  const nombreDe = new Map(jugadorIds.map((id, i) => [id, cortos[i]]))
  const nombre = (id: string) => nombreDe.get(id) ?? ''

  const nombreDePareja = ([a, b]: Pareja) => `${nombre(jugadorIds[a])} y ${nombre(jugadorIds[b])}`
  const marcadorDelTramo = (indice: number): MarcadorDeParejas | null => {
    const t = resultado.tramos.find(x => x.indice === indice)
    return t ? { parejas: [nombreDePareja(t.parejas[0]), nombreDePareja(t.parejas[1])], puntos: [...t.marcador] } : null
  }

  // Hasta dónde se listan los hoyos: el último con algún golpe (o puntuado), o el del scorer si va más adelante.
  let ultimo = -1
  resultado.hoyos.forEach((h, i) => { if (hoyoDelJuegoConGolpes(h)) ultimo = i })
  const ultimoConGolpes = ultimo >= 0 ? resultado.hoyos[ultimo] : null
  const ordenActual = hoyoActual == null ? -1 : resultado.hoyos.findIndex(h => h.numero === hoyoActual)
  if (ultimo >= 0 || ordenActual > 0) ultimo = Math.max(ultimo, ordenActual)
  const visibles = resultado.hoyos.slice(0, ultimo + 1)

  const letras = letrasDeLosPuntitos(config.puntitos)
  const letrasUsadas = new Set<string>()
  const separadores = config.unidad === 'parejas_rotativas'
  const filas: FilaDelJuego[] = []
  let tramoAnterior: number | null = null
  for (const h of visibles) {
    if (separadores && h.tramo != null && h.tramo !== tramoAnterior) {
      const marcador = marcadorDelTramo(h.tramo)
      if (marcador) filas.push({ tipo: 'tramo', indice: h.tramo, marcador })
      tramoAnterior = h.tramo
    }
    // Pendiente o sin jugar: no hay puntos que mostrar en el hoyo.
    const pendiente = h.estado !== 'puntuado'
    const sinJugar = h.estado === 'sin_jugar'
    filas.push({
      tipo: 'hoyo',
      numero: h.numero,
      pendiente,
      sinJugar,
      celdas: jugadorIds.map(id => {
        // `null` = no jugó el hoyo (retirado); `undefined` = falta anotar (pero entonces el hoyo es pendiente).
        const noJugo = !pendiente && h.scoreDeJuego[id] === null
        const contados = pendiente ? [] : h.especiales.filter(e => e.jugadorId === id && e.cuenta && letras[e.puntitoId])
        for (const e of contados) letrasUsadas.add(e.puntitoId)
        return {
          jugadorId: id,
          texto: sinJugar ? TEXTO_NO_SE_JUGO : pendiente ? TEXTO_HOYO_PENDIENTE : noJugo ? TEXTO_NO_JUGO : formatPuntosTimba(h.puntos[id] ?? 0),
          golpesRecibidos: golpesRecibidos[id]?.[h.numero] ?? 0,
          noJugo,
          especiales: contados.map(e => letras[e.puntitoId]),
        }
      }),
    })
  }

  // Tramos de parejas: estado, marcador y quién ganó cada hoyo.
  const etiquetas = etiquetasUnicas(cortos)
  const etiquetaDe = new Map(jugadorIds.map((id, i) => [id, etiquetas[i]]))
  const ordenDe = new Map(resultado.hoyos.map(h => [h.numero, h.orden]))
  const hoyoDe = new Map(resultado.hoyos.map(h => [h.numero, h]))
  const parejaDelTramo = ([a, b]: Pareja): ParejaDelTramo => {
    const [ia, ib] = [jugadorIds[a], jugadorIds[b]]
    return {
      nombre: nombreDePareja([a, b]),
      jugadores: [nombre(ia), nombre(ib)],
      etiqueta: `${etiquetaDe.get(ia) ?? ''}${etiquetaDe.get(ib) ?? ''}`,
    }
  }
  const tramos: TramoDelJuego[] = config.unidad === 'individual' ? [] : resultado.tramos.map(t => {
    const hoyos = t.hoyos.flatMap(n => hoyoDe.get(n) ?? [])
    const finDelTramo = Math.max(-1, ...t.hoyos.map(n => ordenDe.get(n) ?? -1))
    return {
      indice: t.indice,
      titulo: tituloDelTramo(t.hoyos),
      primerHoyo: t.hoyos[0],
      estado: estadoDelTramo(hoyos),
      parejas: [parejaDelTramo(t.parejas[0]), parejaDelTramo(t.parejas[1])],
      marcador: [t.marcador[0], t.marcador[1]],
      casillas: hoyos.map(h => ({ numero: h.numero, ganador: ganadorDelHoyoDeParejas(h) })),
      retiros: jugadorIds
        .filter(id => retiros[id] != null && (ordenDe.get(retiros[id]) ?? Infinity) <= finDelTramo)
        .map(id => `${nombre(id)} se retiró en el hoyo ${retiros[id]}`),
    }
  })
  const posicionDelTramo = (tramo: number | null | undefined) => (tramo == null ? null : tramos.findIndex(t => t.indice === tramo))
  const tramoDestacado = indiceDelTramoDestacado({
    estados: tramos.map(t => t.estado),
    tramoDelScorer: posicionDelTramo(ordenActual >= 0 ? resultado.hoyos[ordenActual].tramo : null),
    tramoDelUltimoHoyoConGolpes: posicionDelTramo(ultimoConGolpes?.tramo),
    cerrada: vista.rondaCerrada,
  })

  const muestraGolpesRecibidos = config.modo === 'neto' && resultado.sinHandicap.length === 0
  const puntosDelPrimero = resultado.ranking[0]?.puntos ?? 0
  const ranking: FilaRankingDelJuego[] = resultado.ranking.map(r => {
    const retiradoDesde = retiros[r.jugadorId] ?? null
    const atras = puntosDelPrimero - r.puntos
    return {
      jugadorId: r.jugadorId,
      nombre: nombre(r.jugadorId),
      puesto: r.puesto,
      puntos: r.puntos,
      texto: formatPuntosTimba(r.puntos),
      textoConUnidad: formatPuntosConUnidad(r.puntos),
      diferencia: retiradoDesde == null && atras > 0 ? `a ${formatPuntosConUnidad(atras)}` : null,
      retiradoDesde,
      // `?.`: una respuesta de /juego/publico de antes del deploy (CDN) no lo trae.
      hcp: vista.hcpAMostrar?.[r.jugadorId] ?? null,
    }
  })
  const hoyosPuntuados = resultado.hoyos.filter(h => h.estado === 'puntuado').length

  const frase = fraseDelEstado({
    ranking,
    hoyosPuntuados,
    hoyosSinJugar: resultado.hoyos.filter(h => h.estado === 'sin_jugar').length,
    totalHoyos: resultado.hoyos.length,
    hayGolpes: resultado.hoyos.some(hoyoDelJuegoConGolpes),
    hoyoDeSalida: resultado.hoyos[0]?.numero ?? 1,
    cerrada: vista.rondaCerrada,
  })
  return {
    titulo: config.plantilla === 'personalizado_total' ? NOMBRE_FORMATO_PERSONALIZADO : NOMBRE_PLANTILLA[config.plantilla],
    hoyosPuntuados,
    totalHoyos: resultado.hoyos.length,
    columnas: jugadorIds.map(id => ({ jugadorId: id, nombre: nombre(id) })),
    ranking,
    frase,
    tramos,
    tramoDestacado,
    filas,
    letrasEnLaTabla: config.puntitos
      .filter(p => letrasUsadas.has(p.id))
      .map(p => ({ letra: letras[p.id], nombre: nombreDelPuntito(p).toLocaleLowerCase('es-CL') })),
    esNeto: config.modo === 'neto',
    muestraGolpesRecibidos,
    // Mismo predicado que el título "Jugadores" de la vista (`frase.empezo`): no pueden divergir.
    muestraHcp: config.modo === 'neto' && !frase.empezo && !vista.rondaCerrada,
    rondaCerrada: vista.rondaCerrada,
    sinHandicap: resultado.sinHandicap.map(nombre),
  }
}
