/**
 * La tabla en vivo y la liquidación de un skins de ronda libre, armadas del resultado del motor (`calcularSkins`, vía
 * `resultadoDelSkins`). No calcula skins ni plata: los ordena para mostrar. Spec docs/specs/formato-skins.md («Estado
 * de cada hoyo», «Pozo y liquidación», «Último hoyo empatado», «Retiros»).
 *
 * La arma el servidor (`GET /juego` y `/juego/publico`): los hándicaps y las marcas no salen de ahí. La vista no trae
 * el neto de cada jugador por hoyo, solo el mejor score del hoyo (lo que la spec pide mostrar en disputa).
 */
import type { ModoJuego } from '@/golf/core/rules'
import { esHoyoResuelto, hoyosConX, type ConfigSkins, type EstadoHoyoSkins, type FueraPorJugador, type ResultadoSkins } from '@/golf/formats/skins'
import { formatPesos } from '@/lib/format'
import { rangoDeHoyos, unirNombres } from './juego-en-vivo'
import { nombresCortos } from './tabla-del-juego'

export interface HoyoDeLaTablaSkins {
  numero: number
  estado: EstadoHoyoSkins
  /** Skins en juego en el hoyo (1 + arrastre). */
  valor: number
  /** Un hoyo anterior sigue abierto: el valor puede subir. */
  provisional: boolean
  /** Mejor score del hoyo hasta ahora (neto o gross según el modo); `null` si nadie anotó golpes. */
  mejor: number | null
  /** Quienes tienen el mejor score (uno = va solo; varios = empatados). */
  lideres: string[]
  ganador: string | null
  repartidoEntre: string[]
  /** Arrastre porque el ganador no validó. */
  noValidado: boolean
}

export interface FilaDeLaTablaSkins {
  jugadorId: string
  /** Puesto por skins (empatados comparten puesto). */
  puesto: number
  /** Puede tener fracción (reparto del último hoyo). */
  skins: number
  /** Hoyos que ganó solo (estado `ganado`), en orden de juego. */
  hoyosGanados: number[]
  /** Hoyos repartidos con otros (último hoyo empatado): explican las fracciones («1,5 skins»). */
  hoyosRepartidos: number[]
  /** Skins que le tocaron por el reparto (valor del hoyo ÷ entre cuántos): «reparto del 18 (7,5)». */
  skinsDelReparto: number
  /** Skins por puntos especiales (1 cada uno). */
  especiales: number
  /** Pesos que cobra: estimado mientras `plata` sea `estimada`. */
  cobra: number
  /** `cobra − pozo por jugador`. */
  neto: number
  retiradoDesde: number | null
}

/**
 * Qué se puede decir de la plata:
 * - `sin_pozo`: se juega sin plata, solo skins.
 * - `bloqueada`: el motor no puede liquidar (sin hándicap, SI inválido, más de 3 golpes por hoyo).
 * - `sin_skins`: con pozo, la ronda sigue y nadie ganó todavía: no hay valor del skin que estimar.
 * - `estimada`: con skins ganados y hoyos por resolver: el valor del skin baja si se ganan más.
 * - `definitiva`: todos los hoyos resueltos.
 * - `devolucion`: todos los hoyos resueltos y nadie ganó: cada uno recupera lo que puso.
 */
export type EstadoDeLaPlata = 'sin_pozo' | 'bloqueada' | 'sin_skins' | 'estimada' | 'definitiva' | 'devolucion'

export interface TablaDelSkins {
  modo: ModoJuego
  pozoPorJugador: number
  pozoTotal: number
  valorSkin: number | null
  plata: EstadoDeLaPlata
  /** Todos los hoyos resueltos (con o sin pozo). */
  definitivo: boolean
  /** El motor no puede calcular con datos confiables (sin hándicap, SI inválido, más de 3 golpes por hoyo): sin resultado. */
  bloqueada: boolean
  skinsCobrados: number
  /** En orden de juego (el del arrastre). */
  hoyos: HoyoDeLaTablaSkins[]
  /** Por skins, de más a menos; empate en el orden de los jugadores. */
  filas: FilaDeLaTablaSkins[]
  /** Hoyos con X («fuera del hoyo») de cada jugador, para la tarjeta (en la base la X no es golpes). */
  fuera: Record<string, number[]>
  /** El primer hoyo sin resolver en orden de juego y lo que vale; `null` si todos están resueltos. */
  enJuego: { hoyo: number; valor: number; provisional: boolean } | null
}

export function armarTablaDelSkins(resultado: ResultadoSkins, input: {
  config: Pick<ConfigSkins, 'modo' | 'pozoPorJugador'>
  retiros: Readonly<Record<string, number>>
  fuera?: FueraPorJugador
}): TablaDelSkins {
  const { config, retiros } = input
  const numeros = resultado.hoyos.map(h => h.numero)
  const hoyos: HoyoDeLaTablaSkins[] = resultado.hoyos.map(h => ({
    numero: h.numero,
    estado: h.estado,
    valor: h.valor,
    provisional: h.valorProvisional,
    mejor: h.mejorNeto,
    lideres: [...h.lideres],
    ganador: h.ganador,
    repartidoEntre: [...h.repartidoEntre],
    noValidado: h.noValidado,
  }))
  const ordenados = resultado.jugadores
    .map((j, i) => ({ j, i }))
    .sort((a, b) => b.j.skins - a.j.skins || a.i - b.i)
  const filas: FilaDeLaTablaSkins[] = []
  ordenados.forEach(({ j }, k) => {
    const anterior = filas[k - 1]
    filas.push({
      jugadorId: j.id,
      puesto: anterior && anterior.skins === j.skins ? anterior.puesto : k + 1,
      skins: j.skins,
      hoyosGanados: hoyos.filter(h => h.estado === 'ganado' && h.ganador === j.id).map(h => h.numero),
      hoyosRepartidos: hoyos.filter(h => h.estado === 'repartido' && h.repartidoEntre.includes(j.id)).map(h => h.numero),
      // Mismo crédito que el motor (`repartoUltimo`: el valor del hoyo dividido en partes iguales entre los empatados).
      skinsDelReparto: hoyos
        .filter(h => h.estado === 'repartido' && h.repartidoEntre.includes(j.id))
        .reduce((s, h) => s + h.valor / h.repartidoEntre.length, 0),
      especiales: j.especiales,
      cobra: j.cobra,
      neto: j.neto,
      retiradoDesde: retiros[j.id] ?? null,
    })
  })
  const abierto = resultado.hoyos.find(h => !esHoyoResuelto(h.estado))
  return {
    modo: config.modo,
    pozoPorJugador: config.pozoPorJugador,
    pozoTotal: resultado.pozoTotal,
    valorSkin: resultado.valorSkin,
    plata: estadoDeLaPlata(resultado),
    definitivo: resultado.definitivo,
    bloqueada: !resultado.liquidable,
    skinsCobrados: resultado.skinsCobrados,
    hoyos,
    filas,
    fuera: Object.fromEntries(resultado.jugadores.map(j => [j.id, hoyosConX(input.fuera?.[j.id], numeros)])),
    enJuego: abierto ? { hoyo: abierto.numero, valor: abierto.valor, provisional: abierto.valorProvisional } : null,
  }
}

function estadoDeLaPlata(r: ResultadoSkins): EstadoDeLaPlata {
  if (r.pozoTotal <= 0) return 'sin_pozo'
  if (!r.liquidable) return 'bloqueada'
  if (r.devolucion) return 'devolucion'
  if (r.definitivo) return 'definitiva'
  return r.skinsCobrados > 0 ? 'estimada' : 'sin_skins'
}

// ─── Textos ─────────────────────────────────────────────────────────────────

/** «1 skin», «3 skins», «1,5 skins» (reparto del último hoyo; hasta 2 decimales). */
export function textoDeSkins(n: number): string {
  const redondo = Math.round(n * 100) / 100
  return `${cifraDeSkins(n)} ${redondo === 1 ? 'skin' : 'skins'}`
}

/** La cifra sola, con coma decimal y hasta 2 decimales: «7,5», «0,33». */
function cifraDeSkins(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/**
 * De dónde salen los skins de una fila, bajo el nombre: «Hoyos 1 y 4 · 1 punto especial». Con el número del hoyo
 * solo («Ganó 4») se leía como cuatro skins al lado de «3 skins». El reparto del último hoyo explica la fracción
 * («8,5 skins» → «Hoyo 4 · reparto del 18 (7,5)»): la parte va entre paréntesis y sin «skins», pegada a su origen,
 * para que no se lea como otro total al lado de la cifra de la fila. `null` si no hay nada que contar.
 */
export function detalleDeLaFila(
  f: Pick<FilaDeLaTablaSkins, 'hoyosGanados' | 'hoyosRepartidos' | 'skinsDelReparto' | 'especiales' | 'retiradoDesde'>,
): string | null {
  const partes: string[] = []
  const h = f.hoyosGanados
  if (h.length === 1) partes.push(`Hoyo ${h[0]}`)
  else if (h.length > 1) partes.push(`Hoyos ${listaDeHoyos(h)}`)
  if (f.hoyosRepartidos.length > 0) {
    partes.push(`reparto del ${listaDeHoyos(f.hoyosRepartidos)} (${cifraDeSkins(f.skinsDelReparto)})`)
  }
  if (f.especiales > 0) partes.push(f.especiales === 1 ? '1 punto especial' : `${f.especiales} puntos especiales`)
  if (f.retiradoDesde != null) partes.push(`se retiró en el ${f.retiradoDesde}`)
  if (partes.length === 0) return null
  const texto = partes.join(' · ')
  return texto[0].toUpperCase() + texto.slice(1)
}

function listaDeHoyos(h: readonly number[]): string {
  return h.length === 1 ? String(h[0]) : `${h.slice(0, -1).join(', ')} y ${h[h.length - 1]}`
}

/** Plata de una fila: con «~» mientras sea estimada. `null` si no hay plata que mostrar. */
export function textoDeLaPlata(tabla: Pick<TablaDelSkins, 'plata'>, cobra: number): string | null {
  if (tabla.plata === 'estimada') return `~${formatPesos(cobra)}`
  if (tabla.plata === 'definitiva' || tabla.plata === 'devolucion') return formatPesos(cobra)
  return null
}

/** «Gana $38.000», «Pierde $10.000», «Queda igual»: el neto de la liquidación, sin depender del color. */
export function textoDelNeto(neto: number): string {
  if (neto > 0) return `Gana ${formatPesos(neto)}`
  if (neto < 0) return `Pierde ${formatPesos(-neto)}`
  return 'Queda igual'
}

/** Lo que dice la celda de un hoyo en la tira (corto: entra en una celda de 6 por fila a 360 px). */
export function textoDeLaCelda(h: HoyoDeLaTablaSkins, corto: (id: string) => string): string {
  switch (h.estado) {
    case 'ganado': return h.ganador ? corto(h.ganador) : ''
    case 'por_validar': return h.lideres[0] ? corto(h.lideres[0]) : ''
    case 'arrastre': return h.noValidado ? 'No validó' : 'Empate'
    case 'repartido': return 'Reparto'
    case 'perdido': return 'Nadie'
    case 'en_disputa': return h.mejor == null ? '' : String(h.mejor)
    default: return ''
  }
}

/**
 * Quién lleva el hoyo en disputa, bajo el mejor score: el nombre corto o «Igual» (`TEXTO_VAN_IGUALES`) si van empatados. `null` si el hoyo
 * no está en disputa o nadie anotó (el grupo pregunta «¿quién lo tiene?», no solo «¿con cuánto?»).
 */
/**
 * Hoyo en juego con varios en el mejor score. «Igual» y no «Emp.»: la celda vecina de un hoyo que ya se empató y
 * pasa dice «Empate», y las dos solo se distinguían por el gris. «Igual» es como se dice en la cancha que van
 * parejos (match play: «van iguales»), no se confunde con un hoyo cerrado y entra en la celda a 360 px.
 */
export const TEXTO_VAN_IGUALES = 'Igual'

export function quienLlevaElHoyo(h: HoyoDeLaTablaSkins, corto: (id: string) => string): string | null {
  if (h.estado !== 'en_disputa' || h.mejor == null || h.lideres.length === 0) return null
  return h.lideres.length > 1 ? TEXTO_VAN_IGUALES : corto(h.lideres[0])
}

/** Lectura completa de una celda para lector de pantalla (la tira es visual: esto es lo que se oye). */
export function lecturaDeLaCelda(h: HoyoDeLaTablaSkins, nombre: (id: string) => string, modo: ModoJuego): string {
  const vale = h.valor > 1 ? `, valía ${textoDeSkins(h.valor)}` : ''
  const score = modo === 'neto' ? 'neto' : 'gross'
  switch (h.estado) {
    case 'ganado': return `Hoyo ${h.numero}: lo ganó ${h.ganador ? nombre(h.ganador) : ''}${vale}`
    case 'por_validar': return `Hoyo ${h.numero}: ${h.lideres[0] ? nombre(h.lideres[0]) : ''} lo gana si valida en el siguiente${vale}`
    case 'arrastre': return `Hoyo ${h.numero}: ${h.noValidado ? 'el ganador no validó' : 'empate'}, pasa al siguiente${vale}`
    case 'repartido': return `Hoyo ${h.numero}: se reparte entre ${unirNombres(h.repartidoEntre.map(nombre))}${vale}`
    case 'perdido': return `Hoyo ${h.numero}: nadie lo cobra${vale}`
    case 'en_disputa':
      return h.mejor == null
        ? `Hoyo ${h.numero}: en juego, vale ${textoDeSkins(h.valor)}`
        : `Hoyo ${h.numero}: en juego, vale ${textoDeSkins(h.valor)}. Mejor ${score} hasta ahora: ${h.mejor}, ${
          h.lideres.length > 1 ? `empatado entre ${unirNombres(h.lideres.map(nombre))}` : `lo lleva ${nombre(h.lideres[0] ?? '')}`}`
    default: return `Hoyo ${h.numero}: por jugar`
  }
}

// ─── Resultado final ────────────────────────────────────────────────────────

export interface ResultadoDelSkins {
  encabezado: string
  titular: string
  bajada: string
  /** Mismo contrato que el ranking de la Timba (`ResultadoFinalDeLaTimba` lo pinta igual). */
  ranking: { jugadorId: string; nombre: string; puesto: number; puntos: number; texto: string; retiradoDesde: number | null; detalle: string | null }[]
  /** Con pozo y la plata cerrada: quién cobra, quién paga y el neto, de más a menos. */
  liquidacion: { jugadorId: string; nombre: string; cobra: number; neto: number }[] | null
}

export function armarResultadoDelSkins(tabla: TablaDelSkins, nombres: Readonly<Record<string, string>>): ResultadoDelSkins {
  const ids = tabla.filas.map(f => f.jugadorId)
  const cortos = nombresCortos(ids.map(id => nombres[id] ?? ''))
  const nombre = (id: string) => cortos[ids.indexOf(id)] ?? ''
  const ranking = tabla.filas.map(f => ({
    jugadorId: f.jugadorId, nombre: nombre(f.jugadorId), puesto: f.puesto, puntos: f.skins, texto: textoDeSkins(f.skins), retiradoDesde: f.retiradoDesde,
    // De dónde salen los skins (hoyos, reparto, especiales, retiro): sin esto «8,5 skins» no se explicaba.
    detalle: detalleDeLaFila(f),
  }))
  const primeros = ranking.filter(r => r.puesto === 1)
  let titular: string
  let bajada: string
  if (!tabla.definitivo) {
    // Ronda cerrada con hoyos sin resolver: no hay ganador que anunciar (spec «Pozo y liquidación»: no se liquida sola).
    titular = 'Quedaron hoyos sin resolver'
    bajada = tabla.skinsCobrados === 0
      ? 'Nadie había ganado un skin.'
      : primeros.length === 1
        ? `Iba adelante ${primeros[0].nombre} con ${primeros[0].texto}.`
        : `Iban adelante ${unirNombres(primeros.map(p => p.nombre))} con ${primeros[0].texto} cada uno.`
  } else if (tabla.skinsCobrados === 0) {
    titular = 'Nadie ganó un skin'
    bajada = tabla.plata === 'devolucion'
      ? `Se devuelve el pozo: cada uno recupera ${formatPesos(tabla.pozoPorJugador)}.`
      : 'Todos los hoyos quedaron empatados.'
  } else if (primeros.length === 1) {
    titular = `Ganó ${primeros[0].nombre}`
    bajada = `Con ${primeros[0].texto}.`
  } else {
    titular = `Empate entre ${unirNombres(primeros.map(p => p.nombre))}`
    bajada = `Con ${primeros[0].texto} cada uno.`
  }
  const pozo = tabla.plata === 'sin_pozo' ? 'Sin pozo' : `Pozo ${formatPesos(tabla.pozoTotal)}`
  const liquidacion = tabla.plata === 'definitiva' || tabla.plata === 'devolucion'
    ? tabla.filas
        .map((f, i) => ({ jugadorId: f.jugadorId, nombre: nombre(f.jugadorId), cobra: f.cobra, neto: f.neto, i }))
        .sort((a, b) => b.neto - a.neto || a.i - b.i)
        .map(({ i: _i, ...l }) => l)
    : null
  return {
    encabezado: `Skins · ${tabla.modo === 'neto' ? 'Neto' : 'Gross'} · ${pozo}`,
    titular,
    bajada,
    ranking,
    liquidacion,
  }
}

/** Hoyos que quedaron sin resolver (ni ganados, ni empatados, ni repartidos), en orden de juego. */
export function hoyosSinResolver(tabla: Pick<TablaDelSkins, 'hoyos'>): number[] {
  return tabla.hoyos.filter(h => !esHoyoResuelto(h.estado)).map(h => h.numero)
}

/**
 * Ronda cerrada con hoyos sin resolver y con pozo: no se liquida sola (spec «Pozo y liquidación»: el organizador ve
 * el aviso y resuelve). Dice qué hoyos y quién decide; la ronda ya está cerrada, así que no se pide «revisar la tarjeta».
 */
export function textoDelPozoSinLiquidar(tabla: Pick<TablaDelSkins, 'hoyos'>): string {
  const hoyos = hoyosSinResolver(tabla)
  const cuales = hoyos.length === 0 ? '' : hoyos.length === 1
    ? ` Quedó sin resolver el hoyo ${hoyos[0]}.`
    // Pocos, uno por uno («17 y 18»: «17–18» se lee como tramo); muchos, en tramos («10–18»).
    : ` Quedaron sin resolver los hoyos ${hoyos.length <= 3 ? listaDeHoyos(hoyos) : rangoDeHoyos(hoyos)}.`
  return `No se liquidó el pozo.${cuales} El organizador decide cómo se reparte.`
}

/** Texto para el grupo de WhatsApp: el resultado, los skins y la liquidación. El link viaja aparte (`url`). */
export function textoParaCompartirElSkins(r: ResultadoDelSkins, tabla: TablaDelSkins, cancha: string): string {
  const lineas = [
    `${r.encabezado}${cancha ? ` · ${cancha}` : ''}`,
    `${r.titular}. ${r.bajada}`,
    '',
    ...r.ranking.map(f => `${f.puesto}. ${f.nombre} ${f.texto}${f.retiradoDesde != null ? ` (se retiró en el hoyo ${f.retiradoDesde})` : ''}`),
  ]
  if (!tabla.definitivo && tabla.plata !== 'sin_pozo') {
    lineas.push('', textoDelPozoSinLiquidar(tabla))
  }
  if (r.liquidacion) {
    lineas.push('', tabla.valorSkin != null ? `Liquidación (skin a ${formatPesos(tabla.valorSkin)})` : 'Liquidación')
    for (const l of r.liquidacion) lineas.push(`${l.nombre}: cobra ${formatPesos(l.cobra)} · ${textoDelNeto(l.neto).toLowerCase()}`)
  }
  return `${lineas.join('\n')}\n`
}
