'use client'

import { useCallback, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { copyToClipboard } from '@/lib/clipboard'
import { SITE_URL } from '@/lib/site-url'

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

      {/* WhatsApp share - primary CTA */}
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`Te invito al torneo ${tournamentName ?? 'de golf'} en Golfers+. Inscr\u00edbete ac\u00e1: ${SITE_URL}/torneo/${slug}/unirse`)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          background: '#25D366',
          border: '1px solid #25D366',
          color: '#ffffff',
          padding: '12px 28px',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 200ms',
          textDecoration: 'none',
          marginBottom: '10px',
          minHeight: '44px',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Compartir por WhatsApp
      </a>

      {/* Copy link button - secondary action */}
      <button
        type="button"
        onClick={async () => {
          if (await copyToClipboard(joinUrl)) {
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2500)
          }
        }}
        style={{
          background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(196,153,42,0.08)',
          border: linkCopied ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(196,153,42,0.2)',
          color: linkCopied ? '#22c55e' : 'var(--brand-on-bg, #c4992a)',
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
