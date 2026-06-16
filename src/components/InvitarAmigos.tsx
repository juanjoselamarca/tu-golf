'use client'

import { useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'

export default function InvitarAmigos({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false)

  const referralCode = userId.slice(0, 8)
  const referralUrl = `https://golfersplus.vercel.app/register?ref=${referralCode}`

  const handleShare = async () => {
    const shareData = {
      title: 'Golfers+ — Scoring en vivo y coaching con IA',
      text: 'Registra tus rondas de golf, mide tu índice y mejora con tAIger+. Gratis.',
      url: referralUrl,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled share
      }
    } else {
      await copyToClipboard(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.2)',
      borderRadius: '14px', padding: '20px', marginBottom: '24px',
      display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: '180px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
          Invita a tus amigos de golf
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.4 }}>
          Comparte Golfers+ con tu grupo. Jugar juntos es mejor.
        </div>
      </div>
      <button
        onClick={handleShare}
        style={{
          background: copied ? '#16a34a' : 'rgba(196,153,42,0.12)',
          border: `1px solid ${copied ? '#16a34a' : 'rgba(196,153,42,0.3)'}`,
          color: copied ? '#ffffff' : '#c4992a',
          fontWeight: 600, fontSize: '13px',
          padding: '12px 20px', borderRadius: '10px',
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'all 200ms',
        }}
      >
        {copied ? 'Link copiado' : 'Compartir link'}
      </button>
    </div>
  )
}
