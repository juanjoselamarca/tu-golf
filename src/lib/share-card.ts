/* client-only — solo importar desde componentes con 'use client' */

export interface ShareCardData {
  ganador: string
  scoreGross: number
  scoreDiff: number
  courseName: string
  fecha: string
  birdies: number
  eagles: number
  scoresByHole: Record<string | number, number>
  parsByHole: Record<number, number>
  holesPlayed: number
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

export async function generarShareCard(data: ShareCardData): Promise<Blob> {
  const W = 1080, H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
  bg.addColorStop(0, '#071510')
  bg.addColorStop(0.3, '#0d1f16')
  bg.addColorStop(0.7, '#111827')
  bg.addColorStop(1, '#080c10')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle texture lines
  ctx.strokeStyle = 'rgba(255,255,255,0.012)'
  ctx.lineWidth = 1
  for (let i = -H; i < W + H; i += 50) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke()
  }

  // Center glow
  const glow = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.8)
  glow.addColorStop(0, 'rgba(201,168,76,0.08)')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Gold border
  ctx.strokeStyle = 'rgba(201,168,76,0.5)'
  ctx.lineWidth = 3
  ctx.strokeRect(20, 20, W - 40, H - 40)

  // Corner decorations
  const cL = 60, cP = 20
  ctx.strokeStyle = 'rgba(201,168,76,0.8)'
  ctx.lineWidth = 2.5
  const corners = [
    [[cP, cP + cL], [cP, cP], [cP + cL, cP]],
    [[W - cP - cL, cP], [W - cP, cP], [W - cP, cP + cL]],
    [[cP, H - cP - cL], [cP, H - cP], [cP + cL, H - cP]],
    [[W - cP - cL, H - cP], [W - cP, H - cP], [W - cP, H - cP - cL]],
  ]
  corners.forEach(pts => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    ctx.lineTo(pts[1][0], pts[1][1])
    ctx.lineTo(pts[2][0], pts[2][1])
    ctx.stroke()
  })

  // Logo
  ctx.textAlign = 'center'
  ctx.font = 'bold 58px Georgia, serif'
  ctx.fillStyle = '#c9a84c'
  ctx.fillText('Golfers+', W / 2, 120)
  ctx.font = '26px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('EL GOLF AMATEUR EN ESPAÑOL', W / 2, 158)

  // Divider
  const div1 = ctx.createLinearGradient(80, 0, W - 80, 0)
  div1.addColorStop(0, 'transparent')
  div1.addColorStop(0.5, 'rgba(201,168,76,0.7)')
  div1.addColorStop(1, 'transparent')
  ctx.strokeStyle = div1
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(80, 185); ctx.lineTo(W - 80, 185); ctx.stroke()

  // Trophy
  ctx.font = '200px serif'
  ctx.textAlign = 'center'
  ctx.fillText('🏆', W / 2, 450)

  // Title
  ctx.font = 'bold 28px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('RONDA COMPLETADA', W / 2, 510)

  // Player name
  ctx.font = 'bold 76px Georgia, serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(data.ganador, W / 2, 600)

  // Score
  const scoreColor = data.scoreDiff < 0 ? '#4ade80' : data.scoreDiff === 0 ? '#c9a84c' : '#f87171'
  ctx.font = 'bold 220px Arial, sans-serif'
  ctx.fillStyle = scoreColor
  ctx.shadowColor = scoreColor
  ctx.shadowBlur = 40
  ctx.fillText(String(data.scoreGross), W / 2, 840)
  ctx.shadowBlur = 0

  // Diff
  const diffText = data.scoreDiff === 0 ? 'Par' : data.scoreDiff > 0 ? `+${data.scoreDiff} sobre par` : `${data.scoreDiff} bajo par`
  ctx.font = 'bold 46px Arial, sans-serif'
  ctx.fillStyle = scoreColor
  ctx.fillText(diffText, W / 2, 900)

  // Course + date
  ctx.font = '34px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText(`${data.courseName}  ·  ${data.fecha}`, W / 2, 955)

  // Divider 2
  ctx.strokeStyle = div1
  ctx.beginPath(); ctx.moveTo(80, 985); ctx.lineTo(W - 80, 985); ctx.stroke()

  // Scorecard
  const boxW = 96, boxH = 84, gapX = 6, gapY = 8
  const totalW = 9 * boxW + 8 * gapX
  const startX = (W - totalW) / 2

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 9; col++) {
      if (row * 9 + col + 1 > data.holesPlayed) break
      const hole = row * 9 + col + 1
      const score = data.scoresByHole[hole] ?? data.scoresByHole[String(hole)]
      const par = data.parsByHole[hole] ?? 4
      const diff = score != null ? score - par : null

      const x = startX + col * (boxW + gapX)
      const y = 1010 + row * (boxH + gapY)

      let bgColor = 'rgba(255,255,255,0.06)', textClr = 'rgba(255,255,255,0.25)', borderClr = 'rgba(255,255,255,0.08)', bw = 1
      if (diff !== null) {
        if (diff <= -2) { bgColor = 'rgba(201,168,76,0.25)'; textClr = '#c9a84c'; borderClr = 'rgba(201,168,76,0.7)'; bw = 2 }
        else if (diff === -1) { bgColor = 'rgba(74,222,128,0.2)'; textClr = '#4ade80'; borderClr = 'rgba(74,222,128,0.6)'; bw = 2 }
        else if (diff === 0) { bgColor = 'rgba(255,255,255,0.06)'; textClr = 'rgba(255,255,255,0.75)'; borderClr = 'rgba(255,255,255,0.18)' }
        else if (diff === 1) { bgColor = 'rgba(217,119,6,0.18)'; textClr = '#f59e0b'; borderClr = 'rgba(217,119,6,0.45)' }
        else { bgColor = 'rgba(248,113,113,0.2)'; textClr = '#f87171'; borderClr = 'rgba(248,113,113,0.5)'; bw = 2 }
      }

      roundRect(ctx, x, y, boxW, boxH, 10)
      ctx.fillStyle = bgColor; ctx.fill()
      ctx.strokeStyle = borderClr; ctx.lineWidth = bw; ctx.stroke()

      ctx.font = '18px Arial, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.textAlign = 'center'
      ctx.fillText(String(hole), x + boxW / 2, y + 24)

      ctx.font = 'bold 38px Arial, sans-serif'
      ctx.fillStyle = textClr
      ctx.fillText(score != null ? String(score) : '–', x + boxW / 2, y + 66)
    }
  }

  // Stats
  const statsY = 1210
  const statsItems: string[] = []
  if (data.eagles > 0) statsItems.push(`${data.eagles} eagle${data.eagles > 1 ? 's' : ''}`)
  if (data.birdies > 0) statsItems.push(`${data.birdies} birdie${data.birdies > 1 ? 's' : ''}`)
  if (statsItems.length > 0) {
    ctx.fillStyle = '#c9a84c'
    ctx.font = 'bold 32px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(statsItems.join('    '), W / 2, statsY)
  }

  // CTA box
  const ctaY = H - 380
  roundRect(ctx, 80, ctaY, W - 160, 200, 20)
  const ctaBg = ctx.createLinearGradient(80, ctaY, W - 80, ctaY + 200)
  ctaBg.addColorStop(0, 'rgba(201,168,76,0.15)')
  ctaBg.addColorStop(1, 'rgba(201,168,76,0.05)')
  ctx.fillStyle = ctaBg; ctx.fill()
  ctx.strokeStyle = 'rgba(201,168,76,0.4)'; ctx.lineWidth = 1; ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = 'bold 40px Georgia, serif'
  ctx.fillStyle = '#c9a84c'
  ctx.fillText('Scoring · IA Coach · Live Leaderboard', W / 2, ctaY + 65)
  ctx.font = '38px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText('tu-golf.vercel.app', W / 2, ctaY + 118)
  ctx.font = '28px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('Primera plataforma de golf en español', W / 2, ctaY + 158)

  // Footer
  ctx.font = 'bold 30px Arial, sans-serif'
  ctx.fillStyle = 'rgba(201,168,76,0.6)'
  ctx.fillText('#GolfersMas  ⛳  #GolfLatAm', W / 2, H - 130)
  ctx.font = '24px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillText('Golfers+ — El golf amateur en español', W / 2, H - 80)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/png',
      0.95
    )
  })
}

export async function compartirResultado(data: ShareCardData): Promise<{ success: boolean; method: 'share' | 'download' }> {
  const blob = await generarShareCard(data)
  const fileName = `golfers-${data.ganador.split(' ')[0].toLowerCase()}-${Date.now()}.png`
  const file = new File([blob], fileName, { type: 'image/png' })

  const texto = `${data.ganador} completó la ronda en ${data.courseName}! Score: ${data.scoreGross} (${data.scoreDiff >= 0 ? '+' : ''}${data.scoreDiff}). Jugado en Golfers+ 🏆 tu-golf.vercel.app`

  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Resultado — Golfers+', text: texto })
      return { success: true, method: 'share' }
    } catch { /* user cancelled or error */ }
  }

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Resultado — Golfers+', text: texto, url: 'https://tu-golf.vercel.app' })
      return { success: true, method: 'share' }
    } catch { /* fallback */ }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { success: true, method: 'download' }
}
