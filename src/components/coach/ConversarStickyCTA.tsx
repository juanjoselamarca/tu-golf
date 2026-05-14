'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'

interface Props {
  href: string
  label: string
}

export function ConversarStickyCTA({ href, label }: Props) {
  const containerStyle: CSSProperties = {
    position: 'sticky',
    bottom: 0,
    padding: '16px 20px 24px',
    background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
    zIndex: 10,
  }
  const ctaStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '16px',
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    textDecoration: 'none',
    minHeight: '52px',
  }

  return (
    <div style={containerStyle}>
      <Link href={href} style={ctaStyle}>
        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--coach-brass)' }} aria-hidden />
        {label}
      </Link>
    </div>
  )
}
