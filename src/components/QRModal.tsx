'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

export default function QRModal({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/torneo/${slug}`
    : `https://tu-golf.vercel.app/torneo/${slug}`

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'rgba(196,153,42,0.08)',
          border: '1px solid rgba(196,153,42,0.3)',
          color: '#c4992a',
          padding: '8px 16px',
          borderRadius: '10px',
          fontSize: '13px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Ver QR
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(20,39,33,0.96) 0%, rgba(14,28,47,0.94) 100%)',
              borderRadius: '18px',
              padding: '28px',
              textAlign: 'center',
              border: '1px solid rgba(196,153,42,0.3)',
              maxWidth: '340px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '10px' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '11px', color: '#9fb4aa', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Compartir torneo</div>
                <div style={{ color: '#edeae4', fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>Escanea y sigue en vivo</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#7a8fa8', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ background: 'white', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '14px' }}>
              <QRCodeSVG value={url} size={200} />
            </div>

            <p style={{ color: '#7a8fa8', fontSize: '13px', margin: '0 0 14px' }}>
              Usa este QR para abrir el leaderboard del torneo desde cualquier celular.
            </p>
            <p style={{ color: '#9fb4aa', fontSize: '11px', margin: '0 0 16px', wordBreak: 'break-all' }}>{url}</p>

            <button
              onClick={() => setOpen(false)}
              style={{ background: '#c4992a', color: '#070d18', border: 'none', borderRadius: '10px', padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', width: '100%' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
