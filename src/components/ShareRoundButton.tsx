'use client'

interface Props {
  scoreGross: number
  scoreDiff: number
  courseName: string
}

export default function ShareRoundButton({ scoreGross, scoreDiff, courseName }: Props) {
  const diffLabel = scoreDiff === 0 ? 'Par' : scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`
  const text = `Jugué ${scoreGross} (${diffLabel}) en ${courseName}. Golfers+ — golfersplus.vercel.app`

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Mi ronda — Golfers+', text, url: 'https://golfersplus.vercel.app' })
        return
      } catch { /* user cancelled or not supported */ }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text)
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
