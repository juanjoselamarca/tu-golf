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
    <button onClick={handleCopy}
      style={{ background: 'transparent', border: '1px solid rgba(122,143,168,0.25)', color: '#7a8fa8', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500, transition: 'all 200ms' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,153,42,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = '#c4992a' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(122,143,168,0.25)'; (e.currentTarget as HTMLButtonElement).style.color = '#7a8fa8' }}>
      {copied ? '✓ Copiado' : '🔗 Link inscripción'}
    </button>
  )
}
