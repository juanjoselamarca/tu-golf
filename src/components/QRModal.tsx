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
          borderRadius: '8px',
          fontSize: '13px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        QR
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: '#0e1c2f', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid rgba(196,153,42,0.3)', maxWidth: '320px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', display: 'inline-block', marginBottom: '16px' }}>
              <QRCodeSVG value={url} size={200} />
            </div>
            <p style={{ color: '#edeae4', marginBottom: '8px', fontSize: '14px', margin: '0 0 8px' }}>Escanea para unirte</p>
            <p style={{ color: '#7a8fa8', fontSize: '12px', marginBottom: '16px', wordBreak: 'break-all', margin: '0 0 16px' }}>{url}</p>
            <button
              onClick={() => setOpen(false)}
              style={{ background: '#c4992a', color: '#070d18', border: 'none', borderRadius: '8px', padding: '8px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
