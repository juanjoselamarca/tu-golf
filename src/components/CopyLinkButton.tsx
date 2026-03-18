'use client'

import React, { useState } from 'react'

export default function CopyLinkButton({ slug }: { slug: string }) {
  const url = `https://tu-golf.vercel.app/login?redirect=/organizador/${slug}/jugadores`
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.32)' : 'rgba(122,143,168,0.25)'}`,
        color: copied ? '#86efac' : '#94a8c0',
        padding: '8px 16px',
        borderRadius: '10px',
        fontSize: '13px',
        cursor: 'pointer',
        fontWeight: 600,
        transition: 'all 200ms',
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,153,42,0.5)'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#c4992a'
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(122,143,168,0.25)'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#94a8c0'
        }
      }}
    >
      {copied ? '✓ Link copiado' : 'Compartir link'}
    </button>
  )
}
