'use client'

import { SITE_URL, SITE_DOMAIN } from '@/lib/site-url'
import { copyToClipboard } from '@/lib/clipboard'

interface Props {
  scoreGross: number
  scoreDiff: number
  courseName: string
  roundUrl?: string
}

export default function ShareRoundButton({ scoreGross, scoreDiff, courseName, roundUrl }: Props) {
  const diffLabel = scoreDiff === 0 ? 'Par' : scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`
  const text = `Jugué ${scoreGross} (${diffLabel}) en ${courseName}. Golfers+ — ${SITE_DOMAIN}`
  const url = roundUrl ?? SITE_URL

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Mi ronda — Golfers+', text, url })
        return
      } catch { /* user cancelled or not supported */ }
    }
    // Fallback: copy to clipboard
    try {
      await copyToClipboard(`${text}\n${url}`)
      alert('Copiado al portapapeles')
    } catch { /* ignore */ }
  }

  return (
    <button
      onClick={handleShare}
      style={{
        background: 'transparent',
        border: '1px solid rgba(196,153,42,0.4)',
        color: '#c4992a',
        padding: '8px 16px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      Compartir
    </button>
  )
}
