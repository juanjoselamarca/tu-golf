/* client-only — importar solo desde componentes con 'use client' */

import { parTotalEstandar } from '@/golf/core/round-score'
import { formatLabel, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { isTeamFormat } from '@/golf/formats'
import { esPrimerLugar } from '@/golf/core/posiciones'
import {
  equiposEnElPrimerLugar,
  posicionesDeEquiposRondaLibre,
  etiquetaDelResultadoDeEquipos,
  juegaContraElPar,
  nombrarEquipos,
} from '@/golf/ronda-libre/resultado-de-equipos'
import { formatOverUnder, relacionConElPar, vsParEnPalabras } from '@/constants/golf'
import { captureError } from '@/lib/error-tracking'
import { SITE_URL } from '@/lib/site-url'
import { hoyosDesdeElUno, hoyosPorNumero, etiquetaDeMitad } from '@/golf/core/hoyos-jugados'

// ── Tipos ─────────────────────────────────────────────────────────

export interface ShareCardRondaLibre {
  tipo: 'ronda_libre'
  ganador: string
  esEmpate: boolean
  jugadores?: string[]
  scoreGross: number
  scoreDiff: number
  courseName: string
  fecha: string
  birdies: number
  eagles: number
  scoresByHole: Record<string | number, number>
  parsByHole: Record<number, number>
  holesPlayed: number
  /** Hoyos de la ronda (`hoyosDeLaRonda`): un 9h desde el 10 son los 10-18. Sin él, 1..holesPlayed. */
  hoyos?: readonly number[]
  formato_juego?: FormatoJuego | string
  modo_juego?: ModoJuego | string | null
  /** `posicion`: etiqueta con empates estilo golf ("T1"), la misma que la tabla. Sin ella, i + 1. */
  ranking?: Array<{ nombre: string; score: number; diff: number; holesPlayed?: number; posicion?: string | null }>
  /** Resultado Match Play (ej: "3&2", "All Square", "1 UP"). Si viene y formato es match_play,
   * se muestra prominente en lugar de score + vs-par. */
  matchResult?: string
  /** Total Stableford del jugador (para mostrar "N pts" como subtítulo). */
  stablefordPoints?: number
  /** Para formatos de equipo: nombre del equipo ganador */
  teamNombre?: string
  /** Para formatos de equipo: miembros del equipo ganador */
  teamJugadores?: string[]
  /** Para formatos de equipo: formato específico */
  teamFormato?: 'best_ball' | 'scramble' | 'foursome'
  /** Formatos de equipo: un solo equipo en la ronda, sin rival. Juega contra el par, no "gana". */
  contraElPar?: boolean
}

export interface ShareCardTorneo {
  tipo: 'torneo'
  torneoNombre: string
  jugadorNombre: string
  posicion: number
  totalJugadores: number
  scoreGross: number
  scoreDiff: number
  courseName: string
  fecha: string
  birdies: number
  eagles: number
  scoresByHole: Record<string | number, number>
  parsByHole: Record<number, number>
  formato_juego?: FormatoJuego | string
  modo_juego?: ModoJuego | string | null
}

export type ShareCardData = ShareCardRondaLibre | ShareCardTorneo

// Keep backwards compat
export interface LeaderboardPlayer {
  nombre: string
  vsPar: number
  holesPlayed: number
  totalHoles: number
  /** Lugar de la tabla (`posicionesDelLeaderboard`): la imagen dice lo mismo que la pantalla. */
  posicion: string | null
}
export interface LeaderboardShareData {
  players: LeaderboardPlayer[]
  courseName: string
  fecha: string
  rondaCodigo: string
  isFinished: boolean
  /** Hoyos de la ronda. Independiente de `players` — necesario para formatos por
   *  equipo (scramble/foursome) donde `players` puede venir vacío (los scores
   *  viven en el equipo, no en el jugador). */
  totalHoles: number
  formato_juego?: FormatoJuego | string
  modo_juego?: ModoJuego | string | null
  /** Match Play: display string del resultado ("3&2", "1 UP", "All Square", etc.).
   *  Cuando formato_juego === 'match_play' y matchResult está presente, la card
   *  renderiza el estado del match en vez del total bruto. */
  matchResult?: string
  /** Match Play: nombre del ganador (si no es empate). Si matchResult indica
   *  "All Square" o similar, este campo se ignora. */
  matchWinner?: string
  /** Team formats: ranking de equipos para la share card */
  teams?: Array<{
    nombre: string
    jugadores: string[]
    score: number
    diff: number
    /** Hoyos con score. 0 = no anotó nada: va al final y no compite. */
    holesPlayed: number
  }>
}

// ── Helpers internos ──────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
}

function drawDivider(ctx: CanvasRenderingContext2D, y: number, W: number) {
  const grad = ctx.createLinearGradient(80, 0, W - 80, 0)
  grad.addColorStop(0, 'transparent'); grad.addColorStop(0.5, 'rgba(201,168,76,0.6)'); grad.addColorStop(1, 'transparent')
  ctx.save(); ctx.strokeStyle = grad; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(W - 80, y); ctx.stroke(); ctx.restore()
}

function scoreColor(diff: number): string {
  if (diff <= -2) return '#0B6BA6' // eagle+ azul oscuro Garmin
  if (diff === -1) return '#14B3D9' // birdie celeste Garmin
  if (diff === 0) return '#c9a84c'  // par dorado Golfers+
  if (diff === 1) return '#D4A442'  // bogey dorado Garmin
  return '#DC3B2E'                   // doble+ rojo Garmin
}

// Badge "9 HOYOS" / "18 HOYOS" — defensive UX, el usuario siempre sabe qué ronda es
function drawHolesBadge(ctx: CanvasRenderingContext2D, holes: number, cx: number, cy: number) {
  const label = `${holes} HOYOS`
  ctx.save()
  ctx.font = 'bold 22px Arial, sans-serif'
  const textW = ctx.measureText(label).width
  const padX = 18, padY = 10
  const w = textW + padX * 2, h = 38
  const x = cx - w / 2, y = cy - h / 2
  // 9 hoyos = más prominente (dorado sólido), 18 hoyos = sutil (outline)
  const isNine = holes <= 9
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = isNine ? 'rgba(201,168,76,0.28)' : 'rgba(201,168,76,0.12)'
  ctx.fill()
  ctx.strokeStyle = isNine ? 'rgba(201,168,76,0.9)' : 'rgba(201,168,76,0.45)'
  ctx.lineWidth = isNine ? 2 : 1.2
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#c9a84c'
  ctx.fillText(label, cx, cy + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// Badge de formato de juego — "STROKE PLAY NETO", "STABLEFORD", "MATCH PLAY"
// Es defensivo: el receptor de la share card siempre sabe qué modalidad se jugó.
// Pill dorada sólida, estilo premium — mismo lenguaje visual que drawHolesBadge.
function drawFormatBadge(
  ctx: CanvasRenderingContext2D,
  formato: FormatoJuego | string | undefined,
  modo: ModoJuego | string | null | undefined,
  cx: number,
  cy: number,
) {
  if (!formato) return
  const label = formatLabel(formato, modo ?? undefined).toUpperCase()
  ctx.save()
  ctx.font = 'bold 22px Arial, sans-serif'
  const textW = ctx.measureText(label).width
  const padX = 18
  const w = textW + padX * 2
  const h = 38
  const x = cx - w / 2
  const y = cy - h / 2
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = 'rgba(201,168,76,0.22)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(201,168,76,0.75)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#c9a84c'
  ctx.fillText(label, cx, cy + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// ── Base: fondo + bordes + logo ───────────────────────────────────

function drawBase(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
  bg.addColorStop(0, '#071510'); bg.addColorStop(0.3, '#0d1f16'); bg.addColorStop(0.7, '#111827'); bg.addColorStop(1, '#080c10')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(255,255,255,0.012)'; ctx.lineWidth = 1
  for (let i = -H; i < W + H; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke() }

  const glow = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.8)
  glow.addColorStop(0, 'rgba(201,168,76,0.07)'); glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(201,168,76,0.45)'; ctx.lineWidth = 2.5; ctx.strokeRect(20, 20, W - 40, H - 40)

  const cL = 55, cP = 20
  ctx.strokeStyle = 'rgba(201,168,76,0.75)'; ctx.lineWidth = 2
  ;[[cP, cP + cL, cP, cP, cP + cL, cP], [W - cP - cL, cP, W - cP, cP, W - cP, cP + cL],
    [cP, H - cP - cL, cP, H - cP, cP + cL, H - cP], [W - cP - cL, H - cP, W - cP, H - cP, W - cP, H - cP - cL]]
    .forEach(([x1, y1, x2, y2, x3, y3]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke() })

  ctx.textAlign = 'center'
  ctx.font = 'bold 54px Georgia, serif'; ctx.fillStyle = '#c9a84c'; ctx.fillText('Golfers', W / 2 - 26, 116)
  ctx.fillStyle = '#ffffff'; ctx.fillText('+', W / 2 + 76, 116)
  ctx.font = '22px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ;(ctx as any).letterSpacing = '3px'; ctx.fillText('EL GOLF AMATEUR EN ESPAÑOL', W / 2, 150); (ctx as any).letterSpacing = '0px'
  drawDivider(ctx, 175, W)
}

// ── Scorecard 18 hoyos ───────────────────────────────────────────

// Garmin palette (verified 24-Mar-2026) — matches ScoreSymbol component
const GARMIN = {
  eagle: '#0B6BA6',
  birdie: '#14B3D9',
  bogey: '#D4A442',
  double: '#DC3B2E',
} as const

// Dibuja el símbolo Garmin alrededor del número (círculo/cuadrado/doble)
function drawScoreSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, diff: number) {
  const r = 26 // radio base del símbolo
  ctx.save()
  ctx.lineWidth = 2
  if (diff <= -2) {
    // Eagle+: doble círculo azul oscuro
    ctx.strokeStyle = GARMIN.eagle
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, r - 5, 0, Math.PI * 2); ctx.stroke()
  } else if (diff === -1) {
    // Birdie: círculo celeste
    ctx.strokeStyle = GARMIN.birdie
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  } else if (diff === 1) {
    // Bogey: cuadrado dorado
    ctx.strokeStyle = GARMIN.bogey
    ctx.strokeRect(cx - r, cy - r, r * 2, r * 2)
  } else if (diff >= 2) {
    // Double+: doble cuadrado rojo
    ctx.strokeStyle = GARMIN.double
    ctx.strokeRect(cx - r, cy - r, r * 2, r * 2)
    ctx.strokeRect(cx - r + 5, cy - r + 5, (r - 5) * 2, (r - 5) * 2)
  }
  // Par (diff === 0): sin símbolo, solo el número
  ctx.restore()
}

/** Exportada para tests (texto pintado por hoyo); el resto del módulo la usa vía `generarShareCard`. */
export function drawScorecard(ctx: CanvasRenderingContext2D, scores: Record<string | number, number>, pars: Record<number, number>, hoyosDeLaTarjeta: readonly number[], startY: number, W: number) {
  // Por número (OUT arriba, IN abajo): un 9h desde el 10 pinta los hoyos 10-18, no 1-9 vacíos.
  const hoyos = hoyosPorNumero(hoyosDeLaTarjeta)
  const holes = hoyos.length
  // Panel de scorecard claro (tipo captura del componente Scorecard)
  const panelPad = 70
  const panelX = panelPad
  const panelY = startY - 20
  const panelW = W - panelPad * 2
  const rows = holes <= 9 ? 1 : 2
  const rowH = 92
  const headerH = 28
  const totalRowH = 34
  const panelH = headerH + rows * rowH + totalRowH + 24

  roundRect(ctx, panelX, panelY, panelW, panelH, 16)
  ctx.fillStyle = '#ffffff'; ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke()

  const cellW = (panelW - 32) / 10 // 9 holes + 1 OUT/IN column
  const gridX = panelX + 16

  // Header row: hole numbers
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = 'bold 16px Arial, sans-serif'; ctx.fillStyle = '#5a6370'

  for (let row = 0; row < rows; row++) {
    const rowY = panelY + headerH + row * rowH
    const headerY = rowY - 4

    // Hole number labels (Hoyo 1..9 or 10..18)
    ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillStyle = '#7c8594'
    const hoyosDeFila = hoyos.slice(row * 9, row * 9 + 9)
    for (let col = 0; col < 9; col++) {
      const h = hoyosDeFila[col]
      if (h == null) break
      ctx.fillText(String(h), gridX + col * cellW + cellW / 2, headerY + 8)
    }
    // OUT / IN label
    ctx.fillStyle = '#c4992a'; ctx.font = 'bold 14px Arial, sans-serif'
    ctx.fillText(etiquetaDeMitad(hoyosDeFila), gridX + 9 * cellW + cellW / 2, headerY + 8)

    // Score row: number + Garmin symbol
    let rowTotal = 0; let rowHasAll = true
    for (let col = 0; col < 9; col++) {
      const h = hoyosDeFila[col]
      if (h == null) { rowHasAll = false; break }
      const s = scores[h] ?? scores[String(h)]
      const p = pars[h] ?? 4
      const cx = gridX + col * cellW + cellW / 2
      const cy = rowY + 48

      if (s == null) {
        rowHasAll = false
        ctx.font = '32px "DM Mono", Courier, monospace'; ctx.fillStyle = '#d1d5db'
        ctx.fillText('–', cx, cy)
      } else {
        const d = s - p
        drawScoreSymbol(ctx, cx, cy, d)
        ctx.font = 'bold 30px "DM Mono", Courier, monospace'; ctx.fillStyle = '#1a1a2e'
        ctx.fillText(String(s), cx, cy)
        rowTotal += s
      }
    }
    // Row total (OUT/IN sum)
    const totX = gridX + 9 * cellW + cellW / 2
    const totY = rowY + 48
    if (rowHasAll && rowTotal > 0) {
      ctx.font = 'bold 30px "DM Mono", Courier, monospace'; ctx.fillStyle = '#c4992a'
      ctx.fillText(String(rowTotal), totX, totY)
    } else if (rowTotal > 0) {
      ctx.font = '26px "DM Mono", Courier, monospace'; ctx.fillStyle = '#9ca3af'
      ctx.fillText(String(rowTotal), totX, totY)
    }
  }

  // Total line at bottom
  const totalY = panelY + headerH + rows * rowH + 4
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(panelX + 16, totalY); ctx.lineTo(panelX + panelW - 16, totalY); ctx.stroke()

  const grandTotal = hoyos.map(h => {
    const s = scores[h] ?? scores[String(h)]
    return typeof s === 'number' ? s : 0
  }).reduce((a, b) => a + b, 0)
  const grandPar = hoyos.map(h => pars[h] ?? 4).reduce((a, b) => a + b, 0)
  const grandDiff = grandTotal - grandPar

  ctx.textAlign = 'left'; ctx.font = 'bold 18px Arial, sans-serif'; ctx.fillStyle = '#5a6370'
  ctx.fillText('TOTAL', panelX + 32, totalY + totalRowH / 2 + 6)
  ctx.textAlign = 'right'
  ctx.font = 'bold 28px "DM Mono", Courier, monospace'; ctx.fillStyle = '#1a1a2e'
  const diffLabel = grandDiff === 0 ? 'E' : (grandDiff > 0 ? `+${grandDiff}` : `${grandDiff}`)
  const diffColor = grandDiff < 0 ? GARMIN.birdie : (grandDiff > 0 ? GARMIN.bogey : '#1a1a2e')
  ctx.fillText(String(grandTotal), panelX + panelW - 100, totalY + totalRowH / 2 + 8)
  ctx.fillStyle = diffColor; ctx.font = 'bold 22px Arial, sans-serif'
  ctx.fillText(diffLabel, panelX + panelW - 32, totalY + totalRowH / 2 + 8)
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
}

// ── CTA inferior ─────────────────────────────────────────────────

function drawCTA(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const ctaY = H - 380
  roundRect(ctx, 80, ctaY, W - 160, 200, 18)
  const bg = ctx.createLinearGradient(80, ctaY, W - 80, ctaY + 200)
  bg.addColorStop(0, 'rgba(201,168,76,0.14)'); bg.addColorStop(1, 'rgba(201,168,76,0.05)')
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = 'rgba(201,168,76,0.38)'; ctx.lineWidth = 1; ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = 'bold 38px Georgia, serif'; ctx.fillStyle = '#c9a84c'; ctx.fillText('Scoring · IA Coach · Live Leaderboard', W / 2, ctaY + 60)
  ctx.font = '34px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillText('golfersplus.vercel.app', W / 2, ctaY + 108)
  ctx.font = '24px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fillText('Primera plataforma de golf en español', W / 2, ctaY + 148)

  // Share text — emoji OK for external platforms (canvas-rendered share card image)
  ctx.font = 'bold 26px Arial, sans-serif'; ctx.fillStyle = 'rgba(201,168,76,0.55)'; ctx.fillText('#GolfersMas  ⛳  #GolfLatAm', W / 2, H - 130)
  ctx.font = '22px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillText('Golfers+ — El golf amateur en español', W / 2, H - 80)
}

// ── Template: Ronda Libre ────────────────────────────────────────

/**
 * Emoji y título de la imagen de una ronda libre. Por equipos sale de la misma
 * fuente que el cuadro ganador de la pantalla (`etiquetaDelResultadoDeEquipos`):
 * un equipo solo juega contra el par y no lleva trofeo (09-nov-2026, R4794T).
 */
export function encabezadoDeRondaLibre(data: Pick<ShareCardRondaLibre, 'esEmpate' | 'teamNombre' | 'contraElPar'>): { emoji: string; titulo: string } {
  if (data.teamNombre) {
    const etiqueta = etiquetaDelResultadoDeEquipos(data.contraElPar ? 1 : 2, data.esEmpate)
    const emoji = data.contraElPar ? '⛳' : data.esEmpate ? '🤝' : '🏆'
    return { emoji, titulo: etiqueta.toUpperCase() }
  }
  return data.esEmpate ? { emoji: '🤝', titulo: 'EMPATE ÉPICO' } : { emoji: '🏆', titulo: 'GANADOR DE LA RONDA' }
}

/**
 * El nombre grande de la imagen. Con empate van los empatados: por equipos
 * "Equipo 1 y Equipo 2" (igual que el cuadro de la pantalla), individual los
 * nombres de pila. Antes por equipos salía siempre el primero, como si el
 * empate fuera de un solo equipo.
 */
export function nombreDeRondaLibre(data: Pick<ShareCardRondaLibre, 'ganador' | 'esEmpate' | 'jugadores' | 'teamNombre'>): string {
  if (data.teamNombre) {
    return data.esEmpate && data.jugadores?.length ? nombrarEquipos(data.jugadores) : data.teamNombre
  }
  return data.esEmpate && data.jugadores ? data.jugadores.map(n => n.split(' ')[0]).join(' · ') : data.ganador
}

/**
 * El tamaño de fuente (px) más grande, de `max` hacia abajo, con el que el texto
 * cabe en `anchoMax`; `min` si ni así cabe. `medir` devuelve el ancho del texto a
 * un tamaño dado (en el lienzo, `ctx.measureText` con esa fuente).
 */
export function tamanoQueCabe(medir: (px: number) => number, max: number, min: number, anchoMax: number): number {
  for (let px = max; px > min; px -= 2) {
    if (medir(px) <= anchoMax) return px
  }
  return min
}

/** Parte un texto en dos líneas por el espacio más cercano al medio (una sola línea si no hay espacios). */
export function partirEnDosLineas(texto: string): [string, string] {
  const medio = texto.length / 2
  let corte = -1
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === ' ' && (corte < 0 || Math.abs(i - medio) < Math.abs(corte - medio))) corte = i
  }
  return corte < 0 ? [texto, ''] : [texto.slice(0, corte), texto.slice(corte + 1)]
}

function dibujarRondaLibre(ctx: CanvasRenderingContext2D, data: ShareCardRondaLibre, W: number, H: number) {
  ctx.textAlign = 'center'
  const encabezado = encabezadoDeRondaLibre(data)
  // Share text — emoji OK for external platforms (canvas-rendered share card image)
  ctx.font = '180px serif'; ctx.fillText(encabezado.emoji, W / 2, 420)

  ctx.font = 'bold 24px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ;(ctx as any).letterSpacing = '3px'
  const isTeam = !!data.teamNombre
  ctx.fillText(encabezado.titulo, W / 2, 470)
  ;(ctx as any).letterSpacing = '0px'

  // El nombre grande se achica hasta caber; los nombres de equipo se escriben
  // libres ("Los Cóndores de Chicureo y Las Águilas del Sur" no cabe a 68px) y
  // antes se salía del lienzo por los dos lados.
  const name = nombreDeRondaLibre(data)
  const anchoDelNombre = W - 120
  const fuenteDelNombre = (px: number) => `bold ${px}px Georgia, serif`
  const medir = (texto: string) => (px: number) => { ctx.font = fuenteDelNombre(px); return ctx.measureText(texto).width }
  ctx.fillStyle = '#ffffff'
  let yIntegrantes = 600
  const px = tamanoQueCabe(medir(name), 68, 40, anchoDelNombre)
  if (medir(name)(px) <= anchoDelNombre) {
    ctx.font = fuenteDelNombre(px); ctx.fillText(name, W / 2, 560)
  } else {
    // Ni a 40px cabe: dos líneas, partidas en el espacio más cercano al medio.
    const [linea1, linea2] = partirEnDosLineas(name)
    const px2 = Math.min(tamanoQueCabe(medir(linea1), 48, 32, anchoDelNombre), tamanoQueCabe(medir(linea2), 48, 32, anchoDelNombre))
    ctx.font = fuenteDelNombre(px2)
    ctx.fillText(linea1, W / 2, 530); ctx.fillText(linea2, W / 2, 586)
    // El número grande (210px, brillo 35) arranca cerca de y=640: los integrantes
    // van a 620 para no quedar bajo el brillo.
    yIntegrantes = 620
  }

  // Team members subtitle (con empate el nombre ya ocupa los dos equipos). Se
  // achica hasta caber: cuatro nombres completos no entran a 28px.
  if (isTeam && !data.esEmpate && data.teamJugadores && data.teamJugadores.length > 0) {
    const integrantes = data.teamJugadores.join(' \u00B7 ')
    const fuenteDeIntegrantes = (px: number) => `${px}px Arial, sans-serif`
    const medirIntegrantes = (px: number) => { ctx.font = fuenteDeIntegrantes(px); return ctx.measureText(integrantes).width }
    ctx.font = fuenteDeIntegrantes(tamanoQueCabe(medirIntegrantes, 28, 20, anchoDelNombre)); ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(integrantes, W / 2, yIntegrantes)
  }

  const isStableford = data.formato_juego === 'stableford'
  const isMatchPlay = data.formato_juego === 'match_play'
  const clr = isStableford ? '#c9a84c' : isMatchPlay ? '#c9a84c' : scoreColor(data.scoreDiff)

  if (isMatchPlay && data.matchResult) {
    // Match Play: el resultado del match es lo que importa, no el stroke total.
    // Mostrar el display ("3&2", "All Square", "1 UP") como el número grande.
    ctx.save(); ctx.shadowColor = clr; ctx.shadowBlur = 35
    const label = data.matchResult
    const fontSize = label.length > 8 ? 130 : label.length > 5 ? 170 : 200
    ctx.font = `bold ${fontSize}px Arial, sans-serif`; ctx.fillStyle = clr; ctx.fillText(label, W / 2, 790)
    ctx.restore()
    ctx.font = 'bold 42px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText('Match Play', W / 2, 848)
  } else {
    // El empate se decide por vs par; los golpes brutos de los empatados pueden
    // diferir (neto, o distinta cantidad de hoyos anotados). Con empate el número
    // grande es el vs par, como en el cuadro ganador de la pantalla.
    const empateVsPar = data.esEmpate && !isStableford
    ctx.save(); ctx.shadowColor = clr; ctx.shadowBlur = 35
    ctx.font = 'bold 210px Arial, sans-serif'; ctx.fillStyle = clr
    ctx.fillText(empateVsPar ? formatOverUnder(data.scoreDiff) : String(data.scoreGross), W / 2, 790)
    ctx.restore()
    if (isStableford) {
      ctx.font = 'bold 42px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText('puntos', W / 2, 848)
    } else {
      const diffTxt = empateVsPar ? relacionConElPar(data.scoreDiff) : vsParEnPalabras(data.scoreDiff)
      ctx.font = 'bold 42px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(diffTxt, W / 2, 848)
    }
  }
  ctx.font = '32px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(`${data.courseName}  ·  ${data.fecha}`, W / 2, 900)
  // Badges: holes + formato (si hay formato, los ponemos apilados para no chocar)
  if (data.formato_juego) {
    drawHolesBadge(ctx, data.holesPlayed, W / 2, 935)
    drawFormatBadge(ctx, data.formato_juego, data.modo_juego, W / 2, 982)
    drawDivider(ctx, 1015, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, data.hoyos ?? hoyosDesdeElUno(data.holesPlayed), 1035, W)
  } else {
    drawHolesBadge(ctx, data.holesPlayed, W / 2, 940)
    drawDivider(ctx, 975, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, data.hoyos ?? hoyosDesdeElUno(data.holesPlayed), 1000, W)
  }

  const statsY = 1200
  const items: string[] = []
  // Stableford y Match Play: eagles/birdies no son relevantes para el resultado.
  // Solo se muestran en Stroke Play donde el total gross manda.
  if (!isStableford && !isMatchPlay) {
    if (data.eagles > 0) items.push(`${data.eagles} eagle${data.eagles > 1 ? 's' : ''}`)
    if (data.birdies > 0) items.push(`${data.birdies} birdie${data.birdies > 1 ? 's' : ''}`)
  }
  if (items.length > 0) { ctx.font = 'bold 30px Arial, sans-serif'; ctx.fillStyle = '#c9a84c'; ctx.textAlign = 'center'; ctx.fillText(items.join('    '), W / 2, statsY) }

  if (data.ranking && data.ranking.length > 1) {
    const rkY = items.length > 0 ? statsY + 48 : statsY
    roundRect(ctx, 80, rkY, W - 160, data.ranking.length * 56 + 16, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke()
    data.ranking.forEach((j, i) => {
      const ly = rkY + 16 + i * 56
      const posicion = j.posicion === undefined ? String(i + 1) : j.posicion
      const lider = j.posicion === undefined ? i === 0 : esPrimerLugar(posicion)
      ctx.textAlign = 'left'; ctx.font = `${lider ? 'bold ' : ''}28px Arial, sans-serif`
      ctx.fillStyle = lider ? '#ffffff' : 'rgba(255,255,255,0.45)'; ctx.fillText(posicion ? `${posicion}. ${j.nombre}` : j.nombre, 110, ly + 36)
      ctx.textAlign = 'right'; ctx.font = 'bold 28px Arial, sans-serif'
      if (j.holesPlayed === 0) {
        // Equipo que no anotó ningún hoyo: va al final y no tiene score que mostrar.
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fillText('sin score', W - 110, ly + 36)
      } else if (isStableford) {
        ctx.fillStyle = '#c9a84c'
        ctx.fillText(`${j.score} pts`, W - 110, ly + 36)
      } else {
        ctx.fillStyle = scoreColor(j.diff)
        ctx.fillText(`${j.score} (${j.diff >= 0 ? '+' : ''}${j.diff})`, W - 110, ly + 36)
      }
    })
  }
}

// ── Template: Torneo ─────────────────────────────────────────────

function dibujarTorneo(ctx: CanvasRenderingContext2D, data: ShareCardTorneo, W: number, H: number) {
  // Share text — emoji OK for external platforms (canvas-rendered share card image)
  const posEmoji = data.posicion === 1 ? '🥇' : data.posicion === 2 ? '🥈' : data.posicion === 3 ? '🥉' : `#${data.posicion}`
  ctx.textAlign = 'center'; ctx.font = '140px serif'; ctx.fillText(posEmoji, W / 2, 370)

  ctx.font = 'bold 36px Georgia, serif'; ctx.fillStyle = '#c9a84c'
  ctx.fillText(data.torneoNombre.length > 30 ? data.torneoNombre.slice(0, 28) + '…' : data.torneoNombre, W / 2, 420)

  const posTxt = data.posicion === 1 ? 'CAMPEÓN' : data.posicion <= 3 ? `${data.posicion}DO LUGAR` : `POSICIÓN #${data.posicion}`
  ctx.font = 'bold 28px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ;(ctx as any).letterSpacing = '3px'; ctx.fillText(posTxt, W / 2, 462); (ctx as any).letterSpacing = '0px'

  ctx.font = 'bold 64px Georgia, serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(data.jugadorNombre, W / 2, 548)

  const clr = scoreColor(data.scoreDiff)
  ctx.save(); ctx.shadowColor = clr; ctx.shadowBlur = 30
  ctx.font = 'bold 200px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(String(data.scoreGross), W / 2, 760); ctx.restore()

  ctx.font = 'bold 40px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(vsParEnPalabras(data.scoreDiff), W / 2, 815)
  ctx.font = '30px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(`${data.courseName}  ·  ${data.fecha}`, W / 2, 862)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText(`${data.totalJugadores} jugadores`, W / 2, 898)
  if (data.formato_juego) {
    drawHolesBadge(ctx, 18, W / 2, 932)
    drawFormatBadge(ctx, data.formato_juego, data.modo_juego, W / 2, 980)
    drawDivider(ctx, 1013, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, hoyosDesdeElUno(18), 1033, W)
  } else {
    drawHolesBadge(ctx, 18, W / 2, 938)
    drawDivider(ctx, 973, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, hoyosDesdeElUno(18), 998, W)
  }

  // Stableford y Match Play: eagles/birdies no son relevantes.
  const isStabT = data.formato_juego === 'stableford'
  const isMatchT = data.formato_juego === 'match_play'
  const items: string[] = []
  if (!isStabT && !isMatchT) {
    if (data.eagles > 0) items.push(`${data.eagles} eagle${data.eagles > 1 ? 's' : ''}`)
    if (data.birdies > 0) items.push(`${data.birdies} birdie${data.birdies > 1 ? 's' : ''}`)
  }
  if (items.length > 0) { ctx.font = 'bold 30px Arial, sans-serif'; ctx.fillStyle = '#c9a84c'; ctx.textAlign = 'center'; ctx.fillText(items.join('    '), W / 2, 1200) }
}

// ── Generador principal ──────────────────────────────────────────

export async function generarShareCard(data: ShareCardData): Promise<Blob> {
  const W = 1080, H = 1920
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'

  drawBase(ctx, W, H)
  if (data.tipo === 'ronda_libre') dibujarRondaLibre(ctx, data, W, H)
  else dibujarTorneo(ctx, data, W, H)
  drawCTA(ctx, W, H)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/png', 0.95)
  })
}

// ── Compartir con fallbacks ──────────────────────────────────────

/**
 * El score del texto que acompaña la imagen. Con empate (fuera de stableford) es el
 * vs par: los golpes brutos de los empatados pueden diferir y la imagen ya muestra
 * el vs par; antes decía el bruto del primer equipo.
 */
export function scoreDelTextoParaCompartir(data: ShareCardData): string {
  if (data.tipo !== 'ronda_libre') return String(data.scoreGross)
  if (data.formato_juego === 'stableford') return `${data.scoreGross} pts`
  if (data.esEmpate) {
    return data.scoreDiff === 0 ? relacionConElPar(0) : `${formatOverUnder(data.scoreDiff)} ${relacionConElPar(data.scoreDiff)}`
  }
  return `${data.scoreGross} (${formatOverUnder(data.scoreDiff)})`
}

export async function compartirResultado(data: ShareCardData): Promise<{ success: boolean; method: 'share' | 'download' }> {
  const blob = await generarShareCard(data)
  const nombre = data.tipo === 'ronda_libre' ? (data.esEmpate ? 'empate' : data.ganador.split(' ')[0].toLowerCase()) : (data as ShareCardTorneo).jugadorNombre.split(' ')[0].toLowerCase()
  const fileName = `golfers-${nombre}-${Date.now()}.png`
  const file = new File([blob], fileName, { type: 'image/png' })

  const scoreText = scoreDelTextoParaCompartir(data)
  const resultadoDeRondaLibre = (r: ShareCardRondaLibre) =>
    r.contraElPar ? `${r.ganador} jugó contra el par` : r.esEmpate ? 'Empate épico' : `${r.ganador} gano`
  const texto = data.tipo === 'ronda_libre'
    ? `${resultadoDeRondaLibre(data)} en ${data.courseName}! Score: ${scoreText}. Golfers+ golfersplus.vercel.app`
    : `${(data as ShareCardTorneo).jugadorNombre} quedo #${(data as ShareCardTorneo).posicion} en ${(data as ShareCardTorneo).torneoNombre}. Score: ${scoreText}. Golfers+ golfersplus.vercel.app`

  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Resultado — Golfers+', text: texto }); return { success: true, method: 'share' } } catch (e) { if ((e as Error).name === 'AbortError') return { success: false, method: 'share' } }
  }
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title: 'Resultado — Golfers+', text: texto, url: SITE_URL }); return { success: true, method: 'share' } } catch {}
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { success: true, method: 'download' }
}

// ── Leaderboard share (backwards compat) ─────────────────────────

/**
 * La imagen de una ronda por equipos a partir del ranking de equipos, o null
 * si el formato no es por equipos o no hay ranking. Con un solo equipo
 * (`contraElPar`) el título dice "Contra el par" y no hay trofeo.
 */
/** Ranking de la imagen con la misma etiqueta que la tabla: mismo vs par = "T" (sin countback en la ronda libre). */
function rankingDeEquipos(teams: NonNullable<LeaderboardShareData['teams']>): NonNullable<ShareCardRondaLibre['ranking']> {
  const posiciones = posicionesDeEquiposRondaLibre(teams)
  return teams.map((t, i) => ({ nombre: t.nombre, score: t.score, diff: t.diff, holesPlayed: t.holesPlayed, posicion: posiciones[i] }))
}

export function tarjetaDeEquipos(data: LeaderboardShareData): ShareCardRondaLibre | null {
  if (!isTeamFormat(data.formato_juego) || !data.teams || data.teams.length === 0) return null
  // El mismo criterio que el cuadro ganador de la pantalla: por `diff`; y si
  // ningún equipo anotó un hoyo, no hay resultado que compartir.
  const primeros = equiposEnElPrimerLugar(data.teams)
  if (primeros.length === 0) return null
  const winTeam = data.teams[0]
  const isTie = primeros.length > 1
  return {
    tipo: 'ronda_libre',
    ganador: winTeam.nombre,
    esEmpate: isTie,
    jugadores: isTie ? primeros.map(t => t.nombre) : undefined,
    scoreGross: winTeam.score,
    scoreDiff: winTeam.diff,
    courseName: data.courseName,
    fecha: data.fecha,
    birdies: 0, eagles: 0,
    scoresByHole: {}, parsByHole: {},
    holesPlayed: data.totalHoles,
    formato_juego: data.formato_juego,
    modo_juego: data.modo_juego,
    teamNombre: winTeam.nombre,
    teamJugadores: winTeam.jugadores,
    teamFormato: data.formato_juego as 'best_ball' | 'scramble' | 'foursome',
    contraElPar: juegaContraElPar(data.teams.length),
    ranking: rankingDeEquipos(data.teams),
  }
}

export async function compartirLeaderboard(data: LeaderboardShareData): Promise<{ success: boolean; method: 'share' | 'download' }> {
  const winner = data.players[0]
  const isStableford = data.formato_juego === 'stableford'
  const isMatchPlay = data.formato_juego === 'match_play'

  if (isMatchPlay && data.matchResult) {
    // Match Play: el resultado del match es lo que importa ("3&2", "1 UP", "All Square").
    // No hay "ganador por stroke total" — el ganador lo define el estado del match.
    const allSquare = /all\s*square|^a\s*s$/i.test(data.matchResult)
    const cardData: ShareCardRondaLibre = {
      tipo: 'ronda_libre',
      ganador: allSquare ? (data.players.map(p => p.nombre).join(' · ')) : (data.matchWinner ?? winner?.nombre ?? ''),
      esEmpate: allSquare,
      jugadores: allSquare ? data.players.map(p => p.nombre) : undefined,
      scoreGross: 0,
      scoreDiff: 0,
      courseName: data.courseName, fecha: data.fecha,
      birdies: 0, eagles: 0,
      scoresByHole: {}, parsByHole: {},
      holesPlayed: data.totalHoles,
      formato_juego: data.formato_juego,
      modo_juego: data.modo_juego,
      matchResult: data.matchResult,
    }
    return compartirResultado(cardData)
  }

  // Team formats: show team ranking
  const tarjetaPorEquipos = tarjetaDeEquipos(data)
  if (tarjetaPorEquipos) return compartirResultado(tarjetaPorEquipos)

  // Sin ganador individual ni ranking de equipos no hay nada que compartir.
  // Cierra en origen el crash de `winner` undefined en el branch stroke-play
  // (ej: formato por equipos sin parMap → teams vacío → fallthrough acá).
  if (!winner) {
    void captureError(new Error('compartirLeaderboard sin jugador con score ni equipo con hoyos anotados'), {
      context: 'share-card.compartirLeaderboard',
      meta: { formato: data.formato_juego },
    })
    return { success: false, method: 'download' }
  }

  // Stroke Play / Stableford: ranking por vsPar
  // El lugar viene de la tabla (posicionesDelLeaderboard): empate = los que comparten el primer lugar.
  const primeros = data.players.filter(p => esPrimerLugar(p.posicion))
  const isTie = primeros.length > 1
  const parTotal = parTotalEstandar(winner.totalHoles)
  const cardData: ShareCardRondaLibre = {
    tipo: 'ronda_libre', ganador: winner.nombre, esEmpate: isTie,
    jugadores: isTie ? primeros.map(p => p.nombre) : undefined,
    // Stableford: scoreGross = puntos, scoreDiff = 0 (no aplica vs-par)
    scoreGross: isStableford ? winner.vsPar : parTotal + winner.vsPar,
    scoreDiff: isStableford ? 0 : winner.vsPar,
    courseName: data.courseName, fecha: data.fecha, birdies: 0, eagles: 0,
    scoresByHole: {}, parsByHole: {}, holesPlayed: winner.totalHoles,
    formato_juego: data.formato_juego,
    modo_juego: data.modo_juego,
    ranking: data.players.map(p => ({
      nombre: p.nombre,
      score: isStableford ? p.vsPar : parTotalEstandar(p.totalHoles) + p.vsPar,
      diff: isStableford ? 0 : p.vsPar,
      posicion: p.posicion,
    })),
  }
  return compartirResultado(cardData)
}

// ── Builder helper ───────────────────────────────────────────────

export function buildShareCardRondaLibre(params: {
  jugadores: Array<{ nombre: string; scores: Record<string, number>; indice?: number }>
  holesData: Array<{ numero: number; par: number }>
  courseName: string
}): ShareCardRondaLibre {
  const { jugadores, holesData, courseName } = params
  const parsByHole: Record<number, number> = {}; holesData.forEach(h => { parsByHole[h.numero] = h.par })

  // Calcular grossTotal y parPlayed (par REAL de hoyos con score) por jugador.
  // Regla del golf: vsPar = gross - par_jugado, NUNCA gross - par_total fijo.
  const conScore = jugadores.map(j => {
    let grossTotal = 0
    let parPlayed = 0
    for (const [hNum, s] of Object.entries(j.scores ?? {})) {
      const gross = Number(s)
      if (gross > 0) {
        grossTotal += gross
        parPlayed += parsByHole[parseInt(hNum)] ?? 4
      }
    }
    return { ...j, grossTotal, parPlayed }
  }).filter(j => j.grossTotal > 0).sort((a, b) => a.grossTotal - b.grossTotal)

  if (conScore.length === 0) {
    return { tipo: 'ronda_libre', ganador: jugadores[0]?.nombre ?? 'Jugador', esEmpate: false, scoreGross: 0, scoreDiff: 0, courseName, fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }), birdies: 0, eagles: 0, scoresByHole: {}, parsByHole, holesPlayed: holesData.length }
  }

  const min = conScore[0].grossTotal; const ganadores = conScore.filter(j => j.grossTotal === min)
  const g = ganadores[0]; const esEmpate = ganadores.length > 1
  const entries = Object.entries(g.scores ?? {})
  const birdies = entries.filter(([h, s]) => Number(s) === (parsByHole[parseInt(h)] ?? 4) - 1).length
  const eagles = entries.filter(([h, s]) => Number(s) <= (parsByHole[parseInt(h)] ?? 4) - 2).length

  return {
    tipo: 'ronda_libre', ganador: g.nombre, esEmpate,
    jugadores: esEmpate ? ganadores.map(x => x.nombre) : undefined,
    scoreGross: g.grossTotal, scoreDiff: g.grossTotal - g.parPlayed, courseName,
    fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
    birdies, eagles, scoresByHole: g.scores ?? {}, parsByHole, holesPlayed: holesData.length,
    ranking: conScore.map(j => ({ nombre: j.nombre, score: j.grossTotal, diff: j.grossTotal - j.parPlayed })),
  }
}
