/* client-only — importar solo desde componentes con 'use client' */

import { parTotalEstandar } from '@/golf/core/round-score'

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
  ranking?: Array<{ nombre: string; score: number; diff: number }>
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
}

export type ShareCardData = ShareCardRondaLibre | ShareCardTorneo

// Keep backwards compat
export interface LeaderboardPlayer { nombre: string; vsPar: number; holesPlayed: number; totalHoles: number }
export interface LeaderboardShareData { players: LeaderboardPlayer[]; courseName: string; fecha: string; rondaCodigo: string; isFinished: boolean }

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
  return diff < 0 ? '#4ade80' : diff === 0 ? '#c9a84c' : '#f87171'
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

function drawScorecard(ctx: CanvasRenderingContext2D, scores: Record<string | number, number>, pars: Record<number, number>, holes: number, startY: number, W: number) {
  const boxW = 90, boxH = 80, gapX = 5, gapY = 6
  const totalW = 9 * boxW + 8 * gapX; const startX = (W - totalW) / 2

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 9; col++) {
      const h = row * 9 + col + 1; if (h > holes) break
      const s = scores[h] ?? scores[String(h)]; const p = pars[h] ?? 4
      const d = s != null ? s - p : null
      const x = startX + col * (boxW + gapX); const y = startY + row * (boxH + gapY)

      let bg = 'rgba(255,255,255,0.05)', tc = 'rgba(255,255,255,0.22)', bc = 'rgba(255,255,255,0.07)', bw = 1
      if (d !== null) {
        if (d <= -2) { bg = 'rgba(201,168,76,0.22)'; tc = '#c9a84c'; bc = 'rgba(201,168,76,0.65)'; bw = 2 }
        else if (d === -1) { bg = 'rgba(74,222,128,0.18)'; tc = '#4ade80'; bc = 'rgba(74,222,128,0.55)'; bw = 2 }
        else if (d === 0) { bg = 'rgba(255,255,255,0.05)'; tc = 'rgba(255,255,255,0.72)'; bc = 'rgba(255,255,255,0.16)' }
        else if (d === 1) { bg = 'rgba(217,119,6,0.16)'; tc = '#f59e0b'; bc = 'rgba(217,119,6,0.42)' }
        else { bg = 'rgba(248,113,113,0.18)'; tc = '#f87171'; bc = 'rgba(248,113,113,0.48)'; bw = 2 }
      }

      roundRect(ctx, x, y, boxW, boxH, 9); ctx.fillStyle = bg; ctx.fill()
      ctx.strokeStyle = bc; ctx.lineWidth = bw; ctx.stroke()
      ctx.textAlign = 'center'
      ctx.font = '16px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillText(String(h), x + boxW / 2, y + 21)
      ctx.font = 'bold 36px Arial, sans-serif'; ctx.fillStyle = tc; ctx.fillText(s != null ? String(s) : '–', x + boxW / 2, y + 63)
    }
  }
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

  ctx.font = 'bold 26px Arial, sans-serif'; ctx.fillStyle = 'rgba(201,168,76,0.55)'; ctx.fillText('#GolfersMas  ⛳  #GolfLatAm', W / 2, H - 130)
  ctx.font = '22px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillText('Golfers+ — El golf amateur en español', W / 2, H - 80)
}

// ── Template: Ronda Libre ────────────────────────────────────────

function dibujarRondaLibre(ctx: CanvasRenderingContext2D, data: ShareCardRondaLibre, W: number, H: number) {
  ctx.textAlign = 'center'
  ctx.font = '180px serif'; ctx.fillText(data.esEmpate ? '🤝' : '🏆', W / 2, 420)

  ctx.font = 'bold 24px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ;(ctx as any).letterSpacing = '3px'
  ctx.fillText(data.esEmpate ? 'EMPATE ÉPICO' : 'GANADOR DE LA RONDA', W / 2, 470)
  ;(ctx as any).letterSpacing = '0px'

  const name = data.esEmpate && data.jugadores ? data.jugadores.map(n => n.split(' ')[0]).join(' · ') : data.ganador
  ctx.font = 'bold 68px Georgia, serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(name, W / 2, 560)

  const clr = scoreColor(data.scoreDiff)
  ctx.save(); ctx.shadowColor = clr; ctx.shadowBlur = 35
  ctx.font = 'bold 210px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(String(data.scoreGross), W / 2, 790)
  ctx.restore()

  const diffTxt = data.scoreDiff === 0 ? 'Par' : data.scoreDiff > 0 ? `+${data.scoreDiff} sobre par` : `${data.scoreDiff} bajo par`
  ctx.font = 'bold 42px Arial, sans-serif'; ctx.fillStyle = clr; ctx.fillText(diffTxt, W / 2, 848)
  ctx.font = '32px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(`${data.courseName}  ·  ${data.fecha}`, W / 2, 900)

  drawDivider(ctx, 930, W)
  drawScorecard(ctx, data.scoresByHole, data.parsByHole, data.holesPlayed, 955, W)

  const statsY = 1170
  const items: string[] = []
  if (data.eagles > 0) items.push(`${data.eagles} eagle${data.eagles > 1 ? 's' : ''}`)
  if (data.birdies > 0) items.push(`${data.birdies} birdie${data.birdies > 1 ? 's' : ''}`)
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
      ctx.textAlign = 'right'; ctx.font = 'bold 28px Arial, sans-serif'; ctx.fillStyle = scoreColor(j.diff)
      ctx.fillText(`${j.score} (${j.diff >= 0 ? '+' : ''}${j.diff})`, W - 110, ly + 36)
    })
  }
}

// ── Template: Torneo ─────────────────────────────────────────────

function dibujarTorneo(ctx: CanvasRenderingContext2D, data: ShareCardTorneo, W: number, H: number) {
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

  drawDivider(ctx, 928, W)
  drawScorecard(ctx, data.scoresByHole, data.parsByHole, 18, 953, W)

  const items: string[] = []
  if (data.eagles > 0) items.push(`${data.eagles} eagle${data.eagles > 1 ? 's' : ''}`)
  if (data.birdies > 0) items.push(`${data.birdies} birdie${data.birdies > 1 ? 's' : ''}`)
  if (items.length > 0) { ctx.font = 'bold 30px Arial, sans-serif'; ctx.fillStyle = '#c9a84c'; ctx.textAlign = 'center'; ctx.fillText(items.join('    '), W / 2, 1168) }
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

  const texto = data.tipo === 'ronda_libre'
    ? `${data.esEmpate ? 'Empate épico' : data.ganador + ' gano'} en ${data.courseName}! Score: ${data.scoreGross} (${data.scoreDiff >= 0 ? '+' : ''}${data.scoreDiff}). Golfers+ golfersplus.vercel.app`
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
  // Convert to ronda_libre format
  const winner = data.players[0]
  const isTie = data.players.length > 1 && data.players[1].vsPar === winner.vsPar
  // FIX: calcular parTotal real según hoyos jugados (no hardcoded 72)
  const parTotal = parTotalEstandar(winner.totalHoles)
  const cardData: ShareCardRondaLibre = {
    tipo: 'ronda_libre', ganador: winner.nombre, esEmpate: isTie,
    jugadores: isTie ? data.players.filter(p => p.vsPar === winner.vsPar).map(p => p.nombre) : undefined,
    scoreGross: parTotal + winner.vsPar, scoreDiff: winner.vsPar,
    courseName: data.courseName, fecha: data.fecha, birdies: 0, eagles: 0,
    scoresByHole: {}, parsByHole: {}, holesPlayed: winner.totalHoles,
    ranking: data.players.map(p => ({ nombre: p.nombre, score: parTotalEstandar(p.totalHoles) + p.vsPar, diff: p.vsPar })),
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
  const parTotal = holesData.length > 0 ? holesData.reduce((a, h) => a + h.par, 0) : 72
  const parsByHole: Record<number, number> = {}; holesData.forEach(h => { parsByHole[h.numero] = h.par })

  const conScore = jugadores.map(j => ({
    ...j, grossTotal: Object.values(j.scores ?? {}).reduce((a, b) => a + Number(b), 0),
  })).filter(j => j.grossTotal > 0).sort((a, b) => a.grossTotal - b.grossTotal)

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
    scoreGross: g.grossTotal, scoreDiff: g.grossTotal - parTotal, courseName,
    fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
    birdies, eagles, scoresByHole: g.scores ?? {}, parsByHole, holesPlayed: holesData.length,
    ranking: conScore.map(j => ({ nombre: j.nombre, score: j.grossTotal, diff: j.grossTotal - parTotal })),
  }
}
