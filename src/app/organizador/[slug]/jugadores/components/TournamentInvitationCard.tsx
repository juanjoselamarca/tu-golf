'use client'

import { useCallback, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { copyToClipboard } from '@/lib/clipboard'

interface Props {
  slug: string
  codigo: string
  tournamentName?: string
}

/** Tarjeta de invitación: QR + copiar link de unirse + código del torneo.
 *  El QR codifica la URL de inscripción para que el organizador lo imprima
 *  o lo proyecte en el club y los jugadores escaneen con el celular. */
export function TournamentInvitationCard({ slug, codigo, tournamentName }: Props) {
  const [codeCopied, setCodeCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/torneo/${slug}/unirse`
    : `https://golfersplus.vercel.app/torneo/${slug}/unirse`

  const handleDownloadQR = useCallback(() => {
    const svgEl = qrRef.current?.querySelector('svg')
    if (!svgEl) return

    const svgData = new XMLSerializer().serializeToString(svgEl)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      // QR 200px + padding 40px each side + text below
      const pad = 40
      const textHeight = tournamentName ? 50 : 20
      canvas.width = 200 + pad * 2
      canvas.height = 200 + pad * 2 + textHeight

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, pad, pad, 200, 200)

      if (tournamentName) {
        ctx.fillStyle = '#1a1a2e'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(tournamentName, canvas.width / 2, 200 + pad + 24)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = '#666666'
        ctx.fillText(`Codigo: ${codigo}`, canvas.width / 2, 200 + pad + 42)
      }

      const link = document.createElement('a')
      link.download = `qr-torneo-${slug}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`
  }, [slug, codigo, tournamentName])

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-md)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        padding: '24px 28px',
        marginBottom: '24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
        Invitar jugadores
      </div>

      {/* QR Code */}
      <div
        ref={qrRef}
        style={{
          display: 'inline-block',
          background: '#ffffff',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '12px',
        }}
      >
        <QRCodeSVG
          value={joinUrl}
          size={180}
          level="M"
          bgColor="#ffffff"
          fgColor="#1a1a2e"
        />
      </div>

      {tournamentName && (
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
          {tournamentName}
        </div>
      )}

      <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '14px' }}>
        Escanea para inscribirte
      </div>

      {/* Download QR button */}
      <button
        type="button"
        onClick={handleDownloadQR}
        style={{
          background: 'none',
          border: '1px solid var(--border-md)',
          color: 'var(--text-2)',
          padding: '6px 16px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 200ms',
          marginBottom: '14px',
        }}
      >
        Descargar QR
      </button>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '2px' }} />

      {/* Copy link button - primary action */}
      <button
        type="button"
        onClick={async () => {
          if (await copyToClipboard(joinUrl)) {
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2500)
          }
        }}
        style={{
          background: linkCopied ? 'rgba(34,197,94,0.15)' : '#c4992a',
          border: linkCopied ? '1px solid rgba(34,197,94,0.4)' : '1px solid #c4992a',
          color: linkCopied ? '#22c55e' : 'var(--brand-dark)',
          padding: '12px 28px',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 200ms',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        {linkCopied ? 'Link copiado!' : 'Copiar link de invitacion'}
      </button>

      {/* Code reference - secondary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>Codigo:</span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--brand-on-bg)',
            letterSpacing: '0.1em',
          }}
        >
          {codigo}
        </span>
        <button
          type="button"
          onClick={async () => {
            if (await copyToClipboard(codigo)) {
              setCodeCopied(true)
              setTimeout(() => setCodeCopied(false), 2000)
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: codeCopied ? '#22c55e' : 'var(--text-2)',
            padding: '2px 6px',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
          }}
        >
          {codeCopied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
