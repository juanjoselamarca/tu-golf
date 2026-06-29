'use client'

import { useState } from 'react'
import { SITE_DOMAIN, SITE_URL } from '@/lib/site-url'
import { useShare } from '@/components/share/useShare'

interface ShareResultsProps {
  tournamentName: string
  courseName: string
  dateDisplay: string
  parTotal: number
  topPlayers: { pos: number; name: string; score: string }[]
}

export default function ShareResultsButton({
  tournamentName,
  courseName,
  dateDisplay,
  parTotal,
  topPlayers,
}: ShareResultsProps) {
  const [copied, setCopied] = useState(false)
  const { share } = useShare()

  const generateText = () => {
    let text = `${tournamentName}\n`
    text += `${courseName} | Par ${parTotal} | ${dateDisplay}\n\n`
    text += `Resultados finales:\n`
    topPlayers.forEach((p) => {
      // Share text — emoji OK for external platforms
      const medal = p.pos === 1 ? '🏆' : p.pos === 2 ? '🥈' : p.pos === 3 ? '🥉' : `${p.pos}.`
      text += `${medal} ${p.name} — ${p.score}\n`
    })
    text += `\nVer leaderboard completo en ${SITE_DOMAIN}`
    return text
  }

  const handleShare = async () => {
    // Cascada única (native → wa.me → portapapeles) vía el canónico useShare.
    // El link al leaderboard es la propia página (antes el share iba sin link).
    const url = typeof window !== 'undefined' ? window.location.href : SITE_URL
    const res = await share({ title: tournamentName, text: generateText(), url })
    if (res.method === 'clipboard') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <button
      onClick={handleShare}
      style={{
        background: 'rgba(196,153,42,0.12)',
        border: '1px solid rgba(196,153,42,0.3)',
        color: copied ? '#22c55e' : '#c4992a',
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 200ms',
      }}
    >
      {copied ? 'Copiado al portapapeles' : 'Compartir resultados'}
    </button>
  )
}
