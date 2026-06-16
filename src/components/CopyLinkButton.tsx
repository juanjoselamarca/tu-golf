'use client'

import React, { useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'

export default function CopyLinkButton({ slug }: { slug: string }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'
  const url = `${siteUrl}/login?redirect=/organizador/${slug}/jugadores`
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (await copyToClipboard(url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={handleCopy}
        style={{
          background: copied ? 'rgba(34,197,94,0.15)' : 'var(--bg-surface)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(196,153,42,0.25)'}`,
          color: copied ? '#86efac' : 'var(--text-2)',
          padding: '12px 20px',
          minHeight: '44px',
          minWidth: '44px',
          borderRadius: '10px',
          fontSize: '14px',
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'all 200ms ease',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onMouseEnter={(e) => {
          if (!copied) {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,153,42,0.5)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#c4992a'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)'
          }
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,153,42,0.25)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)'
          }
        }}
      >
        {copied ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Link copiado
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Compartir link
          </>
        )}
      </button>
    </div>
  )
}
