/* client-only — importar solo desde componentes con 'use client' */

import { parTotalEstandar } from '@/golf/core/round-score'
import { formatLabel, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { isTeamFormat } from '@/golf/formats'

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
  formato_juego?: FormatoJuego | string
  modo_juego?: ModoJuego | string | null
  ranking?: Array<{ nombre: string; score: number; diff: number }>
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
export interface LeaderboardPlayer { nombre: string; vsPar: number; holesPlayed: number; totalHoles: number }
export interface LeaderboardShareData {
  players: LeaderboardPlayer[]
  courseName: string
  fecha: string
  rondaCodigo: string
  isFinished: boolean
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

function drawScorecard(ctx: CanvasRenderingContext2D, scores: Record<string | number, number>, pars: Record<number, number>, holes: number, startY: number, W: number) {
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
    for (let col = 0; col < 9; col++) {
      const h = row * 9 + col + 1
      if (h > holes) break
      ctx.fillText(String(h), gridX + col * cellW + cellW / 2, headerY + 8)
    }
    // OUT / IN label
    ctx.fillStyle = '#c4992a'; ctx.font = 'bold 14px Arial, sans-serif'
    ctx.fillText(row === 0 ? 'OUT' : 'IN', gridX + 9 * cellW + cellW / 2, headerY + 8)

    // Score row: number + Garmin symbol
    let rowTotal = 0; let rowHasAll = true
    for (let col = 0; col < 9; col++) {
      const h = row * 9 + col + 1
      if (h > holes) { rowHasAll = false; break }
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

  const grandTotal = Array.from({ length: holes }, (_, i) => {
    const h = i + 1; const s = scores[h] ?? scores[String(h)]
    return typeof s === 'number' ? s : 0
  }).reduce((a, b) => a + b, 0)
  const grandPar = Array.from({ length: holes }, (_, i) => pars[i + 1] ?? 4).reduce((a, b) => a + b, 0)
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

function dibujarRondaLibre(ctx: CanvasRenderingContext2D, data: ShareCardRondaLibre, W: number, H: number) {
  ctx.textAlign = 'center'
  // Share text — emoji OK for external platforms (canvas-rendered share card image)
  ctx.font = '180px serif'; ctx.fillText(data.esEmpate ? '🤝' : '🏆', W / 2, 420)

  ctx.font = 'bold 24px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ;(ctx as any).letterSpacing = '3px'
  const isTeam = !!data.teamNombre
  const headerLabel = isTeam ? 'EQUIPO GANADOR' : (data.esEmpate ? 'EMPATE ÉPICO' : 'GANADOR DE LA RONDA')
  ctx.fillText(headerLabel, W / 2, 470)
  ;(ctx as any).letterSpacing = '0px'

  const name = isTeam ? data.teamNombre! : (data.esEmpate && data.jugadores ? data.jugadores.map(n => n.split(' ')[0]).join(' · ') : data.ganador)
  ctx.font = 'bold 68px Georgia, serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(name, W / 2, 560)

  // Team members subtitle
  if (isTeam && data.teamJugadores && data.teamJugadores.length > 0) {
    ctx.font = '28px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(data.teamJugadores.join(' \u00B7 '), W / 2, 600)
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
    ctx.save(); ctx.shadowColor = clr; ctx.shadowBlur = 35
    ctx.font = 'bold 210px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(String(data.scoreGross), W / 2, 790)
    ctx.restore()
    if (isStableford) {
      ctx.font = 'bold 42px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText('puntos', W / 2, 848)
    } else {
      const diffTxt = data.scoreDiff === 0 ? 'Par' : data.scoreDiff > 0 ? `+${data.scoreDiff} sobre par` : `${data.scoreDiff} bajo par`
      ctx.font = 'bold 42px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(diffTxt, W / 2, 848)
    }
  }
  ctx.font = '32px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(`${data.courseName}  ·  ${data.fecha}`, W / 2, 900)
  // Badges: holes + formato (si hay formato, los ponemos apilados para no chocar)
  if (data.formato_juego) {
    drawHolesBadge(ctx, data.holesPlayed, W / 2, 935)
    drawFormatBadge(ctx, data.formato_juego, data.modo_juego, W / 2, 982)
    drawDivider(ctx, 1015, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, data.holesPlayed, 1035, W)
  } else {
    drawHolesBadge(ctx, data.holesPlayed, W / 2, 940)
    drawDivider(ctx, 975, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, data.holesPlayed, 1000, W)
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
      ctx.textAlign = 'left'; ctx.font = `${i === 0 ? 'bold ' : ''}28px Arial, sans-serif`
      ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.45)'; ctx.fillText(`${i + 1}. ${j.nombre}`, 110, ly + 36)
      ctx.textAlign = 'right'; ctx.font = 'bold 28px Arial, sans-serif'
      if (isStableford) {
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

  const diffTxt = data.scoreDiff === 0 ? 'Par' : data.scoreDiff > 0 ? `+${data.scoreDiff} sobre par` : `${data.scoreDiff} bajo par`
  ctx.font = 'bold 40px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(diffTxt, W / 2, 815)
  ctx.font = '30px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(`${data.courseName}  ·  ${data.fecha}`, W / 2, 862)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText(`${data.totalJugadores} jugadores`, W / 2, 898)
  if (data.formato_juego) {
    drawHolesBadge(ctx, 18, W / 2, 932)
    drawFormatBadge(ctx, data.formato_juego, data.modo_juego, W / 2, 980)
    drawDivider(ctx, 1013, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, 18, 1033, W)
  } else {
    drawHolesBadge(ctx, 18, W / 2, 938)
    drawDivider(ctx, 973, W)
    drawScorecard(ctx, data.scoresByHole, data.parsByHole, 18, 998, W)
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

export async function compartirResultado(data: ShareCardData): Promise<{ success: boolean; method: 'share' | 'download' }> {
  const blob = await generarShareCard(data)
  const nombre = data.tipo === 'ronda_libre' ? (data.esEmpate ? 'empate' : data.ganador.split(' ')[0].toLowerCase()) : (data as ShareCardTorneo).jugadorNombre.split(' ')[0].toLowerCase()
  const fileName = `golfers-${nombre}-${Date.now()}.png`
  const file = new File([blob], fileName, { type: 'image/png' })

  const isStab = data.tipo === 'ronda_libre' && data.formato_juego === 'stableford'
  const scoreText = isStab
    ? `${data.scoreGross} pts`
    : `${data.scoreGross} (${(data as ShareCardRondaLibre).scoreDiff >= 0 ? '+' : ''}${(data as ShareCardRondaLibre).scoreDiff})`
  const texto = data.tipo === 'ronda_libre'
    ? `${data.esEmpate ? 'Empate épico' : data.ganador + ' gano'} en ${data.courseName}! Score: ${scoreText}. Golfers+ golfersplus.vercel.app`
    : `${(data as ShareCardTorneo).jugadorNombre} quedo #${(data as ShareCardTorneo).posicion} en ${(data as ShareCardTorneo).torneoNombre}. Score: ${data.scoreGross}. Golfers+ golfersplus.vercel.app`

  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Resultado — Golfers+', text: texto }); return { success: true, method: 'share' } } catch (e) { if ((e as Error).name === 'AbortError') return { success: false, method: 'share' } }
  }
  if (typeof navigator.share === 'function') {
    try { const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'; await navigator.share({ title: 'Resultado — Golfers+', text: texto, url: siteUrl }); return { success: true, method: 'share' } } catch {}
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { success: true, method: 'download' }
}

// ── Leaderboard share (backwards compat) ─────────────────────────

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
      ganador: allSquare ? (data.players.map(p => p.nombre).join(' · ')) : (data.matchWinner ?? winner.nombre),
      esEmpate: allSquare,
      jugadores: allSquare ? data.players.map(p => p.nombre) : undefined,
      scoreGross: 0,
      scoreDiff: 0,
      courseName: data.courseName, fecha: data.fecha,
      birdies: 0, eagles: 0,
      scoresByHole: {}, parsByHole: {},
      holesPlayed: winner.totalHoles,
      formato_juego: data.formato_juego,
      modo_juego: data.modo_juego,
      matchResult: data.matchResult,
    }
    return compartirResultado(cardData)
  }

  // Team formats: show team ranking
  if (isTeamFormat(data.formato_juego) && data.teams && data.teams.length > 0) {
    const winTeam = data.teams[0]
    const isTie = data.teams.length > 1 && data.teams[1].score === winTeam.score
    const cardData: ShareCardRondaLibre = {
      tipo: 'ronda_libre',
      ganador: winTeam.nombre,
      esEmpate: isTie,
      jugadores: isTie ? data.teams.filter(t => t.score === winTeam.score).map(t => t.nombre) : undefined,
      scoreGross: winTeam.score,
      scoreDiff: winTeam.diff,
      courseName: data.courseName,
      fecha: data.fecha,
      birdies: 0, eagles: 0,
      scoresByHole: {}, parsByHole: {},
      holesPlayed: winner.totalHoles,
      formato_juego: data.formato_juego,
      modo_juego: data.modo_juego,
      teamNombre: winTeam.nombre,
      teamJugadores: winTeam.jugadores,
      teamFormato: data.formato_juego as 'best_ball' | 'scramble' | 'foursome',
      ranking: data.teams.map(t => ({ nombre: t.nombre, score: t.score, diff: t.diff })),
    }
    return compartirResultado(cardData)
  }

  // Stroke Play / Stableford: ranking por vsPar
  const isTie = data.players.length > 1 && data.players[1].vsPar === winner.vsPar
  const parTotal = parTotalEstandar(winner.totalHoles)
  const cardData: ShareCardRondaLibre = {
    tipo: 'ronda_libre', ganador: winner.nombre, esEmpate: isTie,
    jugadores: isTie ? data.players.filter(p => p.vsPar === winner.vsPar).map(p => p.nombre) : undefined,
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
