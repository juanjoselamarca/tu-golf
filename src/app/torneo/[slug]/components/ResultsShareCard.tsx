'use client'

import { useCallback } from 'react'

interface PodiumEntry {
  pos: number
  name: string
  score: string
}

interface ResultsShareCardProps {
  tournamentName: string
  courseName: string
  dateDisplay: string
  topPlayers: PodiumEntry[]
  totalPlayers: number
}

/**
 * Genera una imagen PNG 600x600 con los resultados del torneo usando Canvas API.
 * Diseño: fondo oscuro navy, branding dorado, podio top 3.
 * Sin dependencias externas.
 */
function drawResultsCard(
  canvas: HTMLCanvasElement,
  props: Omit<ResultsShareCardProps, 'totalPlayers'> & { totalPlayers: number },
) {
  const { tournamentName, courseName, dateDisplay, topPlayers, totalPlayers } = props
  const W = 600
  const H = 600
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Fondo con gradiente oscuro
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
  bgGrad.addColorStop(0, '#0e1c2f')
  bgGrad.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, W, H)

  // Borde sutil dorado
  ctx.strokeStyle = 'rgba(196, 153, 42, 0.3)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)

  // Header — branding
  ctx.fillStyle = '#c4992a'
  ctx.font = '600 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('GOLFERS+', W / 2, 40)

  // Linea decorativa
  ctx.strokeStyle = 'rgba(196, 153, 42, 0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(W / 2 - 60, 52)
  ctx.lineTo(W / 2 + 60, 52)
  ctx.stroke()

  // Nombre del torneo
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 22px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'

  // Wrap del nombre si es largo
  const maxNameWidth = W - 80
  const words = tournamentName.split(' ')
  const nameLines: string[] = []
  let currentLine = ''
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(testLine).width > maxNameWidth && currentLine) {
      nameLines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) nameLines.push(currentLine)

  let nameY = 82
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, nameY)
    nameY += 28
  }

  // Subtitulo: cancha + fecha
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.font = '400 13px system-ui, -apple-system, sans-serif'
  const subtitle = [courseName, dateDisplay].filter(Boolean).join('  |  ')
  ctx.fillText(subtitle, W / 2, nameY + 8)

  // Separador
  const sepY = nameY + 30
  ctx.strokeStyle = 'rgba(196, 153, 42, 0.2)'
  ctx.beginPath()
  ctx.moveTo(40, sepY)
  ctx.lineTo(W - 40, sepY)
  ctx.stroke()

  // Label "RESULTADOS"
  ctx.fillStyle = 'rgba(196, 153, 42, 0.7)'
  ctx.font = '600 11px system-ui, -apple-system, sans-serif'
  ctx.fillText('RESULTADOS', W / 2, sepY + 24)

  // Podio
  const startY = sepY + 50
  const entryH = 52
  const top = topPlayers.slice(0, 5)

  top.forEach((entry, i) => {
    const y = startY + i * entryH

    // Fondo sutil para el #1
    if (entry.pos === 1) {
      ctx.fillStyle = 'rgba(196, 153, 42, 0.08)'
      const rH = 44
      const rX = 50
      const rW = W - 100
      const rY = y - 28
      const r = 8
      ctx.beginPath()
      ctx.moveTo(rX + r, rY)
      ctx.lineTo(rX + rW - r, rY)
      ctx.quadraticCurveTo(rX + rW, rY, rX + rW, rY + r)
      ctx.lineTo(rX + rW, rY + rH - r)
      ctx.quadraticCurveTo(rX + rW, rY + rH, rX + rW - r, rY + rH)
      ctx.lineTo(rX + r, rY + rH)
      ctx.quadraticCurveTo(rX, rY + rH, rX, rY + rH - r)
      ctx.lineTo(rX, rY + r)
      ctx.quadraticCurveTo(rX, rY, rX + r, rY)
      ctx.closePath()
      ctx.fill()
    }

    // Posicion
    const posColors: Record<number, string> = {
      1: '#c4992a',
      2: '#a0aec0',
      3: '#cd7f32',
    }
    ctx.fillStyle = posColors[entry.pos] ?? 'rgba(255, 255, 255, 0.4)'
    ctx.font = '700 16px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${entry.pos}.`, 80, y)

    // Nombre
    ctx.fillStyle = entry.pos === 1 ? '#c4992a' : '#ffffff'
    ctx.font = entry.pos === 1 ? '700 16px system-ui, -apple-system, sans-serif' : '500 15px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'left'

    // Truncar nombre si es largo
    let displayName = entry.name
    while (ctx.measureText(displayName).width > 300 && displayName.length > 3) {
      displayName = displayName.slice(0, -1)
    }
    if (displayName !== entry.name) displayName += '...'
    ctx.fillText(displayName, 110, y)

    // Score
    ctx.fillStyle = entry.pos === 1 ? '#c4992a' : 'rgba(255, 255, 255, 0.7)'
    ctx.font = '700 16px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(entry.score, W - 80, y)
  })

  // Footer
  const footerY = H - 40
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.font = '400 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${totalPlayers} jugadores  |  golfersplus.vercel.app`, W / 2, footerY)
}

export function ResultsShareCard({
  tournamentName,
  courseName,
  dateDisplay,
  topPlayers,
  totalPlayers,
}: ResultsShareCardProps) {
  const handleDownload = useCallback(() => {
    const canvas = document.createElement('canvas')
    drawResultsCard(canvas, { tournamentName, courseName, dateDisplay, topPlayers, totalPlayers })

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resultados-${encodeURIComponent(tournamentName.toLowerCase().replace(/\s+/g, '-'))}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [tournamentName, courseName, dateDisplay, topPlayers, totalPlayers])

  return (
    <button
      onClick={handleDownload}
      style={{
        background: 'rgba(196,153,42,0.12)',
        border: '1px solid var(--border-md)',
        color: 'var(--brand-on-bg)',
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 200ms',
        marginLeft: '8px',
        minHeight: '44px',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Descargar imagen
    </button>
  )
}
